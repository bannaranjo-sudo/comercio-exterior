import { Prisma } from "@/generated/prisma/client";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { ErrorValidacion } from "@/lib/errores";

// Cantidades exactas: siempre texto/Decimal (NUMERIC en PostgreSQL), nunca coma flotante.

export const UNIDADES: Record<UnidadMedida, { etiqueta: string; simbolo: string; fraccionable: boolean }> = {
  UNIDAD: { etiqueta: "Unidad", simbolo: "und", fraccionable: false },
  CAJA: { etiqueta: "Caja", simbolo: "cja", fraccionable: false },
  PAR: { etiqueta: "Par", simbolo: "par", fraccionable: false },
  KILOGRAMO: { etiqueta: "Kilogramo", simbolo: "kg", fraccionable: true },
  GRAMO: { etiqueta: "Gramo", simbolo: "g", fraccionable: true },
  LITRO: { etiqueta: "Litro", simbolo: "L", fraccionable: true },
  METRO: { etiqueta: "Metro", simbolo: "m", fraccionable: true },
  METRO_CUADRADO: { etiqueta: "Metro cuadrado", simbolo: "m²", fraccionable: true },
  METRO_CUBICO: { etiqueta: "Metro cúbico", simbolo: "m³", fraccionable: true },
};

export const ETIQUETA_UNIDAD: Record<UnidadMedida, string> = Object.fromEntries(
  Object.entries(UNIDADES).map(([k, v]) => [k, `${v.etiqueta} (${v.simbolo})`]),
) as Record<UnidadMedida, string>;

const PATRON = /^\d{1,14}([.,]\d{1,4})?$/;

/**
 * Valida y normaliza una cantidad (hasta 4 decimales; entera si la unidad no admite fracciones).
 * Devuelve texto decimal listo para PostgreSQL. `permitirCero` solo para umbrales como el stock mínimo.
 */
export function parsearCantidad(valor: unknown, unidad: UnidadMedida, etiqueta: string, permitirCero = false): string {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!PATRON.test(texto)) {
    throw new ErrorValidacion(`${etiqueta} no es válida (use dígitos y hasta 4 decimales; no se admiten negativos).`);
  }
  const normalizado = texto.replace(",", ".");
  const d = new Prisma.Decimal(normalizado);
  if (d.isZero() && !permitirCero) throw new ErrorValidacion(`${etiqueta} debe ser mayor que cero.`);
  if (!UNIDADES[unidad].fraccionable && !d.isInteger()) {
    throw new ErrorValidacion(`${etiqueta}: la unidad ${UNIDADES[unidad].etiqueta.toLowerCase()} no admite fracciones.`);
  }
  return d.toFixed(4);
}

/** Formatea una cantidad sin ceros innecesarios (p. ej. "12,5 kg", "40 und"). */
export function formatearCantidad(valor: { toFixed(d: number): string } | string, unidad?: UnidadMedida): string {
  const texto = typeof valor === "string" ? valor : valor.toFixed(4);
  const recortado = texto.includes(".") ? texto.replace(/0+$/, "").replace(/\.$/, "") : texto;
  const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(recortado as unknown as number);
  return unidad ? `${numero} ${UNIDADES[unidad].simbolo}` : numero;
}

export const sumar = (a: string | number | Prisma.Decimal, b: string | number | Prisma.Decimal) => new Prisma.Decimal(a).plus(b);
