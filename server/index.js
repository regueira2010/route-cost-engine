import http from 'node:http';
import { URL } from 'node:url';
import { calcularPresupuestoDesplazamiento, DEFAULT_CONFIG } from '../src/services/displacementService.js';
import { calcularCostoDesplazamiento } from '../src/services/costEngine.js';

const PORT = process.env.PORT || 3001;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50 KB límite anti-DoS
const MAX_TEXT_LENGTH = 200;        // Límite de caracteres para origen/destino

/**
 * Parsea el cuerpo JSON de una petición HTTP con control estricto de tamaño.
 */
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_PAYLOAD_BYTES) {
        req.destroy();
        const err = new Error('Cuerpo de la solicitud excede el límite permitido (413)');
        err.statusCode = 413;
        return reject(err);
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        const err = new Error('El cuerpo de la solicitud no es un JSON válido');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', err => reject(err));
  });
}

/**
 * Envía una respuesta HTTP con cabeceras de seguridad y tipo JSON.
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Manejador principal de las solicitudes de la API.
 */
export async function handleApiRequest(req, res) {
  // Manejo de preflight CORS OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end();
    return true;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // 1. Endpoint Healthcheck
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'Módulo de Cálculo de Desplazamientos',
      version: '1.0.0',
      uptime: process.uptime(),
    });
    return true;
  }

  // 2. Endpoint Configuración por defecto
  if (pathname === '/api/config' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      defaults: DEFAULT_CONFIG,
      moneda: 'CLP',
      reglas: {
        formula: 'Costo = Tarifa Base + (Distancia Total * (Precio / Rendimiento) * (1 + Factor))',
        reglaPiso: 'Importe mínimo garantizado igual a Tarifa Base ($9.500 CLP)',
        trayectoPorDefecto: 'Ida y Vuelta (Distancia * 2)',
      },
    });
    return true;
  }

  // 3. Endpoint Cálculo manual directo por kilómetros
  if (pathname === '/api/calcular-km' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      let params = {};
      if (req.method === 'POST') {
        params = await parseRequestBody(req);
      } else {
        params = {
          distanciaKm: reqUrl.searchParams.get('distanciaKm'),
          esIdaYVuelta: reqUrl.searchParams.get('esIdaYVuelta') !== 'false',
        };
      }

      if (params.distanciaKm === undefined || params.distanciaKm === null || params.distanciaKm === '') {
        sendJson(res, 400, {
          success: false,
          error: 'El parámetro "distanciaKm" es obligatorio.',
        });
        return true;
      }

      const km = Number(params.distanciaKm);
      if (!Number.isFinite(km) || km < 0 || km > 50000) {
        sendJson(res, 400, {
          success: false,
          error: 'El parámetro "distanciaKm" debe ser un número finito entre 0 y 50.000.',
        });
        return true;
      }

      const resultado = calcularCostoDesplazamiento({
        distanciaKm: km,
        esIdaYVuelta: params.esIdaYVuelta !== false,
        config: params.config || {},
      });

      sendJson(res, 200, {
        success: true,
        ...resultado,
      });
      return true;
    } catch (err) {
      sendJson(res, err.statusCode || 400, {
        success: false,
        error: err.message,
      });
      return true;
    }
  }

  // 4. Endpoint Principal: Cálculo Automático con Integración de Mapas (Origen y Destino)
  if (pathname === '/api/desplazamiento' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      let params = {};
      if (req.method === 'POST') {
        params = await parseRequestBody(req);
      } else {
        params = {
          origen: reqUrl.searchParams.get('origen'),
          destino: reqUrl.searchParams.get('destino'),
          esIdaYVuelta: reqUrl.searchParams.get('esIdaYVuelta') !== 'false',
          precioBencina: reqUrl.searchParams.get('precioBencina'),
          rendimiento: reqUrl.searchParams.get('rendimiento'),
          factorDesgaste: reqUrl.searchParams.get('factorDesgaste'),
          tarifaBase: reqUrl.searchParams.get('tarifaBase'),
        };
      }

      const { origen, destino, esIdaYVuelta, config, ...resto } = params;

      if (!origen || !destino) {
        sendJson(res, 400, {
          success: false,
          error: 'Debe proporcionar tanto "origen" como "destino" en la solicitud.',
        });
        return true;
      }

      const origenLimpio = String(origen).trim();
      const destinoLimpio = String(destino).trim();

      if (origenLimpio.length > MAX_TEXT_LENGTH || destinoLimpio.length > MAX_TEXT_LENGTH) {
        sendJson(res, 400, {
          success: false,
          error: `Los campos origen y destino no pueden superar ${MAX_TEXT_LENGTH} caracteres.`,
        });
        return true;
      }

      // Consolidar configuración personalizada
      const mergedConfig = {
        ...(config || {}),
        ...(resto.precioBencina ? { precioBencina: Number(resto.precioBencina) } : {}),
        ...(resto.rendimiento ? { rendimiento: Number(resto.rendimiento) } : {}),
        ...(resto.factorDesgaste ? { factorDesgaste: Number(resto.factorDesgaste) } : {}),
        ...(resto.tarifaBase ? { tarifaBase: Number(resto.tarifaBase) } : {}),
      };

      const resultado = await calcularPresupuestoDesplazamiento({
        origen: origenLimpio,
        destino: destinoLimpio,
        esIdaYVuelta: esIdaYVuelta !== false,
        config: mergedConfig,
        opcionesMapa: params.opcionesMapa || {},
      });

      sendJson(res, 200, resultado);
      return true;
    } catch (err) {
      sendJson(res, err.statusCode || 400, {
        success: false,
        error: err.message,
      });
      return true;
    }
  }

  return false;
}

// Inicialización del servidor standalone si se ejecuta directamente con Node
const isDirectRun = process.argv[1]?.endsWith('server/index.js') || process.argv[1]?.endsWith('server\\index.js');
if (isDirectRun) {
  const server = http.createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      sendJson(res, 404, { error: 'Endpoint no encontrado' });
    }
  });

  server.listen(PORT, () => {
    console.log(`[Backend Server] Servidor API ejecutándose en http://localhost:${PORT}`);
    console.log(`[Backend Server] Endpoints disponibles:`);
    console.log(`  - POST/GET /api/desplazamiento (origen, destino, config)`);
    console.log(`  - POST/GET /api/calcular-km (distanciaKm, config)`);
    console.log(`  - GET /api/config`);
    console.log(`  - GET /api/health`);
  });
}
