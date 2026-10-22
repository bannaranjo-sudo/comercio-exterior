import { Prisma } from "@/generated/prisma/client";
import { ErrorValidacion } from "@/lib/errores";
import { hoyLocal } from "@/lib/formato";
import { MAX_FILAS_EXPORTACION, TAMANO_PAGINA_REPORTE } from "./tipos";

export const CERO = new Prisma.Decimal(0);

/** Modo de lectura: pantalla (página de 20) o exportación completa (todas las filas, con tope explícito). */
export type Modo = { pagina: number; todo: boolean };

export const paginaPantalla = (pagina?: number): Modo => ({ pagina: pagina ?? 1, todo: false });
export const modoExportacion: Modo = { pagina: 1, todo: true };

/** skip/take para consultas de base de datos. En exportación pide una fila extra para detectar el exceso. */
export const limites = (m: Modo) =>
  m.todo ? { skip: 0, take: MAX_FILAS_EXPORTACION + 1 } : { skip: (m.pagina - 1) * TAMANO_PAGINA_REPORTE, take: TAMANO_PAGINA_REPORTE };

export function validarTope(filas: number): void {
  if (filas > MAX_FILAS_EXPORTACION) {
    throw new ErrorValidacion(`La exportación supera ${MAX_FILAS_EXPORTACION.toLocaleString("es-CO")} filas. Acote el período o los filtros.`);
  }
}

/** Trozo de una lista ya calculada en memoria (reportes agregados). */
export function trozo<T>(filas: T[], m: Modo): T[] {
  if (m.todo) {
    validarTope(filas.length);
    return filas;
  }
  const i = (m.pagina - 1) * TAMANO_PAGINA_REPORTE;
  return filas.slice(i, i + TAMANO_PAGINA_REPORTE);
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** "Hoy" como fecha UTC a medianoche (misma convención que las columnas @db.Date). */
export const hoyUTC = (): Date => new Date(`${hoyLocal()}T00:00:00Z`);

export const sumarDias = (d: Date, dias: number): Date => new Date(d.getTime() + dias * 86_400_000);
export const diasEntre = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 86_400_000);

export const entero = (n: number): string => new Intl.NumberFormat("es-CO").format(n);

export const porcentaje = (parte: number, total: number): string => (total === 0 ? "—" : `${((parte / total) * 100).toFixed(1)} %`);

/** Texto "USD 1.234,50 · COP 10,00" a partir de totales por moneda (sin conversión). */
export const textoMonedas = (totales: Map<string, Prisma.Decimal>): string =>
  [...totales.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => `${m} ${v.toFixed(2)}`).join(" · ") || "—";
