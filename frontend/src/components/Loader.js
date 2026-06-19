/**
 * Componente Loader — Skeleton loading para la tabla de datos
 * Muestra un placeholder animado mientras se cargan los datos
 */

/**
 * Renderiza el skeleton loader dentro del contenedor
 * @param {HTMLElement} container - Elemento donde renderizar
 * @param {number} rows - Cantidad de filas skeleton (default: 8)
 */
export function renderLoader(container, rows = 8) {
  const skeletonRows = Array.from({ length: rows }, () => `
    <div class="skeleton-row">
      <div class="skeleton-cell skeleton-cell--sm"></div>
      <div class="skeleton-cell skeleton-cell--lg"></div>
      <div class="skeleton-cell skeleton-cell--xl"></div>
      <div class="skeleton-cell skeleton-cell--md"></div>
      <div class="skeleton-cell skeleton-cell--md"></div>
      <div class="skeleton-cell skeleton-cell--md"></div>
      <div class="skeleton-cell skeleton-cell--sm"></div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="table-container">
      <div class="table-header">
        <span class="table-header__title">Cargando datos del MEF...</span>
        <span class="table-header__count" style="animation: pulse 1.5s infinite">⏳ Conectando con la API</span>
      </div>
      <div class="skeleton-table">
        ${skeletonRows}
      </div>
    </div>
  `;
}

/**
 * Renderiza un loader mínimo inline (para recarga de filtros)
 * @param {HTMLElement} container - Elemento donde renderizar
 */
export function renderInlineLoader(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:3rem;gap:0.75rem;color:var(--color-text-muted)">
      <span style="animation:pulse 1s infinite">⏳</span>
      <span>Actualizando datos...</span>
    </div>
  `;
}
