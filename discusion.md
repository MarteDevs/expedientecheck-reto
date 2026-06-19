# Registro de Decisiones y Discusión Técnica

Este documento recopila el criterio técnico y las decisiones arquitectónicas tomadas durante el desarrollo del reto, enfocándose en la resolución de problemas reales encontrados en la integración con la API del MEF y los servicios de Firebase.

## 1. Arquitectura BFF (Backend-For-Frontend) con Cloud Functions
**Problema:** La API del MEF en crudo presenta desafíos de CORS cuando es consultada directamente desde `localhost` o ciertos orígenes web, y es riesgoso o poco performante exponer la lógica compleja de formateo y paginación 100% en el cliente.
**Decisión:** Se implementó una **Cloud Function (`mefProxy`)** que actúa como un proxy reverso y Backend-for-Frontend. 
**Beneficio:** Resolvemos los problemas de CORS desde la raíz, centralizamos la lógica de peticiones y preparamos el terreno para la caché en servidor.

## 2. Migración de Caché Firestore del Frontend al Backend
**Problema:** Inicialmente, el frontend intentaba conectarse directamente a Firestore (`firestore.googleapis.com`) para consultar y guardar la caché de las peticiones. Esto generaba errores como `net::ERR_BLOCKED_BY_CLIENT` porque **los AdBlockers y escudos de navegadores (como Brave) bloquean agresivamente** las conexiones WebSockets o long-polling de Firestore por considerarlas rastreadores.
**Decisión:** 
- Se eliminó por completo el uso del SDK de Firestore en el Frontend (en `firebase.js`), dejando el cliente sumamente ligero y usando únicamente `LocalStorage` como caché ultra-rápida de primera línea.
- La caché principal, robusta y persistente (Firestore) se movió exclusivamente al backend (Cloud Functions).
**Beneficio:** Inmunidad total contra AdBlockers, mayor seguridad (no exponemos reglas de Firestore al cliente web) y una carga inicial del frontend muchísimo más rápida al no tener que arrancar todo el motor de bases de datos en el navegador.

## 3. Tolerancia a Latencia Extrema (Ajuste de Timeouts)
**Problema:** El usuario reportaba errores de "Sin conexión". Al investigar, notamos que consultas complejas a la API CKAN del MEF (ej. filtrar simultáneamente por `Nivel de Gobierno: GOBIERNO NACIONAL` y `Sector: EDUCACION` en 11 millones de registros sin índices optimizados por el MEF) tardaban aproximadamente 40 a 50 segundos. El frontend estaba configurado para abortar la petición (`AbortController`) a los 15 o 60 segundos, cortando la conexión TCP (lo que generaba `SocketException: Connection reset` en el emulador local).
**Decisión:** Se alinearon los límites de tiempo (timeouts). La Cloud Function se configuró para soportar hasta 120 segundos de espera, y en el frontend (`mefClient.js`) elevamos el `REQUEST_TIMEOUT` a 130 segundos (130000 ms).
**Beneficio:** Garantizamos que la primera consulta pesada tenga el tiempo suficiente para resolverse y ser guardada en nuestra caché de Firestore. Las subsiguientes llamadas tardan apenas 50ms al golpear nuestra caché.

## 4. UX: Disparador Explícito de Búsqueda
**Problema:** La barra de búsqueda reaccionaba al evento `change` de cada selector (dropdown). Esto provocaba "consultas dobles" o peticiones accidentales no deseadas si el usuario solo estaba explorando qué filtros aplicar antes de estar listo.
**Decisión:** Se desacopló la selección visual del disparo de la consulta. Se añadió un botón explícito de **"Buscar / Aplicar"**. Las selecciones de filtros y texto ahora solo actualizan el estado visual (los "chips") localmente hasta que el usuario hace clic en el botón o presiona `Enter`.
**Beneficio:** Reducción drástica del estrés sobre nuestra API (y la del MEF), ahorro en costos de facturación de Cloud Functions al evitar peticiones intermedias innecesarias, y una experiencia de usuario mucho más controlada y predecible.
