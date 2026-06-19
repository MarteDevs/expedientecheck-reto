/**
 * Módulo de integración de Caché Local.
 * Simplificado para usar únicamente LocalStorage en el Frontend.
 * 
 * NOTA: La caché real y robusta en Firestore ahora se maneja 
 * exclusivamente desde el Backend (Cloud Function proxy) para 
 * evitar bloqueos por AdBlockers (ERR_BLOCKED_BY_CLIENT) en el navegador.
 */

/**
 * Genera un hash SHA-256 de una cadena de texto para usar como ID seguro
 * @param {string} str - Cadena a hashear
 * @returns {Promise<string>} Hash en formato hexadecimal
 */
async function hashKey(str) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return 'fallback_' + Math.abs(hash).toString(16);
  }
}

/**
 * Intenta recuperar una consulta de la caché (LocalStorage)
 * @param {string} rawKey - Clave sin hashear
 * @returns {Promise<Object|null>} Datos de la caché o null
 */
export async function getCachedQuery(rawKey) {
  const key = await hashKey(rawKey);
  const twelveHours = 12 * 60 * 60 * 1000;

  try {
    const localData = localStorage.getItem(`mef_cache_${key}`);
    if (localData) {
      const cached = JSON.parse(localData);
      const ageMs = Date.now() - cached.timestamp;
      
      if (ageMs < twelveHours) {
        console.log(`[Caché Local] Hit para: ${rawKey.substring(0, 80)}...`);
        return {
          records: cached.records,
          total: cached.total,
          fields: cached.fields,
        };
      } else {
        localStorage.removeItem(`mef_cache_${key}`);
      }
    }
  } catch (err) {
    console.warn('[Caché Local] Error al consultar:', err);
  }

  return null;
}

/**
 * Guarda los resultados de una consulta en la caché (LocalStorage)
 * @param {string} rawKey - Clave sin hashear
 * @param {Object} data - Datos a guardar { records, total, fields }
 */
export async function setCachedQuery(rawKey, data) {
  if (!data || !data.records || data.records.length === 0) return;

  const key = await hashKey(rawKey);
  const cacheObj = {
    records: data.records,
    total: data.total,
    fields: data.fields,
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(`mef_cache_${key}`, JSON.stringify(cacheObj));
    console.log(`[Caché Local] Guardada exitosamente.`);
  } catch (err) {
    console.warn('[Caché Local] Error al guardar (puede que la cuota esté llena):', err);
  }
}
