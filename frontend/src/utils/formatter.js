/**
 * Utilidades de formateo para montos, porcentajes y textos
 * Formatos específicos para datos presupuestales peruanos
 */

/**
 * Formatea un monto numérico en formato de soles peruanos
 * @param {number|string} amount - Monto a formatear
 * @returns {string} Monto formateado (ej: "S/ 1,234,567.00")
 */
export function formatCurrency(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'S/ 0.00';

  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Formatea un monto de forma compacta para las stat cards
 * @param {number|string} amount - Monto a formatear
 * @returns {string} Monto compacto (ej: "S/ 1.2M", "S/ 345K")
 */
export function formatCompactCurrency(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'S/ 0';

  if (num >= 1_000_000_000) {
    return `S/ ${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `S/ ${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `S/ ${(num / 1_000).toFixed(1)}K`;
  }
  return `S/ ${num.toFixed(0)}`;
}

/**
 * Calcula el porcentaje de ejecución y retorna con clase CSS
 * @param {number} executed - Monto devengado
 * @param {number} budget - PIM (presupuesto modificado)
 * @returns {{ value: number, label: string, level: string }}
 */
export function formatExecution(executed, budget) {
  if (!budget || budget === 0) {
    return { value: 0, label: '0.0%', level: 'low' };
  }

  const pct = (executed / budget) * 100;
  const clamped = Math.min(pct, 100);
  let level;

  if (pct >= 75) level = 'high';
  else if (pct >= 50) level = 'mid';
  else level = 'low';

  return {
    value: clamped,
    label: `${pct.toFixed(1)}%`,
    level,
  };
}

/**
 * Trunca un texto largo y agrega tooltip
 * @param {string} text - Texto a truncar
 * @param {number} max - Longitud máxima
 * @returns {string} Texto truncado
 */
export function truncateText(text, max = 40) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.substring(0, max) + '…';
}

/**
 * Formatea un número con separador de miles
 * @param {number|string} num - Número a formatear
 * @returns {string} Número formateado
 */
export function formatNumber(num) {
  const parsed = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(parsed)) return '0';
  return new Intl.NumberFormat('es-PE').format(parsed);
}
