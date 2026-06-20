/**
 * Módulo de integración de Caché Local y Favoritos (Firestore).
 * La caché se maneja en LocalStorage para velocidad.
 * Los Favoritos se guardan en Firestore.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';

// Configuración de Firebase usando variables de entorno de Vite
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

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

/** Cache en memoria para evitar el límite de 5MB de localStorage */
const memoryCache = new Map();

/**
 * Intenta recuperar una consulta de la caché en memoria
 * @param {string} rawKey - Clave sin hashear
 * @returns {Promise<Object|null>} Datos de la caché o null
 */
export async function getCachedQuery(rawKey) {
  const key = await hashKey(rawKey);
  const twelveHours = 12 * 60 * 60 * 1000;

  try {
    const cached = memoryCache.get(key);
    if (cached) {
      const ageMs = Date.now() - cached.timestamp;
      
      if (ageMs < twelveHours) {
        console.log(`[Caché en Memoria] Hit para: ${rawKey.substring(0, 60)}...`);
        return cached;
      } else {
        memoryCache.delete(key);
      }
    }
  } catch (err) {
    console.warn('[Caché en Memoria] Fallo de lectura:', err);
  }

  return null;
}

/**
 * Guarda los resultados de una consulta en la caché en memoria
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
    memoryCache.set(key, cacheObj);
    
    // Opcional: Limpiar caché si crece demasiado (ej. > 50 peticiones en memoria)
    if (memoryCache.size > 50) {
      const firstKey = memoryCache.keys().next().value;
      memoryCache.delete(firstKey);
    }
  } catch (err) {
    console.warn('[Caché en Memoria] Error al guardar:', err);
  }
}

/**
 * Guarda una configuración de filtros y sus resultados como Favorito en Firestore
 * @param {string} name - Nombre descriptivo para el favorito
 * @param {Object} filters - Objeto con los filtros aplicados
 * @param {Object} resultData - Datos resultantes de la consulta { records, total, fields }
 */
export async function saveFavorite(name, filters, resultData = null) {
  try {
    const favoritesRef = collection(db, 'favorites');
    const docData = {
      name: name,
      filters: filters,
      createdAt: serverTimestamp()
    };

    // Guardar los resultados (limitados a 100 registros para no exceder el límite de Firestore)
    if (resultData && resultData.records) {
      docData.records = resultData.records.slice(0, 100);
      docData.total = resultData.total || resultData.records.length;
      docData.fields = resultData.fields || [];
    }

    await addDoc(favoritesRef, docData);
    console.log('[Firestore] Favorito guardado con éxito');
    return true;
  } catch (error) {
    console.error('[Firestore] Error al guardar favorito:', error);
    return false;
  }
}

/**
 * Obtiene la lista de favoritos guardados en Firestore
 * @returns {Promise<Array>} Lista de favoritos
 */
export async function getFavorites() {
  try {
    const favoritesRef = collection(db, 'favorites');
    const q = query(favoritesRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const favorites = [];
    querySnapshot.forEach((doc) => {
      favorites.push({ id: doc.id, ...doc.data() });
    });
    return favorites;
  } catch (error) {
    console.error('[Firestore] Error al obtener favoritos:', error);
    return [];
  }
}
