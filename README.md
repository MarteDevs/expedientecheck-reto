# 📊 ExpedienteCheck — Reto Técnico Finalistas

> Mini-producto funcional que consume la API pública de Datos Abiertos del MEF para visualizar datos de **Ejecución Presupuestal** del Perú, desplegado en Firebase Hosting con infraestructura definida en Terraform.

---

## 🌐 Demo

| Ambiente | URL |
|----------|-----|
| **Dev** | *(se genera al desplegar — ver sección Deploy)* |
| **Prod** | *(se genera al desplegar — ver sección Deploy)* |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Frontend** | Vite + Vanilla JS | Bundler rápido, sin overhead de framework. Demuestra dominio de fundamentos |
| **Estilos** | CSS Custom Properties | Design system completo sin dependencias externas |
| **API** | Datos Abiertos MEF (CKAN) | API pública, gratuita, sin autenticación |
| **Hosting** | Firebase Hosting | CDN global, SSL automático, integración con GCP |
| **IaC** | Terraform + google-beta | Provider oficial de GCP para recursos Firebase |
| **CI/CD** | GitHub Actions | Deploy automático al hacer push |
| **Testing** | Vitest | Testing framework nativo de Vite, rápido y compatible |

---

## 📁 Estructura del Proyecto

```
expedientecheck-reto/
├── frontend/                          # Directorio con todo el código frontend
│   ├── index.html                     # HTML principal con layout semántico
│   ├── package.json                   # Dependencias y scripts
│   ├── vite.config.js                 # Configuración de Vite + Vitest
│   ├── firebase.json                  # Config de Firebase Hosting
│   ├── .firebaserc                    # Aliases de proyecto (dev/prod)
│   │
│   ├── src/
│   │   ├── main.js                    # Entry point — orquesta toda la app
│   │   ├── api/
│   │   │   └── mefClient.js          # Cliente HTTP para API del MEF
│   │   ├── components/
│   │   │   ├── DataTable.js          # Tabla con paginación y progress bars
│   │   │   ├── SearchBar.js          # Búsqueda con debounce + filtros
│   │   │   ├── Loader.js             # Skeleton loading animado
│   │   │   ├── ErrorState.js         # Estado de error con retry
│   │   │   └── DetailModal.js        # Modal glassmorphism con detalle
│   │   ├── utils/
│   │   │   ├── formatter.js          # Formateo de montos (S/) y porcentajes
│   │   │   └── debounce.js           # Utilidad debounce para búsqueda
│   │   └── styles/
│   │       └── index.css              # Design system completo (dark theme)
│   │
│   └── tests/
│       └── mefClient.test.js          # Tests unitarios del cliente API
│
├── terraform/
│   ├── main.tf                        # Recursos principales
│   ├── variables.tf                   # Variables con validaciones
│   ├── outputs.tf                     # Outputs (URLs, IDs)
│   ├── providers.tf                   # Provider google-beta ~> 6.0
│   ├── modules/
│   │   └── firebase-hosting/
│   │       ├── main.tf                # Recursos Firebase Hosting
│   │       ├── variables.tf
│   │       └── outputs.tf
│   └── environments/
│       ├── dev.tfvars                 # Variables para desarrollo
│       └── prod.tfvars                # Variables para producción
│
└── .github/
    └── workflows/
        └── deploy.yml                 # CI/CD — deploy automático
```

---

## 🚀 Cómo Correr Localmente

### Prerrequisitos
- **Node.js** >= 18
- **npm** >= 9

### Pasos

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPO>
cd expedientecheck-reto

# 2. Ir al directorio frontend e instalar dependencias
cd frontend
npm install

# 3. Iniciar el servidor de desarrollo
npm run dev
```

La aplicación se abrirá automáticamente en `http://localhost:3000`.

### Scripts disponibles (ejecutar dentro de la carpeta frontend)

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo con hot reload |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Preview del build de producción |
| `npm run test` | Ejecutar tests unitarios |
| `npm run test:watch` | Tests en modo watch |

---

## 🏗️ Cómo Aplicar el Terraform

### Prerrequisitos
- **Terraform** >= 1.5
- **Cuenta de GCP** con billing habilitado
- **gcloud CLI** autenticado (`gcloud auth application-default login`)
- **Dos proyectos GCP** creados (uno para dev, otro para prod)

### Pasos

```bash
# 1. Navegar al directorio de Terraform
cd terraform

# 2. Inicializar Terraform (descarga providers)
terraform init

# 3. Revisar el plan para desarrollo
terraform plan -var-file=environments/dev.tfvars

# 4. Aplicar la infraestructura de desarrollo
terraform apply -var-file=environments/dev.tfvars

# 5. (Opcional) Aplicar producción
terraform apply -var-file=environments/prod.tfvars
```

> **Nota:** Antes de aplicar, edita los archivos `.tfvars` con los IDs reales de tus proyectos GCP.

### Qué crea el Terraform
1. Habilita las APIs de Firebase y Firebase Hosting
2. Activa Firebase en el proyecto GCP
3. Registra una Web App de Firebase
4. Crea el sitio de Firebase Hosting
5. Configura rewrites para SPA (todas las rutas → `index.html`)
6. Crea un release inicial

---

## 🌍 Cómo Desplegar

### Deploy manual

```bash
# 1. Navegar al directorio de frontend
cd frontend

# 2. Construir la app
npm run build

# 3. Seleccionar el ambiente
npx firebase use dev    # o: npx firebase use prod

# 4. Desplegar
npx firebase deploy --only hosting
```

### Deploy automático (CI/CD)
El archivo `.github/workflows/deploy.yml` despliega automáticamente:
- **Push a `main`** → Deploy a ambiente **dev**
- **Push de tag `v*`** → Deploy a ambiente **prod**

> Requiere configurar el secret `FIREBASE_TOKEN` en el repositorio de GitHub. Genéralo con: `npx firebase login:ci`

---

## 🧠 Decisiones Técnicas

### ¿Por qué Vite + Vanilla JS?
- **Vite** es el bundler más rápido disponible, con HMR instantáneo.
- **Vanilla JS** demuestra dominio de fundamentos sin esconderse detrás de un framework.
- Para un proyecto de esta escala, un framework sería over-engineering.

### ¿Por qué módulos + .tfvars en vez de Terraform workspaces?
- Cada ambiente tiene su propio **state file independiente**, lo cual es más seguro.
- Se puede versionar cada `.tfvars` por separado.
- Es más explícito: `terraform apply -var-file=environments/dev.tfvars` deja claro qué se está desplegando.
- Los workspaces comparten el mismo state y eso puede ser riesgoso en producción.

### ¿Por qué el endpoint SQL de la API del MEF?
- El endpoint `datastore_search` básico no soporta búsqueda de texto en campos específicos.
- `datastore_search_sql` permite hacer `LIKE '%texto%'` en múltiples campos simultáneamente.
- Se usa el endpoint estándar para cargas iniciales y el SQL solo cuando hay búsqueda activa.

### ¿Por qué CSS puro con Custom Properties?
- Zero dependencias externas para estilos.
- Design tokens consistentes en toda la app.
- Dark theme nativo sin librería.
- Glassmorphism y micro-animaciones con CSS puro.

### ¿Por qué no Firestore/Cloud Functions?
- El reto los marca como opcionales y la API del MEF ya es gratuita y sin autenticación.
- Agregar Firestore introduciría complejidad innecesaria para un visor de datos.
- Priorización: hacer bien lo obligatorio antes de agregar extras.

---

## 🧪 Tests

Los tests unitarios verifican:
- ✅ `buildApiUrl` construye URLs con todos los parámetros
- ✅ `buildApiUrl` maneja filtros JSON correctamente
- ✅ `fetchMefData` maneja errores de red
- ✅ `fetchMefData` maneja respuestas vacías
- ✅ `fetchMefData` parsea datos correctamente
- ✅ `fetchMefData` respeta `limit` y `offset` de paginación
- ✅ `fetchMefData` lanza error en respuestas HTTP no exitosas

```bash
npm run test
```

---

## 📐 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        USUARIO                               │
│                     (Navegador Web)                           │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────┐    ┌──────────────────────────┐
│   Firebase Hosting   │    │    API Datos Abiertos    │
│   (dev / prod)       │    │    MEF (CKAN)            │
│                      │    │                          │
│  ┌────────────────┐  │    │  datastore_search        │
│  │  Vite Build    │  │───▶│  datastore_search_sql    │
│  │  (dist/)       │  │    │                          │
│  └────────────────┘  │    │  Presupuesto y Ejecución │
└──────────┬───────────┘    │  de Gasto 2024           │
           │                └──────────────────────────┘
           │
┌──────────▼───────────┐    ┌──────────────────────────┐
│   Terraform          │    │   GitHub Actions          │
│   (google-beta)      │    │   (CI/CD)                 │
│                      │    │                           │
│  ├── modules/        │    │  push main → deploy dev   │
│  └── environments/   │    │  tag v* → deploy prod     │
│      ├── dev.tfvars  │    │                           │
│      └── prod.tfvars │    └───────────────────────────┘
└──────────────────────┘
```

---

## 📝 Qué No Alcancé a Hacer y Cómo lo Resolvería

Con más tiempo, implementaría:

1. **Firestore para favoritos**: Permitir al usuario guardar registros de interés. Usaría Firestore en modo anónimo con reglas de seguridad básicas y un componente `FavoritesPanel`.

2. **Cloud Function como proxy/cache**: Una función HTTP que cachée las respuestas del MEF en Firestore o Memorystore, reduciendo la latencia y protegiendo contra caídas de la API.

3. **Gráficas interactivas**: Charts.js o D3.js para visualizar la ejecución presupuestal por sector/departamento con gráficas de barras y donuts.

4. **Export a CSV/Excel**: Botón para descargar los datos filtrados en formato tabular.

5. **PWA + Offline**: Service Worker para funcionar sin conexión con los últimos datos cacheados.

6. **i18n**: Soporte para quechua y aymara además de español.

7. **Tests E2E**: Playwright o Cypress para probar flujos completos de usuario.

---

## 📄 Licencia

Proyecto desarrollado como reto técnico para ExpedienteCheck. Datos públicos del [Portal de Datos Abiertos del MEF](https://datosabiertos.mef.gob.pe).
