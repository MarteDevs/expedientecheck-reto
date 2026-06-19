# ============================================================================
# Configuración de proveedores de Terraform
# ============================================================================
# Este archivo define el proveedor google-beta, necesario para todos los
# recursos de Firebase. Se utiliza backend local para almacenar el estado
# de Terraform en el disco del equipo.
# ============================================================================

terraform {
  # Versión mínima requerida de Terraform
  required_version = ">= 1.7.0"

  required_providers {
    # Proveedor google-beta: obligatorio para recursos de Firebase
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }

  # Backend local: el estado se almacena en el directorio actual
  # Para entornos compartidos, considerar migrar a GCS o Terraform Cloud
  backend "local" {}
}

# Configuración del proveedor google-beta
# user_project_override = true permite que las cuotas de API se facturen
# al proyecto especificado en cada recurso, no al proyecto por defecto
provider "google-beta" {
  user_project_override = true
}
