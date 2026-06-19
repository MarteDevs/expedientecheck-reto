/**
 * Cliente HTTP para la API de Datos Abiertos del MEF
 * Consume el endpoint datastore_search del portal CKAN del MEF
 *
 * Documentación: https://datosabiertos.mef.gob.pe
 * Endpoint: https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search
 */

/** URL base de la API del MEF */
const API_BASE_URL =
  'https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search';

/** URL para consultas SQL */
const API_SQL_URL =
  'https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search_sql';

/**
 * Resource IDs conocidos de datasets del MEF
 * Estos IDs corresponden a los archivos CSV publicados en el portal
 */
export const RESOURCE_IDS = {
  GASTO_2024: '2f0dc874-6f83-4e21-acf0-cc3cfce3e040',
  GASTO_2023: 'c2b1568e-e399-4bab-8e13-86f62fb7f2b8',
};

/** Resource ID por defecto */
const DEFAULT_RESOURCE_ID = RESOURCE_IDS.GASTO_2024;

/** Timeout para las peticiones (en ms) */
const REQUEST_TIMEOUT = 15000;

/**
 * Construye la URL de la API con los parámetros de consulta
 * @param {Object} params - Parámetros de la consulta
 * @param {string} [params.resourceId] - ID del recurso a consultar
 * @param {number} [params.limit] - Cantidad de registros (default: 20)
 * @param {number} [params.offset] - Desplazamiento para paginación
 * @param {string} [params.query] - Texto de búsqueda libre
 * @param {Object} [params.filters] - Filtros clave-valor
 * @returns {string} URL completa con query params
 */
export function buildApiUrl(params = {}) {
  const {
    resourceId = DEFAULT_RESOURCE_ID,
    limit = 20,
    offset = 0,
    query = '',
    filters = {},
  } = params;

  const url = new URL(API_BASE_URL);
  url.searchParams.set('resource_id', resourceId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  if (query && query.trim()) {
    url.searchParams.set('q', query.trim());
  }

  // Los filtros se envían como JSON
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v && v !== '')
  );
  if (Object.keys(activeFilters).length > 0) {
    url.searchParams.set('filters', JSON.stringify(activeFilters));
  }

  return url.toString();
}

/**
 * Construye una consulta SQL para el endpoint datastore_search_sql
 * Útil para filtros complejos que no se pueden hacer con datastore_search
 * @param {Object} params
 * @returns {string} URL con la consulta SQL
 */
export function buildSqlUrl(params = {}) {
  const {
    resourceId = DEFAULT_RESOURCE_ID,
    limit = 20,
    offset = 0,
    query = '',
    filters = {},
    orderBy = '',
  } = params;

  let sql = `SELECT * FROM "${resourceId}"`;
  const conditions = [];

  // Agregar filtros como condiciones WHERE
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== '') {
      conditions.push(`"${key}" = '${value}'`);
    }
  }

  // Agregar búsqueda de texto (busca en campos de texto comunes)
  if (query && query.trim()) {
    const searchFields = [
      'SECTOR_NOMBRE',
      'PLIEGO_NOMBRE',
      'EJECUTORA_NOMBRE',
      'DEPARTAMENTO_META_NOMBRE',
      'FUNCION_NOMBRE',
      'PROGRAMA_PPTAL_NOMBRE',
    ];
    const searchConditions = searchFields
      .map((f) => `"${f}" LIKE '%${query.trim().toUpperCase()}%'`)
      .join(' OR ');
    conditions.push(`(${searchConditions})`);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (orderBy) {
    sql += ` ORDER BY "${orderBy}" DESC`;
  }

  sql += ` LIMIT ${limit} OFFSET ${offset}`;

  const url = new URL(API_SQL_URL);
  url.searchParams.set('sql', sql);
  return url.toString();
}

/**
 * Obtiene datos de la API del MEF
 * @param {Object} options - Opciones de la consulta
 * @param {string} [options.resourceId] - ID del recurso
 * @param {number} [options.limit] - Cantidad de registros
 * @param {number} [options.offset] - Offset de paginación
 * @param {string} [options.query] - Texto de búsqueda
 * @param {Object} [options.filters] - Filtros clave-valor
 * @param {boolean} [options.useSql] - Usar endpoint SQL (para filtros complejos)
 * @returns {Promise<{ records: Array, total: number, fields: Array }>}
 * @throws {Error} Error descriptivo si la petición falla
 */
export async function fetchMefData(options = {}) {
  const { useSql = false, ...params } = options;

  const url = useSql ? buildSqlUrl(params) : buildApiUrl(params);

  // Crear AbortController para timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Error del servidor: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // La API del MEF devuelve la data en result.records
    if (!data.result) {
      throw new Error('La respuesta de la API no tiene el formato esperado');
    }

    return {
      records: data.result.records || [],
      total: data.result.total || 0,
      fields: data.result.fields || [],
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'La solicitud tardó demasiado. Verifica tu conexión a internet e intenta de nuevo.'
      );
    }
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error(
        'No se pudo conectar con la API del MEF. Verifica tu conexión a internet.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Obtiene los valores únicos de un campo para poblar filtros
 * @param {string} fieldName - Nombre del campo
 * @param {string} [resourceId] - ID del recurso
 * @returns {Promise<string[]>} Lista de valores únicos
 */
export async function fetchDistinctValues(fieldName, resourceId = DEFAULT_RESOURCE_ID) {
  const sql = `SELECT DISTINCT "${fieldName}" FROM "${resourceId}" ORDER BY "${fieldName}" LIMIT 100`;

  const url = new URL(API_SQL_URL);
  url.searchParams.set('sql', sql);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data.result || !data.result.records) return [];

    return data.result.records
      .map((r) => r[fieldName])
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
