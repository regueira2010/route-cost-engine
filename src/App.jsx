import { useState } from 'react';
import './App.css';
import { calcularPresupuestoDesplazamiento, DEFAULT_CONFIG } from './services/displacementService.js';
import { calcularCostoDesplazamiento, formatearCLP } from './services/costEngine.js';

function App() {
  const [modo, setModo] = useState('automatico'); // 'automatico' | 'manual'
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [kilometros, setKilometros] = useState('');
  const [esIdaYVuelta, setEsIdaYVuelta] = useState(true);

  // Parámetros configurables con sus valores por defecto
  const [config, setConfig] = useState({
    precioBencina: DEFAULT_CONFIG.PRECIO_BENCINA,
    rendimiento: DEFAULT_CONFIG.RENDIMIENTO_KML,
    factorDesgaste: DEFAULT_CONFIG.FACTOR_DESGASTE,
    tarifaBase: DEFAULT_CONFIG.TARIFA_BASE,
  });

  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const handleConfigChange = (campo, valor) => {
    setConfig(prev => ({
      ...prev,
      [campo]: parseFloat(valor) || 0,
    }));
  };

  const calcular = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      if (modo === 'automatico') {
        if (!origen.trim() || !destino.trim()) {
          throw new Error('Por favor ingresa tanto el punto de origen como el de destino.');
        }

        // Intento 1: Llamar al endpoint backend /api/desplazamiento
        let respuesta;
        try {
          const resp = await fetch('/api/desplazamiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              origen: origen.trim(),
              destino: destino.trim(),
              esIdaYVuelta,
              config,
            }),
          });
          if (resp.ok) {
            respuesta = await resp.json();
          }
        } catch {
          // Si el servidor HTTP no está activo (ej: SPA estática en Firebase Hosting),
          // invocamos el servicio directamente en el cliente.
        }

        if (!respuesta) {
          respuesta = await calcularPresupuestoDesplazamiento({
            origen: origen.trim(),
            destino: destino.trim(),
            esIdaYVuelta,
            config,
          });
        }

        setResultado(respuesta);
      } else {
        // Modo manual por kilómetros
        const km = parseFloat(kilometros);
        if (isNaN(km) || km < 0) {
          throw new Error('Por favor ingresa una distancia válida en kilómetros.');
        }

        const calculo = calcularCostoDesplazamiento({
          distanciaKm: km,
          esIdaYVuelta,
          config,
        });

        setResultado({
          trayecto: {
            origenSolicitado: 'Manual',
            destinoSolicitado: 'Manual',
            distanciaIdaKm: km,
            distanciaTotalKm: calculo.distanciaTotalKm,
            esIdaYVuelta,
            proveedorMapa: 'Ingreso manual directo',
          },
          parametros: calculo.parametros,
          desglose: calculo.desglose,
          formateado: calculo.formateado,
          moneda: 'CLP',
        });
      }
    } catch (err) {
      setError(err.message || 'Ocurrió un error al calcular el desplazamiento.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="app-layout">
      <div className="container">
        <header className="header">
          <h1>Calculadora de Desplazamientos</h1>
          <p className="subtitle">Cálculo de costos y desgaste según distancia real</p>
        </header>

        {/* Selector de modo */}
        <div className="tab-group">
          <button
            type="button"
            className={`tab-btn ${modo === 'automatico' ? 'active' : ''}`}
            onClick={() => { setModo('automatico'); setError(null); }}
          >
            🗺️ Automático (Origen y Destino)
          </button>
          <button
            type="button"
            className={`tab-btn ${modo === 'manual' ? 'active' : ''}`}
            onClick={() => { setModo('manual'); setError(null); }}
          >
            📏 Manual (Kilómetros)
          </button>
        </div>

        <form onSubmit={calcular} className="form-card">
          {modo === 'automatico' ? (
            <>
              <div className="form-group">
                <label htmlFor="origen">Origen:</label>
                <input
                  type="text"
                  id="origen"
                  placeholder="Ej: Santiago Centro, o dirección de partida"
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                  disabled={cargando}
                />
              </div>

              <div className="form-group">
                <label htmlFor="destino">Destino:</label>
                <input
                  type="text"
                  id="destino"
                  placeholder="Ej: Providencia, Las Condes o dirección de llegada"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  disabled={cargando}
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label htmlFor="kilometros">Distancia de ida (km):</label>
              <input
                type="number"
                id="kilometros"
                step="0.1"
                min="0"
                placeholder="Ej: 15.5"
                value={kilometros}
                onChange={(e) => setKilometros(e.target.value)}
                disabled={cargando}
              />
            </div>
          )}

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={esIdaYVuelta}
                onChange={(e) => setEsIdaYVuelta(e.target.checked)}
              />
              <span>Calcular viaje de <strong>Ida y Vuelta (x2)</strong></span>
            </label>
          </div>

          <button
            type="button"
            className="config-toggle-btn"
            onClick={() => setMostrarConfig(!mostrarConfig)}
          >
            ⚙️ {mostrarConfig ? 'Ocultar variables' : 'Configurar variables de costo'}
          </button>

          {mostrarConfig && (
            <div className="config-panel">
              <h3>Variables del Motor de Costos</h3>
              <div className="config-grid">
                <div>
                  <label>Precio bencina ($/L):</label>
                  <input
                    type="number"
                    value={config.precioBencina}
                    onChange={(e) => handleConfigChange('precioBencina', e.target.value)}
                  />
                </div>
                <div>
                  <label>Rendimiento (km/L):</label>
                  <input
                    type="number"
                    value={config.rendimiento}
                    onChange={(e) => handleConfigChange('rendimiento', e.target.value)}
                  />
                </div>
                <div>
                  <label>Factor desgaste (0.5 = 50%):</label>
                  <input
                    type="number"
                    step="0.05"
                    value={config.factorDesgaste}
                    onChange={(e) => handleConfigChange('factorDesgaste', e.target.value)}
                  />
                </div>
                <div>
                  <label>Tarifa Base ($ CLP):</label>
                  <input
                    type="number"
                    value={config.tarifaBase}
                    onChange={(e) => handleConfigChange('tarifaBase', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={cargando}>
            {cargando ? 'Calculando ruta y costos...' : 'Calcular Desplazamiento'}
          </button>
        </form>

        {error && (
          <div className="alert alert-error">
            <strong>⚠️ Error:</strong> {error}
          </div>
        )}

        {resultado && (
          <div className="resultado-card">
            <h2>Desglose del Desplazamiento</h2>

            <div className="trayecto-info">
              {resultado.trayecto.origenNormalizado && (
                <p><strong>📍 Origen:</strong> {resultado.trayecto.origenNormalizado}</p>
              )}
              {resultado.trayecto.destinoNormalizado && (
                <p><strong>🎯 Destino:</strong> {resultado.trayecto.destinoNormalizado}</p>
              )}
              <p>
                <strong>🛣️ Distancia de ida:</strong> {resultado.trayecto.distanciaIdaKm} km
              </p>
              <p>
                <strong>🔄 Distancia total considerada:</strong>{' '}
                <span className="badge">{resultado.trayecto.distanciaTotalKm} km {resultado.trayecto.esIdaYVuelta ? '(Ida y Vuelta)' : '(Solo Ida)'}</span>
              </p>
              {resultado.trayecto.duracionEstimadaTotalMinutos && (
                <p><strong>⏱️ Tiempo estimado:</strong> ~{resultado.trayecto.duracionEstimadaTotalMinutos} min</p>
              )}
            </div>

            <table className="tabla-desglose">
              <tbody>
                <tr>
                  <td>Tarifa Base Mínima</td>
                  <td className="monto">{resultado.formateado.tarifaBase}</td>
                </tr>
                <tr>
                  <td>
                    Combustible ({resultado.desglose.litrosConsumidos} L @ {formatearCLP(resultado.parametros.precioBencina)}/L)
                  </td>
                  <td className="monto">{resultado.formateado.costoCombustible}</td>
                </tr>
                <tr>
                  <td>
                    Desgaste de vehículo ({resultado.parametros.factorDesgastePorcentaje} sobre combustible)
                  </td>
                  <td className="monto">{resultado.formateado.costoDesgaste}</td>
                </tr>
                <tr className="subtotal-row">
                  <td>Subtotal Variable (Combustible + Desgaste)</td>
                  <td className="monto">{resultado.formateado.subtotalVariable}</td>
                </tr>
                {resultado.desglose.aplicoPisoMinimo && (
                  <tr className="piso-row">
                    <td colSpan="2">
                      ℹ️ Se aplicó la <strong>Regla de Piso Mínimo</strong> (${resultado.formateado.tarifaBase})
                    </td>
                  </tr>
                )}
                <tr className="total-row">
                  <td><strong>Total a Cobrar</strong></td>
                  <td className="monto-total">{resultado.formateado.costoTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
