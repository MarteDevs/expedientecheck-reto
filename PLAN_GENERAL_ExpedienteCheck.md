# ExpedienteCheck — Plan General de Implementación
## Reto Técnico Finalistas: Firebase + API Pública (MEF) + Terraform

---

## Contexto técnico real (post-investigación)

Antes de cualquier plan, estos son los hechos verificados sobre la API:

| Hecho | Detalle |
|-------|---------|
| **Endpoint real** | `https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search` |
| **Endpoint SQL** | `https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search_sql` |
| **Resource ID** | `510bae6d-3d37-4fb2-af35-a40ce01715f4` |
| **Dataset** | Comparativo de Gastos 2022–2026 (Consulta Amigable MEF) |
| **Total registros** | 8,002,563 |
| **Tamaño CSV** | 7.90 GB — descargar completo es inviable |
| **CORS** | ✅ No bloqueado — el fetch desde browser responde |
| **SQL agregaciones** | ❌ `SUM()`, `GROUP BY`, `COUNT()` dan error 42883 — no soportado |
| **SQL simple** | ✅ `SELECT ... WHERE ... ORDER BY ... LIMIT` funciona |
| **Límite impuesto** | El servidor agrega `LIMIT 32000` automáticamente |
| **Wrapper** | Perl custom (`datastore_search_sql.pm`), no PostgreSQL puro |

### Implicación crítica

No se puede agregar en el servidor. Toda la agregación (sumas, porcentajes, comparativos)
se hace en el **frontend con los datos que devuelve la API**, por eso la estrategia
de consulta debe ser inteligente: pedir pocos registros, bien filtrados, y agregar en JS.

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIO FINAL                            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              FIREBASE HOSTING (CDN global)                  │
│         Vue 3 + Vite — SPA estática compilada               │
│  expedientecheck-dev.web.app / expedientecheck.web.app      │
└────────────┬───────────────────────────┬────────────────────┘
             │                           │
             ▼                           ▼
┌────────────────────┐       ┌───────────────────────┐
│   API MEF directa  │       │  Cloud Function (proxy)│  ← BONUS
│  (si no hay CORS   │       │  caché en memoria      │
│   issues en prod)  │       │  resuelve CORS prod    │
└────────────┬───────┘       └───────────┬────────────┘
             │                           │
             └───────────┬───────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         API PÚBLICA MEF — CKAN/DKAN wrapper                 │
│  datastore_search     → registros paginados con filtros     │
│  datastore_search_sql → SELECT simple (sin agregaciones)    │
│  Resource ID: 510bae6d-3d37-4fb2-af35-a40ce01715f4         │
│  8M registros — Comparativo Gastos 2022-2026                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              INFRAESTRUCTURA (TERRAFORM)                    │
│                                                             │
│  terraform/envs/dev/   →  site: expedientecheck-dev        │
│  terraform/envs/prod/  →  site: expedientecheck-prod       │
│                                                             │
│  Recursos aprovisionados:                                   │
│  • google_project_service (habilitar APIs)                  │
│  • google_firebase_project                                  │
│  • google_firebase_web_app                                  │
│  • google_firebase_hosting_site                             │
│  • google_cloudfunctions_function (proxy — bonus)           │
│  • google_firestore_database (favoritos — bonus)            │
│  • google_storage_bucket (backend estado Terraform)         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              CI/CD — GITHUB ACTIONS (BONUS)                 │
│                                                             │
│  push → develop  →  build + deploy a dev                   │
│  push → main     →  build + deploy a prod                  │
│  PR abierto      →  lint + tests Vitest                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Estructura del repositorio

```
expedientecheck-reto/
│
├── frontend/                          # Vue 3 + Vite
│   ├── src/
│   │   ├── services/
│   │   │   └── mef.js                 # Toda la lógica de consulta API MEF
│   │   ├── stores/
│   │   │   └── gastos.js              # Pinia store — estado global de datos
│   │   ├── composables/
│   │   │   └── useAggregations.js     # Agregaciones en JS (reemplaza GROUP BY)
│   │   ├── views/
│   │   │   ├── HomeView.vue           # Dashboard principal con KPIs
│   │   │   ├── ExplorerView.vue       # Tabla filtrable con paginación
│   │   │   └── ComparativoView.vue    # Comparativo 2022-2025 por función
│   │   ├── components/
│   │   │   ├── KpiCard.vue
│   │   │   ├── FilterBar.vue
│   │   │   ├── DataTable.vue
│   │   │   ├── BarChart.vue           # Chart.js o recharts
│   │   │   ├── LoadingState.vue
│   │   │   └── ErrorState.vue
│   │   ├── router/index.js
│   │   └── main.js
│   ├── .env.development               # Variables para dev
│   ├── .env.production                # Variables para prod
│   └── vite.config.js                 # Proxy para desarrollo local
│
├── terraform/
│   ├── modules/
│   │   └── firebase/
│   │       ├── main.tf                # Recursos GCP/Firebase
│   │       ├── variables.tf
│   │       └── outputs.tf
│   └── envs/
│       ├── dev/
│       │   ├── main.tf                # Llama al módulo con vars de dev
│       │   ├── terraform.tfvars       # site_id, project_id para dev
│       │   └── backend.tf             # GCS bucket — estado de dev
│       └── prod/
│           ├── main.tf
│           ├── terraform.tfvars
│           └── backend.tf
│
├── functions/                         # Cloud Function proxy (bonus)
│   ├── index.js
│   └── package.json
│
├── .github/
│   └── workflows/
│       ├── deploy-dev.yml             # Push a develop → deploy dev
│       └── deploy-prod.yml            # Push a main → deploy prod
│
├── docs/
│   ├── api-sample.json                # Respuesta real de la API (evidencia)
│   └── arquitectura.png               # Diagrama (bonus)
│
├── README.md
├── DECISIONS.md
└── .gitignore
```

---

## Estrategia de datos (clave dado el constraint de la API)

Como `SUM()` y `GROUP BY` no funcionan en el endpoint SQL del MEF,
la estrategia es la siguiente:

### Enfoque: Consultas acotadas + agregación en el cliente

```
API MEF                         Frontend (JS)
─────────────────────────────   ──────────────────────────
WHERE NIVEL_GOBIERNO = 'E'   →  records.reduce() para sumar
AND AÑO implícito en cols       DEVENGADO_2025 por sector
LIMIT 5000 (máx por consulta)   Ordenar, tomar top 10
```

### Patrón de consulta optimizado

```javascript
// mef.js — el truco está en filtrar bien antes de traer datos

// ✅ CORRECTO: filtrar por nivel + solo columnas necesarias
GET datastore_search?
  resource_id=510bae6d...
  &filters={"NIVEL_GOBIERNO":"E"}           // solo gobierno nacional
  &fields=SECTOR_NOMBRE,DEVENGADO_2025,PIM_2025  // solo 3 cols de 80
  &limit=5000                               // máximo razonable

// ❌ LENTO: sin filtros, todas las columnas
GET datastore_search?resource_id=...&limit=100
// → devuelve 80 columnas x 100 filas = payload enorme + lento
```

### Vistas de la app y su query correspondiente

| Vista | Filtros aplicados | Cols pedidas | Registros aprox | Agregación JS |
|-------|------------------|--------------|-----------------|---------------|
| KPIs principales | `NIVEL_GOBIERNO=E` | PIM_2025, DEVENGADO_2025 | ~50k → limit 5000 | SUM en JS |
| Top sectores | `NIVEL_GOBIERNO=E` | SECTOR_NOMBRE, DEVENGADO_2025 | ~5000 | group+sum en JS |
| Por departamento | `NIVEL_GOBIERNO=R` o `M` | DEPARTAMENTO_EJECUTORA_NOMBRE, DEVENGADO_2025 | ~3000 | group+sum en JS |
| Comparativo anual | filtro por FUNCION_NOMBRE | DEVENGADO_2022..2025 | ~500 | sum por año en JS |
| Explorador tabla | Filtros del usuario | Cols seleccionadas | limit=50, paginado | ninguna |

---

## Paso 1 — Setup inicial y decisiones de arquitectura

**Tiempo: ~2 horas | Día 1**

### 1.1 Crear el repositorio

```bash
mkdir expedientecheck-reto && cd expedientecheck-reto
git init
mkdir -p frontend terraform/modules/firebase terraform/envs/dev terraform/envs/prod
mkdir -p .github/workflows functions docs
touch README.md DECISIONS.md .gitignore
git add . && git commit -m "chore: initial repo structure"
gh repo create expedientecheck-reto --public --source=. --push
```

### 1.2 .gitignore

```gitignore
node_modules/
.terraform/
*.tfstate
*.tfstate.backup
*.tfplan
.terraform.lock.hcl
.env.local
.env.production
gcp-credentials.json
*-service-account.json
frontend/dist/
.vscode/
.idea/
```

### 1.3 Herramientas a instalar

```bash
# Google Cloud CLI
gcloud --version  # verificar

# Terraform
terraform --version  # verificar

# Firebase CLI
npm install -g firebase-tools
firebase --version

# Node 20+
node --version
```

### 1.4 Prerequisito manual: Proyecto GCP

1. Ir a https://console.cloud.google.com
2. Crear nuevo proyecto: `expedientecheck-reto`
3. Anotar el Project ID (ej: `expedientecheck-reto-461`)
4. Habilitar facturación

```bash
gcloud auth login
gcloud auth application-default login   # crítico para Terraform
gcloud config set project TU_PROJECT_ID
```

### 1.5 Verificar la API MEF desde consola del navegador

```javascript
// Probar en consola del browser — verificar CORS y funcionamiento real
fetch('https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1/datastore_search?resource_id=510bae6d-3d37-4fb2-af35-a40ce01715f4&limit=5&fields=NIVEL_GOBIERNO_NOMBRE,SECTOR_NOMBRE,DEVENGADO_2025,PIM_2025')
  .then(r => r.json())
  .then(d => console.log('✅ OK:', d.result.total, 'registros totales'))
  .catch(e => console.error('❌ CORS o error:', e))
```

Guardar la respuesta en `docs/api-sample.json`.

### 1.6 Checklist paso 1

- [ ] Repo Git público creado con estructura completa
- [ ] `.gitignore` configurado
- [ ] Proyecto GCP creado. Project ID anotado
- [ ] `gcloud auth application-default login` ejecutado
- [ ] API MEF verificada desde browser (no CORS, responde con datos)
- [ ] `docs/api-sample.json` guardado con respuesta real
- [ ] `DECISIONS.md` con decisiones iniciales documentadas

---

## Paso 2 — Terraform: Infraestructura como código

**Tiempo: ~3 horas | Día 1-2**

### 2.1 Por qué módulos + .tfvars y no workspaces

Con workspaces, un `terraform workspace select` incorrecto puede ejecutar
`apply` sobre el ambiente equivocado. Con directorios separados, cada ambiente
es explícito, independiente y su estado está aislado en su propio bucket GCS.
Esta decisión se documenta en `DECISIONS.md`.

### 2.2 Módulo Firebase (`terraform/modules/firebase/`)

**variables.tf**
```hcl
variable "project_id"    { type = string }
variable "site_id"       { type = string }
variable "region"        { type = string  default = "us-central1" }
variable "environment"   { type = string }
```

**main.tf**
```hcl
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Habilitar APIs necesarias
resource "google_project_service" "firebase" {
  project = var.project_id
  service = "firebase.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "hosting" {
  project = var.project_id
  service = "firebasehosting.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudfunctions" {
  project = var.project_id
  service = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firestore" {
  project = var.project_id
  service = "firestore.googleapis.com"
  disable_on_destroy = false
}

# Asociar proyecto GCP a Firebase
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id
  depends_on = [google_project_service.firebase]
}

# Registrar la Web App
resource "google_firebase_web_app" "default" {
  provider     = google-beta
  project      = var.project_id
  display_name = "ExpedienteCheck ${var.environment}"
  depends_on   = [google_firebase_project.default]
}

# Crear el sitio de Hosting
resource "google_firebase_hosting_site" "default" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.site_id
  depends_on = [google_firebase_project.default]
}

# Firestore (bonus — favoritos)
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = "nam5"
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.firestore]
}
```

**outputs.tf**
```hcl
output "hosting_url" {
  value = "https://${var.site_id}.web.app"
}

output "web_app_id" {
  value = google_firebase_web_app.default.app_id
}
```

### 2.3 Ambiente dev (`terraform/envs/dev/`)

**backend.tf**
```hcl
terraform {
  backend "gcs" {
    bucket = "TU_PROJECT_ID-terraform-state"
    prefix = "dev"
  }
}
```

**main.tf**
```hcl
provider "google"      { project = var.project_id  region = var.region }
provider "google-beta" { project = var.project_id  region = var.region }

variable "project_id" {}
variable "region"     { default = "us-central1" }

module "firebase" {
  source      = "../../modules/firebase"
  project_id  = var.project_id
  site_id     = "expedientecheck-dev"
  environment = "dev"
}

output "hosting_url" { value = module.firebase.hosting_url }
```

**terraform.tfvars**
```hcl
project_id = "TU_PROJECT_ID"
region     = "us-central1"
```

### 2.4 Ambiente prod (`terraform/envs/prod/`)

Idéntico a dev pero:
```hcl
# en main.tf del módulo:
site_id     = "expedientecheck-prod"
environment = "prod"

# backend.tf:
prefix = "prod"
```

### 2.5 Crear el bucket de estado antes del primer apply

```bash
# Solo una vez — prerequisito manual
gsutil mb -p TU_PROJECT_ID gs://TU_PROJECT_ID-terraform-state
gsutil versioning set on gs://TU_PROJECT_ID-terraform-state
```

### 2.6 Aplicar Terraform en dev

```bash
cd terraform/envs/dev
terraform init
terraform plan
terraform apply
```

> La infraestructura está creada. El contenido del sitio se despliega
> con Firebase CLI en el Paso 4 — son responsabilidades separadas.

### 2.7 Checklist paso 2

- [ ] Módulo Firebase creado con todos los recursos
- [ ] Ambientes dev y prod con main.tf, variables.tf, backend.tf
- [ ] Bucket GCS para estado creado manualmente
- [ ] `terraform apply` en dev ejecutado sin errores
- [ ] Output `hosting_url` visible (aunque el sitio aún esté vacío)

---

## Paso 3 — Frontend Vue 3: consumo de la API MEF

**Tiempo: ~3 horas | Día 2-3**

### 3.1 Scaffold

```bash
cd frontend
npm create vite@latest . -- --template vue
npm install
npm install pinia vue-router axios
npm install chart.js vue-chartjs   # para los gráficos
npm install -D vitest @vitest/ui   # tests
```

### 3.2 Variables de entorno

**.env.development**
```env
VITE_MEF_RESOURCE_ID=510bae6d-3d37-4fb2-af35-a40ce01715f4
VITE_MEF_API_BASE=/mef-api
VITE_USE_PROXY=true
```

**.env.production**
```env
VITE_MEF_RESOURCE_ID=510bae6d-3d37-4fb2-af35-a40ce01715f4
VITE_MEF_API_BASE=https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1
VITE_USE_PROXY=false
```

### 3.3 Proxy de desarrollo en Vite

**vite.config.js**
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/mef-api': {
        target: 'https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/mef-api/, '')
      }
    }
  }
})
```

### 3.4 Servicio de API MEF — el núcleo

**src/services/mef.js**
```javascript
const BASE = import.meta.env.VITE_MEF_API_BASE
const RESOURCE_ID = import.meta.env.VITE_MEF_RESOURCE_ID

// Función base con manejo de errores y timeout
async function fetchMEF(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`, window.location.origin)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v)
    }
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.result) throw new Error('API sin resultado')
    return data.result
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('La consulta tardó demasiado')
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ─── CONSULTAS PRINCIPALES ───────────────────────────────────

// Obtener registros filtrados (base para todas las vistas)
// fields: string con columnas separadas por coma
// filters: objeto { NIVEL_GOBIERNO: 'E' }
export async function getGastos({ nivelGobierno, fields, limit = 5000, offset = 0 } = {}) {
  const params = {
    resource_id: RESOURCE_ID,
    limit,
    offset,
    fields: fields || [
      'NIVEL_GOBIERNO',
      'NIVEL_GOBIERNO_NOMBRE',
      'SECTOR_NOMBRE',
      'DEPARTAMENTO_EJECUTORA_NOMBRE',
      'FUNCION_NOMBRE',
      'PIM_2025',
      'DEVENGADO_2025',
      'PIM_2024',
      'DEVENGADO_2024'
    ].join(',')
  }
  if (nivelGobierno) params.filters = { NIVEL_GOBIERNO: nivelGobierno }

  return fetchMEF('datastore_search', params)
}

// Para el explorador de tabla — paginado pequeño con filtros del usuario
export async function buscarGastos({ q, filters, limit = 50, offset = 0 }) {
  return fetchMEF('datastore_search', {
    resource_id: RESOURCE_ID,
    q,
    filters: filters ? JSON.stringify(filters) : undefined,
    limit,
    offset,
    fields: [
      'SECTOR_NOMBRE',
      'EJECUTORA_NOMBRE',
      'DEPARTAMENTO_EJECUTORA_NOMBRE',
      'FUNCION_NOMBRE',
      'FUENTE_FINANCIAMIENTO_NOMBRE',
      'PIM_2025',
      'DEVENGADO_2025'
    ].join(',')
  })
}

// SQL simple — solo WHERE + ORDER BY + LIMIT (sin agregaciones)
export async function querySQL(sql) {
  return fetchMEF('datastore_search_sql', { sql })
}

// Registros de un sector específico para detalle
export async function getGastosPorSector(sectorNombre, limit = 200) {
  return fetchMEF('datastore_search', {
    resource_id: RESOURCE_ID,
    filters: JSON.stringify({ SECTOR_NOMBRE: sectorNombre }),
    fields: 'EJECUTORA_NOMBRE,DEPARTAMENTO_EJECUTORA_NOMBRE,FUNCION_NOMBRE,PIM_2025,DEVENGADO_2025',
    limit
  })
}
```

### 3.5 Composable de agregaciones (reemplaza el GROUP BY del servidor)

**src/composables/useAggregations.js**
```javascript
// Agrupa un array de records por un campo y suma otro campo
export function groupAndSum(records, groupField, sumFields) {
  const map = new Map()

  for (const record of records) {
    const key = record[groupField] || 'Sin clasificar'
    if (!map.has(key)) {
      const entry = { [groupField]: key }
      sumFields.forEach(f => entry[f] = 0)
      map.set(key, entry)
    }
    const entry = map.get(key)
    sumFields.forEach(f => {
      entry[f] += parseFloat(record[f]) || 0
    })
  }

  return Array.from(map.values())
}

// Calcula % de ejecución
export function calcularEjecucion(devengado, pim) {
  if (!pim || pim === 0) return 0
  return Math.round((devengado / pim) * 100 * 10) / 10
}

// Formatea soles peruanos
export function formatSoles(valor) {
  if (!valor) return 'S/ 0'
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor)
}

// Top N registros de un array ordenado por campo
export function topN(arr, field, n = 10) {
  return [...arr].sort((a, b) => (b[field] || 0) - (a[field] || 0)).slice(0, n)
}
```

### 3.6 Pinia Store

**src/stores/gastos.js**
```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getGastos } from '../services/mef'
import { groupAndSum, topN } from '../composables/useAggregations'

export const useGastosStore = defineStore('gastos', () => {
  const records = ref([])
  const loading = ref(false)
  const error = ref(null)
  const nivelGobierno = ref('E')  // E=Nacional, R=Regional, M=Local
  const totalRegistros = ref(0)

  // Carga datos filtrados por nivel de gobierno
  async function cargar() {
    loading.value = true
    error.value = null
    try {
      const result = await getGastos({ nivelGobierno: nivelGobierno.value })
      records.value = result.records
      totalRegistros.value = result.total
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Agregaciones computadas en el cliente
  const porSector = computed(() =>
    topN(groupAndSum(records.value, 'SECTOR_NOMBRE', ['DEVENGADO_2025', 'PIM_2025']), 'DEVENGADO_2025', 10)
  )

  const porDepartamento = computed(() =>
    topN(groupAndSum(records.value, 'DEPARTAMENTO_EJECUTORA_NOMBRE', ['DEVENGADO_2025', 'PIM_2025']), 'DEVENGADO_2025', 25)
  )

  const totalDevengado = computed(() =>
    records.value.reduce((sum, r) => sum + (parseFloat(r.DEVENGADO_2025) || 0), 0)
  )

  const totalPim = computed(() =>
    records.value.reduce((sum, r) => sum + (parseFloat(r.PIM_2025) || 0), 0)
  )

  return {
    records, loading, error, nivelGobierno, totalRegistros,
    porSector, porDepartamento, totalDevengado, totalPim,
    cargar
  }
})
```

### 3.7 Vistas principales

**HomeView.vue** — Dashboard con KPIs y gráficos
```
- KpiCard: Total PIM 2025, Total Devengado 2025, % Ejecución
- Selector: Nivel de Gobierno (Nacional / Regional / Local)
- BarChart: Top 10 Sectores por Devengado
- BarChart: Top 10 Departamentos por Ejecución
- Estado loading: Skeleton cards mientras carga
- Estado error: Mensaje + botón Reintentar
```

**ExplorerView.vue** — Tabla navegable
```
- Input búsqueda (q= en la API)
- Filtros: Nivel Gobierno, Departamento
- Tabla paginada (50 por página, offset-based)
- Columnas: Sector, Ejecutora, Departamento, Función, PIM, Devengado
- Al hacer clic en una fila: panel lateral con detalle
```

**ComparativoView.vue** — Histórico 2022-2025
```
- Selector de Función
- LineChart: evolución del devengado 2022→2025
- Tabla: PIA, PIM, Devengado por año
```

### 3.8 Estados requeridos (obligatorios en el reto)

```vue
<!-- Patrón en cada vista -->
<template>
  <LoadingState v-if="store.loading" />
  <ErrorState v-else-if="store.error" :mensaje="store.error" @retry="store.cargar()" />
  <div v-else-if="store.records.length === 0">Sin resultados para este filtro.</div>
  <div v-else>
    <!-- contenido normal -->
  </div>
</template>
```

### 3.9 Checklist paso 3

- [ ] Scaffold Vue 3 + Vite creado
- [ ] `.env.development` y `.env.production` configurados
- [ ] Proxy de Vite configurado para desarrollo local
- [ ] `src/services/mef.js` con `getGastos()` y `buscarGastos()`
- [ ] `src/composables/useAggregations.js` con groupAndSum y formatSoles
- [ ] Pinia store con datos cargando correctamente
- [ ] HomeView con KPIs y al menos un gráfico
- [ ] ExplorerView con búsqueda + paginación funcionando
- [ ] Estado loading implementado (spinner o skeleton)
- [ ] Estado error implementado con botón retry
- [ ] Estado vacío implementado

---

## Paso 4 — Firebase Hosting: deploy

**Tiempo: ~1 hora | Día 3**

### 4.1 Inicializar Firebase CLI

```bash
firebase login
cd frontend
firebase init hosting
```

Respuestas al wizard:
```
? Which Firebase project? → seleccionar TU_PROJECT_ID
? What do you want to use as your public directory? → dist
? Configure as a single-page app? → Yes
? Set up automatic builds with GitHub? → No (lo haremos manual)
```

### 4.2 firebase.json

```json
{
  "hosting": {
    "site": "expedientecheck-dev",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [{ "key": "Cache-Control", "value": "max-age=31536000" }]
      }
    ]
  }
}
```

### 4.3 Primer deploy manual

```bash
npm run build
firebase deploy --only hosting:expedientecheck-dev
```

La URL pública será: `https://expedientecheck-dev.web.app`

### 4.4 Verificar en producción

- [ ] La app carga desde la URL pública
- [ ] Los datos del MEF aparecen (no hay error CORS en producción)
- [ ] Vue Router funciona (navegar a `/explorador` no da 404)
- [ ] Los filtros funcionan

> **Si hay CORS en producción:** activar la Cloud Function del Paso 5
> y cambiar `VITE_MEF_API_BASE` en `.env.production` a la URL de la función.

### 4.5 Checklist paso 4

- [ ] `firebase.json` creado con site ID correcto
- [ ] `npm run build` sin errores
- [ ] Deploy ejecutado: `firebase deploy --only hosting:expedientecheck-dev`
- [ ] URL pública accesible y funcionando
- [ ] Vue Router sin 404 en rutas directas

---

## Paso 5 — GitHub Actions: CI/CD (bonus)

**Tiempo: ~2 horas | Día 4**

### 5.1 Secrets necesarios en GitHub

Ir a repo → Settings → Secrets → New repository secret:

| Secret | Valor |
|--------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON del service account de Firebase |
| `GCP_PROJECT_ID` | Tu project ID |
| `MEF_RESOURCE_ID` | `510bae6d-3d37-4fb2-af35-a40ce01715f4` |

Obtener el service account JSON:
```bash
# En Google Cloud Console → IAM → Service Accounts
# Crear service account con rol: Firebase Hosting Admin
# Descargar la clave JSON → copiar contenido como secret
```

### 5.2 Workflow deploy a dev

**.github/workflows/deploy-dev.yml**
```yaml
name: Deploy to Dev

on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: frontend

      - name: Run tests
        run: npm run test:run
        working-directory: frontend

      - name: Build
        run: npm run build
        working-directory: frontend
        env:
          VITE_MEF_RESOURCE_ID: ${{ secrets.MEF_RESOURCE_ID }}
          VITE_MEF_API_BASE: https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1

      - name: Deploy to Firebase Dev
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: ${{ secrets.GCP_PROJECT_ID }}
          target: expedientecheck-dev
```

### 5.3 Workflow deploy a prod

**.github/workflows/deploy-prod.yml**
```yaml
name: Deploy to Prod

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: frontend
      - run: npm run test:run
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
        env:
          VITE_MEF_RESOURCE_ID: ${{ secrets.MEF_RESOURCE_ID }}
          VITE_MEF_API_BASE: https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: ${{ secrets.GCP_PROJECT_ID }}
          target: expedientecheck-prod
```

### 5.4 Tests básicos con Vitest

**frontend/src/services/mef.test.js**
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGastos } from './mef'

const mockRecords = [
  { SECTOR_NOMBRE: 'SALUD', DEVENGADO_2025: '1000000', PIM_2025: '1200000' },
  { SECTOR_NOMBRE: 'EDUCACION', DEVENGADO_2025: '800000', PIM_2025: '900000' }
]

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      result: { records: mockRecords, total: 2 }
    })
  })
})

describe('getGastos', () => {
  it('devuelve records y total', async () => {
    const result = await getGastos({ nivelGobierno: 'E' })
    expect(result.records).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('aplica filtro de nivel de gobierno', async () => {
    await getGastos({ nivelGobierno: 'R' })
    const url = global.fetch.mock.calls[0][0]
    expect(url).toContain('NIVEL_GOBIERNO')
  })
})
```

**frontend/src/composables/useAggregations.test.js**
```javascript
import { describe, it, expect } from 'vitest'
import { groupAndSum, calcularEjecucion, topN } from './useAggregations'

describe('groupAndSum', () => {
  it('agrupa y suma correctamente', () => {
    const records = [
      { SECTOR: 'A', DEVENGADO: '100' },
      { SECTOR: 'A', DEVENGADO: '200' },
      { SECTOR: 'B', DEVENGADO: '50' }
    ]
    const result = groupAndSum(records, 'SECTOR', ['DEVENGADO'])
    expect(result).toHaveLength(2)
    expect(result.find(r => r.SECTOR === 'A').DEVENGADO).toBe(300)
  })
})

describe('calcularEjecucion', () => {
  it('calcula porcentaje correctamente', () => {
    expect(calcularEjecucion(80, 100)).toBe(80)
    expect(calcularEjecucion(0, 100)).toBe(0)
    expect(calcularEjecucion(50, 0)).toBe(0)  // evita división por cero
  })
})
```

### 5.5 Checklist paso 5

- [ ] Secrets configurados en GitHub
- [ ] `deploy-dev.yml` funcionando — push a develop dispara deploy
- [ ] `deploy-prod.yml` funcionando — push a main dispara deploy
- [ ] Tests Vitest corriendo en el pipeline
- [ ] Badge de status en el README

---

## Paso 6 — Bonus: Cloud Function proxy + Firestore favoritos

**Tiempo: ~2 horas | Día 5-6**

### 6.1 Cloud Function proxy con caché

**functions/index.js**
```javascript
const functions = require('firebase-functions')
const fetch = require('node-fetch')

const MEF_BASE = 'https://api.datosabiertos.mef.gob.pe/DatosAbiertos/v1'
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000  // 5 minutos

exports.mefProxy = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET')
  if (req.method === 'OPTIONS') return res.status(204).send('')

  const { endpoint = 'datastore_search', ...params } = req.query
  const cacheKey = JSON.stringify({ endpoint, params })
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json({ ...cached.data, _cached: true, _age: Date.now() - cached.ts })
  }

  const url = new URL(`${MEF_BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  try {
    const upstream = await fetch(url.toString(), { timeout: 20000 })
    const data = await upstream.json()
    cache.set(cacheKey, { data, ts: Date.now() })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'Error consultando MEF', detail: err.message })
  }
})
```

**functions/package.json**
```json
{
  "name": "expedientecheck-functions",
  "main": "index.js",
  "dependencies": {
    "firebase-functions": "^4.0.0",
    "node-fetch": "^2.7.0"
  }
}
```

### 6.2 Firestore para favoritos

```javascript
// src/services/favoritos.js
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

// Inicializar con config de Firebase Web App (output de Terraform)
const app = initializeApp({
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // ... resto de config
})
const db = getFirestore(app)
const auth = getAuth(app)

export async function guardarFavorito(record) {
  const { user } = await signInAnonymously(auth)
  const ref = doc(db, `favorites/${user.uid}/gastos/${record.KEY_VALUE}`)
  await setDoc(ref, { ...record, savedAt: new Date() })
}

export async function eliminarFavorito(keyValue) {
  const { user } = await signInAnonymously(auth)
  await deleteDoc(doc(db, `favorites/${user.uid}/gastos/${keyValue}`))
}

export async function getFavoritos() {
  const { user } = await signInAnonymously(auth)
  const snap = await getDocs(collection(db, `favorites/${user.uid}/gastos`))
  return snap.docs.map(d => d.data())
}
```

### 6.3 Checklist paso 6

- [ ] Cloud Function deployada y accesible por URL pública
- [ ] Frontend puede alternar entre API directa y Cloud Function
- [ ] Caché de la función funciona (segunda llamada es más rápida)
- [ ] Firestore: botón de favorito en el ExplorerView
- [ ] Favoritos persisten entre recargas de página

---

## Paso 7 — README y entregables finales

**Tiempo: ~2 horas | Día 6-7**

### 7.1 Estructura del README.md

```markdown
# ExpedienteCheck — Consulta Amigable de Gasto Público MEF

> Dashboard interactivo para explorar la ejecución presupuestal
> del Estado Peruano 2022-2026.

🌐 **Demo:** https://expedientecheck-dev.web.app

## Stack
- Vue 3 + Vite + Pinia
- Firebase Hosting
- Terraform (google-beta provider)
- GitHub Actions CI/CD

## Dataset
Comparativo de Gastos 2022-2026 — Portal Datos Abiertos MEF
8,002,563 registros | Resource ID: 510bae6d-...

## Cómo correr localmente
\`\`\`bash
git clone https://github.com/TU_USUARIO/expedientecheck-reto
cd expedientecheck-reto/frontend
npm install
npm run dev
\`\`\`

## Cómo aplicar Terraform
\`\`\`bash
# Prerequisitos: proyecto GCP creado, gcloud autenticado
cd terraform/envs/dev
terraform init
terraform plan
terraform apply
# Luego deployar contenido:
cd ../../frontend && npm run build
firebase deploy --only hosting:expedientecheck-dev
\`\`\`

## Decisiones técnicas
Ver [DECISIONS.md](./DECISIONS.md)

## Qué no alcancé a hacer y cómo lo resolvería
[Completar honestamente — ver nota abajo]
```

### 7.2 El párrafo de "qué no alcancé"

Este párrafo es evaluado. La diferencia entre un candidato promedio y uno que destaca:

❌ **Malo:** "No alcancé a hacer los tests completos por falta de tiempo."

✅ **Bueno:** "No implementé caché persistente con Firestore para las respuestas de la API. Lo resolvería almacenando el resultado de cada combinación de filtros como documento en Firestore con un campo `expiresAt`, y verificando en la Cloud Function si el documento existe y es vigente antes de llamar al MEF. Esto reduciría las llamadas al API externo de ~100/día a ~10/día para los filtros más usados."

### 7.3 Checklist final

- [ ] README completo con instrucciones para correr localmente
- [ ] README con instrucciones para aplicar Terraform paso a paso
- [ ] DECISIONS.md completo con todas las decisiones tomadas
- [ ] URL pública del ambiente dev funcionando
- [ ] Diagrama de arquitectura en `/docs/arquitectura.png`
- [ ] Párrafo "qué no alcancé" redactado con criterio técnico
- [ ] Repositorio Git limpio (commits descriptivos, sin archivos basura)
- [ ] Todos los bonus implementados están documentados en el README

---

## Resumen de tiempos

| Paso | Contenido | Tiempo |
|------|-----------|--------|
| 1 | Setup + decisiones + verificar API MEF | 2h |
| 2 | Terraform módulos + ambientes dev/prod | 3h |
| 3 | Vue 3 + servicios + agregaciones + vistas | 3h |
| 4 | Firebase Hosting + primer deploy | 1h |
| 5 | GitHub Actions + Vitest | 2h |
| 6 | Cloud Function proxy + Firestore (bonus) | 2h |
| 7 | README + DECISIONS.md + polish final | 2h |
| **Total** | | **~15h** |

---

## Constraint crítico a documentar en DECISIONS.md

```markdown
## Limitación descubierta: API MEF no soporta agregaciones SQL

Al implementar las consultas, descubrí que el endpoint
datastore_search_sql del MEF retorna error 42883 al usar
SUM(), GROUP BY, COUNT() u otras funciones de agregación.

El wrapper es Perl custom (no PostgreSQL puro), con LIMIT 32000
impuesto por el servidor.

**Solución adoptada:** toda la agregación se realiza en el
cliente con JavaScript (Array.reduce + Map). Para conjuntos
de datos grandes, se limita el fetch a 5000 registros por
consulta aplicando filtros estrictos de NIVEL_GOBIERNO antes
de agregar, lo que mantiene tiempos de respuesta aceptables.

Esta limitación y su solución están documentadas como parte
del aprendizaje del reto.
```

Documentar esto en el DECISIONS.md es un **diferenciador enorme** —
muestra que investigaste la API real, encontraste un constraint no documentado
y lo resolviste con criterio técnico.
