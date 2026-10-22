// Límites de seguridad y costo para llamadas a proveedores de IA.
export const LIMITES = {
  /** Máximo absoluto de tokens de salida que cualquier adaptador puede solicitar. */
  tokensSalidaMax: 1024,
  /** Techo absoluto para solicitudes que piden más que el tope común (p. ej. informes estructurados). */
  tokensSalidaAbsoluto: 6144,
  tiempoAbsolutoMs: 90_000,
  /** Tokens de salida de la prueba. Margen para modelos de razonamiento, que gastan parte del tope sin emitir texto. */
  tokensSalidaPrueba: 128,
  /** Tiempo máximo de espera de una llamada. */
  tiempoMaxMs: 20_000,
  /** Pruebas de conexión por empresa dentro de la ventana. */
  pruebas: { max: 3, ventanaMs: 10 * 60_000 },
  /** Llamadas totales por empresa dentro de la ventana (cualquier tipo). */
  solicitudes: { max: 30, ventanaMs: 60_000 },
} as const;

export const limitarTokensSalida = (solicitados?: number, tope?: number): number => {
  const techo = Math.max(1, Math.min(tope ?? LIMITES.tokensSalidaMax, LIMITES.tokensSalidaAbsoluto));
  return Math.max(1, Math.min(solicitados ?? techo, techo));
};

export const limitarTiempo = (solicitado?: number): number => Math.min(solicitado ?? LIMITES.tiempoMaxMs, LIMITES.tiempoAbsolutoMs);
