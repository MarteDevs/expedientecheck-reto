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

## 5. Estabilidad de la API del MEF (Retorno al Dataset 2024)
**Problema:** Se intentó migrar la aplicación para consumir un dataset multianual (Comparativo de Gastos 2022-2026). Sin embargo, el endpoint `datastore_search_sql` para este recurso específico devolvía errores HTTP 500 consistentes al realizar consultas de agregación y filtros.
**Decisión:** Se decidió revertir la migración y mantener la aplicación conectada al dataset "2024-Gasto", el cual ha demostrado ser estable y responder correctamente a las consultas complejas de la aplicación.
**Beneficio:** Asegurar la disponibilidad y funcionalidad de la aplicación, priorizando la estabilidad del sistema sobre la cantidad de datos históricos (dado que la infraestructura de origen presentaba inestabilidades insalvables).

## 6. Granularidad del Dataset: PIA y PIM en Cero
**Problema:** Al consultar los datos del dataset 2024-Gasto (11,191,489 registros), se observó que la gran mayoría de registros muestran `MONTO_PIA = 0` y `MONTO_PIM = 0`, incluso cuando tienen montos ejecutados (Devengado > 0). Esto hacía que la métrica de avance presupuestal (Devengado/PIM) siempre mostrara `0.0%`, lo cual no aportaba insight al usuario.
**Análisis:** El dataset está desglosado al nivel más fino del clasificador presupuestal (Específica Detalle + Meta + Mes). El presupuesto (PIA/PIM) se asigna a niveles superiores (Genérica de Gasto), mientras que la ejecución se registra al nivel de detalle. Además, la API CKAN del MEF **no soporta funciones de agregación** (SUM, GROUP BY retornan error `42883 — function does not exist`), por lo que no podemos sumar los montos en el servidor.
**Decisión:** Se mantiene la visualización fiel a los datos tal como los entrega la API. Se implementó:
- Etiquetado especial para filas donde `Devengado > 0` y `PIM = 0` (badge "Gasto sin PIM").
- Cálculo de "Peso del Gasto" (porcentaje de la fila respecto al total de la página) como métrica alternativa cuando el avance no es calculable.

## 7. Filtro por Mes de Ejecución (`MES_EJE`)
**Problema:** Al cargar los datos sin filtro de mes, la tabla mezclaba registros de todos los meses del año fiscal 2024, dificultando el análisis temporal y produciendo duplicidad visual de información.
**Decisión:** Se agregó un cuarto filtro dropdown que permite seleccionar el mes de ejecución. Al filtrar por un mes específico, el usuario puede comparar la ejecución mensual y detectar patrones estacionales del gasto público. Los valores del filtro son estáticos (1-12 → Enero-Diciembre) para evitar una consulta adicional a la API.
**Beneficio:** Permite análisis temporal sin necesidad de agregaciones SQL (que la API no soporta), y reduce el volumen de datos devueltos por consulta, mejorando los tiempos de respuesta.

## 8. Despliegue: Separación Terraform vs Firebase CLI
**Problema:** Al inicio no estaba claro cómo interactúan Terraform y Firebase CLI para el despliegue. El reto específicamente pide que la infraestructura sea creada con Terraform, pero ¿también el contenido web?
**Decisión:** Se separó claramente en dos fases:
1. **`terraform apply`**: Crea la infraestructura (APIs de GCP, proyecto Firebase, Web App, sitio Hosting, Firestore DB). Esto solo se ejecuta una vez (o cuando cambia la infra).
2. **`firebase deploy`** (o GitHub Actions): Despliega el contenido de la web (`dist/`) y las Cloud Functions. Esto se ejecuta en cada cambio de código.
**Beneficio:** Responsabilidades claras. Terraform gestiona el "dónde vive la app" y Firebase CLI gestiona el "qué contiene la app". El CI/CD en GitHub Actions automatiza la segunda fase.

