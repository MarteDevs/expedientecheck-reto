# ============================================================================
# Módulo: Firebase Hosting para ExpedienteCheck
# ============================================================================
# Este módulo aprovisiona la infraestructura completa de Firebase Hosting:
#
#   1. Habilita Firebase en el proyecto de GCP
#   2. Registra una aplicación web en Firebase
#   3. Crea un sitio de Hosting con el site_id proporcionado
#   4. Crea una versión inicial con configuración SPA (Single Page Application)
#   5. Publica la versión inicial como release activo
#
# Todos los recursos usan el proveedor google-beta, obligatorio para Firebase.
# ============================================================================

# ----------------------------------------------------------------------------
# 1. Habilitar Firebase en el proyecto de GCP
# ----------------------------------------------------------------------------
# Este recurso vincula el proyecto de GCP con Firebase. Es un prerrequisito
# para cualquier otro recurso de Firebase (apps, hosting, etc.)
# ----------------------------------------------------------------------------
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id
}

# ----------------------------------------------------------------------------
# 2. Registrar la aplicación web en Firebase
# ----------------------------------------------------------------------------
# Crea una aplicación web dentro del proyecto de Firebase. Esto genera
# las credenciales de configuración (apiKey, authDomain, etc.) que la
# aplicación frontend necesita para conectarse con Firebase.
# ----------------------------------------------------------------------------
resource "google_firebase_web_app" "default" {
  provider = google-beta
  project  = var.project_id

  # Nombre descriptivo que aparece en la consola de Firebase
  display_name = "ExpedienteCheck (${var.environment})"

  # La aplicación web solo puede crearse después de habilitar Firebase
  depends_on = [google_firebase_project.default]
}

# ----------------------------------------------------------------------------
# 3. Crear el sitio de Firebase Hosting
# ----------------------------------------------------------------------------
# El sitio de Hosting es el contenedor donde se despliega la aplicación web.
# El site_id determina la URL pública: https://<site_id>.web.app
# ----------------------------------------------------------------------------
resource "google_firebase_hosting_site" "default" {
  provider = google-beta
  project  = var.project_id

  # Identificador del sitio, visible en la URL pública
  site_id = var.site_id

  # Nombre legible del sitio que aparece en la consola de Firebase
  app_id = google_firebase_web_app.default.app_id

  depends_on = [google_firebase_web_app.default]
}

# ----------------------------------------------------------------------------
# 4. Crear la versión inicial con configuración SPA
# ----------------------------------------------------------------------------
# La versión define la configuración de hosting. Para una SPA (Single Page
# Application) como ExpedienteCheck, necesitamos una regla de reescritura
# (rewrite) que redirija todas las rutas a /index.html, permitiendo que
# el enrutador del lado del cliente maneje la navegación.
# ----------------------------------------------------------------------------
resource "google_firebase_hosting_version" "default" {
  provider = google-beta

  # Referencia al sitio donde se crea esta versión
  site_id = google_firebase_hosting_site.default.site_id

  config {
    # Regla de reescritura para SPA: cualquier ruta ('**') sirve /index.html
    # Esto es esencial para que frameworks como React, Vue o Angular
    # manejen correctamente las rutas del lado del cliente
    rewrites {
      glob = "**"
      path = "/index.html"
    }
  }
}

# ----------------------------------------------------------------------------
# 5. Publicar la versión como release activo
# ----------------------------------------------------------------------------
# Un release vincula una versión específica con el sitio de Hosting,
# haciéndola accesible públicamente. Sin este recurso, la versión
# existiría pero no sería visible en la URL del sitio.
# ----------------------------------------------------------------------------
resource "google_firebase_hosting_release" "default" {
  provider = google-beta

  # Referencia al sitio donde se publica el release
  site_id = google_firebase_hosting_site.default.site_id

  # Referencia a la versión que se publica
  version_name = google_firebase_hosting_version.default.name

  # Mensaje descriptivo para identificar el release en la consola
  message = "Release inicial gestionado por Terraform - ${var.environment}"
}
