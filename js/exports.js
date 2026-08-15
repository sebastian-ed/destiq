// ── EXPORTS ──────────────────────────────────────────────────
// Exportaciones desacopladas del tamaño de pantalla.
// Los gráficos se vuelven a renderizar en alta resolución y las tablas
// se exportan completas o respetando la selección visible, sin tocar datos.

const EXPORT_CHART_DPR = 2;
const EXPORT_MAX_CANVAS_SIDE = 14000;

function buildExportLabel(indicator) {
  const destinationName = indicator?.destination?.name || indicator?.destination_name || '';
  return destinationName ? `${destinationName} · ${indicator.name}` : indicator?.name || 'Indicador';
}

function sanitizeExportName(value) {
  return String(value || 'exportacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120) || 'exportacion';
}

function buildExportFilename(indicator, ext, suffix = '') {
  const parts = [];
  if (indicator?.destination?.name) parts.push(indicator.destination.name);
  if (indicator?.name) parts.push(indicator.name);
  if (suffix) parts.push(suffix);
  const base = sanitizeExportName(parts.join('_') || 'indicador');
  return `${base}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function getCurrentIndicatorSafe() {
  return typeof currentIndicator !== 'undefined' ? currentIndicator : null;
}

function getCurrentDataByYearSafe() {
  return typeof currentDataByYear !== 'undefined' && currentDataByYear ? currentDataByYear : {};
}

function getCurrentYearlyStatsSafe() {
  return typeof currentYearlyStats !== 'undefined' && currentYearlyStats ? currentYearlyStats : {};
}

function getAllExportYears(dataByYear = getCurrentDataByYearSafe()) {
  return Object.keys(dataByYear || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

function getSelectedExportYears() {
  const allYears = getAllExportYears();
  if (!allYears.length) return [];

  try {
    if (typeof getVisibleYears === 'function') {
      const selected = getVisibleYears().map(Number).filter(Number.isFinite);
      return selected.length ? selected.sort((a, b) => a - b) : [];
    }
  } catch (_) {
    // La vista admin no usa filtros de años.
  }

  if (typeof visibleYears !== 'undefined' && Array.isArray(visibleYears)) {
    const selected = visibleYears.map(Number).filter(year => allYears.includes(year));
    if (selected.length) return selected.sort((a, b) => a - b);
  }

  return allYears;
}

function getYearsForExportScope(scope = 'all') {
  return scope === 'selected' ? getSelectedExportYears() : getAllExportYears();
}

function describeYears(years, allYears = getAllExportYears()) {
  const clean = [...new Set((years || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!clean.length) return 'Sin años seleccionados';
  if (clean.length === 1) return `Año ${clean[0]}`;
  if (clean.length === allYears.length) return `Serie completa · ${clean[0]}–${clean[clean.length - 1]}`;
  return `${clean.length} años seleccionados · ${clean[0]}–${clean[clean.length - 1]}`;
}

function showExportToast(message, type = 'success') {
  if (typeof toast === 'function') toast(message, type);
}

function closeExportMenus() {
  document.querySelectorAll('details.export-menu[open]').forEach(menu => menu.removeAttribute('open'));
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function canvasToBlob(canvas, type = 'image/png', quality = 1) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar el archivo.')), type, quality);
  });
}

function cloneChartValue(value, seen = new WeakMap()) {
  if (value === null || value === undefined || typeof value === 'function' || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) {
    const arr = [];
    seen.set(value, arr);
    value.forEach(item => arr.push(cloneChartValue(item, seen)));
    return arr;
  }
  const clone = {};
  seen.set(value, clone);
  Object.keys(value).forEach(key => {
    if (key === 'canvas' || key === 'ctx' || key === 'chart') return;
    clone[key] = cloneChartValue(value[key], seen);
  });
  return clone;
}

function getChartInstance(canvasId) {
  if (typeof Chart === 'undefined') return null;
  return Chart.getChart(canvasId) || Chart.getChart(document.getElementById(canvasId)) || null;
}

function getChartCardTitle(canvasId) {
  const canvas = document.getElementById(canvasId);
  const card = canvas?.closest?.('.chart-card');
  return card?.querySelector?.('.chart-card-title')?.textContent?.trim() || 'Gráfico';
}

function getChartCardNote(canvasId) {
  const canvas = document.getElementById(canvasId);
  const card = canvas?.closest?.('.chart-card');
  return card?.querySelector?.('.chart-card-note')?.textContent?.trim() || '';
}

function getChartExportContext(canvasId, chart) {
  const indicator = getCurrentIndicatorSafe();
  const title = getChartCardTitle(canvasId);
  const note = getChartCardNote(canvasId);
  const parts = [];

  let filenameIndicator = indicator;
  if (canvasId === 'comparisonChart') {
    const payload = typeof currentComparisonTablePayload !== 'undefined' ? currentComparisonTablePayload : null;
    if (payload?.indicatorName) parts.push(payload.indicatorName);
    if (payload?.unit) parts.push(payload.unit);
    if (typeof comparisonMode !== 'undefined') parts.push(comparisonMode === 'monthly' ? 'Comparación mensual histórica' : 'Comparación anual');
    filenameIndicator = { name: `Comparación ${payload?.indicatorName || 'territorial'}` };
  } else if (indicator) {
    parts.push(buildExportLabel(indicator));
    if (indicator.unit) parts.push(indicator.unit);
    const years = getSelectedExportYears();
    if (years.length) parts.push(describeYears(years));
  }

  if (note) parts.push(note);
  if (chart?.data?.labels?.length) parts.push(`${chart.data.labels.length} períodos visibles`);

  return {
    title,
    subtitle: parts.filter(Boolean).join(' · '),
    indicator: filenameIndicator,
    filenameSuffix: canvasId === 'lineChart' ? 'grafico_evolucion' : canvasId === 'barChart' ? 'grafico_anual' : 'grafico_comparativo',
  };
}

function getChartLogicalSize(chart) {
  const labels = chart?.data?.labels?.length || 0;
  const datasets = chart?.data?.datasets?.length || 0;
  let width = 1500;
  if (labels > 24) width = Math.min(2800, 1500 + (labels - 24) * 24);
  if (chart?.config?.type === 'bar') width = Math.max(1500, Math.min(2600, 900 + labels * 70));
  if (datasets > 14) width = Math.max(width, 1900);
  return { width, height: 820 };
}

function prepareExportChartOptions(sourceOptions, chart) {
  const options = cloneChartValue(sourceOptions || {});
  options.responsive = false;
  options.maintainAspectRatio = false;
  options.animation = false;
  options.devicePixelRatio = EXPORT_CHART_DPR;
  options.events = [];
  options.layout = options.layout || {};
  options.layout.padding = { top: 20, right: 28, bottom: 18, left: 18 };

  options.plugins = options.plugins || {};
  options.plugins.tooltip = { ...(options.plugins.tooltip || {}), enabled: false };
  options.plugins.legend = options.plugins.legend || {};
  const datasetCount = chart?.data?.datasets?.length || 0;
  if (datasetCount > 1 && datasetCount <= 28) {
    options.plugins.legend.display = true;
    options.plugins.legend.position = 'top';
    options.plugins.legend.labels = {
      ...(options.plugins.legend.labels || {}),
      color: '#cbd5e1',
      padding: 18,
      boxWidth: 16,
      font: { ...(options.plugins.legend.labels?.font || {}), size: 13 },
    };
  }

  options.scales = options.scales || {};
  ['x', 'y'].forEach(axis => {
    if (!options.scales[axis]) return;
    options.scales[axis].ticks = options.scales[axis].ticks || {};
    options.scales[axis].ticks.color = '#94a3b8';
    options.scales[axis].ticks.font = { ...(options.scales[axis].ticks.font || {}), size: 13 };
    options.scales[axis].grid = { ...(options.scales[axis].grid || {}), color: '#253247' };
  });

  const labelCount = chart?.data?.labels?.length || 0;
  if (options.scales.x?.ticks && labelCount) {
    options.scales.x.ticks.maxTicksLimit = Math.min(labelCount, labelCount > 36 ? 24 : labelCount);
    options.scales.x.ticks.autoSkip = labelCount > 18;
  }

  return options;
}

async function createChartExportCanvas(canvasId) {
  const chart = getChartInstance(canvasId);
  if (!chart) throw new Error('El gráfico todavía no está disponible para descargar.');

  if (document.fonts?.ready) await document.fonts.ready;

  const sourceConfig = chart.config?._config || chart.config || {};
  const logicalSize = getChartLogicalSize(chart);
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = logicalSize.width;
  chartCanvas.height = logicalSize.height;
  chartCanvas.style.width = `${logicalSize.width}px`;
  chartCanvas.style.height = `${logicalSize.height}px`;

  const backgroundPlugin = {
    id: `exportBackground_${Date.now()}`,
    beforeDraw(instance) {
      const ctx = instance.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, instance.width, instance.height);
      ctx.restore();
    },
  };

  const exportChart = new Chart(chartCanvas.getContext('2d'), {
    type: sourceConfig.type || chart.config.type,
    data: cloneChartValue(sourceConfig.data || chart.data),
    options: prepareExportChartOptions(sourceConfig.options || chart.options, chart),
    plugins: [...(Array.isArray(sourceConfig.plugins) ? sourceConfig.plugins : []), backgroundPlugin],
  });

  exportChart.update('none');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const context = getChartExportContext(canvasId, chart);
  const headerHeight = 320;
  const footerHeight = 90;
  const sidePadding = 90;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = chartCanvas.width + sidePadding * 2;
  finalCanvas.height = chartCanvas.height + headerHeight + footerHeight;

  const ctx = finalCanvas.getContext('2d');
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  ctx.fillStyle = '#3b82f6';
  ctx.font = '700 28px "DM Sans", Arial, sans-serif';
  ctx.fillText('DESTIQ · DASHBOARD DE TURISMO', sidePadding, 62);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 54px "DM Sans", Arial, sans-serif';
  drawWrappedCanvasText(ctx, context.title, sidePadding, 135, finalCanvas.width - sidePadding * 2, 62, 2);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 26px "DM Sans", Arial, sans-serif';
  drawWrappedCanvasText(ctx, context.subtitle, sidePadding, 245, finalCanvas.width - sidePadding * 2, 34, 2);

  ctx.fillStyle = '#0f172a';
  roundRectCanvas(ctx, sidePadding - 18, headerHeight - 14, chartCanvas.width + 36, chartCanvas.height + 28, 24);
  ctx.fill();
  ctx.drawImage(chartCanvas, sidePadding, headerHeight);

  ctx.fillStyle = '#64748b';
  ctx.font = '400 22px "DM Sans", Arial, sans-serif';
  ctx.fillText(`Generado el ${new Date().toLocaleDateString('es-AR')} · Imagen en alta resolución`, sidePadding, finalCanvas.height - 35);

  exportChart.destroy();
  return { canvas: finalCanvas, context };
}

function roundRectCanvas(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawWrappedCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines) limited[maxLines - 1] = `${limited[maxLines - 1].replace(/[.…]*$/, '')}…`;
  limited.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}

async function downloadChartAsset(canvasId, format = 'png') {
  closeExportMenus();
  try {
    const { canvas, context } = await createChartExportCanvas(canvasId);
    const indicator = context.indicator || getCurrentIndicatorSafe();
    const filename = buildExportFilename(indicator, format, context.filenameSuffix);

    if (format === 'pdf') {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error('La librería PDF no está disponible.');
      const ratio = canvas.width / canvas.height;
      const doc = new jsPDF({ orientation: ratio >= 1 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 8;
      let width = pageWidth - margin * 2;
      let height = width / ratio;
      if (height > pageHeight - margin * 2) {
        height = pageHeight - margin * 2;
        width = height * ratio;
      }
      doc.addImage(canvas.toDataURL('image/png', 1), 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
      doc.save(filename);
    } else {
      const blob = await canvasToBlob(canvas, 'image/png', 1);
      triggerBlobDownload(blob, filename);
    }
    showExportToast(format === 'pdf' ? 'Gráfico PDF generado ✓' : 'Gráfico PNG HD generado ✓');
  } catch (error) {
    showExportToast(`Error al descargar el gráfico: ${error.message}`, 'error');
  }
}

function setWorksheetLayout(ws, rows, options = {}) {
  const widths = [];
  rows.forEach(row => row.forEach((value, index) => {
    const length = String(value ?? '').length;
    widths[index] = Math.min(options.maxWidth || 24, Math.max(widths[index] || 0, length + 2));
  }));
  ws['!cols'] = widths.map((wch, index) => ({ wch: Math.max(index === 0 ? 16 : 11, wch) }));
  if (options.autoFilter && rows.length) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  }
}

function buildMonthlyExportRows(indicator, dataByYear, yearlyStats, years, includeMeta = true) {
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const rows = [];
  if (includeMeta) {
    const destinationName = indicator?.destination?.name || '';
    if (destinationName) rows.push(['Destino', destinationName]);
    rows.push(['Indicador', indicator?.name || '']);
    rows.push(['Unidad', indicator?.unit || '']);
    rows.push(['Período exportado', describeYears(years, getAllExportYears(dataByYear))]);
    rows.push(['Cálculo anual', annualMeta.label]);
    if (getMethodologyNote(indicator)) rows.push(['Aclaración metodológica', getMethodologyNote(indicator)]);
    rows.push([]);
  }
  rows.push(['Mes', ...years.map(String)]);
  MONTHS.forEach((month, monthIndex) => {
    rows.push([month, ...years.map(year => dataByYear?.[year]?.[monthIndex] ?? '')]);
  });
  rows.push([annualMeta.shortLabel, ...years.map(year => yearlyStats?.[year]?.annualValue ?? '')]);
  return rows;
}

function buildStatsExportRows(indicator, yearlyStats, years) {
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const rows = [['Año', annualMeta.shortLabel, 'Promedio mensual', 'Mediana', 'Mínimo', 'Máximo', 'Desvío Std', 'Var. interanual (%)']];
  years.forEach(year => {
    const stats = yearlyStats?.[year];
    if (!stats) return;
    rows.push([
      year,
      stats.annualValue ?? '',
      stats.mean ?? '',
      stats.median ?? '',
      stats.min ?? '',
      stats.max ?? '',
      stats.stdDev ?? '',
      stats.yoyAnnual ?? '',
    ]);
  });
  return rows;
}

async function exportToExcel(indicator, dataByYear, yearlyStats, options = {}) {
  if (typeof XLSX === 'undefined') throw new Error('La librería Excel no está disponible.');
  const allYears = getAllExportYears(dataByYear);
  const requestedYears = Array.isArray(options.years) ? options.years.map(Number) : allYears;
  const years = requestedYears.filter(year => allYears.includes(year)).sort((a, b) => a - b);
  if (!years.length) throw new Error('No hay años seleccionados para exportar.');

  const wb = XLSX.utils.book_new();
  const monthlyRows = buildMonthlyExportRows(indicator, dataByYear, yearlyStats, years, true);
  const statsRows = buildStatsExportRows(indicator, yearlyStats, years);

  const ws1 = XLSX.utils.aoa_to_sheet(monthlyRows);
  setWorksheetLayout(ws1, monthlyRows, { maxWidth: 34 });
  XLSX.utils.book_append_sheet(wb, ws1, 'Datos mensuales');

  const ws2 = XLSX.utils.aoa_to_sheet(statsRows);
  setWorksheetLayout(ws2, statsRows, { autoFilter: true, maxWidth: 24 });
  XLSX.utils.book_append_sheet(wb, ws2, 'Estadísticas');

  const suffix = options.scope === 'selected' ? 'seleccion' : 'datos_completos';
  XLSX.writeFile(wb, buildExportFilename(indicator, 'xlsx', suffix));
}

function cleanTableCellText(cell) {
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('.sort-indicator').forEach(el => el.remove());
  clone.querySelectorAll('button').forEach(button => {
    const firstLabel = button.querySelector('span')?.textContent || button.textContent;
    button.replaceWith(document.createTextNode(firstLabel));
  });
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function tableToRows(table) {
  return [...table.rows].map(row => [...row.cells].map(cleanTableCellText));
}

function removeTableColumns(table, keepIndexes) {
  const keep = new Set(keepIndexes);
  [...table.rows].forEach(row => {
    [...row.cells].forEach((cell, index) => {
      if (!keep.has(index)) cell.remove();
    });
  });
}

function cloneIndividualTableForScope(tableId, scope = 'all') {
  const original = document.getElementById(tableId);
  if (!original) throw new Error('No se encontró la tabla solicitada.');
  const clone = original.cloneNode(true);

  clone.querySelectorAll('button').forEach(button => {
    const label = button.querySelector('span')?.textContent || button.textContent.replace(/[↕↑↓]/g, '');
    button.replaceWith(document.createTextNode(label.trim()));
  });
  clone.querySelectorAll('.sort-indicator').forEach(el => el.remove());

  if (scope !== 'selected') return clone;
  const selectedYears = getSelectedExportYears();
  if (!selectedYears.length) throw new Error('Seleccioná al menos un año antes de exportar.');
  const selectedSet = new Set(selectedYears.map(String));

  if (tableId === 'monthlyTable') {
    const headerCells = [...(clone.querySelector('thead tr')?.cells || [])];
    const keepIndexes = headerCells
      .map((cell, index) => ({ index, label: cleanTableCellText(cell) }))
      .filter(item => item.index === 0 || selectedSet.has(item.label))
      .map(item => item.index);
    removeTableColumns(clone, keepIndexes);
  } else if (tableId === 'yearStatsTable') {
    clone.querySelectorAll('tbody tr').forEach(row => {
      const year = cleanTableCellText(row.cells[0]);
      if (!selectedSet.has(year)) row.remove();
    });
  }

  return clone;
}

function getTableExportMeta(tableId, scope = 'all') {
  const current = getCurrentIndicatorSafe();
  let indicator = current;
  const selected = scope === 'selected';
  const years = selected ? getSelectedExportYears() : getAllExportYears();
  const titleMap = {
    yearStatsTable: 'Estadísticas por año',
    monthlyTable: 'Datos mensuales',
    comparisonTable: 'Tabla comparativa',
  };
  const title = titleMap[tableId] || 'Tabla de datos';
  const parts = [];
  if (tableId === 'comparisonTable') {
    const payload = typeof currentComparisonTablePayload !== 'undefined' ? currentComparisonTablePayload : null;
    if (payload?.indicatorName) parts.push(payload.indicatorName);
    if (payload?.unit) parts.push(payload.unit);
    parts.push('Selección visible');
    indicator = { name: `Comparación ${payload?.indicatorName || 'territorial'}` };
  } else if (indicator) {
    parts.push(buildExportLabel(indicator));
    if (indicator.unit) parts.push(indicator.unit);
    parts.push(describeYears(years));
  }
  return {
    title,
    subtitle: parts.join(' · '),
    indicator,
    filenameSuffix: `${sanitizeExportName(title)}_${selected ? 'seleccion' : 'completa'}`,
  };
}

function applyExportTableTheme(host, table) {
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  host.style.background = '#ffffff';
  host.style.color = '#0f172a';
  host.style.padding = '54px';
  host.style.fontFamily = '"DM Sans", Arial, sans-serif';
  host.style.boxSizing = 'border-box';

  const columnCount = table.rows[0]?.cells.length || 1;
  host.style.width = `${Math.max(1200, Math.min(6200, 340 + columnCount * 185))}px`;

  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.tableLayout = 'auto';
  table.style.fontSize = '20px';
  table.style.color = '#0f172a';
  table.querySelectorAll('th').forEach(cell => {
    cell.style.background = '#2563eb';
    cell.style.color = '#ffffff';
    cell.style.fontWeight = '700';
    cell.style.border = '1px solid #bfdbfe';
    cell.style.padding = '16px 18px';
    cell.style.whiteSpace = 'nowrap';
  });
  table.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
    row.querySelectorAll('td').forEach((cell, cellIndex) => {
      cell.style.background = rowIndex % 2 === 1 ? '#f8fafc' : '#ffffff';
      cell.style.color = '#0f172a';
      cell.style.border = '1px solid #dbe4f0';
      cell.style.padding = '15px 18px';
      cell.style.whiteSpace = 'nowrap';
      if (cellIndex === 0) cell.style.fontWeight = '600';
    });
  });
}

async function renderTableExportCanvas(table, meta) {
  if (typeof html2canvas === 'undefined') throw new Error('La librería de captura no está disponible.');
  if (document.fonts?.ready) await document.fonts.ready;

  const host = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.textContent = 'DESTIQ · TABLA DE DATOS';
  eyebrow.style.cssText = 'font-size:20px;font-weight:700;letter-spacing:.08em;color:#2563eb;margin-bottom:16px';
  const title = document.createElement('div');
  title.textContent = meta.title;
  title.style.cssText = 'font-size:38px;line-height:1.15;font-weight:800;color:#0f172a;margin-bottom:12px';
  const subtitle = document.createElement('div');
  subtitle.textContent = meta.subtitle;
  subtitle.style.cssText = 'font-size:21px;line-height:1.4;color:#64748b;margin-bottom:34px';
  const footer = document.createElement('div');
  footer.textContent = `Generado el ${new Date().toLocaleDateString('es-AR')} · Exportación en alta resolución`;
  footer.style.cssText = 'font-size:17px;color:#64748b;margin-top:24px';

  applyExportTableTheme(host, table);
  host.append(eyebrow, title, subtitle, table, footer);
  document.body.appendChild(host);

  const width = Math.ceil(host.scrollWidth);
  const height = Math.ceil(host.scrollHeight);
  const maxScaleByWidth = EXPORT_MAX_CANVAS_SIDE / Math.max(width, 1);
  const maxScaleByHeight = EXPORT_MAX_CANVAS_SIDE / Math.max(height, 1);
  const scale = Math.max(1, Math.min(2.5, maxScaleByWidth, maxScaleByHeight));

  const canvas = await html2canvas(host, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
  });
  host.remove();
  return canvas;
}

function exportTableRowsToExcel(rows, meta) {
  if (typeof XLSX === 'undefined') throw new Error('La librería Excel no está disponible.');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  setWorksheetLayout(ws, rows, { autoFilter: true, maxWidth: 32 });
  XLSX.utils.book_append_sheet(wb, ws, 'Tabla');
  XLSX.writeFile(wb, buildExportFilename(meta.indicator, 'xlsx', meta.filenameSuffix));
}

function exportTableRowsToPdf(rows, meta) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('La librería PDF no está disponible.');
  if (!rows.length) throw new Error('La tabla no contiene datos.');

  const columnCount = rows[0]?.length || 1;
  const format = columnCount > 12 ? 'a3' : 'a4';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setTextColor(37, 99, 235);
  doc.setFontSize(9);
  doc.text('DESTIQ · TABLA DE DATOS', 12, 12);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text(meta.title, 12, 21);
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8.5);
  const subtitleLines = doc.splitTextToSize(meta.subtitle || '', pageWidth - 24);
  doc.text(subtitleLines, 12, 28);

  doc.autoTable({
    head: [rows[0]],
    body: rows.slice(1),
    startY: 34 + Math.max(0, subtitleLines.length - 1) * 4,
    theme: 'grid',
    margin: { left: 10, right: 10, bottom: 12 },
    styles: {
      fontSize: columnCount > 12 ? 6.5 : columnCount > 8 ? 7.5 : 8.5,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    horizontalPageBreak: columnCount > 10,
    horizontalPageBreakRepeat: 0,
    didDrawPage: data => {
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageWidth - 24, doc.internal.pageSize.getHeight() - 6);
    },
  });

  doc.save(buildExportFilename(meta.indicator, 'pdf', meta.filenameSuffix));
}

async function downloadIndividualTable(tableId, scope = 'all', format = 'png') {
  closeExportMenus();
  try {
    const indicator = getCurrentIndicatorSafe();
    if (!indicator) throw new Error('Seleccioná un indicador antes de exportar.');
    const years = getYearsForExportScope(scope);
    if (!years.length) throw new Error('No hay años seleccionados para exportar.');
    const meta = getTableExportMeta(tableId, scope);

    if (format === 'xlsx') {
      const rows = tableId === 'yearStatsTable'
        ? buildStatsExportRows(indicator, getCurrentYearlyStatsSafe(), years)
        : buildMonthlyExportRows(indicator, getCurrentDataByYearSafe(), getCurrentYearlyStatsSafe(), years, false);
      exportTableRowsToExcel(rows, meta);
    } else {
      const table = cloneIndividualTableForScope(tableId, scope);
      const rows = tableToRows(table);
      if (format === 'pdf') {
        exportTableRowsToPdf(rows, meta);
      } else {
        const canvas = await renderTableExportCanvas(table, meta);
        const blob = await canvasToBlob(canvas, 'image/png', 1);
        triggerBlobDownload(blob, buildExportFilename(meta.indicator, 'png', meta.filenameSuffix));
      }
    }

    const label = format === 'xlsx' ? 'Excel' : format.toUpperCase();
    showExportToast(`Tabla ${label} generada ✓`);
  } catch (error) {
    showExportToast(`Error al descargar la tabla: ${error.message}`, 'error');
  }
}

async function downloadCurrentTable(tableId = 'comparisonTable', format = 'png') {
  closeExportMenus();
  try {
    const original = document.getElementById(tableId);
    if (!original) throw new Error('No se encontró la tabla solicitada.');
    const table = original.cloneNode(true);
    table.querySelectorAll('button').forEach(button => {
      const label = button.querySelector('span')?.textContent || button.textContent.replace(/[↕↑↓]/g, '');
      button.replaceWith(document.createTextNode(label.trim()));
    });
    table.querySelectorAll('.sort-indicator').forEach(el => el.remove());
    const meta = getTableExportMeta(tableId, 'selected');
    const rows = tableToRows(table);
    if (!rows.length) throw new Error('La tabla no contiene datos para exportar.');

    if (format === 'xlsx') {
      exportTableRowsToExcel(rows, meta);
    } else if (format === 'pdf') {
      exportTableRowsToPdf(rows, meta);
    } else {
      const canvas = await renderTableExportCanvas(table, meta);
      const blob = await canvasToBlob(canvas, 'image/png', 1);
      triggerBlobDownload(blob, buildExportFilename(meta.indicator, 'png', meta.filenameSuffix));
    }
    const label = format === 'xlsx' ? 'Excel' : format.toUpperCase();
    showExportToast(`Tabla comparativa ${label} generada ✓`);
  } catch (error) {
    showExportToast(`Error al descargar la tabla: ${error.message}`, 'error');
  }
}

async function exportToPDF(indicator, dataByYear, yearlyStats) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('La librería PDF no está disponible.');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const years = getAllExportYears(dataByYear);
  const now = new Date().toLocaleDateString('es-AR');
  const destinationName = indicator?.destination?.name || '';
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 210, 'F');
  doc.setTextColor(59, 130, 246);
  doc.setFontSize(9);
  doc.text(destinationName ? 'DASHBOARD DE TURISMO · DESTINO' : 'DASHBOARD DE TURISMO', 14, 20);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(11);
  if (destinationName) doc.text(destinationName, 14, 29);
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(22);
  doc.text(indicator.name, 14, destinationName ? 40 : 34);

  if (indicator.description) {
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text(doc.splitTextToSize(indicator.description, 269), 14, destinationName ? 49 : 43);
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const metaY = destinationName ? 62 : 56;
  doc.text(`Generado: ${now}  ·  Unidad: ${indicator.unit || 'N/A'}  ·  Cálculo anual: ${annualMeta.label}`, 14, metaY);

  const methodologyNote = getMethodologyNote(indicator);
  if (methodologyNote) {
    doc.setFontSize(9);
    doc.setTextColor(249, 115, 22);
    doc.text(doc.splitTextToSize(`Aclaración metodológica: ${methodologyNote}`, 269), 14, metaY + 8);
  }

  const allVals = Object.values(dataByYear).flat().filter(value => value !== null && !isNaN(value));
  const globalStats = calcStats(allVals);
  const lastYear = years[years.length - 1];
  const lastAnnual = lastYear ? yearlyStats?.[lastYear]?.annualValue : null;
  const kpis = [
    { label: annualMeta.shortLabel, value: formatNumber(lastAnnual) },
    { label: 'Máximo histórico', value: formatNumber(globalStats?.max) },
    { label: 'Mínimo histórico', value: formatNumber(globalStats?.min) },
    { label: 'Años cargados', value: String(years.length) },
  ];
  const kpiY = methodologyNote ? 82 : 70;
  kpis.forEach((kpi, index) => {
    const x = 14 + index * 68;
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(x, kpiY, 62, 20, 3, 3, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(kpi.label, x + 5, kpiY + 8);
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text(kpi.value, x + 5, kpiY + 16);
  });

  for (const canvasId of ['lineChart', 'barChart']) {
    const element = document.getElementById(canvasId);
    if (!element || !getChartInstance(canvasId)) continue;
    if (canvasId === 'barChart' && indicator?.annual_chart_visible === false) continue;
    const { canvas } = await createChartExportCanvas(canvasId);
    const img = canvas.toDataURL('image/png', 1);
    const ratio = canvas.width / canvas.height;
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 210, 'F');
    const maxWidth = 281;
    const maxHeight = 194;
    let width = maxWidth;
    let height = width / ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
    doc.addImage(img, 'PNG', (297 - width) / 2, (210 - height) / 2, width, height, undefined, 'FAST');
  }

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 297, 210, 'F');
  doc.setTextColor(37, 99, 235);
  doc.setFontSize(9);
  doc.text('DESTIQ · ESTADÍSTICAS', 14, 13);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text(`Estadísticas por año · ${buildExportLabel(indicator)}`, 14, 22);

  const statsRows = buildStatsExportRows(indicator, yearlyStats, years);
  doc.autoTable({
    head: [statsRows[0]],
    body: statsRows.slice(1).map(row => row.map((value, index) => index === 0 ? String(value) : (value === '' ? '-' : index === 7 ? `${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%` : formatNumber(value)))),
    startY: 29,
    theme: 'grid',
    styles: { textColor: [15, 23, 42], fontSize: 8.5, cellPadding: 2.5, lineColor: [203, 213, 225] },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(buildExportFilename(indicator, 'pdf', 'reporte'));
}
