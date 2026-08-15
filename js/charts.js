// ── CHARTS ───────────────────────────────────────────────────
let lineChartInstance = null;
let barChartInstance = null;
let comparisonChartInstance = null;

const CHART_DEFAULTS = {
  font: { family: "'DM Sans', sans-serif" },
  animation: { duration: 600, easing: 'easeInOutQuart' },
};

function destroyCharts() {
  if (lineChartInstance) { lineChartInstance.destroy(); lineChartInstance = null; }
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
}

function destroyComparisonChart() {
  if (comparisonChartInstance) { comparisonChartInstance.destroy(); comparisonChartInstance = null; }
}

function getChartWrap(canvas) {
  return canvas?.closest?.('.chart-wrap') || null;
}

function updateChartDensity(canvas, seriesCount) {
  const wrap = getChartWrap(canvas);
  if (!wrap) return;
  wrap.classList.toggle('has-many-series', seriesCount > 10);
  wrap.classList.toggle('has-dense-series', seriesCount > 16);
}

function buildLineDatasets(dataByYear, years) {
  const isDense = years.length > 12;
  return years.map((yr, i) => {
    const color = YEAR_COLORS[i % YEAR_COLORS.length];
    return {
      label: String(yr),
      data: dataByYear[yr],
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: isDense ? 1.6 : 2.1,
      pointRadius: isDense ? 1.8 : 3,
      pointHoverRadius: 5,
      pointHitRadius: 18,
      tension: 0.18,
      fill: false,
    };
  });
}

function renderLineChart(canvasId, dataByYear, indicator, dataMetaByYear = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (lineChartInstance) lineChartInstance.destroy();

  const years = Object.keys(dataByYear).map(Number).sort((a, b) => a - b);
  const datasets = buildLineDatasets(dataByYear, years);
  const showLegend = years.length <= 10;
  updateChartDensity(ctx, years.length);

  lineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTHS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top',
          labels: {
            color: '#52636d',
            font: { family: "'DM Sans', sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#d4dce0',
          borderWidth: 1,
          titleColor: '#1d2932',
          bodyColor: '#4d5d67',
          displayColors: true,
          usePointStyle: true,
          padding: 11,
          caretPadding: 8,
          titleMarginBottom: 8,
          bodySpacing: 6,
          boxPadding: 4,
          titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: '700' },
          bodyFont: { family: "'DM Sans', sans-serif", size: 12, weight: '500' },
          callbacks: {
            title: (items) => {
              const item = items?.[0];
              if (!item) return '';
              return `${MONTHS[item.dataIndex]} · ${item.dataset.label}`;
            },
            label: (ctx) => `${formatNumberFull(ctx.parsed.y)} ${indicator.unit || ''}`,
            afterLabel: (ctx) => {
              const year = Number(ctx.dataset.label);
              const meta = dataMetaByYear?.[year]?.[ctx.dataIndex] || null;
              const annotation = getDataPointAnnotationText(meta);
              return annotation ? `* ${annotation}` : '';
            },
          }
        },
      },
      scales: {
        x: {
          grid: { color: '#e4e8eb' },
          ticks: {
            color: '#6b7881',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            autoSkip: true,
            maxTicksLimit: MONTHS.length,
          },
        },
        y: {
          grid: { color: '#e4e8eb' },
          ticks: {
            color: '#6b7881',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            callback: (v) => formatNumber(v, 0),
          },
        }
      }
    }
  });
  return lineChartInstance;
}


function renderHistoricalLineChart(canvasId, labels, series, indicator, measureLabel = 'Evolución mensual histórica') {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (lineChartInstance) lineChartInstance.destroy();

  const seriesCount = (series || []).length;
  updateChartDensity(ctx, Math.max(seriesCount, labels.length > 60 ? 12 : seriesCount));
  const datasets = (series || []).map((item, index) => {
    const color = YEAR_COLORS[index % YEAR_COLORS.length];
    return {
      label: item.label,
      data: item.values,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2.1,
      pointRadius: labels.length > 80 ? 1.5 : 2.8,
      pointHoverRadius: 5,
      pointHitRadius: 18,
      tension: 0.16,
      fill: false,
      spanGaps: true,
    };
  });

  lineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
      plugins: {
        legend: {
          display: seriesCount <= 10,
          position: 'top',
          labels: {
            color: '#52636d',
            font: { family: "'DM Sans', sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#d4dce0',
          borderWidth: 1,
          titleColor: '#1d2932',
          bodyColor: '#4d5d67',
          displayColors: true,
          usePointStyle: true,
          padding: 11,
          caretPadding: 8,
          titleMarginBottom: 8,
          bodySpacing: 6,
          boxPadding: 4,
          titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: '700' },
          bodyFont: { family: "'DM Sans', sans-serif", size: 12, weight: '500' },
          callbacks: {
            title: (items) => {
              const item = items?.[0];
              return item ? labels[item.dataIndex] : '';
            },
            label: (ctx) => ` ${ctx.dataset.label}: ${formatNumberFull(ctx.parsed.y)} ${indicator?.unit || ''}`,
            afterLabel: () => measureLabel ? ` Medida: ${measureLabel}` : '',
          }
        },
      },
      scales: {
        x: {
          grid: { color: '#e4e8eb' },
          ticks: {
            color: '#6b7881',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          grid: { color: '#e4e8eb' },
          ticks: {
            color: '#6b7881',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            callback: (v) => formatNumber(v, 0),
          },
        }
      }
    }
  });
  return lineChartInstance;
}

function renderBarChart(canvasId, yearlyStats, indicator) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (barChartInstance) barChartInstance.destroy();

  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const years = Object.keys(yearlyStats)
    .filter(key => key !== '__meta')
    .map(Number)
    .sort((a, b) => a - b);
  updateChartDensity(ctx, years.length);

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: annualMeta.shortLabel,
        data: years.map(yr => yearlyStats[yr]?.annualValue ?? null),
        backgroundColor: years.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length] + 'cc'),
        borderColor: years.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length]),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 28,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#d4dce0',
          borderWidth: 1,
          titleColor: '#1d2932',
          bodyColor: '#52636d',
          callbacks: {
            label: (ctx) => ` ${annualMeta.shortLabel}: ${formatNumberFull(ctx.parsed.y)} ${indicator.unit || ''}`,
          }
        }
      },
      scales: {
        x: { grid: { color: '#e4e8eb' }, ticks: { color: '#6b7881' } },
        y: {
          grid: { color: '#e4e8eb' },
          ticks: { color: '#6b7881', callback: (v) => formatNumber(v, 0) },
        }
      }
    }
  });
  return barChartInstance;
}

function renderComparisonChart(canvasId, comparisonPayload) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (comparisonChartInstance) comparisonChartInstance.destroy();

  const years = comparisonPayload.years || [];
  const labels = comparisonPayload.labels || years.map(String);
  const seriesCount = (comparisonPayload.series || []).length;
  updateChartDensity(ctx, seriesCount);
  const datasets = (comparisonPayload.series || []).map((serie, index) => {
    const color = YEAR_COLORS[index % YEAR_COLORS.length];
    return {
      label: serie.label,
      data: serie.values,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2.1,
      pointRadius: 2.8,
      pointHoverRadius: 5,
      tension: 0.16,
      fill: false,
      spanGaps: true,
    };
  });

  comparisonChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
      plugins: {
        legend: {
          display: seriesCount <= 10,
          position: 'top',
          labels: {
            color: '#52636d',
            font: { family: "'DM Sans', sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#d4dce0',
          borderWidth: 1,
          titleColor: '#1d2932',
          bodyColor: '#52636d',
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatNumberFull(ctx.parsed.y)} ${comparisonPayload.unit || ''}`,
            afterLabel: () => comparisonPayload.measureLabel ? ` Medida: ${comparisonPayload.measureLabel}` : '',
          }
        },
      },
      scales: {
        x: {
          grid: { color: '#e4e8eb' },
          ticks: {
            color: '#6b7881',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            autoSkip: true,
            maxTicksLimit: MONTHS.length,
          },
        },
        y: {
          grid: { color: '#e4e8eb' },
          ticks: {
            color: '#6b7881',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            callback: (v) => formatNumber(v, 0),
          },
        }
      }
    }
  });

  return comparisonChartInstance;
}
