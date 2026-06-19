# ============================================================================
# Configuración principal de ExpedienteCheck - Firebase Hosting
# ============================================================================
# Este archivo activa las APIs necesarias en el proyecto de GCP y luego
# invoca el módulo de Firebase Hosting para aprovisionar todos los recursos.
#
# Uso:
#   terraform init
#   terraform apply -var-file=environments/dev.tfvars
#   terraform apply -var-file=environments/prod.tfvars
# ============================================================================

# ----------------------------------------------------------------------------
# Activación de APIs requeridas
# ----------------------------------------------------------------------------
# Estas APIs deben estar habilitadas antes de crear cualquier recurso de
# Firebase. disable_on_destroy = false evita que se desactiven al destruir
# la infraestructura, lo cual podría afectar otros servicios del proyecto.
# ----------------------------------------------------------------------------

# API principal de Firebase: necesaria para habilitar Firebase en el proyecto
resource "google_project_service" "firebase_api" {
  provider = google-beta
  project  = var.project_id
  service  = "firebase.googleapis.com"

  # No desactivar la API al hacer terraform destroy
  disable_on_destroy = false
}

# API de Firestore: necesaria para crear bases de datos Firestore
resource "google_project_service" "firestore_api" {
  provider = google-beta
  project  = var.project_id
  service  = "firestore.googleapis.com"

  # No desactivar la API al hacer terraform destroy
  disable_on_destroy = false
}

# Base de datos Firestore en modo Nativo
resource "google_firestore_database" "firestore_db" {
  provider        = google-beta
  project         = var.project_id
  name            = "(default)"
  location_id     = var.region
  type            = "FIRESTORE_NATIVE"
  deletion_policy = "DELETE"

  depends_on = [google_project_service.firestore_api]
}

# API de Firebase Hosting: necesaria para crear sitios y desplegar contenido
resource "google_project_service" "firebase_hosting_api" {
  provider = google-beta
  project  = var.project_id
  service  = "firebasehosting.googleapis.com"

  # No desactivar la API al hacer terraform destroy
  disable_on_destroy = false

  # La API de Hosting depende de que Firebase esté habilitado primero
  depends_on = [google_project_service.firebase_api]
}

# ----------------------------------------------------------------------------
# Módulo de Firebase Hosting
# ----------------------------------------------------------------------------
# Este módulo encapsula todos los recursos de Firebase Hosting:
# proyecto, aplicación web, sitio, versión inicial y release.
# Se invoca después de que ambas APIs estén activas.
# ----------------------------------------------------------------------------
module "firebase_hosting" {
  source = "./modules/firebase-hosting"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  site_id     = var.site_id

  # Asegurar que las APIs estén habilitadas antes de crear los recursos
  depends_on = [
    google_project_service.firebase_api,
    google_project_service.firebase_hosting_api,
    google_project_service.firestore_api,
  ]
}
