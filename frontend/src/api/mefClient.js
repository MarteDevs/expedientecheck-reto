/**
 * Cliente HTTP para la API de Datos Abiertos del MEF
 * Consume el endpoint datastore_search del portal CKAN del MEF
 *
 * Documentación: https://datosabiertos.mef.gob.pe
 * Endpoint: https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search
 */

import { getCachedQuery, setCachedQuery } from './firebase.js';

/**
 * Base URL para consultas.
 * En producción consultamos directo al MEF (para evitar el bloqueo WAF a las IPs de Google Cloud).
 * En desarrollo usamos nuestro emulador local con Caché en Firestore.
 */
const MEF_API_BASE = import.meta.env.PROD
  ? '/api/mef' // Prod: Firebase Hosting rewrite → Cloud Function (Sudamérica)
  : '/api/mef'; // Dev: Vite proxy → MEF API directa (sin CORS, sin emuladores)

/** URL base de la API del MEF */
const API_BASE_URL = `${MEF_API_BASE}/datastore_search`;

/** URL para consultas SQL */
const API_SQL_URL = `${MEF_API_BASE}/datastore_search_sql`;

/** Helper para obtener la URL final (ahora usa directamente la construida) */
function getFetchUrl(urlStr) {
  return urlStr;
}

/**
 * Resource IDs conocidos de datasets del MEF
 * Estos IDs corresponden a los archivos CSV publicados en el portal
 */
export const RESOURCE_IDS = {
  GASTO_2026: 'd45f660d-6d14-438e-9d91-300084c9b85f', // 2026-Gasto-Mensual.csv (Activo)
  GASTO_2025: '77fc3228-fa6f-4c1f-a0ed-d32520ad11ad', // 2025-Gasto-Mensual.csv
  GASTO_2024: 'a50cf1dc-1655-446d-95a3-de6d5351dc8c', // 2024-Gasto.csv
  GASTO_2023: 'c2b1568e-e399-4bab-8e13-86f62fb7f2b8', // 2023-Gasto.csv
};

/** Resource ID por defecto — 2026 datos actuales */
const DEFAULT_RESOURCE_ID = RESOURCE_IDS.GASTO_2026;

/** Timeout para las peticiones (en ms) - Ajustado a 300s (5 min) para soportar caídas del MEF */
const REQUEST_TIMEOUT = 300000;

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

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(API_BASE_URL, baseUrl);
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

  const selectedColumns = [
    '"_id"',
    '"ANO_EJE"',
    '"MES_EJE"',
    '"NIVEL_GOBIERNO_NOMBRE"',
    '"SECTOR_NOMBRE"',
    '"PLIEGO_NOMBRE"',
    '"EJECUTORA_NOMBRE"',
    '"DEPARTAMENTO_META_NOMBRE"',
    '"FUNCION_NOMBRE"',
    '"DIVISION_FUNCIONAL_NOMBRE"',
    '"GRUPO_FUNCIONAL_NOMBRE"',
    '"PROGRAMA_PPTO_NOMBRE" AS "PROGRAMA_PPTAL_NOMBRE"',
    '"PRODUCTO_PROYECTO_NOMBRE"',
    '"ACTIVIDAD_ACCION_OBRA_NOMBRE"',
    '"META_NOMBRE"',
    '"FUENTE_FINANCIAMIENTO_NOMBRE" AS "FUENTE_FINANC_NOMBRE"',
    '"GENERICA_NOMBRE"',
    '"SUBGENERICA_NOMBRE"',
    '"SUBGENERICA_DET_NOMBRE"',
    '"ESPECIFICA_NOMBRE"',
    '"ESPECIFICA_DET_NOMBRE"',
    '"MONTO_PIA"',
    '"MONTO_PIM"',
    '"MONTO_CERTIFICADO"',
    '"MONTO_COMPROMETIDO_ANUAL"',
    '"MONTO_COMPROMETIDO"',
    '"MONTO_DEVENGADO"',
    '"MONTO_GIRADO"'
  ].join(', ');

  let sql = `SELECT ${selectedColumns} FROM "${resourceId}"`;
  const conditions = [];

  // Agregar filtros como condiciones WHERE
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== '') {
      conditions.push(`"${key}" LIKE '${value}'`);
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
      'PROGRAMA_PPTO_NOMBRE', // Nombre de la columna física en la DB
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

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(API_SQL_URL, baseUrl);
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

  // Intentar servir desde la caché híbrida
  try {
    const cached = await getCachedQuery(url);
    if (cached) {
      return cached;
    }
  } catch (err) {
    console.warn('[Caché] Error al leer caché:', err);
  }

  // Crear AbortController para timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(getFetchUrl(url), {
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

    // La API del MEF puede devolver records en la raíz (formato personalizado MEF) o en result.records (CKAN estándar)
    if (!data.result && !data.records) {
      throw new Error('La respuesta de la API no tiene el formato esperado');
    }

    const records = data.records || data.result?.records || [];
    const total = data.result?.include_total || data.result?.total || records.length;
    const fields = data.fields || data.result?.fields || [];

    const parsedResult = {
      records,
      total: typeof total === 'string' ? parseInt(total, 10) : total,
      fields,
    };

    // Guardar en la caché asíncronamente
    try {
      const cachePromise = setCachedQuery(url, parsedResult);
      if (cachePromise && typeof cachePromise.catch === 'function') {
        cachePromise.catch((err) => {
          console.warn('[Caché] Error al guardar caché:', err);
        });
      }
    } catch (err) {
      console.warn('[Caché] Error al iniciar guardado en caché:', err);
    }

    return parsedResult;
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
 * Obtiene las estadísticas globales (PIA, PIM, DEVENGADO) para los filtros actuales,
 * usando SQL nativo para no depender de la paginación.
 */
export async function fetchGlobalStats(params = {}) {
  const {
    resourceId = DEFAULT_RESOURCE_ID,
    query = '',
    filters = {},
  } = params;

  const conditionsAll = [];
  const activeFilters = Object.entries(filters).filter(([, v]) => v && v !== '');
  
  for (const [key, value] of activeFilters) {
    conditionsAll.push(`"${key}" LIKE '${value}'`);
  }
  
  if (query && query.trim()) {
    const q = query.trim().toUpperCase();
    const textFields = [
      'EJECUTORA_NOMBRE',
      'PRODUCTO_PROYECTO_NOMBRE',
      'ACTIVIDAD_ACCION_OBRA_NOMBRE',
      'PLIEGO_NOMBRE',
    ];
    const queryCond = textFields.map((f) => `"${f}" LIKE '%${q}%'`).join(' OR ');
    conditionsAll.push(`(${queryCond})`);
  }

  // Para PIA/PIM excluimos el filtro de mes (ya que su total se guarda en el mes 0)
  const conditionsNoMonth = [];
  for (const [key, value] of activeFilters) {
    if (key !== 'MES_EJE') {
      conditionsNoMonth.push(`"${key}" LIKE '${value}'`);
    }
  }
  if (query && query.trim()) {
    const q = query.trim().toUpperCase();
    const textFields = [
      'EJECUTORA_NOMBRE',
      'PRODUCTO_PROYECTO_NOMBRE',
      'ACTIVIDAD_ACCION_OBRA_NOMBRE',
      'PLIEGO_NOMBRE',
    ];
    const queryCond = textFields.map((f) => `"${f}" LIKE '%${q}%'`).join(' OR ');
    conditionsNoMonth.push(`(${queryCond})`);
  }

  const whereAll = conditionsAll.length > 0 ? `WHERE ${conditionsAll.join(' AND ')}` : '';
  const whereNoMonth = conditionsNoMonth.length > 0 ? `WHERE ${conditionsNoMonth.join(' AND ')}` : '';

  const sqlDevengado = `SELECT SUM(CAST("MONTO_DEVENGADO" AS float)) as dev, SUM(CAST("MONTO_CERTIFICADO" AS float)) as cert, SUM(CAST("MONTO_COMPROMETIDO" AS float)) as comp, SUM(CAST("MONTO_GIRADO" AS float)) as gir FROM "${resourceId}" ${whereAll}`;
  const sqlPimPia = `SELECT SUM(CAST("MONTO_PIA" AS float)) as pia, SUM(CAST("MONTO_PIM" AS float)) as pim FROM "${resourceId}" ${whereNoMonth}`;

  try {
    const urlDevengado = new URL(API_SQL_URL, window.location.origin);
    urlDevengado.searchParams.set('sql', sqlDevengado);
    
    const urlPimPia = new URL(API_SQL_URL, window.location.origin);
    urlPimPia.searchParams.set('sql', sqlPimPia);

    const [resDev, resPimPia] = await Promise.all([
      fetch(getFetchUrl(urlDevengado.toString()), { headers: { Accept: 'application/json' } }).then(async r => {
        if (!r.ok) throw new Error(`El servidor del MEF respondió con código ${r.status} al consultar ejecución.`);
        try {
          return await r.json();
        } catch (e) {
          throw new Error('La respuesta de estadísticas de ejecución no es un JSON válido.');
        }
      }),
      fetch(getFetchUrl(urlPimPia.toString()), { headers: { Accept: 'application/json' } }).then(async r => {
        if (!r.ok) throw new Error(`El servidor del MEF respondió con código ${r.status} al consultar presupuesto.`);
        try {
          return await r.json();
        } catch (e) {
          throw new Error('La respuesta de presupuesto PIA/PIM no es un JSON válido.');
        }
      })
    ]);

    const dev = resDev?.result?.records?.[0]?.dev || resDev?.records?.[0]?.dev || 0;
    const cert = resDev?.result?.records?.[0]?.cert || resDev?.records?.[0]?.cert || 0;
    const comp = resDev?.result?.records?.[0]?.comp || resDev?.records?.[0]?.comp || 0;
    const gir = resDev?.result?.records?.[0]?.gir || resDev?.records?.[0]?.gir || 0;
    
    const pia = resPimPia?.result?.records?.[0]?.pia || resPimPia?.records?.[0]?.pia || 0;
    const pim = resPimPia?.result?.records?.[0]?.pim || resPimPia?.records?.[0]?.pim || 0;

    return {
      totalPIA: pia,
      totalPIM: pim,
      totalCertificado: cert,
      totalComprometido: comp,
      totalDevengado: dev,
      totalGirado: gir
    };
  } catch (err) {
    console.error('Error fetching global stats:', err);
    throw new Error(err.message || 'No se pudieron recuperar las estadísticas globales del MEF.');
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

  const url = new URL(API_SQL_URL, window.location.origin);
  url.searchParams.set('sql', sql);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(getFetchUrl(url.toString()), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const records = data.records || data.result?.records;
    if (!records) return [];

    return records
      .map((r) => r[fieldName])
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
