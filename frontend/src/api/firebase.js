/**
 * Módulo de integración con Firebase / Firestore y Caché Híbrido.
 * Descarga dinámicamente la configuración del hosting y maneja la caché.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

let db = null;
let initialized = false;
let initPromise = null;

/**
 * Genera un hash SHA-256 de una cadena de texto para usar como ID seguro de documento
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
    // Fallback simple si crypto.subtle no está disponible (ej. entornos de test antiguos)
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
 * Si deseas realizar pruebas locales con una base de datos real de Firebase antes de aplicar Terraform,
 * puedes registrar tu app en la consola de Firebase (como se muestra en tu captura) y pegar aquí
 * el objeto de configuración (`firebaseConfig`).
 * 
 * Ejemplo:
 * const LOCAL_FIREBASE_CONFIG = {
 *   apiKey: "AIzaSy...",
 *   authDomain: "expedientecheck.firebaseapp.com",
 *   projectId: "expedientecheck",
 *   ...
 * };
 */
const LOCAL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBc48cNuhI2pMvfC7PKPiOgNre8NTnF_0w",
  authDomain: "expedientecheck.firebaseapp.com",
  projectId: "expedientecheck",
  storageBucket: "expedientecheck.firebasestorage.app",
  messagingSenderId: "1065192589063",
  appId: "1:1065192589063:web:519316df24f272153ca7a2",
  measurementId: "G-5G8PCGG07Q"
};

/**
 * Inicializa Firebase de forma dinámica desde /__/firebase/init.json
 */
async function initFirebase() {
  if (initialized) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      let config = null;

      // 1. Intentar descargar la configuración automática del hosting
      try {
        const res = await fetch('/__/firebase/init.json');
        if (res.ok) {
          config = await res.json();
        }
      } catch (e) {
        // Ignorar fallo de fetch (ej. en desarrollo local sin emulador)
      }

      // 2. Si no estamos en el hosting y hay una config de pruebas local, usarla
      if (!config && LOCAL_FIREBASE_CONFIG) {
        config = LOCAL_FIREBASE_CONFIG;
        console.log('[Firebase] Usando configuración de pruebas local.');
      }

      if (config) {
        const app = initializeApp(config);
        db = getFirestore(app);
        initialized = true;
        console.log('[Firebase] Firestore inicializado correctamente.');
      } else {
        throw new Error('Sin configuración de Firebase disponible (cae a caché local).');
      }
    } catch (err) {
      console.warn('[Firebase] Usando Local Browser Cache únicamente (Entorno local o offline):', err.message);
      db = null;
    }
    return db;
  })();

  return initPromise;
}

/**
 * Intenta recuperar una consulta de la caché (Firestore o LocalStorage)
 * @param {string} rawKey - Clave sin hashear
 * @returns {Promise<Object|null>} Datos de la caché o null
 */
export async function getCachedQuery(rawKey) {
  const key = await hashKey(rawKey);
  const twelveHours = 12 * 60 * 60 * 1000;

  // 1. Intentar obtener de Firestore si está disponible
  const firestoreDb = await initFirebase();
  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'mef_queries_cache', key);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const cached = docSnap.data();
        const ageMs = Date.now() - cached.timestamp;
        if (ageMs < twelveHours) {
          console.log(`[Caché Firestore] Hit para: ${rawKey.substring(0, 80)}...`);
          return {
            records: cached.records,
            total: cached.total,
            fields: cached.fields,
          };
        } else {
          console.log(`[Caché Firestore] Expelida (Antigua) para: ${rawKey.substring(0, 80)}...`);
        }
      }
    } catch (err) {
      console.error('[Caché Firestore] Error al consultar:', err);
    }
  }

  // 2. Fallback a LocalStorage si Firestore no está inicializado o falló
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
 * Guarda los resultados de una consulta en la caché (Firestore y LocalStorage)
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

  // 1. Guardar en LocalStorage como respaldo inmediato
  try {
    localStorage.setItem(`mef_cache_${key}`, JSON.stringify(cacheObj));
  } catch (err) {
    console.warn('[Caché Local] Error al guardar:', err);
  }

  // 2. Guardar en Firestore si está disponible
  const firestoreDb = await initFirebase();
  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'mef_queries_cache', key);
      await setDoc(docRef, cacheObj);
      console.log(`[Caché Firestore] Guardada exitosamente.`);
    } catch (err) {
      console.error('[Caché Firestore] Error al guardar:', err);
    }
  }
}
