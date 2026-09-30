import assert from 'node:assert';
import { calcularCostoDesplazamiento, DEFAULT_CONFIG } from '../src/services/costEngine.js';
import { calcularPresupuestoDesplazamiento } from '../src/services/displacementService.js';

console.log('=== INICIANDO SUITE DE PRUEBAS DEL MOTOR DE COSTOS ===\n');

// PRUEBA 1: Valores por defecto
console.log('Test 1: Verificación de constantes por defecto');
assert.strictEqual(DEFAULT_CONFIG.PRECIO_BENCINA, 1420, 'Precio de bencina debe ser 1420');
assert.strictEqual(DEFAULT_CONFIG.RENDIMIENTO_KML, 10, 'Rendimiento debe ser 10 km/L');
assert.strictEqual(DEFAULT_CONFIG.FACTOR_DESGASTE, 0.50, 'Factor desgaste debe ser 50%');
assert.strictEqual(DEFAULT_CONFIG.TARIFA_BASE, 9500, 'Tarifa base debe ser $9.500 CLP');
console.log('✓ Test 1 superado');

// PRUEBA 2: Regla de piso (Distancia 0 km o resultado menor a Tarifa Base)
console.log('\nTest 2: Regla de piso con distancia 0 km');
const resultadoPiso = calcularCostoDesplazamiento({ distanciaKm: 0 });
// Costo = 9500 + (0 * (1420/10) * 1.5) = 9500
assert.strictEqual(resultadoPiso.desglose.costoCalculado, 9500);
assert.strictEqual(resultadoPiso.desglose.costoTotal, 9500);
assert.strictEqual(resultadoPiso.desglose.costoCombustible, 0);
assert.strictEqual(resultadoPiso.desglose.costoDesgaste, 0);
console.log('✓ Test 2 superado: Regla de piso garantizada ($9.500 CLP)');

// PRUEBA 3: Cálculo exacto con ida y vuelta (ejemplo: 10 km ida -> 20 km total)
console.log('\nTest 3: Cálculo con 10 km de ida (20 km ida y vuelta)');
// Distancia total = 10 * 2 = 20 km
// Consumo litros = 20 / 10 = 2 litros
// Costo combustible = 20 * (1420 / 10) = 20 * 142 = $2.840 CLP
// Costo desgaste = 2840 * 0.50 = $1.420 CLP
// Subtotal variable = 2840 + 1420 = $4.260 CLP
// Costo calculado = 9500 + 4260 = $13.760 CLP
// Costo total = Math.max(13760, 9500) = $13.760 CLP
const resultado10km = calcularCostoDesplazamiento({ distanciaKm: 10, esIdaYVuelta: true });
assert.strictEqual(resultado10km.distanciaTotalKm, 20);
assert.strictEqual(resultado10km.desglose.litrosConsumidos, 2);
assert.strictEqual(resultado10km.desglose.costoCombustible, 2840);
assert.strictEqual(resultado10km.desglose.costoDesgaste, 1420);
assert.strictEqual(resultado10km.desglose.subtotalVariable, 4260);
assert.strictEqual(resultado10km.desglose.tarifaBase, 9500);
assert.strictEqual(resultado10km.desglose.costoCalculado, 13760);
assert.strictEqual(resultado10km.desglose.costoTotal, 13760);
assert.strictEqual(resultado10km.formateado.costoTotal.includes('13.760'), true);
console.log('✓ Test 3 superado: Desglose financiero matemáticamente exacto');

// PRUEBA 4: Viaje solo de ida (sin retorno)
console.log('\nTest 4: Viaje solo de ida (10 km sin retorno)');
// Distancia total = 10 km
// Combustible = 10 * 142 = $1.420 CLP
// Desgaste = 1420 * 0.5 = $710 CLP
// Subtotal variable = 1420 + 710 = $2.130 CLP
// Costo total = 9500 + 2130 = $11.630 CLP
const resultadoSoloIda = calcularCostoDesplazamiento({ distanciaKm: 10, esIdaYVuelta: false });
assert.strictEqual(resultadoSoloIda.distanciaTotalKm, 10);
assert.strictEqual(resultadoSoloIda.desglose.costoCombustible, 1420);
assert.strictEqual(resultadoSoloIda.desglose.costoDesgaste, 710);
assert.strictEqual(resultadoSoloIda.desglose.costoTotal, 11630);
console.log('✓ Test 4 superado');

// PRUEBA 5: Parámetros configurables personalizados
console.log('\nTest 5: Sobrescritura de parámetros configurables');
// Precio bencina: $1.300 CLP, Rendimiento: 13 km/L, Factor desgaste: 40% (0.40), Tarifa Base: $8.000 CLP
// Distancia: 13 km ida y vuelta (26 km total)
// Combustible: 26 * (1300 / 13) = 26 * 100 = $2.600 CLP
// Desgaste: 2600 * 0.40 = $1.040 CLP
// Subtotal variable: 2600 + 1040 = $3.640 CLP
// Total: 8000 + 3640 = $11.640 CLP
const resultadoCustom = calcularCostoDesplazamiento({
  distanciaKm: 13,
  esIdaYVuelta: true,
  config: {
    precioBencina: 1300,
    rendimiento: 13,
    factorDesgaste: 0.40,
    tarifaBase: 8000,
  },
});
assert.strictEqual(resultadoCustom.desglose.costoCombustible, 2600);
assert.strictEqual(resultadoCustom.desglose.costoDesgaste, 1040);
assert.strictEqual(resultadoCustom.desglose.costoTotal, 11640);
console.log('✓ Test 5 superado: Parámetros configurables aplicados');

// PRUEBA 6: Integración del servicio de desplazamientos con medición directa
console.log('\nTest 6: Orquestador con trayecto origen y destino numérico');
const presupuestoDirecto = await calcularPresupuestoDesplazamiento({
  origen: '0',
  destino: '15',
  esIdaYVuelta: true,
});
assert.strictEqual(presupuestoDirecto.success, true);
assert.strictEqual(presupuestoDirecto.trayecto.distanciaIdaKm, 15);
assert.strictEqual(presupuestoDirecto.trayecto.distanciaTotalKm, 30);
// 30 km * 142 = 4260 bencina + 2130 desgaste = 6390 variable + 9500 base = 15890
assert.strictEqual(presupuestoDirecto.desglose.costoTotal, 15890);
console.log('✓ Test 6 superado: Orquestador funcional');

console.log('\n======================================================');
console.log('TODAS LAS PRUEBAS UNITARIAS PASARON SATISFACTORIAMENTE');
console.log('======================================================\n');
