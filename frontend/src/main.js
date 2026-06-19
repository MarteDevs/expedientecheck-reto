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
import { saveFavorite, getFavorites } from './api/firebase.js';
import { showAlertModal } from './components/AlertModal.js';

// Valores de respaldo para los filtros (en caso de que la API del MEF falle o tarde en cargar)
const FALLBACK_NIVEL_GOBIERNO = [
  'GOBIERNO NACIONAL',
  'GOBIERNOS REGIONALES',
  'GOBIERNOS LOCALES'
];

const FALLBACK_SECTORES = [
  'AGRICULTURA',
  'AMBIENTE',
  'COMERCIO EXTERIOR Y TURISMO',
  'CONGRESO DE LA REPUBLICA',
  'CONTRALORIA GENERAL',
  'CULTURA',
  'DEFENSA',
  'DEFENSORIA DEL PUEBLO',
  'DESARROLLO E INCLUSION SOCIAL',
  'ECONOMIA Y FINANZAS',
  'EDUCACION',
  'ENERGIA Y MINAS',
  'GOBIERNOS LOCALES',
  'GOBIERNOS REGIONALES',
  'INTERIOR',
  'JURADO NACIONAL DE ELECCIONES',
  'JUSTICIA Y DERECHOS HUMANOS',
  'MINISTERIO PUBLICO',
  'MUJER Y POBLACIONES VULNERABLES',
  'OFICINA NACIONAL DE PROCESOS ELECTORALES',
  'PODER JUDICIAL',
  'PRESIDENCIA CONSEJO MINISTROS',
  'PRODUCCION',
  'REGISTRO NACIONAL DE IDENTIFICACION Y ESTADO CIVIL',
  'RELACIONES EXTERIORES',
  'SALUD',
  'TRABAJO Y PROMOCION DEL EMPLEO',
  'TRANSPORTES Y COMUNICACIONES',
  'TRIBUNAL CONSTITUCIONAL',
  'VIVIENDA, CONSTRUCCION Y SANEAMIENTO'
];

const FALLBACK_DEPARTAMENTOS = [
  'AMAZONAS',
  'ANCASH',
  'APURIMAC',
  'AREQUIPA',
  'AYACUCHO',
  'CAJAMARCA',
  'CALLAO',
  'CUSCO',
  'HUANCAVELICA',
  'HUANUCO',
  'ICA',
  'JUNIN',
  'LA LIBERTAD',
  'LAMBAYEQUE',
  'LIMA',
  'LORETO',
  'MADRE DE DIOS',
  'MOQUEGUA',
  'PASCO',
  'PIURA',
  'PUNO',
  'SAN MARTIN',
  'TACNA',
  'TUMBES',
  'UCAYALI'
];

const FALLBACK_MES_EJE = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'
];

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
    nivelGobierno: FALLBACK_NIVEL_GOBIERNO,
    sector: FALLBACK_SECTORES,
    departamento: FALLBACK_DEPARTAMENTOS,
    MES_EJE: FALLBACK_MES_EJE,
  },
  loading: true,
  error: null,
  favorites: [],
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
  
  // Cargar favoritos al inicio
  state.favorites = await getFavorites();
  
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
    // Flujos inteligentes:
    // 1. Búsqueda por texto (query): Usamos datastore_search porque aprovecha el índice _full_text
    // 2. Filtros específicos: Usamos datastore_search_sql porque permite usar LIKE según la doc del MEF
    // 3. Sin filtros: Usamos datastore_search por defecto.
    const hasQuery = Boolean(state.searchQuery && state.searchQuery.trim());
    const hasActiveFilters = Object.values(state.filters || {}).some(val => val !== '');
    
    const useSql = !hasQuery && hasActiveFilters;

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
  // Para evitar sobrecargar la API del MEF con consultas SELECT DISTINCT en
  // tablas de 11 millones de registros, usamos directamente las constantes.
  state.filterOptions.nivelGobierno = FALLBACK_NIVEL_GOBIERNO;
  state.filterOptions.sector = FALLBACK_SECTORES;
  state.filterOptions.departamento = FALLBACK_DEPARTAMENTOS;
  state.filterOptions.MES_EJE = FALLBACK_MES_EJE;

  renderSearch();
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
    favorites: state.favorites,
    onSearch: handleSearch,
    onFilterChange: handleFilterChange,
    onClearFilters: handleClearFilters,
    onApply: handleApply,
    onSaveFavorite: handleSaveFavorite,
    onApplyFavorite: handleApplyFavorite
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

function handleApply() {
  state.offset = 0;
  loadData();
}

function handleSearch(query) {
  state.searchQuery = query;
  state.offset = 0;
}

function handleFilterChange({ field, value }) {
  if (value) {
    state.filters[field] = value;
  } else {
    delete state.filters[field];
  }
  state.offset = 0;
  renderSearch(); // Solo actualiza la UI (chips)
}

function handleClearFilters() {
  state.searchQuery = '';
  state.filters = {};
  state.offset = 0;
  loadData();
}

async function handleSaveFavorite(name) {
  const success = await saveFavorite(name, state.filters);
  if (success) {
    state.favorites = await getFavorites(); // Recargar favoritos
    renderSearch();
    await showAlertModal('¡Favorito guardado en Firestore con éxito!', 'Éxito');
  } else {
    await showAlertModal('Hubo un error al guardar el favorito.', 'Error');
  }
}

function handleApplyFavorite(favoriteId) {
  const fav = state.favorites.find(f => f.id === favoriteId);
  if (fav) {
    state.filters = { ...fav.filters };
    state.searchQuery = '';
    state.offset = 0;
    loadData();
  }
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
