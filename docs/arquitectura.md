# Arquitectura y Diseño Técnico de ExpedienteCheck

Este documento detalla la arquitectura de software, infraestructura y flujos de datos diseñados para la aplicación ExpedienteCheck. El diseño está pensado para soportar el alto volumen de datos del MEF (más de 11 millones de registros) garantizando estabilidad, rapidez y escalabilidad.

---

## 1. Diagrama de Arquitectura General

El siguiente diagrama muestra los componentes principales del sistema y cómo interactúan desde que un usuario accede hasta que la infraestructura es provisionada.

```mermaid
graph LR
    %% Usuarios y Clientes
    Usuario((Usuario Final))
    
    %% Nivel Frontend (Firebase Hosting)
    subgraph Frontend [Capa de Presentacion]
        Vite[Vite y Vanilla JS]
        Router[Enrutador Inteligente]
    end

    %% Nivel Proxy (Firebase Cloud Functions)
    subgraph Backend [Capa Intermedia]
        BFF(Cloud Function Proxy)
        FirestoreDB[(Firestore Cache)]
    end

    %% Nivel Externo
    subgraph Externa [Proveedor Externo]
        MEFAPI[API Datos Abiertos MEF]
    end

    %% Relaciones
    Usuario -->|Interactua| Vite
    Vite -->|Peticion HTTP| Router
    Router -->|Peticiones a la API| BFF
    BFF -->|1 Verifica Hash| FirestoreDB
    FirestoreDB -->|2 Retorna Cache| BFF
    BFF -->|3 Cache Miss| MEFAPI
    MEFAPI -.->|Respuesta HTTP| BFF
    BFF -.->|4 Guarda data| FirestoreDB
    
    classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:white;
    classDef backend fill:#f59e0b,stroke:#b45309,color:white;
    classDef external fill:#10b981,stroke:#047857,color:white;
    
    class Vite,Router frontend;
    class BFF,FirestoreDB backend;
    class MEFAPI external;
```

### 1.1 Diagrama de Infraestructura y DevOps

Este diagrama muestra cómo se aprovisionan los componentes y cómo se despliega el código de manera automatizada.

```mermaid
graph TD
    %% Infraestructura y CI/CD
    subgraph DevOps [Aprovisionamiento y CI CD]
        TF{Terraform}
        GH[GitHub Actions]
    end

    %% Componentes Reales
    subgraph Cloud [GCP y Firebase]
        Hosting[Firebase Hosting]
        CloudFunc(Cloud Function Proxy)
        DB[(Firestore Database)]
    end

    %% Relaciones
    TF -->|1 Aprovisiona Base de Datos| DB
    TF -->|2 Habilita API y Servicios| CloudFunc
    TF -->|3 Crea Web App| Hosting
    GH -.->|Ejecuta Pruebas Unitarias| Hosting
    GH -->|Despliega Codigo| CloudFunc
    GH -->|Despliega Assets Estaticos| Hosting
    
    classDef devops fill:#6366f1,stroke:#4338ca,color:white;
    classDef cloud fill:#64748b,stroke:#475569,color:white;
    
    class TF,GH devops;
    class Hosting,CloudFunc,DB cloud;
```

---

## 2. Flujo de Comunicación (Sequence Diagram)

Aquí se grafica exactamente qué ocurre paso a paso cuando un usuario hace una búsqueda o usa los filtros, y cómo la Caché nos salva de los errores del MEF.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant FE as Frontend JS
    participant CF as Cloud Function Proxy
    participant FS as Firestore Cache
    participant MEF as API del MEF
    
    U->>FE: Ingresa filtros y hace clic en Buscar
    Note over FE: El Enrutador decide<br/>Filtros datastore search sql
    
    FE->>CF: GET /api/mef/datastore_search_sql
    
    Note over CF: Genera SHA256 de la URL
    
    CF->>FS: Existe este Hash en cache?
    
    alt Cache Hit (Datos ya consultados)
        FS-->>CF: Si, aqui esta la data
        CF-->>FE: HTTP 200 Datos del Cache
        FE-->>U: Muestra tabla al instante
    else Cache Miss (Busqueda Nueva)
        FS-->>CF: No existe
        
        loop Reintentos con Backoff
            CF->>MEF: GET /v1/datastore_search_sql
            alt MEF responde correctamente
                MEF-->>CF: HTTP 200 Datos masivos
                Note over CF: Termina el loop con exito
            else MEF falla 503 o Timeout
                Note over CF: Espera y reintenta
            end
        end
        
        alt Consulta exitosa en algun intento
            CF->>FS: Guarda la data bajo el Hash
            CF-->>FE: HTTP 200 Datos frescos
            FE-->>U: Muestra tabla
        else Todos los intentos fallan
            CF-->>FE: HTTP 503 Error
            Note over FE: Manejo de errores interactivo
            FE-->>U: Pantalla UI Error al cargar datos
        end
    end
```

---

## 3. Decisiones Arquitectónicas (A Detalle)

### A. Capa de Presentación (Vanilla JS + Vite)
- **Decisión:** Usar Vanilla JS estructurado en lugar de frameworks pesados (React/Vue).
- **Por qué:** Cumple con la necesidad de demostrar fundamentos limpios. Permite máxima ligereza en la carga inicial y demuestra sólidas bases algorítmicas para manipular el DOM directamente.
- **Técnicas aplicadas:**
  - *Debouncing* para no saturar el servidor al teclear.
  - Fallbacks (Valores estáticos en código) para poblar los selects, evitando colapsos del servidor MEF al solicitar listas únicas (`SELECT DISTINCT`) de tablas con millones de registros.

### B. Enrutador Inteligente (Smart Fetching)
- **Problema:** El API CKAN del MEF penaliza consultas pesadas. Múltiples filtros en el endpoint estándar devolvían `409 Conflict` o Timeout.
- **Solución:**
  - Si hay texto libre -> Endpoint `datastore_search` (usa el índice ultra rápido `_full_text` del motor PostgreSQL del MEF).
  - Si hay filtros condicionales -> Endpoint `datastore_search_sql` con operador `LIKE` para simular búsquedas menos estrictas y eludir los bloqueos internos de CKAN.

### C. Proxy, Resiliencia & Caché Híbrida (Firestore + Cloud Functions + RAM Client)
- **Problema:** Los navegadores bloquean peticiones directas de otro dominio por seguridad (Error CORS). Además, el API MEF es altamente inestable (503s frecuentes) y lenta.
- **Solución:** 
  1. La **Cloud Function** actúa como puente de backend para evitar los bloqueos CORS del navegador y expone endpoints filtrados por seguridad.
  2. **Estrategia de Reintentos (Backend):** Implementamos un wrapper de reintentos automáticos con backoff exponencial. Si el MEF lanza un 503, la Cloud Function reintenta silenciosamente hasta 3 veces antes de fallar.
  3. **Caché en Base de Datos (Nivel 2):** Implementamos una base de datos **Firestore** como capa intermedia de caché en el servidor. Cada URL se cifra en un Hash SHA-256, almacenando el resultado por 24 horas.
  4. **Caché en Memoria (Nivel 1):** El frontend implementa un mapa en memoria RAM local para almacenar tanto los resultados de la tabla como los cálculos consolidados del Dashboard de BI, reduciendo las llamadas de red redundantes en <1ms al cambiar de pestaña.
  5. **Evasión de AdBlockers:** Excluimos el uso del SDK de Firestore para el flujo de caché en el cliente (que suele ser bloqueado por AdBlockers), delegando esa comunicación a través del canal HTTP seguro de la Cloud Function.

### D. Automatización e Infraestructura (Terraform + GitHub Actions)
- **Terraform (IaC):** Toda la infraestructura en Google Cloud (APIs, cuentas de servicio) se declaró como código (`.tf`). Esto permite destruir y reconstruir un clon exacto de los servidores en segundos, separando entornos de `DEV` y `PROD`.
- **GitHub Actions (CI/CD):** Configuramos un flujo (`deploy.yml`) de integración continua. Cada vez que el desarrollador hace un `git push`, un servidor en la nube de GitHub clona el proyecto, instala Node, corre las pruebas automatizadas de Vite (`npm run test`), y solo si son exitosas, inyecta credenciales seguras (GitHub Secrets) para aprovisionarlo automáticamente a los servidores mundiales de Firebase.
