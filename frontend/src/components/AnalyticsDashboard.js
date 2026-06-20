import Chart from 'chart.js/auto';
import { formatCurrency, formatCompactCurrency } from '../utils/formatter.js';
import { fetchMefData, fetchGlobalStats, RESOURCE_IDS } from '../api/mefClient.js';
import html2pdf from 'html2pdf.js';

let chartTrend = null;
let chartDonut = null;
let chartFunnel = null;
let chartProjects = null;

export async function renderAnalyticsDashboard(container, options = {}) {
  const { filters, searchQuery, projectPIM, projectPIA } = options;

  // Construir texto de filtros activos
  const activeFiltersStr = Object.entries(filters || {})
    .filter(([_, val]) => val !== '')
    .map(([key, val]) => `${key.replace('_NOMBRE', '')}: ${val}`)
    .join(' | ');
    
  const filterSubtitle = searchQuery 
    ? `Búsqueda: "${searchQuery}" ${activeFiltersStr ? '| ' + activeFiltersStr : ''}` 
    : (activeFiltersStr || 'Todos los registros (Sin filtros)');

  container.innerHTML = `
    <div class="analytics-dashboard">
      <div class="analytics-header" style="align-items: flex-start; flex-direction: column; gap: 0.5rem;">
        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
          <h2>Dashboard Analítico</h2>
          <div class="analytics-actions">
            <button id="btn-export-pdf" class="btn-export" style="display: none;">
              <span>🖨️</span> Exportar PDF
            </button>
          </div>
        </div>
        <p style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
          <span>🔍 Analizando:</span> <strong>${filterSubtitle}</strong>
        </p>
      </div>
      
      <div id="analytics-content" style="grid-column: span 12;">
        <div class="loading-spinner"></div>
        <p style="text-align: center; color: var(--color-text-muted); margin-top: var(--space-2)">
          Procesando datos para análisis avanzado...
        </p>
      </div>
    </div>
  `;

  try {
      // 1. Obtener todos los registros posibles para el análisis (limit alto)
      const hasQuery = Boolean(searchQuery && searchQuery.trim());
      const hasActiveFilters = Object.values(filters || {}).some(val => val !== '');
      const useSql = !hasQuery && hasActiveFilters;

      // Determinar el resourceId en base al año seleccionado
      let resourceId = RESOURCE_IDS.GASTO_2026;
      if (filters && filters.ANO_EJE && RESOURCE_IDS[`GASTO_${filters.ANO_EJE}`]) {
        resourceId = RESOURCE_IDS[`GASTO_${filters.ANO_EJE}`];
      }

      const [result, globalStats] = await Promise.all([
        fetchMefData({
          resourceId,
          limit: 1000, // Traer suficientes registros para el gráfico
          offset: 0,
          query: searchQuery,
          filters: filters,
          useSql,
        }),
        fetchGlobalStats({
          resourceId,
          query: searchQuery,
          filters: filters,
        })
      ]);

      const records = result.records;
      
      // Si no hay datos, mostrar estado vacío
      if (records.length === 0) {
        document.getElementById('analytics-content').innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">📊</div>
            <p class="empty-state__text">No se encontraron registros para analizar con los filtros actuales.</p>
          </div>
        `;
        return;
      }

      // Mostrar botones de exportación
      document.getElementById('btn-export-pdf').style.display = 'flex';

      // Procesar datos para KPIs
      const kpiData = calculateKPIs(records, globalStats);
      
      // Renderizar la vista
      document.getElementById('analytics-content').innerHTML = `
        <div class="analytics-dashboard" style="display: contents;">
          <!-- Resumen Financiero Global -->
          <div class="analytics-module module-summary" style="grid-column: span 12; background: transparent; border: none; padding: 0; box-shadow: none;">
            <h3 class="analytics-module__title" style="margin-bottom: var(--space-4);">💰 Resumen Financiero Global</h3>
            <div class="stats-bar" style="margin-bottom: 0;">
              <div class="stat-card">
                <div class="stat-card__label">PIA Total</div>
                <div class="stat-card__value">${formatCompactCurrency(globalStats.totalPIA || 0)}</div>
                <div class="stat-card__trend">Presupuesto Institucional de Apertura</div>
              </div>
              <div class="stat-card">
                <div class="stat-card__label">PIM Total</div>
                <div class="stat-card__value">${formatCompactCurrency(globalStats.totalPIM || 0)}</div>
                <div class="stat-card__trend">Presupuesto Institucional Modificado</div>
              </div>
              <div class="stat-card">
                <div class="stat-card__label">Devengado Total</div>
                <div class="stat-card__value">${formatCompactCurrency(globalStats.totalDevengado || 0)}</div>
                <div class="stat-card__trend">Ejecución Presupuestal Actual</div>
              </div>
            </div>
          </div>

          <!-- Semáforo de KPIs -->
          <div class="analytics-module module-kpis">
            <h3 class="analytics-module__title">🚦 Semáforo Presupuestal</h3>
            <div class="kpi-grid">
              ${renderKPICards(kpiData)}
            </div>
          </div>

          <!-- Tendencia Mensual -->
          <div class="analytics-module module-trend">
            <h3 class="analytics-module__title">📈 Tendencia de Ejecución vs Ideal</h3>
            <div style="position: relative; height: 350px; width: 100%;">
              <canvas id="chart-trend"></canvas>
            </div>
          </div>

          <!-- Embudo de Fases -->
          <div class="analytics-module module-funnel">
            <h3 class="analytics-module__title">🔻 Embudo de Ejecución</h3>
            <div style="position: relative; height: 350px; width: 100%;">
              <canvas id="chart-funnel"></canvas>
            </div>
          </div>

          <!-- Top 5 Proyectos -->
          <div class="analytics-module module-projects">
            <h3 class="analytics-module__title">🏗️ Top 5 Proyectos / Actividades</h3>
            <div style="position: relative; height: 350px; width: 100%;">
              <canvas id="chart-projects"></canvas>
            </div>
          </div>

          <!-- Clasificación de Gasto -->
          <div class="analytics-module module-donut">
            <h3 class="analytics-module__title">🍩 Clasificación del Gasto (Genérica)</h3>
            <div style="position: relative; height: 350px; width: 100%;">
              <canvas id="chart-donut"></canvas>
            </div>
          </div>

          <!-- Proyección -->
          <div class="analytics-module projection-card">
            <h3 style="font-size: var(--font-size-md); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Proyección de Cierre de Año</h3>
            <div class="projection-card__value">${kpiData.projectionPct.toFixed(1)}%</div>
            <p class="projection-card__subtitle">A este ritmo de gasto mensual, la entidad ejecutará el <strong>${kpiData.projectionPct.toFixed(1)}%</strong> de su Presupuesto Institucional Modificado (PIM) al finalizar el año.</p>
          </div>
        </div>
      `;

      // Inicializar Gráficos
      initCharts(records, globalStats);

      // Event Listeners para exportar
      document.getElementById('btn-export-pdf').onclick = exportToPDF;

    } catch (error) {
      document.getElementById('analytics-content').innerHTML = `
        <div class="error-state" style="grid-column: span 12; text-align: center; padding: 2rem;">
          <h3 style="color: var(--color-danger); margin-bottom: 1rem;">Error al analizar</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
}

function calculateKPIs(records, globalStats) {
  // Identificar el último mes con gasto para la proyección
  const monthlyRecords = records.filter(r => parseInt(r.MES_EJE) !== 0);
  const executionRecords = monthlyRecords.length > 0 ? monthlyRecords : records;

  let maxMonth = 0;
  executionRecords.forEach(r => {
    const mes = parseInt(r.MES_EJE);
    if (mes > maxMonth) maxMonth = mes;
  });

  const { totalPIM, totalCertificado, totalComprometido, totalDevengado } = globalStats;
  
  // Velocidad de gasto mensual
  const avgMonthlyDevengado = maxMonth > 0 ? (totalDevengado / maxMonth) : 0;
  const projectedEndYear = avgMonthlyDevengado * 12;
  const projectionPct = totalPIM > 0 ? (projectedEndYear / totalPIM) * 100 : 0;

  return {
    certificado: totalCertificado,
    comprometido: totalComprometido,
    devengado: totalDevengado,
    projectPIM: totalPIM,
    projectionPct: Math.min(projectionPct, 100) // Capped a 100%
  };
}

function renderKPICards(kpi) {
  // Lógica del semáforo
  // 1. Dinero Trabado: Certificado alto pero poco comprometido
  const pctComprometido = kpi.certificado > 0 ? (kpi.comprometido / kpi.certificado) * 100 : 0;
  const trabadoStatus = pctComprometido < 50 ? 'danger' : (pctComprometido < 80 ? 'warning' : 'success');
  
  // 2. Capacidad de Pago: Comprometido vs Devengado
  const pctDevengado = kpi.comprometido > 0 ? (kpi.devengado / kpi.comprometido) * 100 : 0;
  const pagoStatus = pctDevengado < 50 ? 'danger' : (pctDevengado < 80 ? 'warning' : 'success');

  // 3. Eficiencia: Devengado vs PIM
  const pctEficiencia = kpi.projectPIM > 0 ? (kpi.devengado / kpi.projectPIM) * 100 : 0;
  const eficienciaStatus = pctEficiencia < 30 ? 'danger' : (pctEficiencia < 60 ? 'warning' : 'success');

  return `
    <div class="kpi-card kpi-card--${trabadoStatus}">
      <div class="kpi-card__header">
        <span class="kpi-card__title">Procesos de Compra</span>
        <span class="kpi-card__icon">${trabadoStatus === 'danger' ? '🔴' : (trabadoStatus === 'warning' ? '🟡' : '🟢')}</span>
      </div>
      <div class="kpi-card__value">${pctComprometido.toFixed(1)}%</div>
      <div class="kpi-card__desc">Del certificado fue comprometido. ${trabadoStatus === 'danger' ? 'Dinero "trabado" en procesos lentos.' : 'Buen ritmo de contratación.'}</div>
    </div>

    <div class="kpi-card kpi-card--${pagoStatus}">
      <div class="kpi-card__header">
        <span class="kpi-card__title">Capacidad de Pago</span>
        <span class="kpi-card__icon">${pagoStatus === 'danger' ? '🔴' : (pagoStatus === 'warning' ? '🟡' : '🟢')}</span>
      </div>
      <div class="kpi-card__value">${pctDevengado.toFixed(1)}%</div>
      <div class="kpi-card__desc">Del comprometido fue devengado. ${pagoStatus === 'danger' ? 'Contratos firmados pero demoran en pagarse.' : 'Cadena de pago saludable.'}</div>
    </div>

    <div class="kpi-card kpi-card--${eficienciaStatus}">
      <div class="kpi-card__header">
        <span class="kpi-card__title">Avance Real vs PIM</span>
        <span class="kpi-card__icon">${eficienciaStatus === 'danger' ? '🔴' : (eficienciaStatus === 'warning' ? '🟡' : '🟢')}</span>
      </div>
      <div class="kpi-card__value">${pctEficiencia.toFixed(1)}%</div>
      <div class="kpi-card__desc">Ejecución del presupuesto modificado total.</div>
    </div>
  `;
}

function initCharts(records, globalStats) {
  // Limpiar gráficos anteriores si existen
  if (chartTrend) chartTrend.destroy();
  if (chartDonut) chartDonut.destroy();
  if (chartFunnel) chartFunnel.destroy();
  if (chartProjects) chartProjects.destroy();

  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // --- Gráfico de Tendencia Mensual ---
  const monthlyRecords = records.filter(r => parseInt(r.MES_EJE) > 0 && parseInt(r.MES_EJE) <= 12);
  const executionRecords = monthlyRecords.length > 0 ? monthlyRecords : records;
  
  // Agrupar por mes
  const devengadoPorMes = Array(12).fill(0);
  monthlyRecords.forEach(r => {
    const mesIdx = parseInt(r.MES_EJE) - 1;
    devengadoPorMes[mesIdx] += parseFloat(r.MONTO_DEVENGADO) || 0;
  });

  // Acumulado
  const acumuladoReal = [];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += devengadoPorMes[i];
    acumuladoReal.push(sum);
  }

  const projectPIM = globalStats.totalPIM || 0;
  
  // Línea ideal (distribución lineal del PIM)
  const acumuladoIdeal = [];
  for (let i = 1; i <= 12; i++) {
    acumuladoIdeal.push((projectPIM / 12) * i);
  }

  const ctxTrend = document.getElementById('chart-trend');
  chartTrend = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
      datasets: [
        {
          label: 'Ejecución Real (Acumulada)',
          data: acumuladoReal,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 3
        },
        {
          label: 'Ejecución Ideal (8.33% mensual)',
          data: acumuladoIdeal,
          borderColor: '#94a3b8',
          borderDash: [5, 5],
          fill: false,
          tension: 0,
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': S/ ' + formatCompactCurrency(context.parsed.y).replace('S/ ', '');
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCompactCurrency(value).replace('S/ ', '');
            }
          }
        }
      }
    }
  });

  // --- Gráfico de Donut (Clasificación por Genérica) ---
  const genericaAgrupado = {};
  monthlyRecords.forEach(r => {
    const generica = r.GENERICA_NOMBRE || 'Sin Especificar';
    const monto = parseFloat(r.MONTO_DEVENGADO) || 0;
    if (monto > 0) {
      if (!genericaAgrupado[generica]) genericaAgrupado[generica] = 0;
      genericaAgrupado[generica] += monto;
    }
  });

  // Ordenar de mayor a menor y tomar los Top 5, agrupar el resto en "Otros"
  const sortedGenericas = Object.entries(genericaAgrupado)
    .sort((a, b) => b[1] - a[1]);
  
  const topGenericas = sortedGenericas.slice(0, 5);
  const others = sortedGenericas.slice(5).reduce((acc, curr) => acc + curr[1], 0);
  
  if (others > 0) {
    topGenericas.push(['OTROS GASTOS', others]);
  }

  const ctxDonut = document.getElementById('chart-donut');
  chartDonut = new Chart(ctxDonut, {
    type: 'doughnut',
    data: {
      labels: topGenericas.map(item => item[0]),
      datasets: [{
        data: topGenericas.map(item => item[1]),
        backgroundColor: [
          '#6366f1', // Indigo
          '#ec4899', // Pink
          '#14b8a6', // Teal
          '#f59e0b', // Amber
          '#8b5cf6', // Violet
          '#64748b'  // Slate
        ],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 15,
            font: { size: 11 },
            color: '#e2e8f0'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const val = context.raw;
              const pct = ((val / total) * 100).toFixed(1);
              return ` ${pct}% (S/ ${formatCompactCurrency(val).replace('S/ ', '')})`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });

  // --- Gráfico de Embudo (Fases del Gasto) ---
  const ctxFunnel = document.getElementById('chart-funnel');
  
  const sumPIM = globalStats.totalPIM || 0;
  const sumCert = globalStats.totalCertificado || 0;
  const sumComp = globalStats.totalComprometido || 0;
  const sumDev = globalStats.totalDevengado || 0;
  const sumGir = globalStats.totalGirado || 0;

  chartFunnel = new Chart(ctxFunnel, {
    type: 'bar',
    data: {
      labels: ['PIM', 'Cert', 'Comprom', 'Deveng', 'Girado'],
      datasets: [{
        label: 'Monto (S/)',
        data: [sumPIM, sumCert, sumComp, sumDev, sumGir],
        backgroundColor: [
          'rgba(148, 163, 184, 0.5)', // PIM (Gris)
          'rgba(99, 102, 241, 0.8)',  // Certificado (Indigo)
          'rgba(20, 184, 166, 0.8)',  // Comprometido (Teal)
          'rgba(245, 158, 11, 0.8)',  // Devengado (Amber)
          'rgba(16, 185, 129, 0.8)'   // Girado (Emerald)
        ],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return 'S/ ' + formatCompactCurrency(context.raw).replace('S/ ', '');
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCompactCurrency(value).replace('S/ ', '');
            }
          }
        }
      }
    }
  });

  // --- Top 5 Proyectos/Actividades ---
  const proyectosAgrupado = {};
  executionRecords.forEach(r => {
    const proyecto = r.PRODUCTO_PROYECTO_NOMBRE || r.ACTIVIDAD_ACCION_OBRA_NOMBRE || 'Sin Especificar';
    const monto = parseFloat(r.MONTO_DEVENGADO) || 0;
    if (monto > 0) {
      if (!proyectosAgrupado[proyecto]) proyectosAgrupado[proyecto] = 0;
      proyectosAgrupado[proyecto] += monto;
    }
  });

  const sortedProyectos = Object.entries(proyectosAgrupado)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const ctxProjects = document.getElementById('chart-projects');
  chartProjects = new Chart(ctxProjects, {
    type: 'bar',
    data: {
      labels: sortedProyectos.map(item => {
        // Truncar nombres muy largos
        const name = item[0];
        return name.length > 25 ? name.substring(0, 25) + '...' : name;
      }),
      datasets: [{
        label: 'Devengado (S/)',
        data: sortedProyectos.map(item => item[1]),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', // Hace que las barras sean horizontales
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return 'S/ ' + formatCompactCurrency(context.raw).replace('S/ ', '');
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCompactCurrency(value).replace('S/ ', '');
            }
          }
        }
      }
    }
  });
}

function exportToPDF() {
  const element = document.getElementById('analytics-content');
  const opt = {
    margin:       [10, 10, 10, 10], // top, left, bottom, right
    filename:     'expedientecheck_analisis.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  
  html2pdf().set(opt).from(element).save();
}
