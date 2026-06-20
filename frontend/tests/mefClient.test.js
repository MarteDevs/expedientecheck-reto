/**
 * Pruebas unitarias para el cliente de la API del MEF
 * ====================================================
 * Verifica el comportamiento de las funciones exportadas por mefClient.js:
 *   - buildApiUrl: construcción correcta de URLs con parámetros
 *   - fetchMefData: peticiones HTTP, manejo de errores y paginación
 *
 * Se utiliza vi.fn() para simular (mockear) la función global fetch,
 * evitando llamadas reales a la API durante las pruebas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock de Firebase para evitar dependencias en los tests unitarios
vi.mock('../src/api/firebase.js', () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}));

import { fetchMefData, buildApiUrl, buildSqlUrl } from '../src/api/mefClient.js';

// URL base de la API (ahora proxy local en tests)
const API_BASE_URL = '/api/mef/datastore_search';

describe('mefClient - Cliente de la API del MEF', () => {
  // Configuración: antes de cada prueba, mockear fetch global
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  // Restaurar el estado original después de cada prueba
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================
  // Grupo: buildApiUrl - Construcción de URLs
  // ==========================================================
  describe('buildApiUrl - Construcción de URLs', () => {
    it('debe construir la URL correcta con todos los parámetros', () => {
      const params = {
        resourceId: 'abc-123',
        limit: 50,
        offset: 10,
        query: 'presupuesto',
      };

      const url = buildApiUrl(params);

      expect(url).toContain(API_BASE_URL);
      expect(url).toContain('resource_id=abc-123');
      expect(url).toContain('limit=50');
      expect(url).toContain('offset=10');
      expect(url).toContain('q=presupuesto');
    });

    it('debe usar valores por defecto cuando no se pasan parámetros opcionales', () => {
      const params = { resourceId: 'xyz-789' };

      const url = buildApiUrl(params);

      expect(url).toContain('resource_id=xyz-789');
      // Debe incluir los defaults (limit=20, offset=0)
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=0');
      // No debe incluir q vacío
      expect(url).not.toContain('q=');
    });

    it('debe incluir filtros serializados como JSON cuando se proporcionan', () => {
      const params = {
        resourceId: 'abc-123',
        filters: { SECTOR_NOMBRE: 'EDUCACION', ANO_EJE: '2024' },
      };

      const url = buildApiUrl(params);

      expect(url).toContain('filters=');
      // Los filtros se serializan como JSON y se codifican en URL
      const urlObj = new URL(url);
      const filtersParam = urlObj.searchParams.get('filters');
      const parsed = JSON.parse(filtersParam);
      expect(parsed.SECTOR_NOMBRE).toBe('EDUCACION');
      expect(parsed.ANO_EJE).toBe('2024');
    });

    it('no debe incluir filtros vacíos', () => {
      const params = {
        resourceId: 'abc-123',
        filters: { SECTOR_NOMBRE: '', ANO_EJE: '' },
      };

      const url = buildApiUrl(params);
      expect(url).not.toContain('filters=');
    });
  });

  // ==========================================================
  // Grupo: fetchMefData - Peticiones HTTP y manejo de datos
  // ==========================================================
  describe('fetchMefData - Peticiones HTTP y manejo de datos', () => {
    it('debe manejar errores de red de forma correcta', async () => {
      // Simular un fallo de red
      global.fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      await expect(
        fetchMefData({ resourceId: 'abc-123' })
      ).rejects.toThrow('No se pudo conectar con la API del MEF');
    });

    it('debe manejar una respuesta vacía correctamente', async () => {
      const respuestaVacia = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          result: {
            records: [],
            total: 0,
            fields: [],
          },
        }),
      };

      global.fetch.mockResolvedValueOnce(respuestaVacia);

      const resultado = await fetchMefData({ resourceId: 'abc-123' });

      // fetchMefData retorna { records, total, fields } directamente
      expect(resultado.records).toEqual([]);
      expect(resultado.total).toBe(0);
    });

    it('debe parsear los datos correctamente en una respuesta exitosa', async () => {
      const datosMock = {
        success: true,
        result: {
          records: [
            {
              _id: 1,
              SECTOR_NOMBRE: 'EDUCACION',
              MONTO_PIA: '15000',
              MONTO_PIM: '18000',
              MONTO_DEVENGADO: '12000',
            },
            {
              _id: 2,
              SECTOR_NOMBRE: 'SALUD',
              MONTO_PIA: '23000',
              MONTO_PIM: '25000',
              MONTO_DEVENGADO: '20000',
            },
          ],
          total: 2,
          fields: [{ id: 'SECTOR_NOMBRE', type: 'text' }],
        },
      };

      const respuestaExitosa = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce(datosMock),
      };

      global.fetch.mockResolvedValueOnce(respuestaExitosa);

      const resultado = await fetchMefData({ resourceId: 'abc-123' });

      expect(resultado.records).toHaveLength(2);
      expect(resultado.records[0].SECTOR_NOMBRE).toBe('EDUCACION');
      expect(resultado.records[1].SECTOR_NOMBRE).toBe('SALUD');
      expect(resultado.total).toBe(2);
      expect(resultado.fields).toHaveLength(1);
    });

    it('debe respetar los parámetros de paginación limit y offset', async () => {
      const respuestaPaginada = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          result: {
            records: [{ _id: 11, SECTOR_NOMBRE: 'DEFENSA' }],
            total: 100,
            fields: [],
          },
        }),
      };

      global.fetch.mockResolvedValueOnce(respuestaPaginada);

      await fetchMefData({
        resourceId: 'abc-123',
        limit: 10,
        offset: 10,
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);

      const urlLlamada = global.fetch.mock.calls[0][0];
      expect(urlLlamada).toContain('limit=10');
      expect(urlLlamada).toContain('offset=10');
    });

    it('debe lanzar error cuando la respuesta HTTP no es exitosa', async () => {
      const respuestaError = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };

      global.fetch.mockResolvedValueOnce(respuestaError);

      await expect(
        fetchMefData({ resourceId: 'abc-123' })
      ).rejects.toThrow('Error del servidor: 500');
    });

    it('debe lanzar error cuando la respuesta no tiene el formato esperado', async () => {
      const respuestaMalFormada = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          success: true,
          // Falta el campo "result"
        }),
      };

      global.fetch.mockResolvedValueOnce(respuestaMalFormada);

      await expect(
        fetchMefData({ resourceId: 'abc-123' })
      ).rejects.toThrow('formato esperado');
    });
  });

  // ==========================================================
  // Grupo: buildSqlUrl - Consulta SQL
  // ==========================================================
  describe('buildSqlUrl - Consulta SQL', () => {
    it('debe generar una consulta SQL con columnas seleccionadas explícitamente', () => {
      const params = {
        resourceId: 'abc-123',
        limit: 10,
        offset: 5,
      };

      const url = buildSqlUrl(params);
      const decodedUrl = decodeURIComponent(url).replace(/\+/g, ' ');

      expect(decodedUrl).toContain('SELECT "_id", "ANO_EJE", "MES_EJE", "NIVEL_GOBIERNO_NOMBRE"');
      expect(decodedUrl).toContain('"PROGRAMA_PPTO_NOMBRE" AS "PROGRAMA_PPTAL_NOMBRE"');
      expect(decodedUrl).toContain('"FUENTE_FINANCIAMIENTO_NOMBRE" AS "FUENTE_FINANC_NOMBRE"');
      expect(decodedUrl).toContain('FROM "abc-123"');
      expect(decodedUrl).toContain('LIMIT 10 OFFSET 5');
    });

    it('debe incluir las cláusulas WHERE para filtros activos y búsquedas', () => {
      const params = {
        resourceId: 'abc-123',
        filters: { NIVEL_GOBIERNO_NOMBRE: 'GOBIERNO NACIONAL' },
        query: 'salud',
      };

      const url = buildSqlUrl(params);
      const decodedUrl = decodeURIComponent(url).replace(/\+/g, ' ');

      expect(decodedUrl).toContain('WHERE "NIVEL_GOBIERNO_NOMBRE" LIKE \'GOBIERNO NACIONAL\'');
      // Debe buscar en PROGRAMA_PPTO_NOMBRE (columna real de base de datos) en lugar del alias
      expect(decodedUrl).toContain('"PROGRAMA_PPTO_NOMBRE" LIKE \'%SALUD%\'');
    });
  });
});
