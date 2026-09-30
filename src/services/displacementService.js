/**
 * Servicio Orquestador de Desplazamientos
 * 
 * Integra el servicio de mapas (distancia real ida y vuelta) con el motor de costos
 * para generar el presupuesto y desglose financiero de un traslado.
 */

import { calcularCostoDesplazamiento, DEFAULT_CONFIG } from './costEngine.js';
import { obtenerDistanciaRuta } from './mapService.js';

/**
 * Calcula el presupuesto completo de un desplazamiento a partir de origen y destino.
 * 
 * @param {Object} params
 * @param {string} params.origen - Dirección o punto de origen
 * @param {string} params.destino - Dirección o punto de destino
 * @param {boolean} [params.esIdaYVuelta=true] - Si el cálculo incluye viaje de retorno (2x distancia)
 * @param {Object} [params.config] - Parámetros configurables de costo (precioBencina, rendimiento, factorDesgaste, tarifaBase)
 * @param {Object} [params.opcionesMapa] - Configuración para el servicio de mapas (ej: googleMapsApiKey)
 * @returns {Promise<Object>} Resumen completo del trayecto y desglose económico
 */
export async function calcularPresupuestoDesplazamiento({
  origen,
  destino,
  esIdaYVuelta = true,
  config = {},
  opcionesMapa = {},
}) {
  if (!origen || typeof origen !== 'string' || !origen.trim()) {
    throw new Error('El parámetro "origen" es requerido.');
  }
  if (!destino || typeof destino !== 'string' || !destino.trim()) {
    throw new Error('El parámetro "destino" es requerido.');
  }

  // 1. Obtener distancia real entre origen y destino desde la API de mapas
  const infoRuta = await obtenerDistanciaRuta(origen, destino, opcionesMapa);

  // 2. Ejecutar motor de cálculo de costos
  const resultadoCostos = calcularCostoDesplazamiento({
    distanciaKm: infoRuta.distanciaKm,
    esIdaYVuelta,
    config,
  });

  // 3. Consolidar respuesta estructurada
  return {
    success: true,
    timestamp: new Date().toISOString(),
    trayecto: {
      origenSolicitado: origen,
      destinoSolicitado: destino,
      origenNormalizado: infoRuta.origenNormalizado || origen,
      destinoNormalizado: infoRuta.destinoNormalizado || destino,
      distanciaIdaKm: infoRuta.distanciaKm,
      distanciaTotalKm: resultadoCostos.distanciaTotalKm,
      esIdaYVuelta,
      duracionEstimadaIdaMinutos: infoRuta.duracionMinutos || null,
      duracionEstimadaTotalMinutos: infoRuta.duracionMinutos ? infoRuta.duracionMinutos * (esIdaYVuelta ? 2 : 1) : null,
      proveedorMapa: infoRuta.proveedor,
      advertencia: infoRuta.advertencia || null,
    },
    parametros: resultadoCostos.parametros,
    desglose: resultadoCostos.desglose,
    formateado: resultadoCostos.formateado,
    moneda: resultadoCostos.moneda,
  };
}

export { DEFAULT_CONFIG };
