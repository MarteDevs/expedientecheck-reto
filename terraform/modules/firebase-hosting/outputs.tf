# ============================================================================
# Salidas del módulo Firebase Hosting
# ============================================================================
# Estos valores se exponen a la configuración raíz para ser consumidos
# como outputs globales o por otros módulos.
# ============================================================================

output "hosting_url" {
  description = "URL pública del sitio de Firebase Hosting (formato: https://<site_id>.web.app)"
  value       = "https://${google_firebase_hosting_site.default.site_id}.web.app"
}

output "web_app_id" {
  description = "Identificador de la aplicación web registrada en Firebase"
  value       = google_firebase_web_app.default.app_id
}
