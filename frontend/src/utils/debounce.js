/**
 * Utilidad debounce para limitar la frecuencia de ejecución de funciones
 * Útil para optimizar llamadas a la API durante la búsqueda en tiempo real
 */

/**
 * Crea una versión debounced de una función
 * @param {Function} fn - Función a ejecutar
 * @param {number} delay - Retraso en milisegundos (default: 300ms)
 * @returns {Function} Función debounced
 */
export function debounce(fn, delay = 300) {
  let timeoutId;

  const debounced = (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };

  /** Cancela cualquier ejecución pendiente */
  debounced.cancel = () => {
    clearTimeout(timeoutId);
  };

  return debounced;
}
