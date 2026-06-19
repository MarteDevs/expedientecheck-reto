# ============================================================================
# Variables del módulo Firebase Hosting
# ============================================================================
# Estas variables son recibidas desde la configuración raíz (main.tf).
# Permiten parametrizar el módulo para diferentes entornos.
# ============================================================================

variable "project_id" {
  description = "Identificador del proyecto en Google Cloud Platform"
  type        = string
}

variable "environment" {
  description = "Entorno de despliegue (dev o prod)"
  type        = string
}

variable "region" {
  description = "Región de Google Cloud para los recursos"
  type        = string
}

variable "site_id" {
  description = "Identificador del sitio de Firebase Hosting (define la URL pública)"
  type        = string
}
