const UNASSIGNED_DESTINATION_ID = '__unassigned__';

let destinations = [];
let indicators = [];
let currentDestination = null;
let currentIndicator = null;
let currentDataByYear = {};
let currentDataMetaByYear = {};
let currentYearlyStats = {};
let currentRelatedSeriesMap = {};
let visibleYears = [];
let comparisonSelection = { metricKey: '', destinationIds: [] };
let currentComparisonTablePayload = null;
let comparisonTableSort = { year: '', direction: 'original', measure: 'annualValue' };
let comparisonVisibleYears = [];
let comparisonZoomState = { signature: '', start: 0, span: null };
let rankingState = { metricKey: '', year: '', direction: 'desc', excludeAggregates: true };
let currentRankingPayload = null;
let insightsState = { destinationId: '', scope: 'all', indicatorId: '', periodMode: '__last2__', startYear: '', endYear: '' };
let currentInsightsPayload = null;
const groupCollapseState = { sidebar: {}, center: {} };
const overviewScrollState = {};
const individualTableSortState = {
  selectedYears: { key: 'year', direction: 'original' },
  yearlyStats: { key: 'year', direction: 'original' },
  monthlyData: { key: 'month', direction: 'original' },
};

function getIndicatorSortOrder(indicator) {
  const value = Number(indicator?.sort_order);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareIndicatorsForOrdering(a, b) {
  const orderDiff = getIndicatorSortOrder(a) - getIndicatorSortOrder(b);
  if (orderDiff !== 0) return orderDiff;
  return (a?.name || '').localeCompare(b?.name || '', 'es');
}

window.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  try {
    await Promise.all([loadDestinations(), loadIndicators()]);
    renderComparisonControls();
    renderTerritorialRankingControls();
    await renderAutomaticInsightsControls();
    showEmptyState();
  } catch (e) {
    document.getElementById('destinationList').innerHTML = '<p style="padding:16px;font-size:12px;color:var(--danger)">Error cargando destinos e indicadores</p>';
  }
}

async function loadDestinations() {
  destinations = await fetchDestinations();
}

async function loadIndicators() {
  indicators = await fetchIndicators();
  indicators.sort((a, b) => {
    const destA = (a.destination?.name || 'Sin destino').localeCompare(b.destination?.name || 'Sin destino', 'es');
    if (destA !== 0) return destA;
    return a.name.localeCompare(b.name, 'es');
  });
}

function getRenderableDestinations() {
  const list = [...destinations];
  if (indicators.some(ind => !ind.destination_id)) {
    list.push({ id: UNASSIGNED_DESTINATION_ID, name: 'Sin destino', pseudo: true });
  }
  return list;
}

function getIndicatorsForDestination(destinationId) {
  const scoped = destinationId === UNASSIGNED_DESTINATION_ID
    ? indicators.filter(ind => !ind.destination_id)
    : indicators.filter(ind => ind.destination_id === destinationId);

  return [...scoped].sort(compareIndicatorsForOrdering);
}

function getDestinationById(destinationId) {
  return getRenderableDestinations().find(dest => dest.id === destinationId) || null;
}

function getDestinationDisplayName(destination) {
  const name = String(destination?.name || '').replace(/\s+/g, ' ').trim();
  return name || 'Destino sin nombre';
}

function getIndicatorGroupTitle(indicator) {
  return (indicator?.group_title || '').trim() || 'Sin agrupar';
}


function applyPresenceToIndicators(indicatorIds, presence) {
  const idSet = new Set((indicatorIds || []).filter(Boolean));
  indicators.forEach(ind => {
    if (idSet.has(ind.id)) ind.has_data = presence.has(ind.id);
  });
  if (currentIndicator && idSet.has(currentIndicator.id)) {
    currentIndicator.has_data = presence.has(currentIndicator.id);
  }
}

function buildPresenceFromPoints(points) {
  return new Set((points || []).map(point => point.indicator_id).filter(Boolean));
}

function groupIndicatorsByTitle(items) {
  const orderedItems = [...items].sort(compareIndicatorsForOrdering);
  const groups = new Map();
  orderedItems.forEach(indicator => {
    const title = getIndicatorGroupTitle(indicator);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(indicator);
  });

  return [...groups.entries()]
    .map(([title, indicators]) => ({
      title,
      indicators,
      sortRank: Math.min(...indicators.map(getIndicatorSortOrder)),
    }))
    .sort((a, b) => {
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
      if (a.title === 'Sin agrupar' && b.title !== 'Sin agrupar') return 1;
      if (b.title === 'Sin agrupar' && a.title !== 'Sin agrupar') return -1;
      return a.title.localeCompare(b.title, 'es');
    });
}

function getGroupStateKey(destinationId, groupTitle) {
  return `${destinationId || UNASSIGNED_DESTINATION_ID}::${groupTitle}`;
}

function collapseSidebarGroupsForDestination(destinationId) {
  groupIndicatorsByTitle(getIndicatorsForDestination(destinationId)).forEach(group => {
    const key = getGroupStateKey(destinationId, group.title);
    groupCollapseState.sidebar[key] = true;
  });
}

function scrollSidebarToIndicatorTree() {
  const sidebar = document.querySelector('.sidebar');
  const sidebarList = document.getElementById('sidebarList');
  if (!sidebar || !sidebarList) return;

  requestAnimationFrame(() => {
    const isMobileLayout = window.matchMedia('(max-width: 900px)').matches;

    if (isMobileLayout) {
      const top = sidebarList.getBoundingClientRect().top + window.scrollY - 14;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: 'smooth',
      });
      sidebarList.classList.add('mobile-focus-pulse');
      window.setTimeout(() => sidebarList.classList.remove('mobile-focus-pulse'), 900);
      return;
    }

    sidebar.scrollTo({
      top: Math.max(0, sidebarList.offsetTop - 42),
      behavior: 'smooth',
    });
  });
}

function scrollToIndicatorDetail() {
  const mainView = document.getElementById('mainView');
  const mainContent = document.querySelector('.main-content');
  if (!mainView) return;

  requestAnimationFrame(() => {
    const isMobileLayout = window.matchMedia('(max-width: 900px)').matches;

    if (isMobileLayout) {
      const top = mainView.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: 'smooth',
      });
      return;
    }

    if (mainContent && mainContent.scrollHeight > mainContent.clientHeight + 4) {
      mainContent.scrollTo({
        top: Math.max(0, mainView.offsetTop - 12),
        behavior: 'smooth',
      });
      return;
    }

    const top = mainView.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });
  });
}

function isGroupCollapsed(scope, destinationId, groupTitle) {
  const key = getGroupStateKey(destinationId, groupTitle);
  return Boolean(groupCollapseState[scope]?.[key]);
}

function ensureIndicatorGroupExpanded(indicator, destinationId) {
  if (!indicator) return;
  const key = getGroupStateKey(destinationId, getIndicatorGroupTitle(indicator));
  groupCollapseState.sidebar[key] = false;
  groupCollapseState.center[key] = false;
}

function toggleGroupVisibility(scope, destinationId, encodedGroupTitle) {
  const groupTitle = decodeURIComponent(encodedGroupTitle);
  const key = getGroupStateKey(destinationId, groupTitle);
  if (!groupCollapseState[scope]) groupCollapseState[scope] = {};
  groupCollapseState[scope][key] = !groupCollapseState[scope][key];

  if (scope === 'sidebar') {
    renderSidebar();
  } else if (currentDestination) {
    showCurrentDestinationOverview();
  }
}

function renderGroupedSidebarIndicators(items, destinationId) {
  const groups = groupIndicatorsByTitle(items);
  return groups.map(group => {
    const collapsed = isGroupCollapsed('sidebar', destinationId, group.title);
    const encodedTitle = encodeURIComponent(group.title);
    return `
      <div class="indicator-tree-group ${collapsed ? 'is-collapsed' : ''}">
        <button type="button" class="indicator-tree-title group-toggle-btn" onclick="toggleGroupVisibility('sidebar', '${escapeJs(destinationId)}', '${encodedTitle}')">
          <span class="group-toggle-main">
            <span class="group-toggle-icon">▾</span>
            <span>${escapeHtml(group.title)}</span>
          </span>
          <span class="tree-count">${group.indicators.length}</span>
        </button>
        <div class="indicator-tree-items">
          ${group.indicators.map(ind => `
            <button class="indicator-item ${currentIndicator?.id === ind.id ? 'active' : ''}" onclick="selectIndicator('${ind.id}')">
              <span class="indicator-main">
                <span class="ind-name">${escapeHtml(ind.name)}</span>
                <span class="ind-unit">${escapeHtml(ind.unit || 'sin unidad')}</span>
              </span>
              ${ind.has_data ? '<span class="badge badge-green">datos</span>' : '<span class="badge badge-orange">vacío</span>'}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}


function renderDestinationQuickIndex(items, destinationId) {
  if (!items || !items.length) return '';
  const groups = groupIndicatorsByTitle(items);
  return `
    <div class="quick-index-header">
      <div>
        <h3>Accesos rápidos a indicadores</h3>
        <p>Seleccioná directamente el indicador que querés abrir, sin recorrer todas las tarjetas.</p>
      </div>
      <span class="badge badge-blue">${items.length} indicador${items.length !== 1 ? 'es' : ''}</span>
    </div>
    <div class="quick-index-groups">
      ${groups.map(group => `
        <div class="quick-index-group">
          <div class="quick-index-group-title">
            <span class="quick-index-dot"></span>
            <strong>${escapeHtml(group.title)}</strong>
            <span>${group.indicators.length}</span>
          </div>
          <div class="quick-index-links">
            ${group.indicators.map(ind => `
              <button class="quick-index-link" type="button" onclick="selectIndicator('${ind.id}')">
                <span>${escapeHtml(ind.name)}</span>
                ${ind.has_data ? '<small class="success">datos</small>' : '<small class="warning">vacío</small>'}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderGroupedOverviewCards(items, destinationId) {
  const groups = groupIndicatorsByTitle(items);
  return groups.map(group => {
    const collapsed = isGroupCollapsed('center', destinationId, group.title);
    const encodedTitle = encodeURIComponent(group.title);
    return `
      <section class="grouped-indicator-section ${collapsed ? 'is-collapsed' : ''}">
        <button type="button" class="grouped-indicator-section-header group-toggle-btn" onclick="toggleGroupVisibility('center', '${escapeJs(destinationId)}', '${encodedTitle}')">
          <div class="grouped-indicator-section-title">
            <span class="group-toggle-icon">▾</span>
            <h4>${escapeHtml(group.title)}</h4>
          </div>
          <span class="badge badge-blue">${group.indicators.length} indicador${group.indicators.length !== 1 ? 'es' : ''}</span>
        </button>
        <div class="grouped-indicator-section-body">
          <div class="destination-cards">
            ${group.indicators.map(ind => {
              const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(ind));
              return `
                <article class="indicator-overview-card">
                  <div>
                    <h4>${escapeHtml(ind.name)}</h4>
                    <p>${escapeHtml(ind.description || 'Sin descripción cargada.')}</p>
                  </div>
                  <div class="indicator-overview-meta">
                    <span>${escapeHtml(ind.unit || 'sin unidad')}</span>
                    <span>${annualMeta.shortLabel}</span>
                  </div>
                  <div class="indicator-overview-meta">
                    <span class="status-inline ${ind.has_data ? 'success' : 'warning'}">${ind.has_data ? 'Con datos' : 'Sin datos'}</span>
                    <span>${getMetricKey(ind) || 'sin clave comparable'}</span>
                  </div>
                  ${getMethodologyNote(ind) ? `<div class="indicator-overview-meta"><span class="indicator-note-badge">Nota metodológica</span><span>${escapeHtml(getMethodologyNote(ind))}</span></div>` : ''}
                  <div class="card-actions">
                    <button class="btn btn-primary btn-sm" onclick="selectIndicator('${ind.id}')">Ver indicador</button>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }).join('');
}

function getUniqueMetricOptions() {
  const byKey = new Map();
  indicators.forEach(ind => {
    const key = getMetricKey(ind);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { key, label: ind.name, unit: ind.unit || '' });
  });
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

async function hydrateDestinationDataStatus(destinationId) {
  const destinationIndicators = getIndicatorsForDestination(destinationId);
  const ids = destinationIndicators.map(ind => ind.id);
  if (!ids.length) return;
  try {
    const points = await fetchDataPointsForIndicators(ids);
    const presence = buildPresenceFromPoints(points);
    applyPresenceToIndicators(ids, presence);
  } catch (e) {
    try {
      const presence = await fetchIndicatorsWithData(ids);
      applyPresenceToIndicators(ids, presence);
    } catch (_) {
      // la vista pública sigue operativa aunque falle esta capa visual
    }
  }
}

async function refreshIndicatorsDataStatus(indicatorIds) {
  const ids = [...new Set((indicatorIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    const points = await fetchDataPointsForIndicators(ids);
    const presence = buildPresenceFromPoints(points);
    applyPresenceToIndicators(ids, presence);
  } catch (e) {
    try {
      const presence = await fetchIndicatorsWithData(ids);
      applyPresenceToIndicators(ids, presence);
    } catch (_) {
      // no rompo la UI por una capa visual
    }
  }
}

function renderSidebar() {
  const destinationList = document.getElementById('destinationList');
  const allDestinations = getRenderableDestinations();

  if (!allDestinations.length) {
    destinationList.innerHTML = '<p class="sidebar-hint">No hay destinos cargados.</p>';
  } else {
    destinationList.innerHTML = allDestinations.map(dest => {
      const count = getIndicatorsForDestination(dest.id).length;
      return `
        <button class="destination-item ${currentDestination?.id === dest.id ? 'active' : ''}" onclick="selectDestination('${dest.id}')">
          <span class="destination-main">
            <span class="destination-name">${escapeHtml(getDestinationDisplayName(dest))}</span>
            <span class="destination-meta">${count} indicador${count !== 1 ? 'es' : ''}</span>
          </span>
          <span class="destination-count">${count}</span>
        </button>
      `;
    }).join('');
  }

  const sidebarList = document.getElementById('sidebarList');
  if (!currentDestination) {
    sidebarList.innerHTML = '<div class="sidebar-hint">Seleccioná un destino para ver sus indicadores.</div>';
    return;
  }

  const currentIndicators = getIndicatorsForDestination(currentDestination.id);
  if (!currentIndicators.length) {
    sidebarList.innerHTML = '<div class="sidebar-hint">Este destino todavía no tiene indicadores.</div>';
    return;
  }

  sidebarList.innerHTML = renderGroupedSidebarIndicators(currentIndicators, currentDestination.id);
}

async function selectDestination(destinationId) {
  currentDestination = getDestinationById(destinationId);
  if (!currentDestination) return;

  if (currentIndicator && currentIndicator.destination_id !== (destinationId === UNASSIGNED_DESTINATION_ID ? null : destinationId)) {
    currentIndicator = null;
    destroyCharts();
  }

  overviewScrollState[currentDestination.id] = 0;
  await hydrateDestinationDataStatus(destinationId);
  collapseSidebarGroupsForDestination(destinationId);
  renderSidebar();
  showCurrentDestinationOverview({ restoreScroll: false });
  scrollSidebarToIndicatorTree();
}

function showCurrentDestinationOverview({ restoreScroll = true } = {}) {
  if (!currentDestination) {
    showEmptyState();
    return;
  }

  currentIndicator = null;
  renderSidebar();

  const items = getIndicatorsForDestination(currentDestination.id);
  const withData = items.filter(ind => ind.has_data).length;
  const withoutData = items.length - withData;

  document.getElementById('destinationTitle').textContent = getDestinationDisplayName(currentDestination);
  document.getElementById('destinationBadge').textContent = `${items.length} indicador${items.length !== 1 ? 'es' : ''}`;
  document.getElementById('destinationSubtitle').textContent = items.length
    ? 'Seleccioná un indicador para entrar al detalle, comparar su evolución anual y exportarlo.'
    : 'Todavía no hay indicadores asociados a este destino.';
  document.getElementById('overviewIndicatorsCount').textContent = String(items.length);
  document.getElementById('overviewWithDataCount').textContent = String(withData);
  document.getElementById('overviewWithoutDataCount').textContent = String(withoutData);

  const quickIndex = document.getElementById('destinationQuickIndex');
  const cards = document.getElementById('destinationCards');
  const empty = document.getElementById('destinationCardsEmpty');
  if (!items.length) {
    if (quickIndex) {
      quickIndex.innerHTML = '';
      quickIndex.style.display = 'none';
    }
    cards.innerHTML = '';
    empty.style.display = 'block';
  } else {
    if (quickIndex) {
      quickIndex.innerHTML = renderDestinationQuickIndex(items, currentDestination.id);
      quickIndex.style.display = 'block';
    }
    empty.style.display = 'none';
    cards.innerHTML = renderGroupedOverviewCards(items, currentDestination.id);
  }

  document.getElementById('mainEmpty').style.display = 'none';
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('destinationOverview').style.display = 'block';

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    const targetScroll = restoreScroll ? (overviewScrollState[currentDestination.id] || 0) : 0;
    requestAnimationFrame(() => {
      mainContent.scrollTo({ top: targetScroll, behavior: 'auto' });
    });
  }
}

async function selectIndicator(id) {
  currentIndicator = indicators.find(i => i.id === id);
  if (!currentIndicator) return;

  const mainContent = document.querySelector('.main-content');
  if (currentDestination?.id && mainContent) {
    overviewScrollState[currentDestination.id] = mainContent.scrollTop;
  }

  const destinationId = currentIndicator.destination_id || UNASSIGNED_DESTINATION_ID;
  ensureIndicatorGroupExpanded(currentIndicator, destinationId);
  currentDestination = getDestinationById(destinationId);
  renderSidebar();

  try {
    const destinationIndicators = getIndicatorsForDestination(destinationId);
    const destinationIds = destinationIndicators.map(ind => ind.id);
    const allPoints = await fetchDataPointsForIndicators(destinationIds);
    const dataByIndicator = buildDataByIndicator(allPoints);
    const currentPoints = dataByIndicator[currentIndicator.id] || [];
    currentIndicator.has_data = currentPoints.length > 0;
    const indicatorRef = indicators.find(ind => ind.id === currentIndicator.id);
    if (indicatorRef) indicatorRef.has_data = currentIndicator.has_data;
    renderSidebar();
    currentDataByYear = buildDataByYear(currentPoints);
    currentDataMetaByYear = buildDataPointMetaByYear(currentPoints);
    currentRelatedSeriesMap = buildRelatedSeriesMapForDestination(currentIndicator, destinationIndicators, dataByIndicator);
    currentYearlyStats = calcYearlyStats(currentDataByYear, { indicator: currentIndicator, relatedSeriesMap: currentRelatedSeriesMap });
    visibleYears = getAvailableYears();
    renderDashboard();
    document.getElementById('mainEmpty').style.display = 'none';
    document.getElementById('destinationOverview').style.display = 'none';
    document.getElementById('mainView').style.display = 'block';
    scrollToIndicatorDetail();
  } catch (e) {
    toast('Error cargando el indicador: ' + e.message, 'error');
  }
}

function renderDashboard() {
  const years = getAvailableYears();
  const shownYears = getVisibleYears();
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(currentIndicator));
  document.getElementById('viewTitle').textContent = currentIndicator.name;
  document.getElementById('viewDesc').textContent = currentIndicator.description || '';
  document.getElementById('viewDestinationBadge').textContent = currentDestination ? getDestinationDisplayName(currentDestination) : 'Sin destino';
  document.getElementById('statsUnit').textContent = currentIndicator.unit || 'unidades';
  document.getElementById('yearsCount').textContent = shownYears.length === years.length
    ? years.length + ' año' + (years.length !== 1 ? 's' : '')
    : shownYears.length + ' de ' + years.length + ' año' + (years.length !== 1 ? 's' : '');
  const statsAnnualHeaderEl = document.getElementById('statsAnnualHeader');
  if (statsAnnualHeaderEl) statsAnnualHeaderEl.textContent = annualMeta.shortLabel;
  document.getElementById('annualChartTitle').textContent = annualMeta.shortLabel;
  document.getElementById('annualChartNote').textContent = currentIndicator.annual_chart_visible === false ? 'Oculto por configuración' : annualMeta.description;
  document.getElementById('annualCalcBadge').textContent = annualMeta.label;
  document.getElementById('annualCalcHelp').textContent = annualMeta.description;

  const methodologyNote = getMethodologyNote(currentIndicator);
  const methodologyCard = document.getElementById('methodologyCard');
  const methodologyNoteText = document.getElementById('methodologyNoteText');
  if (methodologyNote) {
    methodologyCard.style.display = 'block';
    methodologyNoteText.textContent = methodologyNote;
  } else {
    methodologyCard.style.display = 'none';
    methodologyNoteText.textContent = '—';
  }

  renderYearFilter();

  const allVals = Object.values(currentDataByYear).flat().filter(v => v !== null && !isNaN(v)).map(Number);
  const globalStats = calcStats(allVals);
  const selectedVals = getValuesForYears(currentDataByYear, shownYears);
  const selectedStats = calcStats(selectedVals);
  const selectedLabel = getSelectedYearsLabel(shownYears, years);
  const selectedAppliedMetric = calculateAppliedMetricForYears(currentIndicator, currentDataByYear, currentYearlyStats, shownYears, currentRelatedSeriesMap);
  const globalAppliedMetric = calculateAppliedMetricForYears(currentIndicator, currentDataByYear, currentYearlyStats, years, currentRelatedSeriesMap, { scope: 'global' });

  const selectedKpis = [
    { label: selectedAppliedMetric.label, value: formatNumber(selectedAppliedMetric.value), sub: selectedAppliedMetric.sub || selectedLabel, accent: '#10B981' },
    { label: 'Promedio mensual', value: formatNumber(selectedStats?.mean), sub: selectedLabel, accent: 'var(--accent)' },
    { label: 'Mediana mensual', value: formatNumber(selectedStats?.median), sub: selectedLabel, accent: '#06B6D4' },
    { label: 'Máximo mensual', value: formatNumber(selectedStats?.max), sub: selectedLabel, accent: '#A855F7' },
    { label: 'Mínimo mensual', value: formatNumber(selectedStats?.min), sub: selectedLabel, accent: '#F97316' },
    { label: 'Desvío estándar', value: formatNumber(selectedStats?.stdDev), sub: 'Serie seleccionada', accent: '#EAB308' },
  ];

  const globalKpis = [
    { label: globalAppliedMetric.label, value: formatNumber(globalAppliedMetric.value), sub: globalAppliedMetric.sub || 'Todos los años cargados', accent: '#10B981' },
    { label: 'Promedio mensual global', value: formatNumber(globalStats?.mean), sub: 'Todos los años cargados', accent: 'var(--accent)' },
    { label: 'Mediana global', value: formatNumber(globalStats?.median), sub: 'Todos los años cargados', accent: '#06B6D4' },
    { label: 'Máximo histórico', value: formatNumber(globalStats?.max), sub: 'Toda la serie', accent: '#A855F7' },
    { label: 'Mínimo histórico', value: formatNumber(globalStats?.min), sub: 'Toda la serie', accent: '#F97316' },
    { label: 'Años cargados', value: years.length ? String(years.length) : '-', sub: years.length ? `${years[0]}–${years[years.length - 1]}` : 'Sin serie', accent: '#EAB308' },
  ];

  const renderKpiCard = (k) => `
    <div class="kpi-card" style="--accent-color:${k.accent}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.change !== undefined && k.change !== null ? `<div class="kpi-change ${k.change >= 0 ? 'up' : 'down'}">${k.change >= 0 ? '▲' : '▼'} ${formatPct(k.change)}</div>` : k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
    </div>
  `;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-grid-section-title kpi-grid-full">
      <span>Medidas de la selección visible</span>
      <small>${escapeHtml(selectedLabel)}</small>
    </div>
    ${selectedKpis.map(renderKpiCard).join('')}
    ${renderSelectedYearStatsTable(shownYears, currentYearlyStats, annualMeta)}
    <div class="kpi-grid-section-title kpi-grid-full">
      <span>Histórico global del indicador</span>
      <small>Calculado con todos los años cargados, aunque estén ocultos en el gráfico.</small>
    </div>
    ${globalKpis.map(renderKpiCard).join('')}
  `;

  destroyCharts();
  const filteredDataByYear = filterDataByYear(currentDataByYear, shownYears);
  const filteredYearlyStats = filterYearlyStats(currentYearlyStats, shownYears);
  const hasVisibleYears = shownYears.length > 0;

  document.getElementById('lineChartEmpty').style.display = hasVisibleYears ? 'none' : 'flex';
  document.getElementById('lineChartWrap').style.display = hasVisibleYears ? 'block' : 'none';
  if (hasVisibleYears) {
    const filteredMetaByYear = Object.fromEntries(shownYears.map(year => [year, currentDataMetaByYear?.[year] || new Array(12).fill(null)]));
    renderLineChart('lineChart', filteredDataByYear, currentIndicator, filteredMetaByYear);
  }

  const annualChartCard = document.getElementById('annualChartCard');
  const annualChartVisible = currentIndicator.annual_chart_visible !== false && getIndicatorCalcMode(currentIndicator) !== 'none';
  if (!annualChartVisible) {
    annualChartCard.style.display = 'none';
  } else {
    annualChartCard.style.display = 'block';
    document.getElementById('barChartEmpty').style.display = hasVisibleYears ? 'none' : 'flex';
    document.getElementById('barChartWrap').style.display = hasVisibleYears ? 'block' : 'none';
    if (hasVisibleYears) {
      renderBarChart('barChart', filteredYearlyStats, currentIndicator);
    }
  }

  renderYearStatsTable(years, currentYearlyStats, annualMeta);
  renderMonthlyDataTable(years);
}



function getNextSortDirection(currentDirection, sameColumn) {
  if (!sameColumn) return 'asc';
  if (currentDirection === 'asc') return 'desc';
  if (currentDirection === 'desc') return 'original';
  return 'asc';
}

function setIndividualTableSort(tableKey, sortKey) {
  const state = individualTableSortState[tableKey];
  if (!state) return;
  const sameColumn = state.key === sortKey;
  state.direction = getNextSortDirection(state.direction, sameColumn);
  state.key = sortKey;
  renderDashboard();
}

function getIndividualSortIndicator(tableKey, sortKey) {
  const state = individualTableSortState[tableKey];
  if (!state || state.key !== sortKey || state.direction === 'original') return '↕';
  return state.direction === 'asc' ? '↑' : '↓';
}

function renderSortableHeader(tableKey, sortKey, label, options = {}) {
  const alignClass = options.align === 'left' ? ' sortable-th-left' : '';
  const active = individualTableSortState?.[tableKey]?.key === sortKey && individualTableSortState?.[tableKey]?.direction !== 'original';
  return `
    <th class="sortable-th${alignClass}${active ? ' active' : ''}">
      <button type="button" class="sortable-th-btn" onclick="setIndividualTableSort('${tableKey}', '${escapeJs(sortKey)}')" title="Ordenar por ${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
        <span class="sort-indicator">${getIndividualSortIndicator(tableKey, sortKey)}</span>
      </button>
    </th>
  `;
}

function isSortableValueMissing(value) {
  return value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
}

function normalizeSortableValue(value) {
  if (isSortableValueMissing(value)) return null;
  if (typeof value === 'number') return value;
  const numeric = Number(value);
  if (!isNaN(numeric)) return numeric;
  return String(value || '').toLowerCase();
}

function compareSortableValues(a, b, direction) {
  const av = normalizeSortableValue(a);
  const bv = normalizeSortableValue(b);
  const aMissing = av === null;
  const bMissing = bv === null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  let result;
  if (typeof av === 'number' && typeof bv === 'number') {
    result = av - bv;
  } else {
    result = String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
  }
  return direction === 'desc' ? -result : result;
}

function sortRowsWithState(rows, state, valueGetter) {
  const safeRows = [...(rows || [])];
  if (!state || state.direction === 'original') {
    return safeRows.sort((a, b) => a.originalIndex - b.originalIndex);
  }
  return safeRows.sort((a, b) => {
    const result = compareSortableValues(valueGetter(a, state.key), valueGetter(b, state.key), state.direction);
    return result !== 0 ? result : a.originalIndex - b.originalIndex;
  });
}

function getYearStatsSortValue(row, key) {
  switch (key) {
    case 'year': return row.year;
    case 'annual': return row.stats?.annualValue;
    case 'mean': return row.stats?.mean;
    case 'median': return row.stats?.median;
    case 'max': return row.stats?.max;
    case 'min': return row.stats?.min;
    case 'stdDev': return row.stats?.stdDev;
    case 'yoy': return row.stats?.yoyAnnual;
    default: return row.year;
  }
}


function getYearStatsColumnDefinitions(tableKey, annualMeta) {
  return [
    { key: 'year', label: 'Año', align: 'left' },
    { key: 'annual', label: annualMeta.shortLabel },
    { key: 'mean', label: 'Promedio mensual' },
    { key: 'median', label: 'Mediana' },
    { key: 'max', label: 'Máximo' },
    { key: 'min', label: 'Mínimo' },
    { key: 'stdDev', label: 'Desvío Std' },
    { key: 'yoy', label: 'Var. interanual' },
  ].map(def => ({ ...def, header: renderSortableHeader(tableKey, def.key, def.label, { align: def.align }) }));
}

function getFocusedYearStatsColumnKey(tableKey) {
  const state = individualTableSortState?.[tableKey];
  if (!state || state.direction === 'original' || state.key === 'year') return '';
  return state.key;
}

function renderYearStatsValueCell(row, key) {
  const s = row.stats || {};
  if (key === 'year') return `<td><strong>${row.year}</strong></td>`;
  if (key === 'annual') return `<td>${formatNumber(s?.annualValue)}</td>`;
  if (key === 'mean') return `<td>${formatNumber(s?.mean)}</td>`;
  if (key === 'median') return `<td>${formatNumber(s?.median)}</td>`;
  if (key === 'max') return `<td>${formatNumber(s?.max)}</td>`;
  if (key === 'min') return `<td>${formatNumber(s?.min)}</td>`;
  if (key === 'stdDev') return `<td>${formatNumber(s?.stdDev)}</td>`;
  if (key === 'yoy') {
    const yoy = s?.yoyAnnual;
    return `<td class="${yoy !== undefined && yoy !== null ? (yoy >= 0 ? 'positive' : 'negative') : ''}">${yoy !== undefined && yoy !== null ? formatPct(yoy) : '-'}</td>`;
  }
  return '<td>-</td>';
}

function getVisibleYearStatsColumns(tableKey, annualMeta) {
  return getYearStatsColumnDefinitions(tableKey, annualMeta);
}

function renderYearStatsTable(years, yearlyStats, annualMeta) {
  const head = document.getElementById('statsHead');
  const body = document.getElementById('statsBody');
  if (!head || !body) return;

  const columns = getVisibleYearStatsColumns('yearlyStats', annualMeta);
  head.innerHTML = `<tr>${columns.map(column => column.header).join('')}</tr>`;

  const rows = (years || []).map((year, index) => ({ year, stats: yearlyStats?.[year] || {}, originalIndex: index }));
  const sortedRows = sortRowsWithState(rows, individualTableSortState.yearlyStats, getYearStatsSortValue);
  body.innerHTML = sortedRows.map(row => `<tr>${columns.map(column => renderYearStatsValueCell(row, column.key)).join('')}</tr>`).join('');
}

function getMonthlySortValue(row, key) {
  if (key === 'month') return row.monthIndex;
  if (String(key || '').startsWith('year:')) {
    const year = Number(String(key).split(':')[1]);
    return currentDataByYear?.[year]?.[row.monthIndex];
  }
  return row.monthIndex;
}

function renderMonthlyDataTable(years) {
  const mt = document.getElementById('monthlyTable');
  if (!mt) return;
  const rows = MONTHS.map((monthName, monthIndex) => ({ monthName, monthIndex, originalIndex: monthIndex }));
  const sortedRows = sortRowsWithState(rows, individualTableSortState.monthlyData, getMonthlySortValue);
  const visibleColumns = years || [];
  const header = `<thead><tr>
    ${renderSortableHeader('monthlyData', 'month', 'Mes', { align: 'left' })}
    ${visibleColumns.map(year => renderSortableHeader('monthlyData', `year:${year}`, String(year))).join('')}
  </tr></thead>`;
  const bodyRows = sortedRows.map(row => `
    <tr>
      <td>${escapeHtml(row.monthName)}</td>
      ${visibleColumns.map(year => renderMonthlyDataCell(currentDataByYear[year]?.[row.monthIndex], currentDataMetaByYear?.[year]?.[row.monthIndex])).join('')}
    </tr>
  `).join('');
  mt.innerHTML = header + `<tbody>${bodyRows}</tbody>`;
}

function getValuesForYears(dataByYear, years) {
  const selected = new Set((years || []).map(Number));
  return Object.entries(dataByYear || {})
    .filter(([year]) => selected.has(Number(year)))
    .flatMap(([, values]) => values || [])
    .filter(value => value !== null && value !== undefined && !isNaN(value))
    .map(Number);
}

function getAnnualValuesForYears(yearlyStats, years) {
  return (years || [])
    .map(year => yearlyStats?.[year]?.annualValue)
    .filter(value => value !== null && value !== undefined && !isNaN(value))
    .map(Number);
}


function calculateAppliedMetricForYears(indicator, dataByYear, yearlyStats, selectedYears, relatedSeriesMap = {}, options = {}) {
  const years = [...new Set((selectedYears || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const mode = getIndicatorCalcMode(indicator);
  const values = getValuesForYears(dataByYear, years);
  const stats = calcStats(values);
  const singleYear = years.length === 1 ? years[0] : null;
  const isGlobal = options.scope === 'global';
  const periodLabel = singleYear ? `Año ${singleYear}` : getSelectedYearsLabel(years, getAvailableYears());

  if (!years.length) {
    return {
      label: annualMeta.shortLabel,
      value: null,
      sub: 'Sin años seleccionados',
    };
  }

  if (singleYear) {
    return {
      label: `${annualMeta.shortLabel} ${singleYear}`,
      value: yearlyStats?.[singleYear]?.annualValue ?? null,
      sub: getAppliedMetricHelpText(mode, true),
    };
  }

  switch (mode) {
    case 'sum':
      return {
        label: isGlobal ? 'Total histórico' : 'Total de la selección',
        value: stats?.sum ?? null,
        sub: isGlobal ? 'Suma de todos los meses cargados' : 'Suma de los meses visibles',
      };
    case 'average':
      return {
        label: isGlobal ? 'Promedio aplicado global' : 'Promedio de la selección',
        value: stats?.mean ?? null,
        sub: isGlobal ? 'Promedio mensual de toda la serie' : 'Promedio mensual de los años visibles',
      };
    case 'last_value':
      return {
        label: isGlobal ? 'Último valor histórico' : 'Último valor de la selección',
        value: getLastNonNull(values),
        sub: isGlobal ? 'Último mes con dato de toda la serie' : 'Último mes con dato entre los años visibles',
      };
    case 'max':
      return {
        label: isGlobal ? 'Máximo histórico aplicado' : 'Máximo de la selección',
        value: stats?.max ?? null,
        sub: isGlobal ? 'Mayor valor mensual de toda la serie' : 'Mayor valor mensual visible',
      };
    case 'min':
      return {
        label: isGlobal ? 'Mínimo histórico aplicado' : 'Mínimo de la selección',
        value: stats?.min ?? null,
        sub: isGlobal ? 'Menor valor mensual de toda la serie' : 'Menor valor mensual visible',
      };
    case 'ratio_of_sums': {
      const numeratorKey = String(indicator?.formula_numerator_key || '').trim();
      const denominatorKey = String(indicator?.formula_denominator_key || '').trim();
      const multiplier = indicator?.formula_multiplier === null || indicator?.formula_multiplier === undefined || indicator?.formula_multiplier === ''
        ? 1
        : Number(indicator.formula_multiplier);
      const numerator = sumClean(years.flatMap(year => relatedSeriesMap?.[numeratorKey]?.[year] || []));
      const denominator = sumClean(years.flatMap(year => relatedSeriesMap?.[denominatorKey]?.[year] || []));
      return {
        label: isGlobal ? 'Valor recalculado global' : 'Valor recalculado selección',
        value: denominator ? (numerator / denominator) * multiplier : null,
        sub: isGlobal ? 'Recalculado con toda la serie cargada' : 'Recalculado con numerador y denominador visibles',
      };
    }
    case 'none':
      return {
        label: 'Medida anual oculta',
        value: null,
        sub: 'Sin valor principal por configuración',
      };
    default:
      return {
        label: annualMeta.shortLabel,
        value: stats?.sum ?? null,
        sub: periodLabel,
      };
  }
}

function getAppliedMetricHelpText(mode, isSingleYear = false) {
  switch (mode) {
    case 'sum':
      return isSingleYear ? 'Suma de los meses del año' : 'Suma de los meses visibles';
    case 'average':
      return isSingleYear ? 'Promedio simple de los meses del año' : 'Promedio simple de los meses visibles';
    case 'last_value':
      return isSingleYear ? 'Último mes con dato del año' : 'Último mes con dato visible';
    case 'max':
      return isSingleYear ? 'Mayor valor mensual del año' : 'Mayor valor mensual visible';
    case 'min':
      return isSingleYear ? 'Menor valor mensual del año' : 'Menor valor mensual visible';
    case 'ratio_of_sums':
      return isSingleYear ? 'Recalculado con numerador y denominador del año' : 'Recalculado con numerador y denominador visibles';
    case 'none':
      return 'Sin valor principal por configuración';
    default:
      return 'Regla anual configurada para el indicador';
  }
}

function getSelectedYearsLabel(selectedYears, availableYears) {
  if (!selectedYears.length) return 'Sin años seleccionados';
  if (selectedYears.length === 1) return `Año ${selectedYears[0]}`;
  if (selectedYears.length === availableYears.length) return 'Serie completa visible';
  const first = selectedYears[0];
  const last = selectedYears[selectedYears.length - 1];
  return `${selectedYears.length} años seleccionados · ${first}–${last}`;
}

function renderSelectedYearStatsTable(selectedYears, yearlyStats, annualMeta) {
  if (!selectedYears.length) {
    return `
      <div class="selected-year-stats-card kpi-grid-full">
        <div class="selected-year-stats-header">
          <div>
            <h3>Medidas por año seleccionado</h3>
            <p>Activá uno o varios años para ver sus medidas individuales.</p>
          </div>
        </div>
        <div class="selected-year-empty">No hay años seleccionados.</div>
      </div>
    `;
  }

  const rows = selectedYears.map((year, index) => ({
    year,
    stats: yearlyStats?.[year] || {},
    originalIndex: index,
  }));
  const columns = getVisibleYearStatsColumns('selectedYears', annualMeta);
  const sortedRows = sortRowsWithState(rows, individualTableSortState.selectedYears, getYearStatsSortValue);
  const rowHtml = sortedRows.map(row => `<tr>${columns.map(column => renderYearStatsValueCell(row, column.key)).join('')}</tr>`).join('');

  return `
    <div class="selected-year-stats-card kpi-grid-full">
      <div class="selected-year-stats-header">
        <div>
          <h3>Medidas por año seleccionado</h3>
          <p>Lectura individual de los años activos en los chips superiores.</p>
        </div>
        <span class="badge badge-blue">${selectedYears.length} año${selectedYears.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="selected-year-stats-table-wrap">
        <table class="data-table selected-year-stats-table">
          <thead>
            <tr>${columns.map(column => column.header).join('')}</tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMonthlyDataCell(value, meta) {
  const title = getDataPointAnnotationText(meta);
  const suffix = hasDataPointAnnotation(meta) ? '<span class="data-point-flag" aria-hidden="true">*</span>' : '';
  return `<td ${title ? `title="${escapeHtml(title)}"` : ''}>${formatNumber(value)}${suffix}</td>`;
}

function getAvailableYears() {
  return Object.keys(currentDataByYear).map(Number).sort((a, b) => a - b);
}

function getVisibleYears() {
  const availableYears = getAvailableYears();
  if (!availableYears.length) return [];
  const availableSet = new Set(availableYears);
  const cleaned = visibleYears.filter(year => availableSet.has(year)).sort((a, b) => a - b);
  visibleYears = cleaned;
  return cleaned;
}

function renderYearFilter() {
  const container = document.getElementById('yearFilterList');
  if (!container) return;
  const availableYears = getAvailableYears();
  const selectedYears = getVisibleYears();

  if (!availableYears.length) {
    container.innerHTML = '<div class="help-text">Este indicador todavía no tiene años cargados.</div>';
    return;
  }

  const selectedSet = new Set(selectedYears);
  container.innerHTML = availableYears.map(year => {
    const active = selectedSet.has(year);
    return `
      <button
        type="button"
        class="chip-toggle ${active ? 'active' : ''}"
        aria-pressed="${active ? 'true' : 'false'}"
        onclick="toggleVisibleYear(${year})"
      >
        <span class="chip-toggle-marker">${active ? '✓' : '+'}</span>
        <span>${year}</span>
      </button>
    `;
  }).join('');
}

function toggleVisibleYear(year) {
  const next = new Set(getVisibleYears());
  if (next.has(year)) {
    next.delete(year);
  } else {
    next.add(year);
  }
  visibleYears = [...next].sort((a, b) => a - b);
  renderDashboard();
}

function selectAllVisibleYears() {
  visibleYears = getAvailableYears();
  renderDashboard();
}

function clearVisibleYears() {
  visibleYears = [];
  renderDashboard();
}

function filterDataByYear(dataByYear, years) {
  const yearSet = new Set(years);
  return Object.fromEntries(
    Object.entries(dataByYear)
      .filter(([year]) => yearSet.has(Number(year)))
      .map(([year, values]) => [year, values])
  );
}

function filterYearlyStats(yearlyStats, years) {
  const yearSet = new Set(years);
  const filteredEntries = Object.entries(yearlyStats)
    .filter(([key]) => key === '__meta' || yearSet.has(Number(key)));
  return Object.fromEntries(filteredEntries);
}

function showEmptyState() {
  currentDestination = null;
  currentIndicator = null;
  visibleYears = [];
  destroyCharts();
  renderSidebar();
  document.getElementById('mainEmpty').style.display = 'block';
  document.getElementById('destinationOverview').style.display = 'none';
  document.getElementById('mainView').style.display = 'none';
}


function normalizeComparisonText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildComparableMetricOptions() {
  const byKey = new Map();
  indicators.forEach(ind => {
    const key = getMetricKey(ind);
    if (!key || !ind.destination_id) return;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: ind.name || key,
        unit: ind.unit || '',
        groupTitle: getIndicatorGroupTitle(ind),
        destinationIds: new Set(),
      });
    }
    const entry = byKey.get(key);
    entry.destinationIds.add(ind.destination_id);
    if (!entry.unit && ind.unit) entry.unit = ind.unit;
    const groupTitle = getIndicatorGroupTitle(ind);
    if ((!entry.groupTitle || entry.groupTitle === 'Sin agrupar') && groupTitle && groupTitle !== 'Sin agrupar') {
      entry.groupTitle = groupTitle;
    }
  });

  return [...byKey.values()]
    .map(item => ({
      ...item,
      count: item.destinationIds.size,
      destinationIds: [...item.destinationIds],
      groupTitle: item.groupTitle || 'Sin agrupar',
    }))
    .filter(item => item.count >= 2)
    .sort((a, b) => {
      const groupDiff = (a.groupTitle || '').localeCompare(b.groupTitle || '', 'es');
      if (groupDiff !== 0) return groupDiff;
      return (a.label || '').localeCompare(b.label || '', 'es');
    });
}

function getFilteredComparableMetricOptions() {
  const options = buildComparableMetricOptions();
  const searchEl = document.getElementById('compareMetricSearch');
  const query = normalizeComparisonText(searchEl?.value || '');
  if (!query) return options;
  return options.filter(opt => {
    const haystack = normalizeComparisonText(`${opt.label} ${opt.groupTitle} ${opt.unit}`);
    return haystack.includes(query);
  });
}


function buildRankingMetricOptions() {
  return buildComparableMetricOptions();
}

function isAggregateDestinationName(name) {
  const normalized = normalizeComparisonText(name || '');
  return normalized === 'total pais' || normalized.startsWith('region ');
}

function getRankingDestinationById(destinationId) {
  return destinations.find(dest => dest.id === destinationId) || null;
}

function getRankingCandidateIndicators(metricKey = rankingState.metricKey, { excludeAggregates = rankingState.excludeAggregates } = {}) {
  const byDestination = new Map();
  indicators
    .filter(ind => getMetricKey(ind) === metricKey && ind.destination_id)
    .sort(compareIndicatorsForOrdering)
    .forEach(indicator => {
      const destination = getRankingDestinationById(indicator.destination_id) || indicator.destination || null;
      if (!destination) return;
      if (excludeAggregates && isAggregateDestinationName(destination.name)) return;
      if (!byDestination.has(destination.id)) {
        byDestination.set(destination.id, { ...indicator, destination });
      }
    });
  return [...byDestination.values()];
}

function getFilteredRankingMetricOptions() {
  const options = buildRankingMetricOptions();
  const query = normalizeComparisonText(document.getElementById('rankingMetricSearch')?.value || '');
  if (!query) return options;
  return options.filter(opt => normalizeComparisonText(`${opt.label} ${opt.groupTitle} ${opt.unit}`).includes(query));
}

function renderRankingMetricOptions(options, selectedMetric) {
  const select = document.getElementById('rankingMetricKey');
  if (!select) return;
  if (!options.length) {
    select.innerHTML = '<option value="">Sin indicadores para ranking</option>';
    return;
  }

  const groups = new Map();
  options.forEach(opt => {
    const groupTitle = opt.groupTitle || 'Sin agrupar';
    if (!groups.has(groupTitle)) groups.set(groupTitle, []);
    groups.get(groupTitle).push(opt);
  });

  select.innerHTML = [...groups.entries()].map(([groupTitle, items]) => `
    <optgroup label="${escapeHtml(groupTitle)}">
      ${items.map(opt => {
        const unit = opt.unit ? ` · ${escapeHtml(opt.unit)}` : '';
        const countLabel = `${opt.count} destino${opt.count !== 1 ? 's' : ''}`;
        return `<option value="${escapeHtml(opt.key)}" ${selectedMetric === opt.key ? 'selected' : ''}>${escapeHtml(opt.label)}${unit} · ${countLabel}</option>`;
      }).join('')}
    </optgroup>
  `).join('');
}

function renderTerritorialRankingControls() {
  const options = getFilteredRankingMetricOptions();
  const select = document.getElementById('rankingMetricKey');
  const results = document.getElementById('rankingResults');
  const empty = document.getElementById('rankingEmpty');
  const badge = document.getElementById('rankingSummaryBadge');
  if (!select) return;

  if (!options.length) {
    rankingState.metricKey = '';
    renderRankingMetricOptions([], '');
    if (results) results.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'No hay indicadores repetidos en dos o más destinos para armar rankings.';
    }
    if (badge) badge.textContent = 'Sin ranking';
    populateRankingYearOptions([]);
    return;
  }

  const currentStillVisible = options.some(opt => opt.key === rankingState.metricKey);
  rankingState.metricKey = currentStillVisible ? rankingState.metricKey : options[0].key;
  renderRankingMetricOptions(options, rankingState.metricKey);
  updateRankingYearOptions();
}

function handleRankingMetricSearch() {
  currentRankingPayload = null;
  renderTerritorialRankingControls();
  clearTerritorialRankingResults('Elegí un indicador y generá el ranking territorial.');
}

function handleRankingMetricChange() {
  rankingState.metricKey = document.getElementById('rankingMetricKey')?.value || '';
  currentRankingPayload = null;
  clearTerritorialRankingResults('Elegí un período y generá el ranking territorial.');
  updateRankingYearOptions();
}

function handleRankingControlChange() {
  rankingState.year = document.getElementById('rankingYear')?.value || '';
  rankingState.direction = document.getElementById('rankingDirection')?.value || 'desc';
  rankingState.excludeAggregates = document.getElementById('rankingExcludeAggregates')?.checked !== false;
  if (currentRankingPayload) runTerritorialRanking();
  else updateRankingYearOptions();
}

function clearTerritorialRankingResults(message = 'Elegí un indicador y generá el ranking territorial.') {
  const results = document.getElementById('rankingResults');
  const empty = document.getElementById('rankingEmpty');
  const badge = document.getElementById('rankingSummaryBadge');
  if (results) {
    results.innerHTML = '';
    results.style.display = 'none';
  }
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = message;
  }
  if (badge) badge.textContent = 'Sin ranking';
}

function collectRankingFetchIndicatorIds(candidates) {
  const ids = new Set(candidates.map(ind => ind.id));
  candidates.forEach(indicator => {
    if (getIndicatorCalcMode(indicator) !== 'ratio_of_sums') return;
    const numeratorKey = String(indicator.formula_numerator_key || '').trim();
    const denominatorKey = String(indicator.formula_denominator_key || '').trim();
    if (!numeratorKey || !denominatorKey) return;
    indicators
      .filter(ind => ind.destination_id === indicator.destination_id)
      .filter(ind => [numeratorKey, denominatorKey].includes(getMetricKey(ind)))
      .forEach(ind => ids.add(ind.id));
  });
  return [...ids];
}

function populateRankingYearOptions(years) {
  const select = document.getElementById('rankingYear');
  if (!select) return;
  const cleanYears = [...new Set((years || []).map(Number).filter(Number.isFinite))].sort((a, b) => b - a);
  const previous = rankingState.year;
  const defaultYear = cleanYears[0] ? String(cleanYears[0]) : '';
  const nextValue = previous === '__all__' || cleanYears.map(String).includes(String(previous))
    ? previous
    : defaultYear;
  rankingState.year = nextValue;

  select.innerHTML = [
    '<option value="__all__" ' + (nextValue === '__all__' ? 'selected' : '') + '>Serie completa</option>',
    ...cleanYears.map(year => `<option value="${year}" ${String(nextValue) === String(year) ? 'selected' : ''}>${year}</option>`),
  ].join('');
  select.disabled = cleanYears.length === 0;
}

async function updateRankingYearOptions() {
  const candidates = getRankingCandidateIndicators();
  const ids = collectRankingFetchIndicatorIds(candidates);
  if (!ids.length) {
    populateRankingYearOptions([]);
    return;
  }
  try {
    const points = await fetchDataPointsForIndicators(ids);
    const years = [...new Set((points || [])
      .map(point => Number(point.year))
      .filter(Number.isFinite))]
      .sort((a, b) => b - a);
    populateRankingYearOptions(years);
  } catch (error) {
    populateRankingYearOptions([]);
  }
}

function getOrderedValuesFromDataByYear(dataByYear, years) {
  const selectedYears = [...years].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return selectedYears.flatMap(year => (dataByYear?.[year] || []).filter(value => value !== null && value !== undefined && !isNaN(value)).map(Number));
}

function getUnionYearsForRanking(dataByYear, relatedSeriesMap = {}) {
  const yearSet = new Set(Object.keys(dataByYear || {}).map(Number).filter(Number.isFinite));
  Object.values(relatedSeriesMap || {}).forEach(series => {
    Object.keys(series || {}).forEach(year => {
      const numeric = Number(year);
      if (Number.isFinite(numeric)) yearSet.add(numeric);
    });
  });
  return [...yearSet].sort((a, b) => a - b);
}

function sumRelatedValuesForYears(relatedSeriesMap, metricKey, years) {
  return sumClean(getOrderedValuesFromDataByYear(relatedSeriesMap?.[metricKey] || {}, years));
}

function calculateRankingSeriesValue(indicator, dataByYear, relatedSeriesMap, selectedYear) {
  const mode = getIndicatorCalcMode(indicator);
  if (selectedYear && selectedYear !== '__all__') {
    const year = Number(selectedYear);
    const vals = dataByYear?.[year] || [];
    const stats = calcStats(vals);
    return calculateAnnualValue({ ...indicator, dataByYear }, stats, year, relatedSeriesMap);
  }

  const years = getUnionYearsForRanking(dataByYear, relatedSeriesMap);
  if (!years.length) return null;

  if (mode === 'none') return null;
  if (mode === 'ratio_of_sums') {
    const numeratorKey = String(indicator?.formula_numerator_key || '').trim();
    const denominatorKey = String(indicator?.formula_denominator_key || '').trim();
    const multiplier = indicator?.formula_multiplier === null || indicator?.formula_multiplier === undefined || indicator?.formula_multiplier === ''
      ? 1
      : Number(indicator.formula_multiplier);
    if (!numeratorKey || !denominatorKey) return null;
    const numerator = sumRelatedValuesForYears(relatedSeriesMap, numeratorKey, years);
    const denominator = sumRelatedValuesForYears(relatedSeriesMap, denominatorKey, years);
    if (!denominator) return null;
    return (numerator / denominator) * multiplier;
  }

  const values = getOrderedValuesFromDataByYear(dataByYear, years);
  if (!values.length) return null;
  const stats = calcStats(values);

  switch (mode) {
    case 'sum': return stats?.sum ?? null;
    case 'average': return stats?.mean ?? null;
    case 'last_value': return getLastNonNull(values);
    case 'max': return stats?.max ?? null;
    case 'min': return stats?.min ?? null;
    default: return stats?.sum ?? null;
  }
}

function getRankingPeriodLabel(selectedYear) {
  return selectedYear === '__all__' ? 'serie completa' : String(selectedYear || '—');
}

function shouldShowRankingShare(indicator, rows) {
  if (getIndicatorCalcMode(indicator) !== 'sum') return false;
  return rows.every(row => row.value === null || row.value >= 0);
}

function renderRankingRows(rows, { showShare = false, unit = '' } = {}) {
  const numericRows = rows.filter(row => row.value !== null && row.value !== undefined && !isNaN(row.value));
  const maxAbs = Math.max(...numericRows.map(row => Math.abs(Number(row.value))), 0);
  const total = numericRows.reduce((acc, row) => acc + Math.max(0, Number(row.value)), 0);

  return rows.map((row, index) => {
    const value = row.value;
    const hasValue = value !== null && value !== undefined && !isNaN(value);
    const width = hasValue && maxAbs ? Math.max(3, Math.abs(Number(value)) / maxAbs * 100) : 0;
    const share = showShare && hasValue && total ? (Number(value) / total) * 100 : null;
    return `
      <div class="ranking-row ${!hasValue ? 'ranking-row-empty' : ''}">
        <div class="ranking-position">${index + 1}</div>
        <div class="ranking-destination">
          <strong>${escapeHtml(row.destinationName)}</strong>
          <span>${escapeHtml(row.indicatorName || '')}</span>
        </div>
        <div class="ranking-bar-cell">
          <div class="ranking-bar-track">
            <div class="ranking-bar-fill" style="width:${width}%"></div>
          </div>
          ${share !== null ? `<span class="ranking-share">${share.toFixed(1)}%</span>` : ''}
        </div>
        <div class="ranking-value">${hasValue ? `${formatNumber(value)}${unit ? ` ${escapeHtml(unit)}` : ''}` : '-'}</div>
      </div>
    `;
  }).join('');
}

async function runTerritorialRanking() {
  rankingState.metricKey = document.getElementById('rankingMetricKey')?.value || rankingState.metricKey;
  rankingState.year = document.getElementById('rankingYear')?.value || rankingState.year;
  rankingState.direction = document.getElementById('rankingDirection')?.value || rankingState.direction || 'desc';
  rankingState.excludeAggregates = document.getElementById('rankingExcludeAggregates')?.checked !== false;

  const results = document.getElementById('rankingResults');
  const empty = document.getElementById('rankingEmpty');
  const badge = document.getElementById('rankingSummaryBadge');
  if (!rankingState.metricKey) {
    clearTerritorialRankingResults('Seleccioná un indicador para generar el ranking.');
    return;
  }

  const metricOption = buildRankingMetricOptions().find(opt => opt.key === rankingState.metricKey);
  const candidates = getRankingCandidateIndicators();
  if (candidates.length < 2) {
    clearTerritorialRankingResults('Ese indicador no tiene suficientes destinos para armar un ranking territorial.');
    return;
  }

  if (results) {
    results.style.display = 'block';
    results.innerHTML = '<div class="ranking-loading"><div class="spinner"></div><span>Calculando ranking territorial...</span></div>';
  }
  if (empty) empty.style.display = 'none';

  try {
    const fetchIds = collectRankingFetchIndicatorIds(candidates);
    const points = await fetchDataPointsForIndicators(fetchIds);
    const dataByIndicator = buildDataByIndicator(points);

    const rows = candidates.map(indicator => {
      const destinationIndicators = indicators.filter(ind => ind.destination_id === indicator.destination_id);
      const dataByYear = buildDataByYear(dataByIndicator[indicator.id] || []);
      const relatedSeriesMap = buildRelatedSeriesMapForDestination(indicator, destinationIndicators, dataByIndicator);
      const value = calculateRankingSeriesValue(indicator, dataByYear, relatedSeriesMap, rankingState.year);
      return {
        destinationId: indicator.destination_id,
        destinationName: indicator.destination?.name || getRankingDestinationById(indicator.destination_id)?.name || 'Destino sin nombre',
        indicatorName: indicator.name,
        indicator,
        value: value === null || value === undefined || isNaN(value) ? null : Number(value),
      };
    });

    const directionFactor = rankingState.direction === 'asc' ? 1 : -1;
    const sortedRows = rows
      .map((row, index) => ({ ...row, __originalIndex: index }))
      .sort((a, b) => {
        const aMissing = a.value === null;
        const bMissing = b.value === null;
        if (aMissing && bMissing) return a.__originalIndex - b.__originalIndex;
        if (aMissing) return 1;
        if (bMissing) return -1;
        if (a.value === b.value) return a.__originalIndex - b.__originalIndex;
        return (a.value - b.value) * directionFactor;
      });

    const rowsWithValue = sortedRows.filter(row => row.value !== null);
    const periodLabel = getRankingPeriodLabel(rankingState.year);
    const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(candidates[0]));
    const showShare = shouldShowRankingShare(candidates[0], rowsWithValue);
    const unit = metricOption?.unit || candidates[0]?.unit || '';
    const aggregateLabel = rankingState.excludeAggregates ? 'Agregados excluidos' : 'Agregados incluidos';
    currentRankingPayload = { rows: sortedRows, metricKey: rankingState.metricKey, year: rankingState.year };

    if (badge) badge.textContent = `${rowsWithValue.length} destino${rowsWithValue.length !== 1 ? 's' : ''}`;
    if (results) {
      results.style.display = 'block';
      results.innerHTML = `
        <div class="ranking-result-header">
          <div>
            <h4>${escapeHtml(metricOption?.label || candidates[0]?.name || 'Indicador')} · ${escapeHtml(periodLabel)}</h4>
            <p>${escapeHtml(annualMeta.label)} · ${escapeHtml(aggregateLabel)} · ${rowsWithValue.length} con dato de ${sortedRows.length} destino${sortedRows.length !== 1 ? 's' : ''}</p>
          </div>
          ${showShare ? '<span class="badge badge-green">Incluye participación sobre total visible</span>' : '<span class="badge badge-blue">Ranking por valor</span>'}
        </div>
        <div class="ranking-list">
          ${renderRankingRows(sortedRows, { showShare, unit })}
        </div>
      `;
    }
  } catch (error) {
    currentRankingPayload = null;
    if (results) results.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'No pude calcular el ranking: ' + error.message;
    }
    if (badge) badge.textContent = 'Error';
  }
}

// ── HALLAZGOS AUTOMÁTICOS POR DESTINO ──────────────────────
function getRealDestinationsForInsights() {
  return [...destinations].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}

function getInsightsDestinationIndicators(destinationId) {
  return getIndicatorsForDestination(destinationId).filter(ind => ind.destination_id === destinationId);
}

function getIndicatorDataPointsFromMap(dataByIndicator, indicatorId) {
  return dataByIndicator?.[indicatorId] || [];
}

function getYearsFromPoints(points) {
  return [...new Set((points || []).map(point => Number(point.year)).filter(Number.isFinite))].sort((a, b) => a - b);
}

function getInsightPeriodYears(allYears, mode = insightsState.periodMode, startYear = insightsState.startYear, endYear = insightsState.endYear) {
  const years = [...new Set((allYears || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!years.length) return [];
  if (mode === '__last__') return [years[years.length - 1]];
  if (mode === '__last2__') return years.slice(-2);
  if (mode === '__last5__') return years.slice(-5);
  if (mode === '__custom__') {
    const from = Number(startYear || years[0]);
    const to = Number(endYear || years[years.length - 1]);
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    return years.filter(year => year >= min && year <= max);
  }
  return years;
}

function getInsightsPeriodLabel(years, allYears = []) {
  const clean = [...new Set((years || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!clean.length) return 'sin período';
  if (clean.length === 1) return `año ${clean[0]}`;
  const full = clean.length === allYears.length;
  return `${full ? 'serie completa' : 'período seleccionado'} ${clean[0]}–${clean[clean.length - 1]}`;
}

function getMonthLabelForPoint(point) {
  if (!point) return '—';
  return `${MONTHS[(Number(point.month) || 1) - 1]} ${point.year}`;
}

function getBestAndWorstMonthlyPoint(points) {
  const clean = (points || [])
    .filter(point => point.value !== null && point.value !== undefined && !isNaN(point.value))
    .map(point => ({ ...point, value: Number(point.value) }));
  if (!clean.length) return { best: null, worst: null };
  const sorted = [...clean].sort((a, b) => a.value - b.value);
  return { worst: sorted[0], best: sorted[sorted.length - 1] };
}

function calculateInsightsAppliedMetric(indicator, dataByYear, yearlyStats, years, relatedSeriesMap = {}) {
  const selectedYears = [...new Set((years || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const mode = getIndicatorCalcMode(indicator);
  if (!selectedYears.length) return { label: annualMeta.shortLabel, value: null, help: 'Sin años seleccionados' };
  if (selectedYears.length === 1) {
    const year = selectedYears[0];
    return {
      label: `${annualMeta.shortLabel} ${year}`,
      value: yearlyStats?.[year]?.annualValue ?? null,
      help: getAppliedMetricHelpText(mode, true),
    };
  }

  const values = getValuesForYears(dataByYear, selectedYears);
  const stats = calcStats(values);
  if (mode === 'sum') return { label: 'Total del período', value: stats?.sum ?? null, help: 'Suma de todos los meses del período' };
  if (mode === 'average') return { label: 'Promedio del período', value: stats?.mean ?? null, help: 'Promedio mensual del período' };
  if (mode === 'last_value') return { label: 'Último valor del período', value: getLastNonNull(values), help: 'Último mes con dato dentro del período' };
  if (mode === 'max') return { label: 'Máximo del período', value: stats?.max ?? null, help: 'Mayor valor mensual del período' };
  if (mode === 'min') return { label: 'Mínimo del período', value: stats?.min ?? null, help: 'Menor valor mensual del período' };
  if (mode === 'ratio_of_sums') {
    const numeratorKey = String(indicator?.formula_numerator_key || '').trim();
    const denominatorKey = String(indicator?.formula_denominator_key || '').trim();
    const multiplier = indicator?.formula_multiplier === null || indicator?.formula_multiplier === undefined || indicator?.formula_multiplier === '' ? 1 : Number(indicator.formula_multiplier);
    const numerator = sumClean(selectedYears.flatMap(year => relatedSeriesMap?.[numeratorKey]?.[year] || []));
    const denominator = sumClean(selectedYears.flatMap(year => relatedSeriesMap?.[denominatorKey]?.[year] || []));
    return { label: 'Valor recalculado del período', value: denominator ? (numerator / denominator) * multiplier : null, help: 'Σ numerador / Σ denominador × multiplicador' };
  }
  return { label: annualMeta.shortLabel, value: null, help: annualMeta.description };
}

function getInsightTrendText(changePct) {
  if (changePct === null || changePct === undefined || isNaN(changePct)) return 'sin variación calculable';
  const abs = Math.abs(Number(changePct));
  if (abs < 3) return 'estabilidad relativa';
  if (changePct > 0 && abs < 10) return 'crecimiento moderado';
  if (changePct > 0) return 'crecimiento marcado';
  if (changePct < 0 && abs < 10) return 'retroceso moderado';
  return 'retroceso marcado';
}

function formatInsightValue(value, unit = '') {
  if (value === null || value === undefined || isNaN(value)) return 'sin dato';
  const cleanUnit = String(unit || '').trim();
  return `${formatNumber(value)}${cleanUnit ? ` ${cleanUnit}` : ''}`;
}

function getInsightCalcMethodText(indicator) {
  const mode = getIndicatorCalcMode(indicator);
  const meta = getAnnualCalcMeta(mode);
  if (mode === 'sum') return 'se trata como volumen acumulable del período';
  if (mode === 'average') return 'se informa como promedio de los meses cargados';
  if (mode === 'last_value') return 'se toma el último valor disponible del período';
  if (mode === 'max') return 'se toma el máximo mensual del período';
  if (mode === 'min') return 'se toma el mínimo mensual del período';
  if (mode === 'ratio_of_sums') return 'se recalcula con numerador y denominador, no por suma ni promedio simple de tasas';
  return meta.description || 'se aplica la regla configurada para el indicador';
}

function getInsightVariationPhrase(summary, unit = '') {
  const hasChange = summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct);
  if (!summary.firstYear || !summary.lastYear || summary.firstYear === summary.lastYear) {
    return 'No corresponde calcular variación entre años porque el período seleccionado contiene un único año con dato.';
  }
  const from = formatInsightValue(summary.firstValue, unit);
  const to = formatInsightValue(summary.lastValue, unit);
  if (!hasChange) {
    return `Entre ${summary.firstYear} y ${summary.lastYear}, el indicador pasó de ${from} a ${to}; la variación porcentual no es calculable por falta de base válida.`;
  }
  const diff = Number(summary.lastValue) - Number(summary.firstValue);
  const direction = diff > 0 ? 'un incremento' : diff < 0 ? 'una disminución' : 'una variación nula';
  return `Entre ${summary.firstYear} y ${summary.lastYear}, el indicador pasó de ${from} a ${to}. Esto implicó ${direction} de ${formatInsightValue(Math.abs(diff), unit)} y una variación de ${formatPct(summary.changePct)}.`;
}

function getInsightAnnualExtremesPhrase(summary, unit = '') {
  if (!summary.bestAnnual && !summary.worstAnnual) return '';
  if (summary.bestAnnual?.year === summary.worstAnnual?.year) {
    return `El único año disponible para la lectura anual fue ${summary.bestAnnual.year}, con ${formatInsightValue(summary.bestAnnual.value, unit)}.`;
  }
  return `El mejor registro anual del período se observó en ${summary.bestAnnual?.year || '—'}, con ${formatInsightValue(summary.bestAnnual?.value, unit)}, mientras que el menor registro correspondió a ${summary.worstAnnual?.year || '—'}, con ${formatInsightValue(summary.worstAnnual?.value, unit)}.`;
}

function getInsightMonthlyExtremesPhrase(summary, unit = '') {
  if (!summary.monthlyBest && !summary.monthlyWorst) return '';
  if (summary.monthlyBest?.year === summary.monthlyWorst?.year && summary.monthlyBest?.month === summary.monthlyWorst?.month) {
    return `A nivel mensual, el único dato disponible fue ${getMonthLabelForPoint(summary.monthlyBest)}, con ${formatInsightValue(summary.monthlyBest?.value, unit)}.`;
  }
  return `En la apertura mensual, el pico fue ${formatInsightValue(summary.monthlyBest?.value, unit)} en ${getMonthLabelForPoint(summary.monthlyBest)}, y el mínimo fue ${formatInsightValue(summary.monthlyWorst?.value, unit)} en ${getMonthLabelForPoint(summary.monthlyWorst)}.`;
}

function getInsightTechnicalNarrative(summary) {
  const indicator = summary.indicator;
  const unit = indicator.unit || '';
  const name = indicator.name || 'El indicador';
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const applied = `${summary.appliedMetric?.label || annualMeta.shortLabel}: ${formatInsightValue(summary.appliedMetric?.value, unit)}`;
  const method = getInsightCalcMethodText(indicator);

  if (summary.selectedYears.length === 1) {
    const year = summary.selectedYears[0];
    const annualSentence = `${name} registró en ${year} un valor de ${formatInsightValue(summary.appliedMetric?.value, unit)}. La lectura corresponde a ${annualMeta.label.toLowerCase()}; ${method}.`;
    const monthlySentence = getInsightMonthlyExtremesPhrase(summary, unit);
    return [annualSentence, monthlySentence].filter(Boolean).join(' ');
  }

  const opening = `Para ${summary.periodLabel}, ${name} presentó como medida principal ${applied}. La lectura metodológica aplicada indica que ${method}.`;
  const variation = getInsightVariationPhrase(summary, unit);
  const annualExtremes = getInsightAnnualExtremesPhrase(summary, unit);
  const monthlyExtremes = getInsightMonthlyExtremesPhrase(summary, unit);
  return [opening, variation, annualExtremes, monthlyExtremes].filter(Boolean).join(' ');
}

function getInsightNarrative(indicator, summary) {
  return getInsightTechnicalNarrative(summary);
}

function buildIndicatorInsightSummary(indicator, destinationIndicators, dataByIndicator, selectedYears, allYears) {
  const dataPoints = getIndicatorDataPointsFromMap(dataByIndicator, indicator.id);
  const dataByYear = buildDataByYear(dataPoints);
  const relatedSeriesMap = buildRelatedSeriesMapForDestination(indicator, destinationIndicators, dataByIndicator);
  const yearlyStats = calcYearlyStats(dataByYear, { indicator, relatedSeriesMap });
  const periodYears = selectedYears.filter(year => yearlyStats?.[year] && yearlyStats[year].count !== 0);
  const periodPoints = dataPoints.filter(point => selectedYears.includes(Number(point.year)));
  const values = getValuesForYears(dataByYear, selectedYears);
  const periodStats = calcStats(values);
  const appliedMetric = calculateInsightsAppliedMetric(indicator, dataByYear, yearlyStats, selectedYears, relatedSeriesMap);
  const annualRows = selectedYears
    .map(year => ({ year, value: yearlyStats?.[year]?.annualValue ?? null }))
    .filter(row => row.value !== null && row.value !== undefined && !isNaN(row.value));
  const firstRow = annualRows[0] || null;
  const lastRow = annualRows[annualRows.length - 1] || null;
  const changePct = firstRow && lastRow && Number(firstRow.value) !== 0
    ? ((Number(lastRow.value) - Number(firstRow.value)) / Math.abs(Number(firstRow.value))) * 100
    : null;
  const bestAnnual = annualRows.length ? [...annualRows].sort((a, b) => Number(b.value) - Number(a.value))[0] : null;
  const worstAnnual = annualRows.length ? [...annualRows].sort((a, b) => Number(a.value) - Number(b.value))[0] : null;
  const monthly = getBestAndWorstMonthlyPoint(periodPoints);
  const periodLabel = getInsightsPeriodLabel(selectedYears, allYears);

  return {
    indicator,
    dataByYear,
    yearlyStats,
    selectedYears,
    periodYears,
    periodLabel,
    periodStats,
    appliedMetric,
    firstYear: firstRow?.year || null,
    firstValue: firstRow?.value ?? null,
    lastYear: lastRow?.year || null,
    lastValue: lastRow?.value ?? null,
    changePct,
    bestAnnual,
    worstAnnual,
    monthlyBest: monthly.best,
    monthlyWorst: monthly.worst,
    narrative: '',
  };
}

function populateInsightsDestinationSelect() {
  const select = document.getElementById('insightsDestinationId');
  if (!select) return;
  const list = getRealDestinationsForInsights();
  const fallback = currentDestination?.id && currentDestination.id !== UNASSIGNED_DESTINATION_ID ? currentDestination.id : (list[0]?.id || '');
  if (!insightsState.destinationId || !list.some(dest => dest.id === insightsState.destinationId)) insightsState.destinationId = fallback;
  select.innerHTML = list.length
    ? list.map(dest => `<option value="${escapeHtml(dest.id)}" ${dest.id === insightsState.destinationId ? 'selected' : ''}>${escapeHtml(dest.name || 'Destino sin nombre')}</option>`).join('')
    : '<option value="">Sin destinos</option>';
}

function populateInsightsIndicatorSelect() {
  const select = document.getElementById('insightsIndicatorId');
  if (!select) return;
  const indicatorsForDest = getInsightsDestinationIndicators(insightsState.destinationId);
  const scope = document.getElementById('insightsScope')?.value || insightsState.scope;
  insightsState.scope = scope;

  if (!indicatorsForDest.length) {
    select.innerHTML = '<option value="">Sin indicadores</option>';
    select.disabled = true;
    return;
  }

  const groups = groupIndicatorsByTitle(indicatorsForDest);
  select.innerHTML = groups.map(group => `
    <optgroup label="${escapeHtml(group.title)}">
      ${group.indicators.map(ind => `<option value="${escapeHtml(ind.id)}" ${ind.id === insightsState.indicatorId ? 'selected' : ''}>${escapeHtml(ind.name)}${ind.unit ? ` · ${escapeHtml(ind.unit)}` : ''}</option>`).join('')}
    </optgroup>
  `).join('');

  if (!insightsState.indicatorId || !indicatorsForDest.some(ind => ind.id === insightsState.indicatorId)) {
    insightsState.indicatorId = indicatorsForDest[0]?.id || '';
    select.value = insightsState.indicatorId;
  }
  select.disabled = scope !== 'single';
}

function populateInsightsYearSelects(years) {
  const start = document.getElementById('insightsStartYear');
  const end = document.getElementById('insightsEndYear');
  if (!start || !end) return;
  const cleanYears = [...new Set((years || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!cleanYears.length) {
    start.innerHTML = '<option value="">Sin años</option>';
    end.innerHTML = '<option value="">Sin años</option>';
    start.disabled = true;
    end.disabled = true;
    insightsState.startYear = '';
    insightsState.endYear = '';
    return;
  }
  if (!cleanYears.includes(Number(insightsState.startYear))) insightsState.startYear = String(cleanYears[0]);
  if (!cleanYears.includes(Number(insightsState.endYear))) insightsState.endYear = String(cleanYears[cleanYears.length - 1]);
  const options = cleanYears.map(year => `<option value="${year}">${year}</option>`).join('');
  start.innerHTML = options;
  end.innerHTML = options;
  start.value = insightsState.startYear;
  end.value = insightsState.endYear;
  const custom = insightsState.periodMode === '__custom__';
  start.disabled = !custom;
  end.disabled = !custom;
}

async function getInsightsAvailableYears(destinationId) {
  const destinationIndicators = getInsightsDestinationIndicators(destinationId);
  const ids = destinationIndicators.map(ind => ind.id);
  if (!ids.length) return [];
  const points = await fetchDataPointsForIndicators(ids);
  return getYearsFromPoints(points);
}

async function renderAutomaticInsightsControls() {
  populateInsightsDestinationSelect();
  populateInsightsIndicatorSelect();
  const modeEl = document.getElementById('insightsPeriodMode');
  if (modeEl) modeEl.value = insightsState.periodMode;
  try {
    const years = await getInsightsAvailableYears(insightsState.destinationId);
    populateInsightsYearSelects(years);
  } catch (_) {
    populateInsightsYearSelects([]);
  }
}

async function handleInsightsDestinationChange() {
  insightsState.destinationId = document.getElementById('insightsDestinationId')?.value || '';
  insightsState.indicatorId = '';
  currentInsightsPayload = null;
  populateInsightsIndicatorSelect();
  clearAutomaticInsightsResults('Elegí período y generá los hallazgos automáticos.');
  try {
    const years = await getInsightsAvailableYears(insightsState.destinationId);
    populateInsightsYearSelects(years);
  } catch (_) {
    populateInsightsYearSelects([]);
  }
}

function handleInsightsScopeChange() {
  insightsState.scope = document.getElementById('insightsScope')?.value || 'all';
  populateInsightsIndicatorSelect();
  clearAutomaticInsightsResults('Elegí el alcance y generá el informe.');
}

function handleInsightsPeriodModeChange() {
  insightsState.periodMode = document.getElementById('insightsPeriodMode')?.value || '__all__';
  populateInsightsYearSelects([...(document.getElementById('insightsStartYear')?.options || [])].map(option => Number(option.value)).filter(Number.isFinite));
  clearAutomaticInsightsResults('Elegí el período y generá el informe.');
}

function handleInsightsControlChange() {
  insightsState.destinationId = document.getElementById('insightsDestinationId')?.value || insightsState.destinationId;
  insightsState.scope = document.getElementById('insightsScope')?.value || insightsState.scope;
  insightsState.indicatorId = document.getElementById('insightsIndicatorId')?.value || insightsState.indicatorId;
  insightsState.periodMode = document.getElementById('insightsPeriodMode')?.value || insightsState.periodMode;
  insightsState.startYear = document.getElementById('insightsStartYear')?.value || insightsState.startYear;
  insightsState.endYear = document.getElementById('insightsEndYear')?.value || insightsState.endYear;
  clearAutomaticInsightsResults('Listo para generar el informe con la nueva selección.');
}

function clearAutomaticInsightsResults(message = 'Elegí destino, período y generá los hallazgos automáticos.') {
  const results = document.getElementById('insightsResults');
  const empty = document.getElementById('insightsEmpty');
  const badge = document.getElementById('insightsSummaryBadge');
  if (results) {
    results.innerHTML = '';
    results.style.display = 'none';
  }
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = message;
  }
  if (badge) badge.textContent = 'Sin informe';
}

function getInsightsSelectedIndicators(destinationIndicators) {
  if (insightsState.scope === 'single') {
    return destinationIndicators.filter(ind => ind.id === insightsState.indicatorId);
  }
  return destinationIndicators;
}

function getInsightPrioritySummaries(summaries) {
  const withTrend = summaries
    .filter(summary => summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct))
    .sort((a, b) => Math.abs(Number(b.changePct)) - Math.abs(Number(a.changePct)));
  return withTrend.slice(0, 4);
}

function renderInsightKpis({ destination, selectedYears, allYears, summaries }) {
  const withTrend = summaries.filter(summary => summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct));
  const positive = withTrend.filter(summary => summary.changePct > 0).length;
  const negative = withTrend.filter(summary => summary.changePct < 0).length;
  const periodLabel = getInsightsPeriodLabel(selectedYears, allYears);
  const strongest = withTrend.length ? [...withTrend].sort((a, b) => Number(b.changePct) - Number(a.changePct))[0] : null;
  return `
    <div class="insights-kpi-grid">
      <div class="insights-kpi"><span>Destino</span><strong>${escapeHtml(destination?.name || 'Destino sin nombre')}</strong><small>${escapeHtml(periodLabel)}</small></div>
      <div class="insights-kpi"><span>Indicadores analizados</span><strong>${summaries.length}</strong><small>Con datos en el período</small></div>
      <div class="insights-kpi"><span>Señales positivas</span><strong>${positive}</strong><small>Indicadores con variación positiva</small></div>
      <div class="insights-kpi"><span>Señales negativas</span><strong>${negative}</strong><small>Indicadores con variación negativa</small></div>
      <div class="insights-kpi"><span>Mayor variación positiva</span><strong>${strongest ? formatPct(strongest.changePct) : '-'}</strong><small>${escapeHtml(strongest?.indicator?.name || 'Sin dato suficiente')}</small></div>
    </div>
  `;
}

function renderInsightsExecutiveSummary({ destination, selectedYears, allYears, summaries }) {
  const periodLabel = getInsightsPeriodLabel(selectedYears, allYears);
  const withTrend = summaries.filter(summary => summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct));
  const positive = withTrend.filter(summary => summary.changePct > 0).length;
  const negative = withTrend.filter(summary => summary.changePct < 0).length;
  const stable = withTrend.filter(summary => Math.abs(Number(summary.changePct)) < 3).length;
  const intro = `Se analizaron ${summaries.length} indicador${summaries.length !== 1 ? 'es' : ''} con datos para ${destination?.name || 'el destino'} durante ${periodLabel}. El informe respeta la regla anual configurada para cada indicador: los volúmenes acumulables se suman, los indicadores de stock o promedio se leen según su método definido y las tasas o ratios se recalculan desde numerador y denominador cuando corresponde.`;
  const balance = withTrend.length
    ? `Entre los indicadores con extremos comparables, ${positive} mostraron variación positiva, ${negative} variación negativa y ${stable} se ubicaron en un rango de estabilidad relativa menor a 3%. Estas señales son descriptivas y no implican causalidad.`
    : 'No hay suficientes extremos temporales comparables para calcular variaciones porcentuales de manera consistente; por eso el análisis se concentra en niveles, máximos, mínimos y comportamiento mensual.';

  const grouped = new Map();
  summaries.forEach(summary => {
    const title = getIndicatorGroupTitle(summary.indicator);
    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push(summary);
  });

  const groupsHtml = [...grouped.entries()].map(([title, items]) => `
    <div class="insights-executive-group">
      <h5>${escapeHtml(title)}</h5>
      ${items.map(summary => `<p><strong>${escapeHtml(summary.indicator.name)}.</strong> ${escapeHtml(summary.narrative)}</p>`).join('')}
    </div>
  `).join('');

  return `
    <div class="insights-report-section insights-executive-report">
      <h4>Resumen ejecutivo técnico</h4>
      <p>${escapeHtml(intro)}</p>
      <p>${escapeHtml(balance)}</p>
      <div class="insights-executive-body">
        ${groupsHtml}
      </div>
    </div>
  `;
}

function renderIndicatorInsightCard(summary) {
  const indicator = summary.indicator;
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const unit = indicator.unit || '';
  const changeValue = summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct) ? formatPct(summary.changePct) : '-';
  const changeClass = summary.changePct > 0 ? 'positive' : summary.changePct < 0 ? 'negative' : '';
  return `
    <article class="insights-indicator-card">
      <div class="insights-indicator-head">
        <div>
          <h5>${escapeHtml(indicator.name)}</h5>
          <span>${escapeHtml(getIndicatorGroupTitle(indicator))} · ${escapeHtml(annualMeta.label)}</span>
        </div>
        <strong class="${changeClass}">${changeValue}</strong>
      </div>
      <div class="insights-metric-row">
        <div><span>${escapeHtml(summary.appliedMetric.label)}</span><strong>${formatNumber(summary.appliedMetric.value)}${unit ? ` ${escapeHtml(unit)}` : ''}</strong></div>
        <div><span>Primer valor anual</span><strong>${summary.firstYear ? `${summary.firstYear}: ${formatNumber(summary.firstValue)}` : '-'}</strong></div>
        <div><span>Último valor anual</span><strong>${summary.lastYear ? `${summary.lastYear}: ${formatNumber(summary.lastValue)}` : '-'}</strong></div>
      </div>
      <div class="insights-metric-row compact">
        <div><span>Mejor año</span><strong>${summary.bestAnnual ? `${summary.bestAnnual.year}: ${formatNumber(summary.bestAnnual.value)}` : '-'}</strong></div>
        <div><span>Peor año</span><strong>${summary.worstAnnual ? `${summary.worstAnnual.year}: ${formatNumber(summary.worstAnnual.value)}` : '-'}</strong></div>
        <div><span>Pico mensual</span><strong>${summary.monthlyBest ? `${getMonthLabelForPoint(summary.monthlyBest)} · ${formatNumber(summary.monthlyBest.value)}` : '-'}</strong></div>
        <div><span>Mínimo mensual</span><strong>${summary.monthlyWorst ? `${getMonthLabelForPoint(summary.monthlyWorst)} · ${formatNumber(summary.monthlyWorst.value)}` : '-'}</strong></div>
      </div>
      <p class="insights-card-narrative">${escapeHtml(summary.narrative)}</p>
    </article>
  `;
}

function renderInsightsByGroup(summaries) {
  const groups = new Map();
  summaries.forEach(summary => {
    const title = getIndicatorGroupTitle(summary.indicator);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(summary);
  });
  return [...groups.entries()].map(([title, items]) => `
    <section class="insights-group-section">
      <div class="insights-group-title">
        <h4>${escapeHtml(title)}</h4>
        <span class="badge badge-blue">${items.length} indicador${items.length !== 1 ? 'es' : ''}</span>
      </div>
      <div class="insights-indicator-grid">
        ${items.map(renderIndicatorInsightCard).join('')}
      </div>
    </section>
  `).join('');
}

function buildInsightsPlainText(payload) {
  const { destination, selectedYears, allYears, summaries } = payload;
  const periodLabel = getInsightsPeriodLabel(selectedYears, allYears);
  const withTrend = summaries.filter(summary => summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct));
  const positive = withTrend.filter(summary => summary.changePct > 0).length;
  const negative = withTrend.filter(summary => summary.changePct < 0).length;
  const stable = withTrend.filter(summary => Math.abs(Number(summary.changePct)) < 3).length;
  const lines = [];
  lines.push(`Informe técnico automático · ${destination?.name || 'Destino sin nombre'}`);
  lines.push(`Período: ${periodLabel}`);
  lines.push(`Indicadores analizados: ${summaries.length}`);
  lines.push(`Balance: ${positive} positivos · ${negative} negativos · ${stable} estables relativos (<3%)`);
  lines.push('Criterio metodológico: se respetan las reglas anuales configuradas por indicador; los volúmenes se suman, los stocks/promedios se leen según su regla y las tasas/ratios se recalculan desde numerador y denominador cuando corresponde.');
  lines.push('');

  const grouped = new Map();
  summaries.forEach(summary => {
    const title = getIndicatorGroupTitle(summary.indicator);
    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push(summary);
  });

  [...grouped.entries()].forEach(([title, items]) => {
    lines.push(title.toUpperCase());
    items.forEach((summary, index) => {
      lines.push(`${index + 1}. ${summary.indicator.name}`);
      lines.push(`   ${summary.narrative}`);
      lines.push(`   Medida principal: ${summary.appliedMetric.label}: ${formatNumber(summary.appliedMetric.value)} ${summary.indicator.unit || ''}`.trim());
      lines.push(`   Variación entre extremos: ${summary.changePct !== null && summary.changePct !== undefined && !isNaN(summary.changePct) ? formatPct(summary.changePct) : 'sin dato'}`);
    });
    lines.push('');
  });

  return lines.join('\n');
}

async function copyInsightsReport() {
  if (!currentInsightsPayload) return;
  try {
    await navigator.clipboard.writeText(buildInsightsPlainText(currentInsightsPayload));
    toast('Informe copiado al portapapeles', 'success');
  } catch (_) {
    toast('No pude copiar el informe automáticamente', 'error');
  }
}

async function runAutomaticInsights() {
  insightsState.destinationId = document.getElementById('insightsDestinationId')?.value || insightsState.destinationId;
  insightsState.scope = document.getElementById('insightsScope')?.value || insightsState.scope;
  insightsState.indicatorId = document.getElementById('insightsIndicatorId')?.value || insightsState.indicatorId;
  insightsState.periodMode = document.getElementById('insightsPeriodMode')?.value || insightsState.periodMode;
  insightsState.startYear = document.getElementById('insightsStartYear')?.value || insightsState.startYear;
  insightsState.endYear = document.getElementById('insightsEndYear')?.value || insightsState.endYear;

  const results = document.getElementById('insightsResults');
  const empty = document.getElementById('insightsEmpty');
  const badge = document.getElementById('insightsSummaryBadge');
  const destination = destinations.find(dest => dest.id === insightsState.destinationId) || null;
  if (!destination) {
    clearAutomaticInsightsResults('Seleccioná un destino para generar el informe.');
    return;
  }

  const destinationIndicators = getInsightsDestinationIndicators(destination.id);
  const selectedIndicators = getInsightsSelectedIndicators(destinationIndicators);
  if (!selectedIndicators.length) {
    clearAutomaticInsightsResults('Ese destino no tiene indicadores para analizar.');
    return;
  }

  if (results) {
    results.style.display = 'block';
    results.innerHTML = '<div class="ranking-loading"><div class="spinner"></div><span>Generando informe técnico automático...</span></div>';
  }
  if (empty) empty.style.display = 'none';
  if (badge) badge.textContent = 'Calculando';

  try {
    const ids = destinationIndicators.map(ind => ind.id);
    const points = await fetchDataPointsForIndicators(ids);
    const dataByIndicator = buildDataByIndicator(points);
    const allYears = getYearsFromPoints(points);
    const selectedYears = getInsightPeriodYears(allYears, insightsState.periodMode, insightsState.startYear, insightsState.endYear);

    if (!selectedYears.length) {
      clearAutomaticInsightsResults('No hay datos cargados para el período seleccionado.');
      return;
    }

    const summaries = selectedIndicators
      .map(indicator => buildIndicatorInsightSummary(indicator, destinationIndicators, dataByIndicator, selectedYears, allYears))
      .filter(summary => summary.periodStats && summary.periodStats.count > 0 || summary.appliedMetric?.value !== null && summary.appliedMetric?.value !== undefined && !isNaN(summary.appliedMetric.value))
      .map(summary => ({ ...summary, narrative: getInsightNarrative(summary.indicator, summary) }));

    if (!summaries.length) {
      clearAutomaticInsightsResults('No hay indicadores con datos en ese período.');
      return;
    }

    currentInsightsPayload = { destination, selectedYears, allYears, summaries };
    if (badge) badge.textContent = `${summaries.length} indicador${summaries.length !== 1 ? 'es' : ''}`;
    if (results) {
      results.style.display = 'block';
      results.innerHTML = `
        <div class="insights-result-header">
          <div>
            <h4>Informe técnico automático · ${escapeHtml(destination.name || 'Destino sin nombre')}</h4>
            <p>${escapeHtml(getInsightsPeriodLabel(selectedYears, allYears))} · ${summaries.length} indicador${summaries.length !== 1 ? 'es' : ''} con datos · reglas EOH configuradas respetadas</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="copyInsightsReport()">Copiar informe</button>
        </div>
        ${renderInsightKpis({ destination, selectedYears, allYears, summaries })}
        ${renderInsightsExecutiveSummary({ destination, selectedYears, allYears, summaries })}
        ${renderInsightsByGroup(summaries)}
      `;
    }
  } catch (error) {
    currentInsightsPayload = null;
    if (results) results.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'No pude generar el informe: ' + error.message;
    }
    if (badge) badge.textContent = 'Error';
  }
}


function renderComparisonMetricOptions(options, selectedMetric) {
  const metricSelect = document.getElementById('compareMetricKey');
  if (!options.length) {
    metricSelect.innerHTML = '<option value="">Sin resultados comparables</option>';
    return;
  }

  const groups = new Map();
  options.forEach(opt => {
    const groupTitle = opt.groupTitle || 'Sin agrupar';
    if (!groups.has(groupTitle)) groups.set(groupTitle, []);
    groups.get(groupTitle).push(opt);
  });

  metricSelect.innerHTML = [...groups.entries()].map(([groupTitle, items]) => `
    <optgroup label="${escapeHtml(groupTitle)}">
      ${items.map(opt => {
        const unit = opt.unit ? ` · ${escapeHtml(opt.unit)}` : '';
        const countLabel = `${opt.count} destino${opt.count !== 1 ? 's' : ''}`;
        return `<option value="${escapeHtml(opt.key)}" ${selectedMetric === opt.key ? 'selected' : ''}>${escapeHtml(opt.label)}${unit} · ${countLabel}</option>`;
      }).join('')}
    </optgroup>
  `).join('');
}

function getComparisonAvailableDestinations(metricKey = comparisonSelection.metricKey) {
  const relevantIndicators = indicators.filter(ind => getMetricKey(ind) === metricKey && ind.destination_id);
  const destinationIds = [...new Set(relevantIndicators.map(ind => ind.destination_id))];
  return destinations.filter(dest => destinationIds.includes(dest.id));
}

function getAutoComparisonSelection(availableDestinations) {
  const selected = [];
  if (currentDestination?.id && availableDestinations.some(dest => dest.id === currentDestination.id)) {
    selected.push(currentDestination.id);
  }
  availableDestinations.forEach(dest => {
    if (selected.length >= Math.min(2, availableDestinations.length)) return;
    if (!selected.includes(dest.id)) selected.push(dest.id);
  });
  return selected;
}

function renderComparisonControls() {
  const metricSelect = document.getElementById('compareMetricKey');
  const allComparableOptions = buildComparableMetricOptions();
  const filteredOptions = getFilteredComparableMetricOptions();
  const container = document.getElementById('compareDestinationList');

  if (!allComparableOptions.length) {
    metricSelect.innerHTML = '<option value="">No hay indicadores repetidos en dos o más destinos</option>';
    container.innerHTML = '<span class="help-text">Todavía no hay indicadores comparables. Para comparar, la misma clave comparable debe existir en al menos dos destinos.</span>';
    return;
  }

  if (!filteredOptions.length) {
    metricSelect.innerHTML = '<option value="">Sin resultados para ese filtro</option>';
    container.innerHTML = '<span class="help-text">No hay indicadores comparables que coincidan con la búsqueda.</span>';
    comparisonSelection.metricKey = '';
    clearComparisonResults();
    return;
  }

  const searchValue = document.getElementById('compareMetricSearch')?.value || '';
  const previousMetric = comparisonSelection.metricKey;
  const currentStillVisible = filteredOptions.some(opt => opt.key === comparisonSelection.metricKey);
  const currentStillComparable = allComparableOptions.some(opt => opt.key === comparisonSelection.metricKey);
  const selectedMetric = currentStillVisible
    ? comparisonSelection.metricKey
    : (currentStillComparable && !searchValue ? comparisonSelection.metricKey : filteredOptions[0].key);
  comparisonSelection.metricKey = selectedMetric;
  if (previousMetric && previousMetric !== selectedMetric) {
    comparisonSelection.destinationIds = [];
  }
  renderComparisonMetricOptions(filteredOptions, selectedMetric);
  renderComparisonDestinationChoices({ autoSelect: true });
}

function handleComparisonMetricSearch() {
  renderComparisonControls();
  clearComparisonResults();
}

function renderComparisonDestinationChoices({ autoSelect = false } = {}) {
  const metricKey = comparisonSelection.metricKey;
  const selectedOption = buildComparableMetricOptions().find(opt => opt.key === metricKey);
  const availableDestinations = getComparisonAvailableDestinations(metricKey);
  const destinationIds = availableDestinations.map(dest => dest.id);
  const preservedSelection = comparisonSelection.destinationIds.filter(id => destinationIds.includes(id));
  comparisonSelection.destinationIds = preservedSelection.length
    ? preservedSelection
    : (autoSelect ? getAutoComparisonSelection(availableDestinations) : []);

  const container = document.getElementById('compareDestinationList');
  if (!selectedOption || availableDestinations.length < 2) {
    container.innerHTML = '<span class="help-text">Ese indicador no está disponible en dos o más destinos.</span>';
    return;
  }

  const selectedCount = comparisonSelection.destinationIds.length;
  container.innerHTML = `
    <div class="compare-helper-row">
      <span>${escapeHtml(selectedOption.label)} está disponible en <strong>${availableDestinations.length}</strong> destino${availableDestinations.length !== 1 ? 's' : ''}. Seleccionados: <strong>${selectedCount}</strong>.</span>
      <span class="compare-helper-actions">
        <button class="btn btn-secondary btn-sm" type="button" onclick="selectAllComparisonDestinations()">Todos</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="clearComparisonDestinations()">Limpiar</button>
      </span>
    </div>
    <div class="compare-chip-grid">
      ${availableDestinations.map(dest => {
        const active = comparisonSelection.destinationIds.includes(dest.id);
        return `
          <button
            type="button"
            class="chip-toggle ${active ? 'active' : ''}"
            aria-pressed="${active ? 'true' : 'false'}"
            onclick="toggleComparisonDestination('${dest.id}')"
          >
            <span class="chip-toggle-marker">${active ? '✓' : '+'}</span>
            <span>${escapeHtml(dest.name)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function handleComparisonMetricChange() {
  comparisonSelection.metricKey = document.getElementById('compareMetricKey').value;
  comparisonSelection.destinationIds = [];
  renderComparisonDestinationChoices({ autoSelect: true });
  clearComparisonResults();
}

function toggleComparisonDestination(destinationId) {
  const next = new Set(comparisonSelection.destinationIds);
  if (next.has(destinationId)) next.delete(destinationId);
  else next.add(destinationId);
  comparisonSelection.destinationIds = [...next];
  renderComparisonDestinationChoices({ autoSelect: false });
  clearComparisonResults();
}

function selectAllComparisonDestinations() {
  comparisonSelection.destinationIds = getComparisonAvailableDestinations().map(dest => dest.id);
  renderComparisonDestinationChoices({ autoSelect: false });
  clearComparisonResults();
}

function clearComparisonDestinations() {
  comparisonSelection.destinationIds = [];
  renderComparisonDestinationChoices({ autoSelect: false });
  clearComparisonResults();
}

function clearComparisonResults() {
  destroyComparisonChart();
  currentComparisonTablePayload = null;
  comparisonVisibleYears = [];
  comparisonZoomState = { signature: '', start: 0, span: null };
  const zoomControls = document.getElementById('comparisonZoomControls');
  if (zoomControls) { zoomControls.style.display = 'none'; zoomControls.innerHTML = ''; }
  const sortControls = document.getElementById('comparisonTableSortControls');
  if (sortControls) sortControls.style.display = 'none';
  document.getElementById('compareEmpty').style.display = 'block';
  document.getElementById('compareResults').style.display = 'none';
  document.getElementById('compareSummaryBadge').textContent = 'Sin comparación';
}

function getComparisonMeasureOptions(payload = null) {
  const annualLabel = payload?.annualMeta?.shortLabel || 'Medida anual aplicada';
  return [
    {
      value: 'annualValue',
      label: annualLabel,
      help: 'Respeta la regla anual configurada para el indicador.',
    },
    {
      value: 'mean',
      label: 'Promedio mensual',
      help: 'Promedio simple de los meses cargados dentro de cada año.',
    },
    {
      value: 'monthly_history',
      label: 'Evolución mensual histórica',
      help: 'Muestra todos los meses cargados de la serie histórica, sin resumirlos a valores anuales.',
    },
    {
      value: 'median',
      label: 'Mediana mensual',
      help: 'Valor central del año. Útil cuando hay meses atípicos.',
    },
    {
      value: 'max',
      label: 'Máximo mensual del año',
      help: 'Mayor valor mensual registrado en ese año.',
    },
    {
      value: 'min',
      label: 'Mínimo mensual del año',
      help: 'Menor valor mensual registrado en ese año.',
    },
    {
      value: 'stdDev',
      label: 'Desvío estándar mensual',
      help: 'Medida avanzada de variabilidad. Útil para estacionalidad; no conviene como ranking principal.',
    },
  ];
}

function getComparisonMeasureMeta(measure, payload = null) {
  const options = getComparisonMeasureOptions(payload);
  return options.find(option => option.value === measure) || options[0];
}

function isMonthlyComparisonMode(measure = comparisonTableSort.measure) {
  return measure === 'monthly_history';
}

function getComparisonAllYears(payload = currentComparisonTablePayload) {
  return (payload?.years || []).map(Number).sort((a, b) => a - b);
}

function sanitizeComparisonVisibleYears(payload = currentComparisonTablePayload) {
  const allYears = getComparisonAllYears(payload);
  const available = new Set(allYears.map(year => String(year)));
  comparisonVisibleYears = [...new Set((comparisonVisibleYears || []).map(Number))]
    .filter(year => available.has(String(year)))
    .sort((a, b) => a - b);
  return comparisonVisibleYears;
}

function getComparisonVisibleYears(payload = currentComparisonTablePayload) {
  const allYears = getComparisonAllYears(payload);
  if (!allYears.length) return [];
  const visible = sanitizeComparisonVisibleYears(payload);
  const visibleSet = new Set(visible.map(year => String(year)));
  return allYears.filter(year => visibleSet.has(String(year)));
}

function toggleComparisonVisibleYear(year) {
  const targetYear = Number(year);
  const next = new Set((comparisonVisibleYears || []).map(Number));
  if (next.has(targetYear)) next.delete(targetYear);
  else next.add(targetYear);
  comparisonVisibleYears = [...next].sort((a, b) => a - b);
  renderComparisonTable();
  renderComparisonChartFromPayload();
}

function selectAllComparisonYears() {
  comparisonVisibleYears = getComparisonAllYears(currentComparisonTablePayload);
  renderComparisonTable();
  renderComparisonChartFromPayload();
}

function clearComparisonYears() {
  comparisonVisibleYears = [];
  renderComparisonTable();
  renderComparisonChartFromPayload();
}

function renderComparisonYearFilter(payload = currentComparisonTablePayload) {
  const allYears = getComparisonAllYears(payload);
  if (!allYears.length) return '';
  const visibleYears = getComparisonVisibleYears(payload);
  const visibleSet = new Set(visibleYears.map(year => String(year)));
  return `
    <div class="comparison-year-filter">
      <div class="comparison-year-filter-header">
        <div>
          <label class="form-label">Años visibles en comparación</label>
          <div class="comparison-year-filter-help">Seleccioná uno, varios o todos. Afecta el gráfico y la tabla comparativa.</div>
        </div>
        <div class="comparison-year-filter-actions">
          <button class="btn btn-secondary btn-sm" type="button" onclick="selectAllComparisonYears()">Ver todos</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="clearComparisonYears()">Ocultar todos</button>
        </div>
      </div>
      <div class="comparison-year-chip-list">
        ${allYears.map(year => {
          const active = visibleSet.has(String(year));
          return `
            <button type="button" class="chip-toggle ${active ? 'active' : ''}" onclick="toggleComparisonVisibleYear(${year})" aria-pressed="${active ? 'true' : 'false'}">
              <span class="chip-toggle-marker">${active ? '✓' : '+'}</span>
              <span>${year}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function getComparisonMonthlyPeriods(payload = currentComparisonTablePayload, yearsFilter = null) {
  const periodKeys = new Set();
  const allowedYears = yearsFilter ? new Set((yearsFilter || []).map(year => String(year))) : null;
  (payload?.series || []).forEach(item => {
    const byYear = item?.dataByYear || {};
    Object.keys(byYear).forEach(year => {
      if (allowedYears && !allowedYears.has(String(year))) return;
      (byYear[year] || []).forEach((value, monthIndex) => {
        if (value === null || value === undefined || isNaN(Number(value))) return;
        periodKeys.add(`${year}-${String(monthIndex + 1).padStart(2, '0')}`);
      });
    });
  });
  return [...periodKeys].sort((a, b) => a.localeCompare(b));
}

function formatComparisonPeriodLabel(periodKey) {
  const [year, month] = String(periodKey || '').split('-');
  const monthName = MONTHS[Number(month) - 1] || month || '';
  return `${monthName.slice(0, 3)} ${year}`;
}

function getComparisonMonthlyValue(item, periodKey) {
  const [year, month] = String(periodKey || '').split('-');
  const value = item?.dataByYear?.[Number(year)]?.[Number(month) - 1];
  return value === null || value === undefined || isNaN(Number(value)) ? null : Number(value);
}


function getComparisonZoomSignature(labels, payload = currentComparisonTablePayload) {
  const seriesNames = (payload?.series || []).map(item => item.destinationName || '').join('|');
  return `${labels.length}|${labels[0] || ''}|${labels[labels.length - 1] || ''}|${seriesNames}`;
}

function resetComparisonZoom(labels = []) {
  comparisonZoomState = {
    signature: getComparisonZoomSignature(labels),
    start: 0,
    span: labels.length || null,
  };
}

function clampComparisonZoom(total) {
  if (!total) {
    comparisonZoomState.start = 0;
    comparisonZoomState.span = null;
    return;
  }
  const minSpan = Math.min(6, total);
  let span = Number(comparisonZoomState.span);
  if (!Number.isFinite(span) || span < minSpan) span = total;
  span = Math.max(minSpan, Math.min(total, Math.round(span)));
  let start = Number(comparisonZoomState.start);
  if (!Number.isFinite(start)) start = 0;
  start = Math.max(0, Math.min(total - span, Math.round(start)));
  comparisonZoomState.span = span;
  comparisonZoomState.start = start;
}

function getComparisonZoomWindow(labels = []) {
  const total = labels.length;
  const signature = getComparisonZoomSignature(labels);
  if (comparisonZoomState.signature !== signature) {
    resetComparisonZoom(labels);
  }
  clampComparisonZoom(total);
  const start = comparisonZoomState.start || 0;
  const span = comparisonZoomState.span || total;
  return {
    start,
    end: Math.min(total, start + span),
    span,
    total,
    isZoomed: total > 0 && span < total,
  };
}

function applyComparisonZoomToSeries(labels, series) {
  const windowInfo = getComparisonZoomWindow(labels);
  if (!windowInfo.isZoomed) {
    return { labels, series, windowInfo };
  }
  const slicedLabels = labels.slice(windowInfo.start, windowInfo.end);
  const slicedSeries = (series || []).map(item => ({
    ...item,
    values: (item.values || []).slice(windowInfo.start, windowInfo.end),
  }));
  return { labels: slicedLabels, series: slicedSeries, windowInfo };
}

function renderComparisonZoomControls(labels = [], monthlyMode = isMonthlyComparisonMode()) {
  const controls = document.getElementById('comparisonZoomControls');
  if (!controls) return;
  if (!monthlyMode || labels.length <= 18) {
    controls.style.display = 'none';
    controls.innerHTML = '';
    return;
  }
  const windowInfo = getComparisonZoomWindow(labels);
  const firstLabel = labels[windowInfo.start] || '';
  const lastLabel = labels[Math.max(windowInfo.end - 1, 0)] || '';
  const maxStart = Math.max(0, windowInfo.total - windowInfo.span);
  controls.style.display = 'flex';
  controls.innerHTML = `
    <div class="comparison-zoom-main">
      <span class="comparison-zoom-label">Zoom del gráfico</span>
      <button class="btn btn-secondary btn-sm" type="button" onclick="moveComparisonZoom(-1)" ${windowInfo.start <= 0 ? 'disabled' : ''}>←</button>
      <button class="btn btn-secondary btn-sm" type="button" onclick="changeComparisonZoom(1)">+ Zoom</button>
      <button class="btn btn-secondary btn-sm" type="button" onclick="changeComparisonZoom(-1)" ${!windowInfo.isZoomed ? 'disabled' : ''}>− Zoom</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="resetComparisonZoomAndRender()" ${!windowInfo.isZoomed && windowInfo.start === 0 ? 'disabled' : ''}>Ver todo</button>
      <button class="btn btn-secondary btn-sm" type="button" onclick="moveComparisonZoom(1)" ${windowInfo.end >= windowInfo.total ? 'disabled' : ''}>→</button>
    </div>
    <div class="comparison-zoom-range-wrap">
      <input class="comparison-zoom-range" type="range" min="0" max="${maxStart}" value="${windowInfo.start}" ${maxStart <= 0 ? 'disabled' : ''} oninput="setComparisonZoomStart(this.value)"/>
      <span class="comparison-zoom-info">${escapeHtml(firstLabel)} – ${escapeHtml(lastLabel)} · ${windowInfo.end - windowInfo.start} de ${windowInfo.total} meses</span>
    </div>
  `;
}

function rerenderComparisonChartOnly() {
  renderComparisonChartFromPayload(currentComparisonTablePayload);
}

function changeComparisonZoom(direction) {
  const payload = currentComparisonTablePayload;
  if (!payload || !isMonthlyComparisonMode()) return;
  const labels = getComparisonMonthlyPeriods(payload, getComparisonVisibleYears(payload)).map(formatComparisonPeriodLabel);
  const windowInfo = getComparisonZoomWindow(labels);
  if (!windowInfo.total) return;
  const center = windowInfo.start + windowInfo.span / 2;
  const minSpan = Math.min(6, windowInfo.total);
  const factor = direction > 0 ? 0.6 : 1.6;
  const nextSpan = Math.max(minSpan, Math.min(windowInfo.total, Math.round(windowInfo.span * factor)));
  comparisonZoomState.span = nextSpan;
  comparisonZoomState.start = Math.max(0, Math.min(windowInfo.total - nextSpan, Math.round(center - nextSpan / 2)));
  rerenderComparisonChartOnly();
}

function moveComparisonZoom(direction) {
  const payload = currentComparisonTablePayload;
  if (!payload || !isMonthlyComparisonMode()) return;
  const labels = getComparisonMonthlyPeriods(payload, getComparisonVisibleYears(payload)).map(formatComparisonPeriodLabel);
  const windowInfo = getComparisonZoomWindow(labels);
  const step = Math.max(1, Math.round(windowInfo.span * 0.5));
  comparisonZoomState.start = Math.max(0, Math.min(windowInfo.total - windowInfo.span, windowInfo.start + (direction * step)));
  rerenderComparisonChartOnly();
}

function setComparisonZoomStart(value) {
  const payload = currentComparisonTablePayload;
  if (!payload || !isMonthlyComparisonMode()) return;
  const labels = getComparisonMonthlyPeriods(payload, getComparisonVisibleYears(payload)).map(formatComparisonPeriodLabel);
  const windowInfo = getComparisonZoomWindow(labels);
  comparisonZoomState.start = Math.max(0, Math.min(windowInfo.total - windowInfo.span, Number(value) || 0));
  rerenderComparisonChartOnly();
}

function resetComparisonZoomAndRender() {
  const payload = currentComparisonTablePayload;
  const labels = payload && isMonthlyComparisonMode()
    ? getComparisonMonthlyPeriods(payload, getComparisonVisibleYears(payload)).map(formatComparisonPeriodLabel)
    : [];
  resetComparisonZoom(labels);
  rerenderComparisonChartOnly();
}

function getComparisonMeasureValue(item, year, measure = comparisonTableSort.measure) {
  if (isMonthlyComparisonMode(measure)) return null;
  if (!year) return null;
  const stats = item?.yearlyStats?.[Number(year)];
  if (!stats) return null;
  const key = measure || 'annualValue';
  const value = stats?.[key];
  return value === null || value === undefined || isNaN(Number(value)) ? null : Number(value);
}

function resetComparisonTableSortForYears(years = [], payload = null) {
  const visibleYears = getComparisonVisibleYears(payload);
  const availableYears = new Set((visibleYears || []).map(year => String(year)));
  if (!availableYears.has(String(comparisonTableSort.year || ''))) {
    comparisonTableSort.year = '';
  }
  if (!['original', 'asc', 'desc'].includes(comparisonTableSort.direction)) {
    comparisonTableSort.direction = 'original';
  }
  if (!comparisonTableSort.year) {
    comparisonTableSort.direction = 'original';
  }
  const availableMeasures = new Set(getComparisonMeasureOptions(payload).map(option => option.value));
  if (!availableMeasures.has(comparisonTableSort.measure)) {
    comparisonTableSort.measure = 'annualValue';
  }
  if (isMonthlyComparisonMode(comparisonTableSort.measure)) {
    comparisonTableSort.year = '';
    comparisonTableSort.direction = 'original';
  }
}

function handleComparisonSortChange() {
  const previousMeasure = comparisonTableSort.measure;
  comparisonTableSort.measure = document.getElementById('comparisonMeasure')?.value || 'annualValue';
  if (previousMeasure !== comparisonTableSort.measure) comparisonZoomState = { signature: '', start: 0, span: null };
  comparisonTableSort.year = document.getElementById('comparisonSortYear')?.value || '';
  comparisonTableSort.direction = document.getElementById('comparisonSortDirection')?.value || 'original';
  if (isMonthlyComparisonMode(comparisonTableSort.measure)) {
    comparisonTableSort.year = '';
    comparisonTableSort.direction = 'original';
  }
  if (!comparisonTableSort.year) comparisonTableSort.direction = 'original';
  renderComparisonTable();
  renderComparisonChartFromPayload();
}

function renderComparisonTableSortControls(payload) {
  const controls = document.getElementById('comparisonTableSortControls');
  if (!controls) return;
  const allYears = getComparisonAllYears(payload);
  const years = getComparisonVisibleYears(payload);
  resetComparisonTableSortForYears(years, payload);
  if (!allYears.length) {
    controls.style.display = 'none';
    controls.innerHTML = '';
    return;
  }

  const measures = getComparisonMeasureOptions(payload);
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);
  const monthlyMode = isMonthlyComparisonMode(comparisonTableSort.measure);

  controls.style.display = 'flex';
  controls.innerHTML = `
    <div class="comparison-sort-field comparison-measure-field">
      <label class="form-label">Medida de tabla y gráfico</label>
      <select id="comparisonMeasure" class="form-control comparison-sort-select" onchange="handleComparisonSortChange()">
        ${measures.map(option => `<option value="${option.value}" ${comparisonTableSort.measure === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </div>
    ${monthlyMode ? '' : `
      <div class="comparison-sort-field">
        <label class="form-label">Año de referencia</label>
        <select id="comparisonSortYear" class="form-control comparison-sort-select" onchange="handleComparisonSortChange()" ${years.length ? '' : 'disabled'}>
          <option value="" ${comparisonTableSort.year ? '' : 'selected'}>Sin año específico</option>
          ${years.map(year => `<option value="${year}" ${String(comparisonTableSort.year) === String(year) ? 'selected' : ''}>${year}</option>`).join('')}
        </select>
      </div>
      <div class="comparison-sort-field">
        <label class="form-label">Criterio</label>
        <select id="comparisonSortDirection" class="form-control comparison-sort-select" onchange="handleComparisonSortChange()" ${comparisonTableSort.year ? '' : 'disabled'}>
          <option value="original" ${comparisonTableSort.direction === 'original' ? 'selected' : ''}>Orden original</option>
          <option value="desc" ${comparisonTableSort.direction === 'desc' ? 'selected' : ''}>Mayor a menor</option>
          <option value="asc" ${comparisonTableSort.direction === 'asc' ? 'selected' : ''}>Menor a mayor</option>
        </select>
      </div>
    `}
    <div class="comparison-measure-note">${escapeHtml(activeMeasure.help)}</div>
    ${renderComparisonYearFilter(payload)}
  `;
}

function getComparisonValueForSort(item, year) {
  return getComparisonMeasureValue(item, year, comparisonTableSort.measure);
}

function getSortedComparisonSeries(payload) {
  const baseSeries = (payload?.series || []).map((item, index) => ({ ...item, __originalIndex: index }));
  const sortYear = comparisonTableSort.year;
  const sortDirection = comparisonTableSort.direction || 'original';
  if (!sortYear || sortDirection === 'original') return baseSeries;

  const directionFactor = sortDirection === 'asc' ? 1 : -1;
  return baseSeries.sort((a, b) => {
    const aValue = getComparisonValueForSort(a, sortYear);
    const bValue = getComparisonValueForSort(b, sortYear);
    const aMissing = aValue === null;
    const bMissing = bValue === null;

    if (aMissing && bMissing) return a.__originalIndex - b.__originalIndex;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (aValue === bValue) return a.__originalIndex - b.__originalIndex;
    return (aValue - bValue) * directionFactor;
  });
}

function buildComparisonChartSeries(payload) {
  const sortedSeries = getSortedComparisonSeries(payload);
  const visibleYears = getComparisonVisibleYears(payload);
  if (isMonthlyComparisonMode()) {
    const periods = getComparisonMonthlyPeriods(payload, visibleYears);
    return sortedSeries.map(item => ({
      label: item.destinationName,
      values: periods.map(period => getComparisonMonthlyValue(item, period)),
    }));
  }
  return sortedSeries.map(item => ({
    label: item.destinationName,
    values: visibleYears.map(year => getComparisonMeasureValue(item, year, comparisonTableSort.measure)),
  }));
}

function renderComparisonChartFromPayload(payload = currentComparisonTablePayload) {
  if (!payload) return;
  const visibleYears = getComparisonVisibleYears(payload);
  resetComparisonTableSortForYears(visibleYears, payload);
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);
  const metricName = payload.indicatorName || payload.series?.[0]?.indicator?.name || 'Indicador';
  const monthlyMode = isMonthlyComparisonMode();
  const periods = monthlyMode ? getComparisonMonthlyPeriods(payload, visibleYears) : [];
  const rawChartLabels = monthlyMode ? periods.map(formatComparisonPeriodLabel) : visibleYears.map(String);
  const rawChartSeries = buildComparisonChartSeries(payload);
  const zoomedChart = monthlyMode
    ? applyComparisonZoomToSeries(rawChartLabels, rawChartSeries)
    : { labels: rawChartLabels, series: rawChartSeries };
  renderComparisonZoomControls(rawChartLabels, monthlyMode);
  renderComparisonChart('comparisonChart', {
    years: monthlyMode ? [] : visibleYears,
    labels: zoomedChart.labels,
    series: zoomedChart.series,
    unit: payload.unit || '',
    measureLabel: activeMeasure.label,
  });
  const titleEl = document.getElementById('compareChartTitle');
  const noteEl = document.getElementById('compareChartNote');
  if (titleEl) titleEl.textContent = monthlyMode ? `${metricName} · evolución mensual histórica` : `${metricName} · comparación entre destinos`;
  if (noteEl) noteEl.textContent = visibleYears.length ? activeMeasure.label : `${activeMeasure.label} · sin años visibles`;
}

function renderMonthlyComparisonTable(payload, table) {
  const visibleYears = getComparisonVisibleYears(payload);
  const periods = getComparisonMonthlyPeriods(payload, visibleYears);
  const sortedSeries = getSortedComparisonSeries(payload);
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);
  renderComparisonTableSortControls(payload);

  if (!visibleYears.length) {
    table.innerHTML = '<tbody><tr><td>Seleccioná al menos un año para visualizar la comparación mensual.</td></tr></tbody>';
    return;
  }
  if (!periods.length) {
    table.innerHTML = '<tbody><tr><td>No hay datos mensuales cargados para los años seleccionados.</td></tr></tbody>';
    return;
  }

  const header = `<thead><tr><th>Destino</th>${periods.map(period => `<th>${escapeHtml(formatComparisonPeriodLabel(period))}</th>`).join('')}</tr></thead>`;
  const rows = sortedSeries.map(item => `
    <tr>
      <td>${escapeHtml(item.destinationName)}</td>
      ${periods.map(period => `<td title="${escapeHtml(activeMeasure.label)} · ${escapeHtml(formatComparisonPeriodLabel(period))}">${formatNumber(getComparisonMonthlyValue(item, period))}</td>`).join('')}
    </tr>
  `).join('');

  table.innerHTML = header + `<tbody>${rows}</tbody>`;
}

function renderComparisonTable() {
  const payload = currentComparisonTablePayload;
  const table = document.getElementById('comparisonTable');
  if (!payload || !table) return;

  if (isMonthlyComparisonMode()) {
    renderMonthlyComparisonTable(payload, table);
    return;
  }

  const years = getComparisonVisibleYears(payload);
  const sortedSeries = getSortedComparisonSeries(payload);
  const activeSortYear = String(comparisonTableSort.year || '');
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);
  const isSortedByValue = activeSortYear && comparisonTableSort.direction !== 'original';
  const sortArrow = comparisonTableSort.direction === 'asc' ? '↑' : comparisonTableSort.direction === 'desc' ? '↓' : '';
  renderComparisonTableSortControls(payload);

  if (!years.length) {
    table.innerHTML = '<tbody><tr><td>Seleccioná al menos un año para visualizar la comparación.</td></tr></tbody>';
    return;
  }

  const header = `<thead><tr><th>Destino</th>${years.map(year => {
    const isActive = String(year) === activeSortYear;
    return `<th class="${isActive ? 'sorted-column' : ''}">${year}${isActive && sortArrow ? ` ${sortArrow}` : ''}</th>`;
  }).join('')}</tr></thead>`;

  const rows = sortedSeries.map((item, rowIndex) => `
    <tr class="${isSortedByValue && rowIndex === 0 ? 'top-ranked-row' : ''}">
      <td>${escapeHtml(item.destinationName)}</td>
      ${years.map(year => {
        const isActive = String(year) === activeSortYear;
        return `<td class="${isActive ? 'sorted-column' : ''}" title="${escapeHtml(activeMeasure.label)} · ${year}">${formatNumber(getComparisonMeasureValue(item, year, activeMeasure.value))}</td>`;
      }).join('')}
    </tr>
  `).join('');

  table.innerHTML = header + `<tbody>${rows}</tbody>`;
}


async function runComparison() {
  const metricKey = comparisonSelection.metricKey;
  const destinationIds = comparisonSelection.destinationIds;
  if (!metricKey) {
    toast('Elegí un indicador comparable.', 'error');
    return;
  }
  if (destinationIds.length < 2) {
    toast('Seleccioná al menos dos destinos para comparar.', 'error');
    return;
  }

  const selectedIndicators = destinationIds
    .map(destId => indicators.find(ind => ind.destination_id === destId && getMetricKey(ind) === metricKey))
    .filter(Boolean);
  if (selectedIndicators.length < 2) {
    toast('No encontré suficientes indicadores comparables.', 'error');
    return;
  }

  try {
    const destinationIndicatorIds = [...new Set(destinationIds.flatMap(destId => getIndicatorsForDestination(destId).map(ind => ind.id)))];
    const allPoints = await fetchDataPointsForIndicators(destinationIndicatorIds);
    const dataByIndicator = buildDataByIndicator(allPoints);
    const yearsSet = new Set();
    const series = [];

    selectedIndicators.forEach(indicator => {
      const destinationIndicators = getIndicatorsForDestination(indicator.destination_id);
      const relatedSeriesMap = buildRelatedSeriesMapForDestination(indicator, destinationIndicators, dataByIndicator);
      const dataByYear = buildDataByYear(dataByIndicator[indicator.id] || []);
      const yearlyStats = calcYearlyStats(dataByYear, { indicator, relatedSeriesMap });
      const annualSeries = buildAnnualSeries(yearlyStats);
      annualSeries.years.forEach(year => yearsSet.add(year));
      series.push({
        indicator,
        destinationName: indicator.destination?.name || 'Sin destino',
        dataByYear,
        yearlyStats,
        annualSeries,
      });
    });

    const years = [...yearsSet].sort((a, b) => a - b);
    const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(selectedIndicators[0]));

    currentComparisonTablePayload = {
      years,
      series,
      annualMeta,
      unit: selectedIndicators[0]?.unit || '',
      indicatorName: selectedIndicators[0]?.name || 'Indicador',
    };
    comparisonTableSort = { year: '', direction: 'original', measure: 'annualValue' };
    comparisonVisibleYears = [...years];
    renderComparisonChartFromPayload();
    document.getElementById('compareSummaryBadge').textContent = `${selectedIndicators.length} destinos`;
    renderComparisonTable();

    document.getElementById('compareEmpty').style.display = 'none';
    document.getElementById('compareResults').style.display = 'block';
  } catch (e) {
    toast('Error armando la comparación: ' + e.message, 'error');
  }
}

async function handleExcelExport() {
  if (!currentIndicator) return;
  try {
    await exportToExcel(currentIndicator, currentDataByYear, currentYearlyStats);
    toast('Excel generado ✓', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function handlePdfExport() {
  if (!currentIndicator) return;
  try {
    await exportToPDF(currentIndicator, currentDataByYear, currentYearlyStats);
    toast('PDF generado ✓', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function escapeJs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
