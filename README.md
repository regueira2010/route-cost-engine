# Calculadora de Desplazamientos

Módulo de cálculo de costos de traslado automovilístico con trazado de rutas viales y desglose financiero en pesos chilenos (CLP).

## Reglas de Negocio

- **Tarifa Base**: $9.500 CLP.
- **Precio Bencina**: $1.420 CLP/L.
- **Rendimiento**: 10 km/L.
- **Factor de Desgaste**: 50% sobre el gasto de combustible (0.50).
- **Distancia**: Ida y vuelta predeterminada ($2 \times \text{ida}$).
- **Fórmula**:
  $$\text{Costo} = \text{Tarifa Base} + \left( \text{Distancia Total} \times \frac{\text{Precio}}{\text{Rendimiento}} \times (1 + \text{Factor}) \right)$$
- **Regla de Piso**: Si el costo calculado es inferior a la Tarifa Base ($9.500 CLP), se aplica este valor como importe mínimo.

## Stack

- Node.js >= 18
- React 18 + Vite 5
- OpenStreetMap (Nominatim + OSRM) / Google Maps Distance Matrix API

## Arquitectura

```
Cliente (React SPA) ──> API REST / Middleware ──> Orquestador ──┬──> Motor de Mapas (OSRM / Google Maps)
                                                               └──> Motor de Costos (Fórmula + Piso)
```

## Instalación y Ejecución

```bash
npm install
```

```bash
# Desarrollo frontend con API integrada
npm run dev

# Servidor API backend independiente (puerto 3001)
npm run server

# Pruebas unitarias y de integración
npm test

# Build de producción
npm run build
```

## Variables de Entorno

Archivo opcional `.env`:

```env
PORT=3001
GOOGLE_MAPS_API_KEY=tu_api_key_opcional
```

Si no se define `GOOGLE_MAPS_API_KEY`, el servicio utiliza OpenStreetMap / OSRM sin requerir credenciales.

## API Endpoints

### POST `/api/desplazamiento`

Calcula el trayecto real entre dos puntos y devuelve el desglose de costos.

```bash
curl -X POST http://localhost:3001/api/desplazamiento \
  -H "Content-Type: application/json" \
  -d '{
    "origen": "Santiago Centro",
    "destino": "Providencia",
    "esIdaYVuelta": true
  }'
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "trayecto": {
    "origenSolicitado": "Santiago Centro",
    "destinoSolicitado": "Providencia",
    "origenNormalizado": "Santiago Centro, Región Metropolitana, Chile",
    "destinoNormalizado": "Providencia, Región Metropolitana, Chile",
    "distanciaIdaKm": 7.83,
    "distanciaTotalKm": 15.66,
    "esIdaYVuelta": true,
    "duracionEstimadaTotalMinutos": 26,
    "proveedorMapa": "OpenStreetMap / OSRM Driving Engine"
  },
  "parametros": {
    "precioBencina": 1420,
    "rendimientoKmPorLitro": 10,
    "factorDesgaste": 0.5,
    "tarifaBase": 9500
  },
  "desglose": {
    "litrosConsumidos": 1.566,
    "costoCombustible": 2224,
    "costoDesgaste": 1112,
    "subtotalVariable": 3336,
    "tarifaBase": 9500,
    "costoCalculado": 12836,
    "aplicoPisoMinimo": false,
    "costoTotal": 12836
  },
  "formateado": {
    "litrosConsumidos": "1.566 L",
    "costoCombustible": "$2.224",
    "costoDesgaste": "$1.112",
    "subtotalVariable": "$3.336",
    "tarifaBase": "$9.500",
    "costoTotal": "$12.836"
  },
  "moneda": "CLP"
}
```

### POST `/api/calcular-km`

Cálculo directo indicando kilometraje sin consulta de mapas.

```bash
curl -X POST http://localhost:3001/api/calcular-km \
  -H "Content-Type: application/json" \
  -d '{
    "distanciaKm": 10,
    "esIdaYVuelta": true
  }'
```

### GET `/api/config`

Devuelve los valores predeterminados del motor de costos.

```bash
curl http://localhost:3001/api/config
```

### GET `/api/health`

```bash
curl http://localhost:3001/api/health
```

## Estructura del Código

```
├── server/
│   └── index.js                 # Servidor HTTP nativo y endpoints REST
├── src/
│   ├── services/
│   │   ├── costEngine.js        # Motor de costos y regla de piso
│   │   ├── mapService.js        # Integración con OSRM y Google Maps
│   │   └── displacementService.js # Orquestador de rutas y presupuesto
│   ├── App.jsx                  # UI en React
│   └── App.css                  # Estilos
├── tests/
│   ├── costEngine.test.js       # Pruebas unitarias de cálculo
│   └── endpoint.test.js         # Pruebas de integración HTTP
└── vite.config.js               # Configuración de Vite con plugin API
```
