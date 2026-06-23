# Documentación Técnica: Módulo de Business Intelligence (BI) y Analítica

Este documento explica en profundidad el funcionamiento del **Dashboard Analítico** (Business Intelligence) del frontend de **ExpedienteCheck**, detallando los cálculos matemáticos, la lógica de agregación de datos por SQL, la integración con Chart.js y consideraciones técnicas del diseño.

---

## 📊 Arquitectura del Módulo de BI

El área de analítica está diseñada para digerir y simplificar grandes cantidades de información del MEF (millones de registros), transformándolas en métricas procesables para la toma de decisiones.

```
                  ┌──────────────────────────────────────────────┐
                  │                 mefClient.js                 │
                  │  Dispara 2 consultas SQL en paralelo al BFF   │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
            1. sqlDevengado      │                │ 2. sqlPimPia
    (Con filtro de mes)          │                │ (Sin filtro de mes)
    Calcula: Cert, Comp, Dev, Gir│                │ Calcula: PIA y PIM globales
                                 ▼                ▼
                  ┌──────────────────────────────────────────────┐
                  │             AnalyticsDashboard.js            │
                  │   Recibe la data y procesa los indicadores   │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
             A. Cálculos de KPIs │                │ B. Gráficos Interactivos
             - Semáforo de Gasto │                │  - Tendencia Real vs Ideal
             - Velocidad y Cierre│                │  - Embudo de Gasto (Phases)
                                 ▼                ▼
                  ┌──────────────────────────────────────────────┐
                  │                 VISTA / UI                   │
                  │    Renderizado dinámico + Manejo de Errores  │
                  └──────────────────────────────────────────────┘
```

### 1. El Truco del SQL Paralelo: `fetchGlobalStats`
Uno de los puntos con mayor criterio técnico se encuentra en la forma en que solicitamos los datos en [mefClient.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/api/mefClient.js#L273-L356):
* **El Problema:** La base de datos del MEF registra el presupuesto inicial (**PIA**) y el modificado (**PIM**) de forma anual, asociándolos por defecto al mes cero (`MES_EJE = 0`). Si el usuario filtra la vista por "Junio" (`MES_EJE = 6`), y sumamos los montos directamente, la PIA y el PIM retornarían en **cero**, rompiendo todos los cálculos de avance presupuestal.
* **La Solución:** `fetchGlobalStats` divide la consulta en dos promesas ejecutadas en paralelo (`Promise.all`):
  1. `sqlDevengado`: Suma la ejecución real (Certificado, Comprometido, Devengado y Girado) aplicando **todos** los filtros (incluyendo el mes).
  2. `sqlPimPia`: Suma los totales anuales de PIA y PIM **excluyendo** la restricción de mes para obtener los presupuestos reales de la entidad.

### 2. Caché Híbrida Inteligente para Métricas de BI
* **El Problema:** Cada vez que el usuario cambia entre las pestañas "Datos" y "Análisis BI" o repite la aplicación de los mismos filtros, el sistema realizaba consultas de agregación SQL pesadas a la base de datos a través de Cloud Functions, generando latencia repetitiva y sobrecarga.
* **La Solución:** Integramos un sistema de caché en memoria del cliente en [mefClient.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/api/mefClient.js). Al igual que se hace con las consultas a la tabla principal, el frontend hashea la estructura de filtros de BI y almacena el resultado acumulado. Si el usuario re-ingresa a la sección o cambia de pestaña sin alterar los filtros, las estadísticas se sirven instantáneamente de la caché local en menos de 1ms, optimizando recursos y evitando llamadas de red innecesarias.

---

## 📈 Métricas y Visualizaciones Explicadas a Detalle

El dashboard está compuesto por cuatro componentes visuales de **Chart.js** y un semáforo de KPIs.

### 1. Semáforo Presupuestal (KPIs de Eficiencia)
Aplica reglas lógicas de negocio público sobre tres indicadores:
* **Procesos de Compra (Certificado vs Comprometido):** `Ratio = (Comprometido / Certificado) * 100`
  * *Rojo (< 50%):* Alerta que hay dinero reservado para compras (certificado) pero los contratos aún no se firman (demoras en la contratación pública).
* **Capacidad de Pago (Comprometido vs Devengado):** `Ratio = (Devengado / Comprometido) * 100`
  * *Rojo (< 50%):* Alerta que los contratos están firmados, pero no se están pagando a tiempo (retraso en la entrega de bienes o conformidades).
* **Avance Real vs PIM (Eficiencia Global):** `Ratio = (Devengado / PIM) * 100`
  * Mide el porcentaje real del presupuesto ejecutado frente al dinero total modificado disponible.

### 2. Tendencia de Ejecución vs Ideal (Line Chart)
* **Real Acumulado:** Suma mes a mes el devengado para mostrar la curva acumulativa del gasto.
* **Línea Ideal:** Dibuja una línea de crecimiento constante (lineal) que asume un gasto uniforme del 8.33% mensual (`100% / 12`).
* **Utilidad:** Permite ver a simple vista si la entidad está gastando por debajo de lo planificado (línea real por debajo de la punteada) o si concentra todo el gasto en diciembre (el clásico "gasto de fin de año" del sector público).

### 3. Embudo de Ejecución (Bar Chart - Funnel)
Muestra visualmente la pérdida o flujo del presupuesto a través de las 5 fases oficiales de la contabilidad gubernamental en Perú:
1. **PIM:** Dinero máximo asignado para gastar.
2. **Certificación:** Dinero reservado para un proceso de adquisición.
3. **Compromiso:** Contrato firmado (dinero comprometido con un proveedor).
4. **Devengado:** Servicio recibido y aprobado para pago (gasto ejecutado en libros).
5. **Girado:** Dinero transferido a la cuenta del proveedor (pagado).

### 4. Clasificación y Top 5 (Doughnut & Horizontal Bars)
* **Clasificación del Gasto (Doughnut):** Agrupa el devengado por la partida `GENERICA_NOMBRE` (ej. Personal, Bienes y Servicios, Adquisición de Activos) para identificar en qué gasta el presupuesto la entidad. Toma el Top 5 de partidas y agrupa el resto bajo "Otros Gastos".
* **Top 5 Proyectos / Actividades (Horizontal Bar):** Lista los 5 proyectos de inversión (`PRODUCTO_PROYECTO_NOMBRE`) con mayor gasto devengado para fiscalizar las obras principales del sector.

### 5. Proyección de Cierre de Año
Calcula de manera algorítmica la proyección de gasto al finalizar el año fiscal:
1. Identifica el mes más avanzado con datos ejecutados (`M_max`).
2. Calcula la velocidad mensual promedio de gasto: 
   `Promedio Mensual = Devengado Total / M_max`
3. Proyecta a 12 meses: 
   `Proyección = Promedio Mensual * 12`
4. Convierte a porcentaje frente al PIM: 
   `% Proyección Cierre = (Proyección / PIM) * 100`

---

## 🛡️ Tolerancia a Fallos y Botón de Reintento

Dado que el servidor de datos abiertos del MEF puede experimentar alta latencia o devolver errores HTTP 503 temporales, implementamos un mecanismo robusto de tolerancia a fallos:
1. **Propagación del Error:** El cliente [mefClient.js](file:///d:/Data-Analytic-Proyect/expedientecheck-reto/frontend/src/api/mefClient.js) detecta respuestas fallidas o con formato de error (HTML en lugar de JSON) y lanza una excepción limpia.
2. **Interfaz de Estado de Error:** En lugar de mostrar valores vacíos de `S/ 0` que confundan al usuario, el componente intercepta el error y renderiza una tarjeta de advertencia estilizada con el mensaje detallado del servidor.
3. **Botón de Reintento ("Reintentar análisis"):** Permite al usuario volver a disparar la consulta de análisis de forma reactiva sin necesidad de recargar la página completa, mejorando significativamente la UX del sistema en situaciones de inestabilidad externa.


