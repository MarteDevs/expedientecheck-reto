/**
 * Componente AlertModal — Modal personalizado para mostrar mensajes
 * Reemplaza el alert() nativo del navegador para mantener el diseño
 */

export function showAlertModal(message, title = 'Aviso') {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.style.zIndex = '2000';
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '2001';
    modal.style.width = 'min(90vw, 400px)';
    
    modal.innerHTML = `
      <div class="modal__header">
        <h3 class="modal__title">${escapeHtml(title)}</h3>
        <button class="modal__close" title="Cerrar">✕</button>
      </div>
      <div class="modal__body" style="text-align: center; padding: var(--space-6) var(--space-4);">
        <p style="font-size: var(--font-size-md); color: var(--color-text-primary);">${escapeHtml(message)}</p>
        <div style="display: flex; justify-content: center; margin-top: var(--space-6);">
          <button class="btn btn--primary" id="alert-modal-ok" style="background: var(--color-primary); min-width: 120px;">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const btnOk = modal.querySelector('#alert-modal-ok');
    const btnClose = modal.querySelector('.modal__close');

    setTimeout(() => btnOk.focus(), 50);

    const closeModal = () => {
      backdrop.classList.remove('active');
      modal.classList.remove('active');
      
      setTimeout(() => {
        if (document.body.contains(backdrop)) document.body.removeChild(backdrop);
        if (document.body.contains(modal)) document.body.removeChild(modal);
        resolve();
      }, 300);
    };

    btnOk.addEventListener('click', closeModal);
    btnClose.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        closeModal();
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
