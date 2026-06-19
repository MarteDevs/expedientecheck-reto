# ============================================================================
# Variables de entrada del proyecto ExpedienteCheck
# ============================================================================
# Estas variables se proporcionan mediante archivos .tfvars ubicados en
# el directorio environments/. Permiten reutilizar la misma configuración
# para los entornos de desarrollo (dev) y producción (prod).
# ============================================================================

variable "project_id" {
  description = "Identificador único del proyecto en Google Cloud Platform"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "El project_id debe tener entre 6 y 30 caracteres, comenzar con letra minúscula y contener solo letras minúsculas, números y guiones."
  }
}

variable "environment" {
  description = "Entorno de despliegue: dev para desarrollo, prod para producción"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "El entorno debe ser 'dev' o 'prod'."
  }
}

variable "region" {
  description = "Región de Google Cloud donde se aprovisionan los recursos"
  type        = string
  default     = "us-central1"
}

variable "site_id" {
  description = "Identificador del sitio de Firebase Hosting (aparece en la URL: <site_id>.web.app)"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,48}[a-z0-9]$", var.site_id))
    error_message = "El site_id debe contener solo letras minúsculas, números y guiones, y tener entre 4 y 50 caracteres."
  }
}
