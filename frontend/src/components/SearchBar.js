/**
 * Componente SearchBar — Barra de búsqueda y filtros
 * Incluye input de búsqueda con debounce y dropdowns de filtros
 */

import { debounce } from '../utils/debounce.js';

/**
 * Renderiza la barra de búsqueda y filtros
 * @param {HTMLElement} container - Elemento donde renderizar
 * @param {Object} options
 * @param {Object} options.filterOptions - Opciones disponibles para cada filtro
 * @param {Object} options.activeFilters - Filtros actualmente activos
 * @param {string} options.searchQuery - Texto de búsqueda actual
 * @param {Function} options.onSearch - Callback al buscar (recibe query string)
 * @param {Function} options.onFilterChange - Callback al cambiar filtro (recibe { field, value })
 * @param {Function} options.onClearFilters - Callback para limpiar todos los filtros
 */
export function renderSearchBar(container, options = {}) {
  const {
    filterOptions = {},
    activeFilters = {},
    searchQuery = '',
    onSearch,
    onFilterChange,
    onClearFilters,
  } = options;

  // Generar opciones de select para cada filtro
  const createSelectOptions = (fieldName, values, currentValue) => {
    const label = getFilterLabel(fieldName);
    const opts = (values || [])
      .map(
        (v) =>
          `<option value="${escapeHtml(v)}" ${v === currentValue ? 'selected' : ''}>${escapeHtml(truncate(v, 50))}</option>`
      )
      .join('');
    return `
      <select class="filter-select" data-field="${fieldName}" id="filter-${fieldName}">
        <option value="">${label}</option>
        ${opts}
      </select>
    `;
  };

  // Filtros disponibles
  const filterFields = [
    { field: 'NIVEL_GOBIERNO_NOMBRE', values: filterOptions.nivelGobierno },
    { field: 'SECTOR_NOMBRE', values: filterOptions.sector },
    { field: 'DEPARTAMENTO_META_NOMBRE', values: filterOptions.departamento },
  ];

  const filtersHtml = filterFields
    .map((f) => createSelectOptions(f.field, f.values, activeFilters[f.field]))
    .join('');

  // Chips de filtros activos
  const activeChips = Object.entries(activeFilters)
    .filter(([, v]) => v && v !== '')
    .map(
      ([key, value]) => `
      <span class="filter-chip">
        ${getFilterLabel(key)}: ${truncate(value, 25)}
        <button class="filter-chip__remove" data-remove-field="${key}" title="Quitar filtro">✕</button>
      </span>
    `
    )
    .join('');

  // Determinar si hay filtros activos
  const hasActiveFilters =
    searchQuery || Object.values(activeFilters).some((v) => v && v !== '');

  container.innerHTML = `
    <div class="search-section">
      <div class="search-bar">
        <div class="search-bar__input-wrapper">
          <span class="search-bar__icon">🔍</span>
          <input
            type="text"
            id="search-input"
            class="search-bar__input"
            placeholder="Buscar por sector, pliego, ejecutora, departamento..."
            value="${escapeHtml(searchQuery)}"
            autocomplete="off"
          />
        </div>
        ${
          hasActiveFilters
            ? '<button id="clear-filters-btn" class="btn btn--ghost">✕ Limpiar</button>'
            : ''
        }
      </div>
      <div class="filters-row">
        ${filtersHtml}
      </div>
      ${activeChips ? `<div class="active-filters">${activeChips}</div>` : ''}
    </div>
  `;

  // ── Event Listeners ──

  // Búsqueda con debounce
  const searchInput = container.querySelector('#search-input');
  if (searchInput && onSearch) {
    const debouncedSearch = debounce((value) => onSearch(value), 400);
    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  // Cambio de filtros
  const selects = container.querySelectorAll('.filter-select');
  selects.forEach((select) => {
    select.addEventListener('change', (e) => {
      if (onFilterChange) {
        onFilterChange({
          field: e.target.dataset.field,
          value: e.target.value,
        });
      }
    });
  });

  // Limpiar todos los filtros
  const clearBtn = container.querySelector('#clear-filters-btn');
  if (clearBtn && onClearFilters) {
    clearBtn.addEventListener('click', onClearFilters);
  }

  // Quitar filtro individual (chip)
  const removeButtons = container.querySelectorAll('.filter-chip__remove');
  removeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (onFilterChange) {
        onFilterChange({
          field: btn.dataset.removeField,
          value: '',
        });
      }
    });
  });
}

/** Mapea nombres de campo a etiquetas legibles */
function getFilterLabel(fieldName) {
  const labels = {
    NIVEL_GOBIERNO_NOMBRE: 'Nivel de Gobierno',
    SECTOR_NOMBRE: 'Sector',
    DEPARTAMENTO_META_NOMBRE: 'Departamento',
    ANO_EJE: 'Año',
    FUNCION_NOMBRE: 'Función',
    PROGRAMA_PPTAL_NOMBRE: 'Programa',
  };
  return labels[fieldName] || fieldName;
}

/** Escapa caracteres HTML para prevenir XSS */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Trunca texto largo */
function truncate(str, max = 40) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}
