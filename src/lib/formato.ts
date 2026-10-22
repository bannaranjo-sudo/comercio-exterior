// Zona horaria de la empresa para "hoy" y para mostrar fechas con hora (configurable con APP_TIMEZONE).
const ZONA = process.env.APP_TIMEZONE ?? "America/Bogota";

const fechaCorta = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });
const fechaHora = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: ZONA });

/** Columnas de fecha (@db.Date) se guardan a medianoche UTC; se muestran sin desplazamiento horario. */
export const formatearFecha = (valor: Date | null | undefined): string => (valor ? fechaCorta.format(valor) : "—");
export const formatearFechaHora = (valor: Date | null | undefined): string => (valor ? fechaHora.format(valor) : "—");
/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de la empresa, para valores por defecto de formularios. */
export const hoyLocal = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
export const aInputFecha = (valor: Date | null | undefined): string => (valor ? valor.toISOString().slice(0, 10) : "");

/** Formatea un importe decimal exacto (texto) con su moneda, sin pasar por coma flotante. */
export function formatearImporte(valor: { toFixed(d: number): string } | string, moneda: string): string {
  const texto = typeof valor === "string" ? valor : valor.toFixed(2);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: moneda,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(texto as unknown as number);
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
