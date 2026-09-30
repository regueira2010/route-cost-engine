/**
 * Motor de Costos de Desplazamiento
 * 
 * Reglas de negocio:
 * 1. Variables configurables con valores por defecto:
 *    - Precio bencina: $1.420 CLP
 *    - Rendimiento: 10 km/L
 *    - Factor de desgaste: 50% sobre el combustible (0.50)
 *    - Tarifa Base: $9.500 CLP
 * 
 * 2. Fórmula:
 *    Costo = Tarifa Base + (Distancia Total * (Precio / Rendimiento) * (1 + Factor))
 * 
 * 3. Regla de piso:
 *    Si el resultado es menor a la Tarifa Base ($9.500 CLP), aplicar este importe mínimo.
 */

export const DEFAULT_CONFIG = {
  PRECIO_BENCINA: 1420,       // CLP por litro
  RENDIMIENTO_KML: 10,        // km por litro
  FACTOR_DESGASTE: 0.50,      // 50% sobre el combustible
  TARIFA_BASE: 9500,          // CLP tarifa base mínima
};

/**
 * Valida y normaliza la configuración del motor de cálculo.
 * @param {Object} customConfig
 * @returns {Object} Configuración validada
 */
export function getMergedConfig(customConfig = {}) {
  const precioBencina = Number(customConfig.precioBencina ?? customConfig.PRECIO_BENCINA ?? DEFAULT_CONFIG.PRECIO_BENCINA);
  const rendimiento = Number(customConfig.rendimiento ?? customConfig.RENDIMIENTO_KML ?? DEFAULT_CONFIG.RENDIMIENTO_KML);
  const factorDesgaste = Number(customConfig.factorDesgaste ?? customConfig.FACTOR_DESGASTE ?? DEFAULT_CONFIG.FACTOR_DESGASTE);
  const tarifaBase = Number(customConfig.tarifaBase ?? customConfig.TARIFA_BASE ?? DEFAULT_CONFIG.TARIFA_BASE);

  if (isNaN(precioBencina) || precioBencina <= 0) {
    throw new Error('El precio de la bencina debe ser un número mayor a 0');
  }
  if (isNaN(rendimiento) || rendimiento <= 0) {
    throw new Error('El rendimiento debe ser un número mayor a 0');
  }
  if (isNaN(factorDesgaste) || factorDesgaste < 0) {
    throw new Error('El factor de desgaste debe ser un número igual o mayor a 0');
  }
  if (isNaN(tarifaBase) || tarifaBase < 0) {
    throw new Error('La tarifa base debe ser un número igual o mayor a 0');
  }

  return {
    precioBencina,
    rendimiento,
    factorDesgaste,
    tarifaBase,
  };
}

/**
 * Formatea un monto numérico a formato de moneda chilena (CLP).
 * @param {number} valor
 * @returns {string} Ejemplo: "$13.760"
 */
export function formatearCLP(valor) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.round(valor));
}

/**
 * Calcula el costo de un desplazamiento aplicando la fórmula de negocio y desglose.
 * 
 * @param {Object} params
 * @param {number} params.distanciaKm - Distancia unidireccional (ida) en km
 * @param {boolean} [params.esIdaYVuelta=true] - Si se debe considerar viaje ida y vuelta
 * @param {Object} [params.config={}] - Opciones de configuración personalizadas
 * @returns {Object} Objeto con el desglose detallado del cálculo
 */
export function calcularCostoDesplazamiento({ distanciaKm, esIdaYVuelta = true, config = {} }) {
  const distanciaNum = Number(distanciaKm);
  if (isNaN(distanciaNum) || distanciaNum < 0) {
    throw new Error('La distancia debe ser un valor numérico mayor o igual a 0');
  }

  const { precioBencina, rendimiento, factorDesgaste, tarifaBase } = getMergedConfig(config);

  // Distancia total recorrida (por defecto ida y vuelta: distancia * 2)
  const factorTrayecto = esIdaYVuelta ? 2 : 1;
  const distanciaTotalKm = Number((distanciaNum * factorTrayecto).toFixed(2));

  // 1. Cálculo de combustible: (Distancia Total * (Precio / Rendimiento))
  const litrosConsumidos = Number((distanciaTotalKm / rendimiento).toFixed(3));
  const costoCombustibleExacto = distanciaTotalKm * (precioBencina / rendimiento);
  const costoCombustible = Math.round(costoCombustibleExacto);

  // 2. Cálculo de desgaste (Factor sobre el costo del combustible)
  const costoDesgasteExacto = costoCombustibleExacto * factorDesgaste;
  const costoDesgaste = Math.round(costoDesgasteExacto);

  // 3. Subtotal variable (Combustible + Desgaste)
  const subtotalVariableExacto = costoCombustibleExacto * (1 + factorDesgaste);
  const subtotalVariable = Math.round(subtotalVariableExacto);

  // 4. Costo calculado antes de aplicar regla de piso
  // Fórmula: Costo = Tarifa Base + (Distancia Total * (Precio/Rendimiento) * (1 + Factor))
  const costoCalculadoExacto = tarifaBase + subtotalVariableExacto;
  const costoCalculado = Math.round(costoCalculadoExacto);

  // 5. Regla de piso: Si el resultado es menor a la Tarifa Base, aplicar este importe mínimo
  const aplicoPisoMinimo = costoCalculado < tarifaBase;
  const costoTotalFinal = Math.max(costoCalculado, tarifaBase);

  return {
    distanciaIdaKm: distanciaNum,
    distanciaTotalKm,
    esIdaYVuelta,
    parametros: {
      precioBencina,
      rendimientoKmPorLitro: rendimiento,
      factorDesgaste,
      factorDesgastePorcentaje: `${(factorDesgaste * 100).toFixed(0)}%`,
      tarifaBase,
    },
    desglose: {
      litrosConsumidos,
      costoCombustible,
      costoDesgaste,
      subtotalVariable,
      tarifaBase,
      costoCalculado,
      aplicoPisoMinimo,
      costoTotal: costoTotalFinal,
    },
    formateado: {
      litrosConsumidos: `${litrosConsumidos} L`,
      costoCombustible: formatearCLP(costoCombustible),
      costoDesgaste: formatearCLP(costoDesgaste),
      subtotalVariable: formatearCLP(subtotalVariable),
      tarifaBase: formatearCLP(tarifaBase),
      costoCalculado: formatearCLP(costoCalculado),
      costoTotal: formatearCLP(costoTotalFinal),
    },
    moneda: 'CLP',
  };
}
