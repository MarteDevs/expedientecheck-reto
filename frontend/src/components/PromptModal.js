/**
 * Componente PromptModal — Modal personalizado para pedir texto al usuario
 * Reemplaza el prompt() nativo del navegador para mantener el diseño
 */

export function showPromptModal({ title, placeholder = '', defaultValue = '', submitText = 'Guardar', cancelText = 'Cancelar' }) {
  return new Promise((resolve) => {
    // 1. Crear el HTML
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.style.zIndex = '2000'; // Asegurar que esté por encima de todo
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '2001';
    modal.style.width = 'min(90vw, 400px)'; // Más pequeño que el modal de detalle
    
    modal.innerHTML = `
      <div class="modal__header">
        <h3 class="modal__title">${escapeHtml(title)}</h3>
        <button class="modal__close" title="Cerrar">✕</button>
      </div>
      <div class="modal__body">
        <div style="margin-bottom: var(--space-4);">
          <input 
            type="text" 
            id="prompt-modal-input" 
            class="search-bar__input" 
            style="width: 100%; border: 1px solid var(--color-border); background: var(--color-bg-glass); border-radius: var(--radius-md); padding: var(--space-3);" 
            placeholder="${escapeHtml(placeholder)}"
            value="${escapeHtml(defaultValue)}"
            autocomplete="off"
          />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5);">
          <button class="btn btn--ghost" id="prompt-modal-cancel">${escapeHtml(cancelText)}</button>
          <button class="btn btn--primary" id="prompt-modal-submit" style="background: #fbbf24; color: #000;">${escapeHtml(submitText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const input = modal.querySelector('#prompt-modal-input');
    const btnCancel = modal.querySelector('#prompt-modal-cancel');
    const btnSubmit = modal.querySelector('#prompt-modal-submit');
    const btnClose = modal.querySelector('.modal__close');

    // Foco inicial
    setTimeout(() => input.focus(), 50);

    // 2. Manejadores
    const closeModal = (value = null) => {
      backdrop.classList.remove('active');
      modal.classList.remove('active');
      
      // Esperar animación antes de remover
      setTimeout(() => {
        if (document.body.contains(backdrop)) document.body.removeChild(backdrop);
        if (document.body.contains(modal)) document.body.removeChild(modal);
        resolve(value);
      }, 300);
    };

    btnCancel.addEventListener('click', () => closeModal(null));
    btnClose.addEventListener('click', () => closeModal(null));
    backdrop.addEventListener('click', () => closeModal(null));

    btnSubmit.addEventListener('click', () => {
      closeModal(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        closeModal(input.value);
      } else if (e.key === 'Escape') {
        closeModal(null);
      }
    });
  });
}

/** Escapa caracteres HTML para prevenir XSS */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
