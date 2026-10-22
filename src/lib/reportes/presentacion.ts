import { formatearFecha } from "@/lib/formato";
import type { Columna, Valor } from "./tipos";

const formatosDecimales = new Map<number, Intl.NumberFormat>();
const formato = (d: number) => {
  let f = formatosDecimales.get(d);
  if (!f) {
    f = new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
    formatosDecimales.set(d, f);
  }
  return f;
};

/** Texto para pantalla y PDF. Los decimales llegan como texto exacto y se formatean sin pasar por coma flotante. */
export function formatearValor(c: Columna, v: Valor): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (c.tipo) {
    case "decimal": return formato(c.decimales ?? 2).format(String(v) as unknown as number);
    case "entero": return new Intl.NumberFormat("es-CO").format(Number(v));
    case "fecha": return formatearFecha(new Date(`${String(v)}T00:00:00Z`));
    default: return String(v);
  }
}

export const esNumerica = (c: Columna): boolean => c.tipo === "decimal" || c.tipo === "entero";
