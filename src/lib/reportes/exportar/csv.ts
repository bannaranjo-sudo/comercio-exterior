import type { Encabezado } from "../indice";
import type { ReporteDatos, Tabla, Valor } from "../tipos";

// CSV en UTF-8 con BOM (Excel lo abre con acentos correctos), separador coma y saltos CRLF.

/** Evita la inyección de fórmulas al abrir el archivo en una hoja de cálculo. */
const seguro = (texto: string): string => (/^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto);

function celda(v: Valor, tipo: string): string {
  if (v === null || v === undefined) return "";
  const texto = String(v);
  const t = tipo === "texto" ? seguro(texto) : texto;
  return /[",\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

const linea = (valores: string[]) => valores.map((v) => celda(v, "texto")).join(",");

export function generarCsv(enc: Encabezado, datos: ReporteDatos, tabla: Tabla): Buffer {
  const lineas: string[] = [
    linea(["Empresa", enc.empresa]),
    linea(["Identificación fiscal", enc.identificacionFiscal]),
    linea(["Reporte", `${enc.reporte} · ${tabla.titulo}`]),
    linea(["Período", `${enc.periodo} (sobre: ${enc.campoPeriodo})`]),
    linea(["Filtros", enc.filtros.join("; ") || "Ninguno"]),
    linea(["Generado", `${enc.generadoEn} por ${enc.generadoPor}`]),
    linea(["Unidades monetarias", "Importes en la moneda indicada en cada fila; sin conversión entre monedas"]),
    ...datos.avisos.map((a) => linea(["Nota", a])),
    "",
    tabla.columnas.map((c) => celda(c.etiqueta, "texto")).join(","),
    ...tabla.filas.map((f) => tabla.columnas.map((c) => celda(f.celdas[c.clave] ?? null, c.tipo)).join(",")),
  ];
  return Buffer.from("﻿" + lineas.join("\r\n") + "\r\n", "utf8");
}
