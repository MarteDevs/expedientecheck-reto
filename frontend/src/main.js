/**
 * ExpedienteCheck — Entry Point
 * Orquesta la aplicación: carga datos del MEF, renderiza componentes,
 * maneja estado global y eventos de usuario
 */

import './styles/index.css';
import {
  fetchMefData,
  fetchDistinctValues,
  RESOURCE_IDS,
} from './api/mefClient.js';
import { renderLoader } from './components/Loader.js';
import { renderErrorState } from './components/ErrorState.js';
import { renderSearchBar } from './components/SearchBar.js';
import { renderDataTable } from './components/DataTable.js';
import { initModal, openModal } from './components/DetailModal.js';
import { formatCompactCurrency } from './utils/formatter.js';
import { saveFavorite, getFavorites } from './api/firebase.js';
import { showAlertModal } from './components/AlertModal.js';
import { renderAnalyticsDashboard } from './components/AnalyticsDashboard.js';

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

const FALLBACK_ANO_EJE = [
  '2026', '2025', '2024', '2023'
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
    ANO_EJE: FALLBACK_ANO_EJE,
  },
  loading: true,
  error: null,
  favorites: [],
  analyticsDirty: true,
  stats: {
    totalPIA: 0,
    totalPIM: 0,
    totalDevengado: 0,
    avgExecution: 0,
  },
  currentTab: 'data', // 'data' o 'analytics'
};

// ── Elementos del DOM ──
let searchContainer;
let tableContainer;
let analyticsContainer;
let tabData;
let tabAnalytics;

/**
 * Inicializa la aplicación
 */
async function init() {
  searchContainer = document.getElementById('search-container');
  tableContainer = document.getElementById('table-container');
  analyticsContainer = document.getElementById('analytics-container');
  tabData = document.getElementById('tab-data');
  tabAnalytics = document.getElementById('tab-analytics');

  initModal();
  loadFilterOptions();

  // Tab Listeners
  tabData.addEventListener('click', () => switchTab('data'));
  tabAnalytics.addEventListener('click', () => switchTab('analytics'));
  
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

    // Determinar el resourceId en base al año seleccionado
    let resourceId = RESOURCE_IDS.GASTO_2026;
    if (state.filters.ANO_EJE && RESOURCE_IDS[`GASTO_${state.filters.ANO_EJE}`]) {
      resourceId = RESOURCE_IDS[`GASTO_${state.filters.ANO_EJE}`];
    }

    const result = await fetchMefData({
      resourceId,
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
  state.filterOptions.ANO_EJE = FALLBACK_ANO_EJE;

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
  renderSearch();
  renderTable();
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
    pageTotalPIM: state.stats.totalPIM,
    onPageChange: handlePageChange,
    onLimitChange: handleLimitChange,
    onRowClick: handleRowClick,
  });
}

/**
 * Renderiza el estado de error
 */
function renderError() {
  renderSearch();
  renderErrorState(tableContainer, state.error, () => loadData());
}

// ── Handlers de Eventos ──

function handleApply() {
  state.offset = 0;
  state.analyticsDirty = true;
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
  state.analyticsDirty = true;
  loadData();
}

async function handleSaveFavorite(name) {
  // Pasar los resultados actuales junto con los filtros
  const resultData = {
    records: state.records,
    total: state.total,
    fields: state.fields
  };
  const success = await saveFavorite(name, state.filters, resultData);
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
    state.analyticsDirty = true;
    
    // Si el favorito trajo los resultados en la misma carga, usarlos
    if (fav.resultData && fav.resultData.records && fav.resultData.records.length > 0) {
      state.records = fav.resultData.records;
      state.total = fav.resultData.total || fav.resultData.records.length;
      state.fields = fav.resultData.fields || state.fields;
      renderSearch();
      renderTable();
    } else {
      // Si no tiene resultados, consultar la API con los filtros
      loadData();
    }
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
  openModal(record, state.stats.totalPIM);
}

/**
 * Cambia entre la vista de Datos y la vista de Análisis
 */
function switchTab(tab) {
  if (state.currentTab === tab) return;
  state.currentTab = tab;

  // Actualizar UI de los tabs
  if (tab === 'data') {
    tabData.classList.add('active');
    tabAnalytics.classList.remove('active');
    
    // Mostrar/ocultar contenedores
    tableContainer.style.display = 'block';
    searchContainer.style.display = 'block';
    analyticsContainer.style.display = 'none';
  } else {
    tabAnalytics.classList.add('active');
    tabData.classList.remove('active');
    
    // Mostrar/ocultar contenedores
    tableContainer.style.display = 'none';
    searchContainer.style.display = 'none';
    analyticsContainer.style.display = 'block';
    
    // Renderizar dashboard de análisis solo si los filtros cambiaron
    if (state.analyticsDirty) {
      renderAnalyticsDashboard(analyticsContainer, {
        filters: state.filters,
        searchQuery: state.searchQuery,
        projectPIM: state.stats.totalPIM,
        projectPIA: state.stats.totalPIA
      });
      state.analyticsDirty = false;
    }
  }
}

// ── Arranque ──
document.addEventListener('DOMContentLoaded', init);
