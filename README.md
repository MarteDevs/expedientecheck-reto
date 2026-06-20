# 📊 ExpedienteCheck — Reto Técnico Finalistas

> Mini-producto funcional que consume la API pública de Datos Abiertos del MEF para visualizar datos de **Ejecución Presupuestal** del Perú. Desplegado en Firebase (Hosting y Cloud Functions), con caché en Firestore e infraestructura aprovisionada vía Terraform.

---

## 🌐 Enlaces

| Ambiente | URL |
|----------|-----|
| **Desarrollo (DEV)** | [https://expedientecheck-dev-123.web.app](https://expedientecheck-dev-123.web.app) |
| **Producción (PROD)** | *(Automatizado vía GitHub Actions al crear release tags)* |

---

## 🏗️ Arquitectura y Flujos Inteligentes (NUEVO)

Ante la inestabilidad de la API gubernamental del MEF (CKAN) que maneja más de **11 millones de registros**, implementamos una arquitectura resiliente y **Flujos de Consulta Inteligentes (Smart Routing)**:

1. **Proxy + Caché Híbrida (Firestore & Cloud Functions):**
   Las consultas del Frontend no van directo al MEF (para evitar errores CORS y proteger al cliente de timeouts). Pasan por un Cloud Function (`mefProxy`) que revisa si la consulta exacta (vía Hash SHA-256) ya existe en Firestore. Si existe, la sirve en milisegundos. Si no, va al MEF, la guarda y responde. **Esto evita que la app colapse cuando el gobierno se cae.**

2. **Smart Routing (SQL vs. Estándar):**
   - **Búsqueda Libre:** Usa el endpoint `datastore_search` (aprovechando el índice ultra-rápido `_full_text` del MEF).
   - **Filtros por Categoría (Dropdowns):** Usa `datastore_search_sql` con la cláusula `LIKE` para eludir conflictos severos (error `409`) que da el API al concatenar múltiples filtros estrictos.

3. **Valores Estáticos de Arranque (Fallbacks):**
   Para evitar saturar la base de datos con peticiones `SELECT DISTINCT` gigantescas que bloquean la renderización inicial, los dropdowns se nutren de listas estáticas previamente mapeadas en el código.

**Nota sobre los entornos (Proxy vs Rewrite):** En el entorno local (desarrollo), `Vite` hace de proxy para la ruta `/api/mef` apuntando directo al Emulador o API externa. En Producción, `firebase.json` tiene una regla de `rewrite` para que cualquier solicitud a `/api/mef/**` sea redirigida internamente a la Cloud Function `mefProxy`.

*(Para más detalle sobre las decisiones técnicas, consulta el archivo [DECISIONS.md](DECISIONS.md) y el diagrama en [docs/arquitectura.md](docs/arquitectura.md))*

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Frontend** | Vite + Vanilla JS | Bundler rápido, sin overhead de frameworks pesados (React/Vue). Demuestra dominio sólido del DOM. |
| **Estilos** | CSS Custom Properties | Design system (Glassmorphism, Dark Theme) sin dependencias externas. |
| **Backend / Proxy** | Node.js + Firebase Cloud Functions | Previene CORS y encapsula la lógica de la caché SHA-256. |
| **Base de Datos** | Firebase Firestore | Actúa como Memoria Caché persistente para las respuestas del MEF. |
| **API Externa** | Datos Abiertos MEF (CKAN) | Fuente de verdad de la Ejecución Presupuestal 2024. |
| **Infraestructura** | Terraform | Infraestructura como Código (IaC). Separa de forma replicable DEV y PROD. |
| **CI/CD** | GitHub Actions | Ejecuta tests y sube el despliegue al hacer push a la rama `main`. |
| **Testing** | Vitest | Framework de pruebas ultrarrápido para validar el cliente HTTP (`mefClient`). |

---

## 📁 Estructura del Proyecto

```text
expedientecheck-reto/
├── frontend/                          # Capa de Presentación
│   ├── index.html                     # HTML principal
│   ├── vite.config.js                 # Configuración de empaquetado
│   ├── src/
│   │   ├── main.js                    # Entry point y Smart Router
│   │   ├── api/mefClient.js           # Constructor de queries e integrador con caché
│   │   ├── components/                # Componentes Vanilla JS (Modal, DataTable, SearchBar)
│   │   ├── utils/formatter.js         # Formateo monetario
│   │   └── styles/index.css           # Design System
│   └── tests/mefClient.test.js        # Pruebas Unitarias
│
├── functions/                         # Capa Intermedia (Backend)
│   ├── index.js                       # Cloud Function (mefProxy)
│   └── package.json
│
├── terraform/                         # Infraestructura como Código
│   ├── main.tf                        # Aprovisionamiento de GCP y Firebase
│   └── environments/                  # Variables para Dev y Prod
│
├── docs/                              # Documentación adicional
│   └── arquitectura.md                # Gráficos de Mermaid
│
├── .github/workflows/deploy.yml       # Integración Continua (CI/CD)
├── firebase.json                      # Reglas de Hosting (Headers de caché), Funciones y Firestore
└── firestore.rules                    # Reglas de seguridad
```

---

## 🚀 Cómo Correr Localmente

### Prerrequisitos
- **Node.js** >= 18
- **npm** >= 9
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Terraform** >= 1.7
- **Google Cloud SDK (gcloud CLI)**

### 1. Configuración de GCP y Terraform
Para que Terraform pueda aprovisionar los recursos, debes configurar tus credenciales de Google Cloud:

```bash
# Inicia sesión en Google Cloud
gcloud auth application-default login

# Crea un nuevo proyecto (si no tienes uno)
gcloud projects create expedientecheck-dev-123 --name="ExpedienteCheck Dev"

# Vincula una cuenta de facturación a tu proyecto (requerido para Firebase Blaze)
gcloud beta billing projects link expedientecheck-dev-123 --billing-account=XXXXX-XXXXX-XXXXX

# Despliega la infraestructura base
cd terraform
terraform init
terraform apply
```
*Nota: Al finalizar `terraform apply`, obtendrás un output llamado `hosting_url`. Esa es la URL en vivo de tu aplicación.*

### Pasos

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPO>
cd expedientecheck-reto

# 2. Instalar dependencias del Frontend
cd frontend
npm install

# 3. Copiar las variables de entorno
cd frontend
cp .env.example .env.local

# 4. Instalar dependencias de las Funciones (Backend Proxy)
cd ../functions
npm install
cd ..

# 4. Iniciar todo usando el Emulador de Firebase + Vite
# En la raíz del proyecto, abrimos una terminal para el Backend:
firebase emulators:start

# En otra terminal, iniciamos el Frontend:
cd frontend
npm run dev
```

---

## 🔄 Flujo CI/CD (GitHub Actions)

El proyecto incluye un flujo completamente automatizado en `.github/workflows/deploy.yml`.

1. Cuando el desarrollador hace un `git push` a `main` o crea un *tag*.
2. El servidor de GitHub ejecuta `npm run test` (Vitest) para asegurar la integridad de la lógica de negocio.
3. Si todo está en verde, inyecta las credenciales seguras (Secrets) y hace un `firebase deploy --force` automático hacia el ambiente respectivo.

---

## ⚡ Qué no alcancé a hacer y cómo lo resolvería con más tiempo

Aunque el proyecto cumple con creces los objetivos y los bonus, con más tiempo implementaría lo siguiente:
1. **Precarga en Segundo Plano (Prefetching):** Al cargar la primera página, usaría un Web Worker o un fetch silencioso para traer la página 2 (`offset=20`) antes de que el usuario haga scroll, mejorando la percepción de velocidad a 0ms.
2. **Dashboard Gráfico con Chart.js/D3:** Transformar los datos crudos en gráficos de barras para comparar la ejecución presupuestal entre ministerios de forma más visual.
3. **Invalidación de Caché (TTL):** Actualmente la caché en Firestore guarda las consultas de manera persistente. Le agregaría un campo `timestamp` en Firestore y una regla en la Cloud Function para que, si el caché tiene más de 24 horas, vuelva a consultar al MEF para asegurar que los datos estén frescos.

---

## ⚡ Conclusión del Reto
Se ha logrado un sistema *End-to-End* funcional. En lugar de un simple listado con filtros, se orquestó un ecosistema productivo real donde la **Infraestructura se declara como código (Terraform)**, los **despliegues son automáticos (GitHub Actions)**, el **frontend es extremadamente ligero (Vanilla+Vite)**, y la intermitencia del servidor gubernamental se soluciona de forma elegante mediante **Proxies y Cachés (Cloud Functions+Firestore)**.
