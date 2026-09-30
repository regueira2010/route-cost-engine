import http from 'node:http';
import assert from 'node:assert';
import { handleApiRequest } from '../server/index.js';

console.log('=== TEST DE INTEGRACIÓN: ENDPOINTS HTTP BACKEND ===\n');

// Crear servidor de prueba en puerto efímero (0)
const server = http.createServer(async (req, res) => {
  const handled = await handleApiRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(0, async () => {
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Servidor de prueba ejecutándose en ${baseUrl}`);

  try {
    // 1. Probar GET /api/health
    console.log('Test 1: GET /api/health');
    const resHealth = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(resHealth.status, 200);
    const dataHealth = await resHealth.json();
    assert.strictEqual(dataHealth.status, 'ok');
    console.log('✓ GET /api/health superado');

    // 2. Probar GET /api/config
    console.log('\nTest 2: GET /api/config');
    const resConfig = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(resConfig.status, 200);
    const dataConfig = await resConfig.json();
    assert.strictEqual(dataConfig.defaults.PRECIO_BENCINA, 1420);
    assert.strictEqual(dataConfig.defaults.TARIFA_BASE, 9500);
    console.log('✓ GET /api/config superado');

    // 3. Probar POST /api/desplazamiento (Cálculo automático con geocodificación)
    console.log('\nTest 3: POST /api/desplazamiento (Santiago Centro -> Providencia)');
    const resDesplazamiento = await fetch(`${baseUrl}/api/desplazamiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origen: 'Santiago Centro',
        destino: 'Providencia',
        esIdaYVuelta: true,
      }),
    });
    assert.strictEqual(resDesplazamiento.status, 200);
    const dataDesp = await resDesplazamiento.json();
    assert.strictEqual(dataDesp.success, true);
    assert.ok(dataDesp.trayecto.distanciaTotalKm > 0);
    assert.ok(dataDesp.desglose.costoTotal >= 9500);
    console.log(`✓ Trayecto: ${dataDesp.trayecto.distanciaTotalKm} km ida y vuelta. Total: ${dataDesp.formateado.costoTotal}`);
    console.log('✓ POST /api/desplazamiento superado');

    // 4. Probar POST /api/calcular-km (Cálculo directo con km)
    console.log('\nTest 4: POST /api/calcular-km (10 km ida)');
    const resKm = await fetch(`${baseUrl}/api/calcular-km`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distanciaKm: 10,
        esIdaYVuelta: true,
      }),
    });
    assert.strictEqual(resKm.status, 200);
    const dataKm = await resKm.json();
    assert.strictEqual(dataKm.desglose.costoTotal, 13760);
    assert.strictEqual(dataKm.desglose.tarifaBase, 9500);
    console.log('✓ POST /api/calcular-km superado');

    // 5. Probar validación de error 400 (Parámetros faltantes)
    console.log('\nTest 5: Manejo de errores 400');
    const resErr = await fetch(`${baseUrl}/api/desplazamiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'Solo origen' }),
    });
    assert.strictEqual(resErr.status, 400);
    const dataErr = await resErr.json();
    assert.strictEqual(dataErr.success, false);
    console.log(`✓ Error capturado adecuadamente: "${dataErr.error}"`);

    console.log('\n======================================================');
    console.log('TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON EXITOSAMENTE');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Error durante la prueba de integración:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
