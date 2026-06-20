/**
 * Componente DataTable — Tabla de datos presupuestales con paginación
 * Muestra registros del MEF con columnas de montos, ejecución y avance
 */

import { formatCurrency, formatExecution, truncateText } from '../utils/formatter.js';

const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Renderiza la tabla de datos y la paginación
 * @param {HTMLElement} container - Elemento donde renderizar
 * @param {Object} options
 * @param {Array} options.records - Registros del MEF
 * @param {number} options.total - Total de registros disponibles
 * @param {number} options.limit - Registros por página
 * @param {number} options.offset - Offset actual
 * @param {Function} options.onPageChange - Callback al cambiar página (recibe offset)
 * @param {Function} options.onLimitChange - Callback al cambiar limit (recibe limit)
 * @param {Function} options.onRowClick - Callback al hacer clic en una fila (recibe record)
 */
export function renderDataTable(container, options = {}) {
  const {
    records = [],
    total = 0,
    limit = 20,
    offset = 0,
    pageTotalPIM = 0,
    onPageChange,
    onLimitChange,
    onRowClick,
  } = options;

  // Calcular info de paginación
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const showingFrom = total > 0 ? offset + 1 : 0;
  const showingTo = Math.min(offset + limit, total);

  // Estado vacío
  if (records.length === 0 && total === 0) {
    container.innerHTML = `
      <div class="table-container">
        <div class="empty-state">
          <div class="empty-state__icon">📊</div>
          <p class="empty-state__text">No se encontraron registros con los filtros seleccionados.</p>
        </div>
      </div>
    `;
    return;
  }

  // Calcular el PIM total del proyecto desde las filas de la página
  // El MEF asigna el PIM en las filas con MES_EJE=0 (asignación anual)
  // Las filas mensuales (MES_EJE=1-12) tienen PIM=0 porque solo registran gasto
  const projectPIM = pageTotalPIM > 0 ? pageTotalPIM : 
    records.reduce((sum, r) => sum + (parseFloat(r.MONTO_PIM) || 0), 0);

  // Separar filas anuales (MES=0, asignación presupuestal) de mensuales (ejecución)
  // Las filas anuales ya se muestran en las tarjetas de resumen
  const monthlyRecords = records.filter(r => parseInt(r.MES_EJE) !== 0);
  const displayRecords = monthlyRecords.length > 0 ? monthlyRecords : records;

  // Calcular el devengado acumulado para avance progresivo
  const totalDevengado = displayRecords.reduce((sum, r) => sum + (parseFloat(r.MONTO_DEVENGADO) || 0), 0);

  // Generar filas de la tabla
  const rowsHtml = displayRecords
    .map((record, index) => {
      const devengado = parseFloat(record.MONTO_DEVENGADO) || 0;
      const mesEje = parseInt(record.MES_EJE) || 0;

      return `
        <tr data-index="${index}" title="Clic para ver detalle">
          <td>${record.ANO_EJE || '-'}</td>
          <td class="col-name">${truncateText(record.SECTOR_NOMBRE, 30)}</td>
          <td class="col-name">${truncateText(record.PLIEGO_NOMBRE, 35)}</td>
          <td>${truncateText(record.FUNCION_NOMBRE, 25)}</td>
          <td class="col-amount">${formatCurrency(devengado)}</td>
        </tr>
      `;
    })
    .join('');

  // Generar botones de paginación
  const paginationButtons = generatePaginationButtons(currentPage, totalPages);

  container.innerHTML = `
    <div class="table-container">
      <div class="table-header">
        <span class="table-header__title">📋 Ejecución Presupuestal</span>
        <span class="table-header__count">${formatNumber(total)} registros encontrados</span>
      </div>
      <div class="data-table-wrapper">
        <table class="data-table" id="data-table">
          <thead>
            <tr>
              <th>Año</th>
              <th>Sector</th>
              <th>Pliego</th>
              <th>Función</th>
              <th class="col-amount">Devengado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <div class="pagination__info">
          Mostrando ${showingFrom} - ${showingTo} de ${formatNumber(total)}
        </div>
        <div class="pagination__controls">
          ${paginationButtons}
        </div>
        <div class="pagination__per-page">
          <span>Por página:</span>
          <select id="limit-select">
            ${[10, 20, 50, 100]
              .map(
                (n) =>
                  `<option value="${n}" ${n === limit ? 'selected' : ''}>${n}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>
    </div>
  `;

  // ── Event Listeners ──

  // Clic en filas para abrir detalle
  const tbody = container.querySelector('tbody');
  if (tbody && onRowClick) {
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (row) {
        const index = parseInt(row.dataset.index, 10);
        if (!isNaN(index) && records[index]) {
          onRowClick(records[index]);
        }
      }
    });
  }

  // Botones de paginación
  const pageButtons = container.querySelectorAll('.pagination__btn[data-page]');
  pageButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page, 10);
      if (!isNaN(page) && onPageChange) {
        onPageChange((page - 1) * limit);
      }
    });
  });

  // Selector de registros por página
  const limitSelect = container.querySelector('#limit-select');
  if (limitSelect && onLimitChange) {
    limitSelect.addEventListener('change', (e) => {
      onLimitChange(parseInt(e.target.value, 10));
    });
  }
}

/**
 * Genera los botones de paginación con lógica de ellipsis
 */
function generatePaginationButtons(current, total) {
  if (total <= 1) return '';

  const buttons = [];

  // Botón anterior
  buttons.push(
    `<button class="pagination__btn" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>‹</button>`
  );

  // Lógica de páginas visibles
  const pages = getVisiblePages(current, total);
  pages.forEach((page) => {
    if (page === '...') {
      buttons.push(`<span class="pagination__btn" style="border:none;cursor:default">…</span>`);
    } else {
      const isActive = page === current ? 'pagination__btn--active' : '';
      buttons.push(
        `<button class="pagination__btn ${isActive}" data-page="${page}">${page}</button>`
      );
    }
  });

  // Botón siguiente
  buttons.push(
    `<button class="pagination__btn" data-page="${current + 1}" ${current >= total ? 'disabled' : ''}>›</button>`
  );

  return buttons.join('');
}

/**
 * Calcula qué páginas mostrar con ellipsis
 */
function getVisiblePages(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [];
  pages.push(1);

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('...');

  pages.push(total);

  return pages;
}

/** Formatea números con separador de miles (inline para no depender de import) */
function formatNumber(num) {
  return new Intl.NumberFormat('es-PE').format(num);
}
