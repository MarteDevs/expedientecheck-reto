/**
 * Componente ErrorState — Estado de error con mensaje y botón de reintento
 * Se muestra cuando la API falla o hay problemas de conexión
 */

/**
 * Renderiza el estado de error
 * @param {HTMLElement} container - Elemento donde renderizar
 * @param {string} errorMessage - Mensaje de error a mostrar
 * @param {Function} onRetry - Callback para el botón de reintentar
 */
export function renderErrorState(container, errorMessage, onRetry) {
  // Determinar el icono y título según el tipo de error
  let icon = '⚠️';
  let title = 'Error al cargar los datos';

  if (errorMessage.includes('conexión') || errorMessage.includes('conectar')) {
    icon = '🌐';
    title = 'Sin conexión';
  } else if (errorMessage.includes('tardó demasiado') || errorMessage.includes('timeout')) {
    icon = '⏱️';
    title = 'Tiempo de espera agotado';
  } else if (errorMessage.includes('servidor') || errorMessage.includes('500')) {
    icon = '🔧';
    title = 'Error del servidor';
  }

  container.innerHTML = `
    <div class="table-container">
      <div class="error-state">
        <div class="error-state__icon">${icon}</div>
        <h3 class="error-state__title">${title}</h3>
        <p class="error-state__message">${errorMessage}</p>
        <button id="retry-btn" class="btn btn--primary error-state__btn">
          🔄 Reintentar
        </button>
      </div>
    </div>
  `;

  // Vincular el botón de retry
  const retryBtn = container.querySelector('#retry-btn');
  if (retryBtn && onRetry) {
    retryBtn.addEventListener('click', onRetry);
  }
}
