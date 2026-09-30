/**
 * Servicio de Integración con APIs de Mapas y Rutas
 * 
 * Soporta:
 * 1. OpenStreetMap (Nominatim para geocodificación + OSRM para ruta de conducción real) - Gratuito y sin API key obligatoria.
 * 2. Google Maps Distance Matrix API (configurable mediante clave de API).
 * 3. Fallback heurístico resiliente para pruebas locales / sin conexión.
 */

// Diccionario de coordenadas para comunas/ciudades comunes (fallback de geocodificación rápida y testing)
const COORDENADAS_CONOCIDAS = {
  'santiago': { lat: -33.4489, lon: -70.6693, nombre: 'Santiago Centro, Región Metropolitana, Chile' },
  'santiago centro': { lat: -33.4489, lon: -70.6693, nombre: 'Santiago Centro, Región Metropolitana, Chile' },
  'providencia': { lat: -33.4314, lon: -70.6093, nombre: 'Providencia, Región Metropolitana, Chile' },
  'las condes': { lat: -33.4117, lon: -70.5794, nombre: 'Las Condes, Región Metropolitana, Chile' },
  'maipu': { lat: -33.5110, lon: -70.7580, nombre: 'Maipú, Región Metropolitana, Chile' },
  'maipú': { lat: -33.5110, lon: -70.7580, nombre: 'Maipú, Región Metropolitana, Chile' },
  'la florida': { lat: -33.5227, lon: -70.5983, nombre: 'La Florida, Región Metropolitana, Chile' },
  'nunoa': { lat: -33.4569, lon: -70.5976, nombre: 'Ñuñoa, Región Metropolitana, Chile' },
  'ñuñoa': { lat: -33.4569, lon: -70.5976, nombre: 'Ñuñoa, Región Metropolitana, Chile' },
  'puente alto': { lat: -33.6117, lon: -70.5758, nombre: 'Puente Alto, Región Metropolitana, Chile' },
  'vina del mar': { lat: -33.0245, lon: -71.5518, nombre: 'Viña del Mar, Región de Valparaíso, Chile' },
  'viña del mar': { lat: -33.0245, lon: -71.5518, nombre: 'Viña del Mar, Región de Valparaíso, Chile' },
  'valparaiso': { lat: -33.0472, lon: -71.6127, nombre: 'Valparaíso, Región de Valparaíso, Chile' },
  'valparaíso': { lat: -33.0472, lon: -71.6127, nombre: 'Valparaíso, Región de Valparaíso, Chile' },
  'concepcion': { lat: -36.8270, lon: -73.0503, nombre: 'Concepción, Región del Biobío, Chile' },
  'concepción': { lat: -36.8270, lon: -73.0503, nombre: 'Concepción, Región del Biobío, Chile' },
};

/**
 * Normaliza una cadena de texto para comparaciones.
 */
function normalizarTexto(texto) {
  return (texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Calcula la distancia haversine en km entre dos pares de coordenadas (usado como respaldo).
 */
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanciaEnLineaRecta = R * c;
  // Factor de sinuosidad promedio para rutas por carretera urbana/interurbana (~1.25 a 1.35)
  return Number((distanciaEnLineaRecta * 1.3).toFixed(2));
}

/**
 * Geocodifica una dirección usando Nominatim (OpenStreetMap) con timeout.
 */
async function geocodificarDireccion(direccion, timeoutMs = 4000) {
  const clave = normalizarTexto(direccion);
  if (COORDENADAS_CONOCIDAS[clave]) {
    return COORDENADAS_CONOCIDAS[clave];
  }

  // Si el usuario ingresó directamente "lat,lon"
  const regexCoord = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
  const matchCoord = direccion.trim().match(regexCoord);
  if (matchCoord) {
    return {
      lat: parseFloat(matchCoord[1]),
      lon: parseFloat(matchCoord[3]),
      nombre: direccion.trim(),
    };
  }

  const query = encodeURIComponent(direccion.includes('Chile') ? direccion : `${direccion}, Chile`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CalculadoraKm-Desplazamientos/1.0',
      },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`Nominatim respondió con código HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        nombre: data[0].display_name,
      };
    }
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[mapService] Error en geocodificación con Nominatim para "${direccion}":`, err.message);
  }

  // Fallback si no fue encontrado en la API externa ni en la lista básica
  return null;
}

/**
 * Consulta la ruta de conducción real entre dos coordenadas mediante OSRM.
 */
async function consultarRutaOSRM(origenCoord, destinoCoord, timeoutMs = 5000) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origenCoord.lon},${origenCoord.lat};${destinoCoord.lon},${destinoCoord.lat}?overview=false`;
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`OSRM respondió con código HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const ruta = data.routes[0];
      const distanciaKm = Number((ruta.distance / 1000).toFixed(2)); // Metros a km
      const duracionMinutos = Math.round(ruta.duration / 60);       // Segundos a minutos

      return {
        distanciaKm,
        duracionMinutos,
        proveedor: 'OpenStreetMap / OSRM Driving Engine',
      };
    }
  } catch (err) {
    clearTimeout(timer);
    console.warn('[mapService] Error al consultar ruta en OSRM:', err.message);
  }

  return null;
}

/**
 * Consulta la API de Google Maps Distance Matrix si existe API Key.
 */
async function consultarGoogleMaps(origen, destino, apiKey) {
  if (!apiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origen)}&destinations=${encodeURIComponent(destino)}&mode=driving&units=metric&key=${apiKey}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();

    if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
      const elem = data.rows[0].elements[0];
      const distanciaKm = Number((elem.distance.value / 1000).toFixed(2));
      const duracionMinutos = Math.round(elem.duration.value / 60);

      return {
        distanciaKm,
        duracionMinutos,
        origenNormalizado: data.origin_addresses[0],
        destinoNormalizado: data.destination_addresses[0],
        proveedor: 'Google Maps Distance Matrix API',
      };
    }
  } catch (err) {
    console.warn('[mapService] Error al consultar Google Maps API:', err.message);
  }

  return null;
}

/**
 * Obtiene la distancia real de conducción y detalles de ruta entre un origen y un destino.
 * 
 * @param {string} origen - Dirección o comuna de origen
 * @param {string} destino - Dirección o comuna de destino
 * @param {Object} [opciones={}]
 * @param {string} [opciones.googleMapsApiKey] - API Key opcional de Google Maps
 * @returns {Promise<Object>} Información de la ruta con distancia en km
 */
export async function obtenerDistanciaRuta(origen, destino, opciones = {}) {
  if (!origen || !origen.trim()) {
    throw new Error('Debe especificar un punto de origen');
  }
  if (!destino || !destino.trim()) {
    throw new Error('Debe especificar un punto de destino');
  }

  const origenLimpio = origen.trim();
  const destinoLimpio = destino.trim();

  // 1. Si el usuario ingresó números directos (ej: origen="0", destino="15.5")
  if (!isNaN(destinoLimpio) && (!isNaN(origenLimpio) || origenLimpio === '0')) {
    const km = Math.abs(parseFloat(destinoLimpio) - (parseFloat(origenLimpio) || 0));
    return {
      distanciaKm: Number(km.toFixed(2)),
      duracionMinutos: Math.round((km / 45) * 60), // estimación 45 km/h promedio
      origenNormalizado: origenLimpio,
      destinoNormalizado: destinoLimpio,
      proveedor: 'Medición directa por kilometraje',
    };
  }

  // 2. Intentar con Google Maps API si se suministró key
  const apiKey = opciones.googleMapsApiKey || (typeof process !== 'undefined' ? process.env?.GOOGLE_MAPS_API_KEY : null);
  if (apiKey) {
    const resultadoGoogle = await consultarGoogleMaps(origenLimpio, destinoLimpio, apiKey);
    if (resultadoGoogle) {
      return resultadoGoogle;
    }
  }

  // 3. Geocodificar con OpenStreetMap / Nominatim
  const [origenCoord, destinoCoord] = await Promise.all([
    geocodificarDireccion(origenLimpio),
    geocodificarDireccion(destinoLimpio),
  ]);

  if (origenCoord && destinoCoord) {
    // 4. Obtener ruta vehicular real con OSRM
    const rutaOSRM = await consultarRutaOSRM(origenCoord, destinoCoord);
    if (rutaOSRM) {
      return {
        ...rutaOSRM,
        origenNormalizado: origenCoord.nombre,
        destinoNormalizado: destinoCoord.nombre,
        coordenadas: {
          origen: { lat: origenCoord.lat, lon: origenCoord.lon },
          destino: { lat: destinoCoord.lat, lon: destinoCoord.lon },
        },
      };
    }

    // Si OSRM falló pero tenemos coordenadas, estimar con Haversine + factor de sinuosidad
    const distanciaAprox = calcularDistanciaHaversine(
      origenCoord.lat,
      origenCoord.lon,
      destinoCoord.lat,
      destinoCoord.lon
    );
    return {
      distanciaKm: distanciaAprox,
      duracionMinutos: Math.round((distanciaAprox / 40) * 60),
      origenNormalizado: origenCoord.nombre,
      destinoNormalizado: destinoCoord.nombre,
      proveedor: 'Estimación geoespacial vial (Haversine + factor 1.3)',
      advertencia: 'Calculado mediante estimación geográfica vial de respaldo.',
    };
  }

  // 5. Si no se pudo geocodificar por red o límites de API, lanzar error explicativo
  throw new Error(
    `No fue posible geolocalizar la ruta entre "${origenLimpio}" y "${destinoLimpio}". Verifique los nombres o ingrese los kilómetros manualmente.`
  );
}
