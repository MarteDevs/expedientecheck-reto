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

/**
 * Guarda una configuración de filtros como Favorito en Firestore
 * @param {string} name - Nombre descriptivo para el favorito
 * @param {Object} filters - Objeto con los filtros aplicados
 */
export async function saveFavorite(name, filters) {
  try {
    const favoritesRef = collection(db, 'favorites');
    await addDoc(favoritesRef, {
      name: name,
      filters: filters,
      createdAt: serverTimestamp()
    });
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
