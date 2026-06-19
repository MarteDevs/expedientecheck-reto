# ============================================================================
# Salidas (outputs) del proyecto ExpedienteCheck
# ============================================================================
# Estos valores se muestran al final de cada terraform apply y pueden
# ser consumidos por otros módulos o scripts de CI/CD.
# ============================================================================

output "hosting_url" {
  description = "URL pública del sitio de Firebase Hosting"
  value       = module.firebase_hosting.hosting_url
}

output "site_id" {
  description = "Identificador del sitio de Firebase Hosting"
  value       = var.site_id
}

output "project_id" {
  description = "Identificador del proyecto de Google Cloud Platform"
  value       = var.project_id
}
