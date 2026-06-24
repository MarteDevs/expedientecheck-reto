# Registro de Decisiones y Discusión Técnica (ADR)

Este documento recopila el criterio técnico y las decisiones arquitectónicas tomadas durante el desarrollo del reto, enfocándose en la resolución de problemas reales encontrados en la integración con la API del MEF y los servicios de Firebase.

## 1. Arquitectura BFF (Backend-For-Frontend) con Cloud Functions

**Problema:** La API del MEF en crudo presenta desafíos de CORS cuando es consultada directamente desde `localhost` o ciertos orígenes web, y es riesgoso o poco performante exponer la lógica compleja de formateo y paginación 100% en el cliente.

**Decisión:** Se implementó una **Cloud Function (`mefProxy`)** que actúa como un proxy reverso y Backend-for-Frontend.

**Beneficio:** Resolvemos los problemas de CORS desde la raíz, centralizamos la lógica de peticiones y preparamos el terreno para la caché en servidor.

## 2. Uso Estratégico del SDK de Firestore (Frontend vs Backend)

**Problema:** Inicialmente, el frontend intentaba conectarse directamente a Firestore (`firestore.googleapis.com`) para consultar y guardar la inmensa caché de las peticiones del MEF. Esto generaba errores de cuota y bloqueos (`net::ERR_BLOCKED_BY_CLIENT`) porque **los AdBlockers y escudos de navegadores (como Brave) bloquean agresivamente** las conexiones WebSockets o long-polling de Firestore por considerarlas rastreadores.
\
**Decisión:**

- **Para la Caché del MEF (Heavy data):** Se eliminó por completo el uso del SDK de Firestore en el Frontend. La caché masiva se movió exclusivamente al backend (Cloud Function `mefProxy` usando Firebase Admin SDK) y se complementa con un mapa en memoria RAM (`memoryCache`) ultra-rápido de primera línea en el frontend.
- **Para Favoritos (Light data):** Se mantuvo el SDK de Firestore inicializado en el frontend (`firebase.js`) **exclusivamente** para gestionar los "Favoritos" del usuario.
  \
  **Beneficio:** Inmunidad contra AdBlockers en el flujo principal (lectura de datos del MEF) y optimización extrema de rendimiento. La función de favoritos sigue siendo serverless en el frontend, lo cual es aceptable dado que son escrituras transaccionales ligeras a demanda, reduciendo la complejidad del backend.

## 3. Tolerancia a Latencia Extrema (Ajuste de Timeouts)

**Problema:** El usuario reportaba errores de "Sin conexión". Al investigar, notamos que consultas complejas a la API CKAN del MEF (ej. filtrar simultáneamente por `Nivel de Gobierno` y `Sector` en millones de registros) tardaban aproximadamente 40 a 50 segundos. El frontend estaba configurado para abortar la petición (`AbortController`) a los 15 segundos.
\
\
**Decisión:** Se alinearon los límites de tiempo. La Cloud Function se configuró para soportar hasta 120 segundos de espera, y en el frontend elevamos el `REQUEST_TIMEOUT` a 130 segundos (130000 ms).
\
\
**Beneficio:** Garantizamos que la primera consulta pesada tenga el tiempo suficiente para resolverse y ser guardada en caché. Las subsiguientes llamadas tardan apenas 50ms.

## 4. UX: Disparador Explícito de Búsqueda

**Problema:** La barra de búsqueda reaccionaba al evento `change` de cada selector (dropdown). Esto provocaba "consultas dobles" o peticiones accidentales no deseadas.
**Decisión:** Se desacopló la selección visual del disparo de la consulta. Se añadió un botón explícito de **"Buscar / Aplicar"**.
**Beneficio:** Reducción drástica del estrés sobre nuestra API, ahorro en costos de Cloud Functions y una experiencia de usuario controlada.

## 5. Granularidad del Dataset: PIA y PIM en Cero

**Problema:** La gran mayoría de registros del MEF muestran `MONTO_PIA = 0` y `MONTO_PIM = 0`, incluso con montos ejecutados. Esto hacía que el avance presupuestal mostrara `0.0%`.
**Decisión:** Se implementó etiquetado especial para filas donde `Devengado > 0` y `PIM = 0` y se agrego unas validacion completa con uan analisis BI para poder de forma clara el trabajo realizado\* 

## 6. Despliegue: Separación Terraform vs Firebase CLI

**Problema:** Al inicio no estaba claro cómo interactúan Terraform y Firebase CLI para el despliegue.
**Decisión:** Se separó en dos fases:

1. **`terraform apply`**: Crea la infraestructura (APIs, Firebase, Hosting, Firestore).
2. **`firebase deploy`**: Despliega el contenido web y las Cloud Functions.

## 9. Backend de Estado de Terraform (Migrado a GCS)

**Problema:** Inicialmente se utilizó un backend "local" para Terraform por simplicidad de desarrollo, lo cual no es robusto para trabajo en equipo.
**Decisión:** Se migró el backend a Google Cloud Storage (GCS).
**Proceso ejecutado:** Se creó el bucket `expedientecheck-tf-state` con versionamiento activado, y se ejecutó `terraform init -migrate-state` apuntando al nuevo bucket. Todo el estado remoto de la infraestructura está ahora bloqueado y versionado en la nube.

## 10. Estrategia de Reintentos en Backend (Tolerancia a Errores 503)

**Problema:** El API gubernamental del MEF arroja recurrentemente errores HTTP 503 (Service Unavailable) bajo carga pesada, interrumpiendo la navegación del usuario de forma aleatoria.
**Decisión:** Implementar una lógica de reintentos automáticos con backoff exponencial (`fetchWithRetry`) directamente en la Cloud Function (BFF).
**Beneficio:** Si la API del MEF falla con 503, la Cloud Function reintenta silenciosamente hasta 3 veces duplicando el tiempo de espera. Esto resuelve de forma transparente el 90% de los fallos de red temporales, evitando arrojar errores innecesarios al frontend.

## 11. Caché en Memoria Híbrida para Métricas Analíticas (BI)

**Problema:** Al cambiar entre la pestaña "Datos" y "Análisis BI", o repetir la aplicación de filtros idénticos, la aplicación disparaba de forma redundante las consultas SQL de consolidación de presupuesto hacia el servidor, generando latencia y saturando los servicios.
**Decisión:** Extender el sistema de caché en memoria del frontend para soportar objetos agregados de analítica. Almacena las estadísticas de BI bajo una firma hash calculada a partir de los filtros seleccionados.
**Beneficio:** El cambio de pestañas o re-consulta de los mismos filtros sirve la analítica en <1ms desde la memoria RAM local del navegador, logrando un rendimiento instantáneo y eliminando llamadas de red repetitivas.

## 12. Enfoque en Resiliencia de Carga de BI (Botón Reintentar)

**Problema:** Ante caídas duras del MEF, los KPIs cargaban por defecto en `S/ 0`, lo que confundía al usuario.
**Decisión:** Eliminar el botón de exportación a PDF y estructurar una interfaz de error detallada en el Dashboard de BI. Si las llamadas a la base de datos fallan permanentemente, se captura la excepción y se despliega una tarjeta de error estilizada con un botón interactivo de **"Reintentar análisis"**.
**Beneficio:** Simplificación del código de frontend y mejor experiencia de usuario (UX) reactiva, permitiendo re-evaluar la consulta sin forzar la recarga del navegador completo.
