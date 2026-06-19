/**
 * ExpedienteCheck - MEF API Proxy Cache
 * Cloud Function que actúa como intermediario hacia la API del MEF.
 * Implementa una capa de caché en Firestore para reducir tiempos de respuesta 
 * de ~40s a ~50ms.
 */

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// Tiempo de vida de la caché (24 horas en milisegundos)
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MEF_BASE_URL = "https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1";

/**
 * Genera una clave única para la combinación de parámetros de búsqueda.
 */
function generateCacheKey(queryParams) {
  // Ordenar las claves para asegurar que el mismo set de parámetros
  // genere el mismo hash independientemente del orden en la URL.
  const sortedParams = Object.keys(queryParams)
    .sort()
    .reduce((acc, key) => {
      acc[key] = queryParams[key];
      return acc;
    }, {});

  const stringified = JSON.stringify(sortedParams);
  return crypto.createHash("sha256").update(stringified).digest("hex");
}

exports.mefProxy = onRequest(
  {
    region: "us-central1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 120, // La API del MEF puede tardar hasta 40s
  },
  (req, res) => {
    // Aplicar CORS
    cors(req, res, async () => {
      // Solo soportar método GET y OPTIONS (manejado por cors)
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

      try {
        const pathSegments = req.path.split("/").filter(Boolean);
        const endpoint = pathSegments[pathSegments.length - 1] || "datastore_search";
        const queryParams = req.query;

        // Validar endpoints permitidos por seguridad
        if (!["datastore_search", "datastore_search_sql"].includes(endpoint)) {
          return res.status(400).json({ error: "Endpoint not supported" });
        }

        const cacheKey = generateCacheKey({ endpoint, ...queryParams });
        const cacheRef = db.collection("mef_cache").doc(cacheKey);

        // 1. Verificar si existe en la caché
        const doc = await cacheRef.get();
        if (doc.exists) {
          const data = doc.data();
          const now = Date.now();
          const createdAt = data.createdAt ? data.createdAt.toMillis() : 0;

          if (now - createdAt < CACHE_TTL) {
            console.log(`[CACHE HIT] Returning data for key: ${cacheKey}`);
            // Retornar datos cacheados
            return res.status(200).json(data.response);
          } else {
            console.log(`[CACHE STALE] Data expired for key: ${cacheKey}`);
          }
        }

        // 2. Si no hay caché válido, llamar a la API original del MEF
        console.log(`[CACHE MISS] Fetching from MEF API for key: ${cacheKey}`);
        
        // Reconstruir URL con los parámetros
        const url = new URL(`${MEF_BASE_URL}/${endpoint}`);
        Object.entries(queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });

        console.log(`Fetching: ${url.toString()}`);
        
        const mefResponse = await fetch(url.toString(), {
          headers: {
            "Accept": "application/json",
            "User-Agent": "ExpedienteCheck-Proxy/1.0",
          },
        });

        if (!mefResponse.ok) {
          throw new Error(`MEF API responded with status: ${mefResponse.status}`);
        }

        const jsonResponse = await mefResponse.json();

        // 3. Guardar la respuesta en Firestore (solo si la consulta fue exitosa)
        if (jsonResponse.success) {
          await cacheRef.set({
            queryParams: req.query,
            response: jsonResponse,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[CACHE SAVED] Saved new data for key: ${cacheKey}`);
        }

        // 4. Retornar los datos al cliente
        return res.status(200).json(jsonResponse);
      } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
          success: false,
          error: {
            message: "Failed to fetch data from MEF API",
            details: error.message,
          },
        });
      }
    });
  }
);
