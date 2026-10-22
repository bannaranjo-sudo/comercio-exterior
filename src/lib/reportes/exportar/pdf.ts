import { deflateSync } from "node:zlib";
import type { Encabezado } from "../indice";
import { esNumerica, formatearValor } from "../presentacion";
import type { ReporteDatos, Tabla } from "../tipos";

// PDF gerencial básico (A4 horizontal, Helvetica) generado sin dependencias: identificación, indicadores y tablas.
// Las tablas largas se limitan (se informa en el documento); el detalle completo está en Excel y CSV.

const ANCHO = 842;
const ALTO = 595;
const MARGEN = 36;
const FILAS_PRINCIPAL = 250;
const FILAS_SECUNDARIA = 40;

const REEMPLAZOS: Record<string, string> = { "→": "->", "−": "-", "—": "-", "–": "-", "…": "...", "≥": ">=", "≤": "<=" };
/** Limpia el texto a la codificación WinAnsi (latin1 para el alfabeto español). */
const limpio = (s: string): string =>
  [...s].map((c) => REEMPLAZOS[c] ?? (c.charCodeAt(0) < 256 && c.charCodeAt(0) >= 32 ? c : c.charCodeAt(0) < 32 ? " " : "?")).join("");
const escapar = (s: string): string => limpio(s).replace(/([\\()])/g, "\\$1");

function ancho(s: string, tam: number, negrita = false): number {
  let w = 0;
  for (const c of limpio(s)) w += /[0-9]/.test(c) ? 0.556 : c === " " ? 0.278 : /[A-ZÁÉÍÓÚÑ]/.test(c) ? 0.68 : /[.,;:|'!ilj]/.test(c) ? 0.26 : /[mwMW]/.test(c) ? 0.85 : 0.52;
  return w * tam * (negrita ? 1.06 : 1);
}

function recortar(s: string, max: number, tam: number, negrita = false): string {
  const t = limpio(s);
  if (ancho(t, tam, negrita) <= max) return t;
  let r = t;
  while (r.length > 1 && ancho(r + "...", tam, negrita) > max) r = r.slice(0, -1);
  return r + "...";
}

class Documento {
  paginas: string[][] = [];
  y = 0;
  constructor(private enc: Encabezado) {
    this.nuevaPagina();
  }
  get actual() {
    return this.paginas[this.paginas.length - 1];
  }
  nuevaPagina() {
    this.paginas.push([]);
    this.y = ALTO - MARGEN;
  }
  asegurar(alto: number) {
    if (this.y - alto < MARGEN + 18) {
      this.nuevaPagina();
      return true;
    }
    return false;
  }
  texto(x: number, y: number, s: string, tam = 8, negrita = false, color: [number, number, number] = [0.1, 0.1, 0.15]) {
    this.actual.push(`BT /${negrita ? "F2" : "F1"} ${tam} Tf ${color.join(" ")} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${escapar(s)}) Tj ET`);
  }
  rect(x: number, y: number, w: number, h: number, color: [number, number, number]) {
    this.actual.push(`${color.join(" ")} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
  }
  linea(x1: number, y1: number, x2: number, y2: number) {
    this.actual.push(`0.82 0.84 0.88 RG 0.5 w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  }
  linea1(s: string, tam = 8, negrita = false, avance = tam + 4) {
    this.asegurar(avance);
    this.y -= avance;
    this.texto(MARGEN, this.y, recortar(s, ANCHO - 2 * MARGEN, tam, negrita), tam, negrita);
  }
  espacio(n: number) {
    this.y -= n;
  }

  tabla(t: Tabla, limite: number) {
    const cols = t.columnas;
    const filas = t.filas.slice(0, limite);
    const tam = 7;
    const util = ANCHO - 2 * MARGEN;
    const pesos = cols.map((c) => {
      const muestra = [c.etiqueta, ...filas.slice(0, 60).map((f) => formatearValor(c, f.celdas[c.clave] ?? null))];
      return Math.min(40, Math.max(6, ...muestra.map((m) => m.length), 5));
    });
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    const anchos = pesos.map((p) => (p / sumaPesos) * util);

    this.asegurar(40);
    this.y -= 6;
    this.texto(MARGEN, this.y - 8, `${t.titulo} (${t.total.toLocaleString("es-CO")})`, 10, true);
    this.y -= 18;
    const encabezado = () => {
      this.asegurar(26);
      this.rect(MARGEN, this.y - 13, util, 14, [0.12, 0.23, 0.37]);
      let x = MARGEN;
      cols.forEach((c, i) => {
        const w = anchos[i] - 6;
        const txt = recortar(c.etiqueta, w, tam, true);
        this.texto(esNumerica(c) ? x + 3 + w - ancho(txt, tam, true) : x + 3, this.y - 9, txt, tam, true, [1, 1, 1]);
        x += anchos[i];
      });
      this.y -= 14;
    };
    encabezado();
    if (filas.length === 0) {
      this.y -= 12;
      this.texto(MARGEN + 3, this.y, "Sin registros para los filtros aplicados.", 8);
    }
    for (const f of filas) {
      if (this.y - 12 < MARGEN + 18) {
        this.nuevaPagina();
        encabezado();
      }
      let x = MARGEN;
      cols.forEach((c, i) => {
        const w = anchos[i] - 6;
        const txt = recortar(formatearValor(c, f.celdas[c.clave] ?? null), w, tam);
        this.texto(esNumerica(c) ? x + 3 + w - ancho(txt, tam) : x + 3, this.y - 8.5, txt, tam);
        x += anchos[i];
      });
      this.y -= 11;
      this.linea(MARGEN, this.y, MARGEN + util, this.y);
    }
    const notas = [t.nota, t.filas.length > limite ? `Se muestran las primeras ${limite} filas de ${t.total.toLocaleString("es-CO")}. El detalle completo está en Excel o CSV.` : undefined].filter(Boolean) as string[];
    for (const n of notas) this.linea1(n, 7, false, 10);
    this.y -= 8;
  }

  construir(): Buffer {
    const total = this.paginas.length;
    const objetos: Buffer[] = [];
    const agregar = (contenido: string | Buffer): number => {
      objetos.push(Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, "latin1"));
      return objetos.length;
    };
    agregar("<< /Type /Catalog /Pages 2 0 R >>");
    agregar(""); // 2: Pages (se completa abajo)
    agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
    agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"); // 4
    const hijos: number[] = [];
    this.paginas.forEach((ops, i) => {
      const pie = [
        `BT /F1 7 Tf 0.4 0.43 0.5 rg ${MARGEN} ${MARGEN - 4} Td (${escapar(`${this.enc.empresa} - ${this.enc.reporte} - Generado ${this.enc.generadoEn} - Importes por moneda, sin conversion`)}) Tj ET`,
        `BT /F1 7 Tf 0.4 0.43 0.5 rg ${ANCHO - MARGEN - 60} ${MARGEN - 4} Td (${escapar(`Pagina ${i + 1} de ${total}`)}) Tj ET`,
      ];
      const flujo = deflateSync(Buffer.from([...ops, ...pie].join("\n"), "latin1"));
      const contenido = agregar(Buffer.concat([Buffer.from(`<< /Length ${flujo.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), flujo, Buffer.from("\nendstream", "latin1")]));
      hijos.push(agregar(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contenido} 0 R >>`));
    });
    objetos[1] = Buffer.from(`<< /Type /Pages /Kids [${hijos.map((h) => `${h} 0 R`).join(" ")}] /Count ${hijos.length} >>`, "latin1");

    const partes: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
    const offsets: number[] = [];
    let pos = partes[0].length;
    objetos.forEach((o, i) => {
      const cab = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
      const pie = Buffer.from("\nendobj\n", "latin1");
      offsets.push(pos);
      partes.push(cab, o, pie);
      pos += cab.length + o.length + pie.length;
    });
    const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
    return Buffer.concat(partes);
  }
}

export function generarPdf(enc: Encabezado, datos: ReporteDatos): Buffer {
  const d = new Documento(enc);
  d.linea1(`${enc.empresa}  ·  ${enc.identificacionFiscal}`, 9, true, 10);
  d.linea1(datos.titulo, 16, true, 22);
  d.linea1(`Período: ${enc.periodo} (sobre: ${enc.campoPeriodo})`, 8);
  d.linea1(`Filtros: ${enc.filtros.join("; ") || "Ninguno"}`, 8);
  d.linea1(`Generado: ${enc.generadoEn} por ${enc.generadoPor}`, 8);
  d.linea1("Unidades monetarias: importes en la moneda indicada; no se convierten ni consolidan monedas distintas.", 8);
  for (const a of datos.avisos) d.linea1(`Nota: ${a}`, 7, false, 9);
  d.espacio(8);

  if (datos.kpis.length) {
    d.linea1("Indicadores", 10, true, 14);
    const colW = (ANCHO - 2 * MARGEN) / 3;
    for (let i = 0; i < datos.kpis.length; i += 3) {
      d.asegurar(26);
      d.y -= 24;
      datos.kpis.slice(i, i + 3).forEach((k, j) => {
        const x = MARGEN + j * colW;
        d.texto(x, d.y + 12, recortar(k.etiqueta, colW - 10, 7), 7, false, [0.35, 0.38, 0.45]);
        d.texto(x, d.y, recortar(k.valor, colW - 10, 12, true), 12, true);
      });
    }
    d.espacio(6);
  }
  datos.tablas.forEach((t, i) => d.tabla(t, i === 0 ? FILAS_PRINCIPAL : FILAS_SECUNDARIA));
  return d.construir();
}
