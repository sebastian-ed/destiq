# DestIQ para Hermes y otros agentes

Esta integración es **solo de lectura**. No cambia la interfaz, no cambia el panel admin y no agrega botones al sitio público.

DestIQ ya usa Supabase. Las tablas `destinations`, `indicators` y `data_points` tienen lectura pública mediante RLS, mientras que las operaciones de escritura continúan reservadas a usuarios autenticados. La integración aprovecha esa lectura estructurada.

## Opción A — usar la API REST directamente

Base:

`https://ozjgsfojqvtcnrtfhorr.supabase.co/rest/v1`

Header:

`apikey: sb_publishable_Laor_XKXrXTUJqlXnBK8fg_PCmx6-AH`

Ejemplo PowerShell:

```powershell
$headers = @{ apikey = "sb_publishable_Laor_XKXrXTUJqlXnBK8fg_PCmx6-AH" }
Invoke-RestMethod `
  -Uri "https://ozjgsfojqvtcnrtfhorr.supabase.co/rest/v1/destinations?select=*&order=sort_order.asc,name.asc" `
  -Headers $headers
```

Ejemplo para un indicador concreto:

```powershell
$headers = @{ apikey = "sb_publishable_Laor_XKXrXTUJqlXnBK8fg_PCmx6-AH" }
$indicatorId = "PEGAR_UUID"
Invoke-RestMethod `
  -Uri "https://ozjgsfojqvtcnrtfhorr.supabase.co/rest/v1/data_points?select=*&indicator_id=eq.$indicatorId&order=year.asc,month.asc" `
  -Headers $headers
```

También quedan publicados `llms.txt`, `agent-api.json` y `openapi.yaml` al subir este proyecto a GitHub Pages.

## Opción B — Hermes con MCP (recomendada)

Hermes soporta servidores MCP por `stdio`. El servidor incluido ofrece herramientas semánticas para listar destinos, buscar indicadores, leer series completas y comparar métricas.

### 1. Descomprimir el proyecto

Ejemplo:

`C:\Users\TU_USUARIO\Documents\DestIQ`

### 2. Instalar el paquete MCP

Abrí PowerShell en la carpeta `agent` y ejecutá:

```powershell
python -m pip install -r requirements.txt
```

Si `python` no responde, probá:

```powershell
py -m pip install -r requirements.txt
```

### 3. Probar el cliente sin Hermes

```powershell
python destiq_cli.py destinations
python destiq_cli.py search "viajeros"
python destiq_cli.py catalog
```

Para una serie:

```powershell
python destiq_cli.py series --metric-key viajeros --destination "NOMBRE DEL DESTINO"
```

Para comparar destinos:

```powershell
python destiq_cli.py compare viajeros --year 2025
```

### 4. Agregar DestIQ a Hermes

Abrí:

`%USERPROFILE%\.hermes\config.yaml`

Agregá el bloque de `hermes-config-example.yaml` y reemplazá la ruta por la ruta real de `mcp_server.py`.

Ejemplo:

```yaml
mcp_servers:
  destiq:
    command: "python"
    args:
      - "C:/Users/TU_USUARIO/Documents/DestIQ/agent/mcp_server.py"
    enabled: true
    timeout: 120
    connect_timeout: 60
```

Si tu configuración ya tiene `mcp_servers:`, no dupliques esa línea: agregá solamente la entrada `destiq:` debajo.

### 5. Reiniciar/releer MCP en Hermes

Reiniciá Hermes o ejecutá dentro de Hermes:

`/reload-mcp`

Hermes registrará las herramientas del servidor con el prefijo correspondiente al servidor MCP.

### 6. Pedir análisis en lenguaje natural

Ejemplos:

- `Usá DestIQ y compará viajeros entre todos los destinos para 2025.`
- `Analizá la evolución de ocupación hotelera de Bariloche entre 2019 y 2025 y marcá cambios de tendencia.`
- `Buscá todos los indicadores relacionados con plazas y explicame cuáles son comparables entre destinos.`
- `Tomá todos los indicadores de Mar del Plata y armá un diagnóstico de 10 hallazgos, diferenciando niveles, variaciones y datos provisorios.`

## Herramientas MCP incluidas

- `list_destinations`
- `get_catalog`
- `search_indicators`
- `list_indicators`
- `get_indicator_series`
- `get_destination_dataset`
- `compare_metric`

`get_indicator_series` y `compare_metric` respetan la regla anual configurada en DestIQ, incluyendo `ratio_of_sums`. Esto evita errores como sumar porcentajes cuando la metodología exige recalcular numerador/denominador.

## Opción C — cualquier otra IA

Hay tres caminos:

1. Si acepta OpenAPI: cargar `openapi.yaml` y configurar la API key como header `apikey`.
2. Si puede navegar URLs: darle `https://sebastian-ed.github.io/destiq/llms.txt`.
3. Si soporta MCP: usar `agent/mcp_server.py` de la misma forma que Hermes.

## Seguridad

La clave incluida es **publishable**, la misma que ya está en `js/config.js` y llega al navegador. No es una service-role/secret key. El esquema actual aplica RLS: lectura pública y escritura solo para usuarios autenticados.

Si en el futuro querés que ciertos datos dejen de ser públicos, hay que cambiar las políticas RLS y no alcanza con ocultar la clave del frontend.
