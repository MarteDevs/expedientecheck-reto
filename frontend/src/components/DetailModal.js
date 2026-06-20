/**
 * Componente DetailModal — Modal glassmorphism con detalle de un registro
 * Se abre al hacer clic en una fila de la tabla
 */

import { formatCurrency, formatExecution } from '../utils/formatter.js';

/** Referencia para gestionar el estado del modal */
let isOpen = false;

/**
 * Inicializa el modal (crea el markup base en el DOM)
 * Llamar una sola vez al inicio de la app
 */
export function initModal() {
  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';

  // Modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'detail-modal';
  modal.innerHTML = `
    <div class="modal__header">
      <h3 class="modal__title" id="modal-title">Detalle</h3>
      <button class="modal__close" id="modal-close" title="Cerrar (Esc)">✕</button>
    </div>
    <div class="modal__body" id="modal-body"></div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  // ── Event Listeners ──

  // Cerrar con clic en backdrop
  backdrop.addEventListener('click', closeModal);

  // Cerrar con botón X
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeModal();
    }
  });
}

/**
 * Abre el modal con los datos de un registro
 * @param {Object} record - Registro del MEF a mostrar
 * @param {number} projectPIM - PIM total del proyecto (de las stat cards)
 */
export function openModal(record, projectPIM = 0) {
  if (!record) return;

  const title = record.PLIEGO_NOMBRE || record.SECTOR_NOMBRE || 'Detalle del registro';
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const backdrop = document.getElementById('modal-backdrop');
  const modal = document.getElementById('detail-modal');

  modalTitle.textContent = title;

  // Construir los campos del detalle
  const pia = parseFloat(record.MONTO_PIA) || 0;
  const pim = parseFloat(record.MONTO_PIM) || 0;
  const certificado = parseFloat(record.MONTO_CERTIFICADO) || 0;
  const comprometido = parseFloat(record.MONTO_COMPROMETIDO) || 0;
  const devengado = parseFloat(record.MONTO_DEVENGADO) || 0;
  const girado = parseFloat(record.MONTO_GIRADO) || 0;
  const mesEje = parseInt(record.MES_EJE) || 0;

  // Usar el PIM del proyecto cuando la fila es mensual (PIM=0)
  const effectivePIM = pim > 0 ? pim : projectPIM;
  const execution = formatExecution(devengado, effectivePIM);
  const isMensual = mesEje > 0 && pim === 0;

  const sections = [
    {
      title: '🏢 Institución',
      fields: [
        { label: 'Año de Ejercicio', value: record.ANO_EJE },
        { label: 'Nivel de Gobierno', value: record.NIVEL_GOBIERNO_NOMBRE },
        { label: 'Sector', value: record.SECTOR_NOMBRE },
        { label: 'Pliego', value: record.PLIEGO_NOMBRE },
        { label: 'Ejecutora', value: record.EJECUTORA_NOMBRE },
        { label: 'Departamento', value: record.DEPARTAMENTO_META_NOMBRE },
      ]
    },
    {
      title: '📂 Clasificación Funcional',
      fields: [
        { label: 'Función', value: record.FUNCION_NOMBRE },
        { label: 'División Funcional', value: record.DIVISION_FUNCIONAL_NOMBRE },
        { label: 'Grupo Funcional', value: record.GRUPO_FUNCIONAL_NOMBRE },
        { label: 'Programa Presupuestal', value: record.PROGRAMA_PPTAL_NOMBRE },
      ]
    },
    {
      title: '🎯 Meta y Proyecto (¿Para qué?)',
      fields: [
        { label: 'Producto / Proyecto', value: record.PRODUCTO_PROYECTO_NOMBRE },
        { label: 'Actividad / Obra', value: record.ACTIVIDAD_ACCION_OBRA_NOMBRE },
        { label: 'Meta (Finalidad)', value: record.META_NOMBRE },
      ]
    },
    {
      title: '🏷️ Clasificación del Gasto (¿En qué?)',
      fields: [
        { label: 'Fuente de Financiamiento', value: record.FUENTE_FINANC_NOMBRE },
        { label: 'Genérica', value: record.GENERICA_NOMBRE },
        { label: 'Subgenérica', value: record.SUBGENERICA_NOMBRE },
        { label: 'Subgenérica Detalle', value: record.SUBGENERICA_DET_NOMBRE },
        { label: 'Específica', value: record.ESPECIFICA_NOMBRE },
        { label: 'Específica Detalle', value: record.ESPECIFICA_DET_NOMBRE },
      ]
    }
  ];

  const moneyFields = [
    { label: 'PIA (Apertura)', value: pia },
    { label: 'PIM (Modificado)', value: pim },
    { label: 'Certificado', value: certificado },
    { label: 'Comprometido', value: comprometido },
    { label: 'Devengado', value: devengado },
    { label: 'Girado', value: girado },
  ];

  const sectionsHtml = sections.map(sec => {
    const validFields = sec.fields.filter(f => f.value && f.value !== '');
    if (validFields.length === 0) return '';
    
    return `
      <div style="margin-bottom: var(--space-4);">
        <h4 style="font-size:var(--font-size-sm);color:var(--color-primary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-2);border-bottom:1px solid var(--color-border);padding-bottom:var(--space-1)">${sec.title}</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:var(--space-3)">
          ${validFields.map(f => `
            <div class="modal__field">
              <span class="modal__field-label">${f.label}</span>
              <span class="modal__field-value">${f.value}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  const moneyHtml = moneyFields
    .map(
      (f) => `
      <div class="modal__field">
        <span class="modal__field-label">${f.label}</span>
        <span class="modal__field-value modal__field-value--amount">${formatCurrency(f.value)}</span>
      </div>
    `
    )
    .join('');

  modalBody.innerHTML = `
    ${sectionsHtml}
    <div style="background-color:var(--color-surface);padding:var(--space-4);border-radius:var(--radius-lg);margin-top:var(--space-4);border:1px solid var(--color-border)">
      <h4 style="font-size:var(--font-size-sm);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-3)">💰 Montos Presupuestales</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:var(--space-3);${effectivePIM > 0 ? 'margin-bottom:var(--space-4)' : ''}">
        ${moneyHtml}
      </div>
      ${effectivePIM > 0 ? `
      <div class="modal__execution-bar">
        <div class="modal__execution-bar__title">📊 Avance de Ejecución ${isMensual ? '(contribución al PIM global actual)' : '(respecto al PIM)'}</div>
        <div class="execution-visual">
          <div class="execution-visual__fill" style="width:${execution.value}%">
            ${execution.label}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-2);font-size:var(--font-size-xs);color:var(--color-text-muted)">
          <span>Devengado: ${formatCurrency(devengado)}</span>
          <span>PIM ${isMensual ? '(Global Actual)' : ''}: ${formatCurrency(effectivePIM)}</span>
        </div>
      </div>
      ` : ''}
    </div>
  `;

  // Abrir con animación
  backdrop.classList.add('active');
  modal.classList.add('active');
  isOpen = true;

  // Prevenir scroll del body
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra el modal
 */
export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const modal = document.getElementById('detail-modal');

  if (backdrop) backdrop.classList.remove('active');
  if (modal) modal.classList.remove('active');
  isOpen = false;

  // Restaurar scroll
  document.body.style.overflow = '';
}
