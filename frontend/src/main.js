/**
 * ExpedienteCheck — Entry Point
 * Orquesta la aplicación: carga datos del MEF, renderiza componentes,
 * maneja estado global y eventos de usuario
 */

import './styles/index.css';
import { fetchMefData, fetchDistinctValues, RESOURCE_IDS } from './api/mefClient.js';
import { renderLoader } from './components/Loader.js';
import { renderErrorState } from './components/ErrorState.js';
import { renderSearchBar } from './components/SearchBar.js';
import { renderDataTable } from './components/DataTable.js';
import { initModal, openModal } from './components/DetailModal.js';
import { formatCompactCurrency } from './utils/formatter.js';

// ── Estado Global de la Aplicación ──
const state = {
  records: [],
  total: 0,
  fields: [],
  limit: 20,
  offset: 0,
  searchQuery: '',
  filters: {},
  filterOptions: {
    nivelGobierno: [],
    sector: [],
    departamento: [],
  },
  loading: true,
  error: null,
  stats: {
    totalPIA: 0,
    totalPIM: 0,
    totalDevengado: 0,
    avgExecution: 0,
  },
};

// ── Elementos del DOM ──
let searchContainer;
let tableContainer;
let statsContainer;

/**
 * Inicializa la aplicación
 */
async function init() {
  searchContainer = document.getElementById('search-container');
  tableContainer = document.getElementById('table-container');
  statsContainer = document.getElementById('stats-container');

  initModal();
  loadFilterOptions();
  await loadData();
}

/**
 * Carga los datos de la API del MEF según el estado actual
 */
async function loadData() {
  state.loading = true;
  state.error = null;
  renderLoader(tableContainer);

  try {
    const useSql = Boolean(state.searchQuery);

    const result = await fetchMefData({
      resourceId: RESOURCE_IDS.GASTO_2024,
      limit: state.limit,
      offset: state.offset,
      query: state.searchQuery,
      filters: state.filters,
      useSql,
    });

    state.records = result.records;
    state.total = result.total;
    state.fields = result.fields;
    state.loading = false;

    calculateStats();
    render();
  } catch (error) {
    state.loading = false;
    state.error = error.message;
    renderError();
  }
}

/**
 * Carga los valores únicos para los dropdowns de filtros
 */
async function loadFilterOptions() {
  try {
    const [nivelGobierno, sector, departamento] = await Promise.all([
      fetchDistinctValues('NIVEL_GOBIERNO_NOMBRE', RESOURCE_IDS.GASTO_2024),
      fetchDistinctValues('SECTOR_NOMBRE', RESOURCE_IDS.GASTO_2024),
      fetchDistinctValues('DEPARTAMENTO_META_NOMBRE', RESOURCE_IDS.GASTO_2024),
    ]);

    state.filterOptions.nivelGobierno = nivelGobierno;
    state.filterOptions.sector = sector;
    state.filterOptions.departamento = departamento;

    if (!state.loading) {
      renderSearch();
    }
  } catch {
    console.warn('No se pudieron cargar las opciones de filtros');
  }
}

/**
 * Calcula estadísticas resumidas de los datos actuales
 */
function calculateStats() {
  if (!state.records.length) {
    state.stats = { totalPIA: 0, totalPIM: 0, totalDevengado: 0, avgExecution: 0 };
    return;
  }

  let totalPIA = 0;
  let totalPIM = 0;
  let totalDevengado = 0;

  state.records.forEach((r) => {
    totalPIA += parseFloat(r.MONTO_PIA) || 0;
    totalPIM += parseFloat(r.MONTO_PIM) || 0;
    totalDevengado += parseFloat(r.MONTO_DEVENGADO) || 0;
  });

  const avgExecution = totalPIM > 0 ? (totalDevengado / totalPIM) * 100 : 0;
  state.stats = { totalPIA, totalPIM, totalDevengado, avgExecution };
}

/**
 * Renderiza todos los componentes
 */
function render() {
  renderStats();
  renderSearch();
  renderTable();
}

/**
 * Renderiza las tarjetas de estadísticas
 */
function renderStats() {
  const { totalPIA, totalPIM, totalDevengado, avgExecution } = state.stats;

  statsContainer.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__label">PIA Total (Página)</div>
      <div class="stat-card__value">${formatCompactCurrency(totalPIA)}</div>
      <div class="stat-card__trend">Presupuesto de Apertura</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">PIM Total (Página)</div>
      <div class="stat-card__value">${formatCompactCurrency(totalPIM)}</div>
      <div class="stat-card__trend">Presupuesto Modificado</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Devengado (Página)</div>
      <div class="stat-card__value">${formatCompactCurrency(totalDevengado)}</div>
      <div class="stat-card__trend">Monto Ejecutado</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Avance Promedio</div>
      <div class="stat-card__value">${avgExecution.toFixed(1)}%</div>
      <div class="stat-card__trend stat-card__trend--${avgExecution >= 50 ? 'up' : 'down'}">
        ${avgExecution >= 50 ? '↑' : '↓'} Ejecución presupuestal
      </div>
    </div>
  `;
}

/**
 * Renderiza la barra de búsqueda
 */
function renderSearch() {
  renderSearchBar(searchContainer, {
    filterOptions: state.filterOptions,
    activeFilters: state.filters,
    searchQuery: state.searchQuery,
    onSearch: handleSearch,
    onFilterChange: handleFilterChange,
    onClearFilters: handleClearFilters,
  });
}

/**
 * Renderiza la tabla de datos
 */
function renderTable() {
  renderDataTable(tableContainer, {
    records: state.records,
    total: state.total,
    limit: state.limit,
    offset: state.offset,
    onPageChange: handlePageChange,
    onLimitChange: handleLimitChange,
    onRowClick: handleRowClick,
  });
}

/**
 * Renderiza el estado de error
 */
function renderError() {
  renderStats();
  renderSearch();
  renderErrorState(tableContainer, state.error, () => loadData());
}

// ── Handlers de Eventos ──

function handleSearch(query) {
  state.searchQuery = query;
  state.offset = 0;
  loadData();
}

function handleFilterChange({ field, value }) {
  if (value) {
    state.filters[field] = value;
  } else {
    delete state.filters[field];
  }
  state.offset = 0;
  loadData();
}

function handleClearFilters() {
  state.searchQuery = '';
  state.filters = {};
  state.offset = 0;
  loadData();
}

function handlePageChange(newOffset) {
  state.offset = newOffset;
  loadData();
  tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleLimitChange(newLimit) {
  state.limit = newLimit;
  state.offset = 0;
  loadData();
}

function handleRowClick(record) {
  openModal(record);
}

// ── Arranque ──
document.addEventListener('DOMContentLoaded', init);
