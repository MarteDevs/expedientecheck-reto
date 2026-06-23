# Documentación Técnica: Frontend y Flujo de Despliegue (CI/CD)

Este documento detalla el diseño de la capa cliente de **ExpedienteCheck** (Vite + Vanilla JS) y el funcionamiento detallado del pipeline de Integración y Despliegue Continuo (CI/CD) automatizado en GitHub Actions.

---

## 🎨 Arquitectura del Frontend (Vite + Vanilla JS)

El frontend está diseñado bajo un enfoque de **cero dependencias pesadas** (Zero Framework Overhead), utilizando JavaScript puro (Vanilla JS) y Vite como compilador y empaquetador moderno.

```
┌────────────────────────────────────────────────────────┐
│                      INDEX.HTML                        │
│            Carga el punto de entrada main.js           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                        MAIN.JS                         │
│   - Orquesta el estado global de la aplicación (State)  │
│   - Gestiona eventos del DOM global (Buscar/Favoritos)  │
└─────┬────────────────────┬───────────────────────┬─────┘
      │                    │                       │
      ▼                    ▼                       ▼
┌──────────────┐    ┌──────────────┐        ┌──────────────┐
│  COMPONENTS  │    │     API      │        │  FIREBASE    │
│  SearchBar   │    │  mefClient   │        │  firebaseJS  │
│  DataTable   │    │  (Queries)   │        │ (Favoritos)  │
│  DetailModal │    └──────────────┘        └──────────────┘
└──────────────┘
```

### 1. ¿Por qué Vanilla JS y no React/Vue/Angular?
* **Rendimiento Extremo (Web Performance):** Al no cargar el peso de un framework y sus procesos de reconciliación de DOM virtual, el paquete de la aplicación compilado pesa menos de **60 KB** en total. Esto garantiza una puntuación de **100/100 en Google Lighthouse** y tiempos de carga instantáneos, incluso en conexiones móviles lentas.
* **Demostración de Fundamentos:** Demuestra solidez en el manejo nativo del DOM de los navegadores, gestión manual del estado sin librerías externas y un control total de la memoria (evitando fugas de memoria por listeners huérfanos).

### 2. Estructura de Componentes en Código
Cada componente encapsula su representación visual mediante funciones modulares de renderizado que inyectan HTML en nodos específicos:
* [SearchBar.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/components/SearchBar.js): Construye la barra con los selects dinámicos (Nivel de Gobierno, Sector, Departamento) y estáticos (Mes). Implementa un botón explícito "Aplicar Filtros" para evitar peticiones accidentales.
* [DataTable.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/components/DataTable.js): Dibuja la tabla de datos principales del MEF con soporte de paginación integrada y un etiquetado condicional para registros con anomalías (como el badge "Gasto sin PIM").
* [DetailModal.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/components/DetailModal.js): Renderiza el modal interactivo con el desglose del expediente. Calcula en caliente las métricas clave:
  * Avance Presupuestal (% PIM): `(Devengado / PIM) * 100`.
  * Variación del Presupuesto (%): `((PIM - PIA) / PIA) * 100` (si la PIA es mayor a cero).
* [AnalyticsDashboard.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/components/AnalyticsDashboard.js): Genera un resumen visual con métricas acumuladas (PIM total devengado, ejecución agregada) y gráficos informativos para el análisis rápido de la data.

### 3. Enrutador Inteligente (Smart Fetching)
Implementado en el cliente [mefClient.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/api/mefClient.js), optimiza la forma en que se le solicita la data al BFF:
* **Filtros Paramétricos:** Si el usuario aplica filtros estructurados, construye una query SQL y apunta al endpoint `/api/mef/datastore_search_sql` usando operadores de coincidencia parcial (`LIKE '%VALOR%'`).
* **Búsqueda Libre:** Si el usuario digita texto en el buscador general, apunta a `/api/mef/datastore_search` para aprovechar el índice de texto completo (`_full_text`) provisto por PostgreSQL en el servidor gubernamental del MEF.
* **Controlador de Abortos (AbortController):** Ante peticiones lentas o cuando el usuario dispara una nueva búsqueda antes de que termine la anterior, cancela activamente la petición HTTP en curso, protegiendo los recursos de la máquina del cliente y del servidor.

### 4. Gestión Selectiva de Firebase (Evadiendo AdBlockers)
En el frontend se inicializa la SDK de Firebase en [firebase.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/firebase.js) **únicamente** para persistir la colección de favoritos del usuario final.
* **El Reto:** Los navegadores con bloqueadores de anuncios (como Brave o extensiones de Chrome) bloquean las conexiones del frontend directas a Firestore (`firestore.googleapis.com`).
* **La Solución:** Todo lo referente a consultas masivas y caché del MEF viaja a través de nuestra Cloud Function (BFF). El SDK de Firebase de cara al navegador solo se activa para operaciones transaccionales muy ligeras (guardar favoritos), asegurando que si un AdBlocker corta esa funcionalidad, el corazón del sistema (búsqueda y visualización) siga operando al 100%.

---

## 🚀 Flujo de Despliegue Continuo (CI/CD)

El ciclo de despliegue está completamente automatizado y separado por entornos a través de GitHub Actions en [.github/workflows/deploy.yml](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/.github/workflows/deploy.yml).

### Arquitectura del Pipeline de Despliegue

```
 📥 Cambios Locales en Git
          │
          ├────────────────────────┐ (Push a main)
          │                        │
          ▼ (Push de Tag v*)       ▼
   🚀 Entorno PROD          🛠️ Entorno DEV
          │                        │
          └───────────┬────────────┘
                      ▼
             [ GitHub Actions Run ]
                      │
             1. Clonar repositorio
                      │
             2. Configurar Node.js v20
                      │
             3. Ejecutar pruebas unitarias (Vitest)
                      │
             4. Inyectar secretos en variables VITE_*
                      │
             5. Compilar bundle (npm run build)
                      │
             6. Firebase Deploy (Hosting, Functions, Firestore Rules)
```

### Paso 1: Disparador Inteligente (Triggers)
* **Ambiente DEV:** Se ejecuta automáticamente al hacer un `git push` a la rama principal `main`.
* **Ambiente PROD:** Se ejecuta únicamente cuando un administrador crea un Tag de versión en Git con el prefijo "v" (ej: `git tag v1.0.0` y `git push --tags`). Esto bloquea subidas accidentales a producción.

### Paso 2: Control de Calidad (Testing)
El pipeline levanta un contenedor en la nube, instala dependencias de producción mediante `npm ci` y corre las pruebas automatizadas usando **Vitest** (`npm run test`). Si hay un solo test fallido, la compilación se interrumpe y el despliegue es abortado, garantizando que código roto nunca toque los servidores públicos.

### Paso 3: Inyección de Secretos y Compilación (Build)
Dado que no debemos subir llaves secretas o configuraciones de Firebase en texto plano al repositorio público de GitHub por seguridad, el pipeline inyecta los **GitHub Secrets** (`VITE_FIREBASE_API_KEY`, etc.) como variables de entorno al proceso de compilación de Vite (`npm run build`). Vite reemplaza estos marcadores en caliente en los archivos estáticos optimizados generados en la carpeta `dist`.

### Paso 4: Despliegue Multiorigen con Firebase CLI
El flujo ejecuta el despliegue integrado usando las herramientas de Firebase:
```bash
npx firebase-tools deploy --only hosting,functions,firestore:rules --project <entorno> --force
```
* **Hosting:** Sube el bundle estático de `frontend/dist` a la CDN mundial de Firebase.
* **Functions:** Sube la Cloud Function (`mefProxy`) empaquetando e instalando sus propios módulos del backend.
* **Firestore Rules:** Sube las reglas de seguridad y validaciones de datos declaradas en [firestore.rules](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/firestore.rules).


