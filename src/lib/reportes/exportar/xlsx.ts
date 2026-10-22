import type { Encabezado } from "../indice";
import type { Columna, ReporteDatos, Tabla, Valor } from "../tipos";
import { crearZip } from "./zip";

// Libro Excel (.xlsx) generado a mano: hoja "Resumen" con identificación, filtros e indicadores y una hoja por tabla.
// Los importes se escriben como el texto decimal exacto del servidor (sin pasar por coma flotante en este código).

const ESTILO = { normal: 0, encabezado: 1, dec2: 2, fecha: 3, titulo: 4, entero: 5, dec1: 6, dec4: 7, etiqueta: 8 } as const;

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const columnaLetra = (i: number): string => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const texto = (ref: string, v: string, estilo: number = ESTILO.normal) =>
  `<c r="${ref}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
const numero = (ref: string, v: string | number, estilo: number) => `<c r="${ref}" s="${estilo}"><v>${v}</v></c>`;

const NUMERO_EXACTO = /^-?\d+(\.\d+)?$/;
const serialExcel = (iso: string): number => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

function celdaDe(ref: string, c: Columna, v: Valor): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  switch (c.tipo) {
    case "entero": return Number.isFinite(Number(v)) ? numero(ref, Number(v), ESTILO.entero) : texto(ref, s);
    case "decimal": {
      if (!NUMERO_EXACTO.test(s)) return texto(ref, s);
      const d = c.decimales ?? 2;
      return numero(ref, s, d === 1 ? ESTILO.dec1 : d >= 3 ? ESTILO.dec4 : ESTILO.dec2);
    }
    case "fecha": return /^\d{4}-\d{2}-\d{2}$/.test(s) ? numero(ref, serialExcel(s), ESTILO.fecha) : texto(ref, s);
    default: return texto(ref, s);
  }
}

type Fila = string[];

function hoja(filas: Fila[], anchos: number[], opciones: { congelar?: boolean; filtro?: string } = {}): string {
  const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="${opciones.congelar ? 1 : 0}">` +
    (opciones.congelar ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` : "") +
    `</sheetView></sheetViews><cols>${cols}</cols><sheetData>${filas.map((f, i) => `<row r="${i + 1}">${f.join("")}</row>`).join("")}</sheetData>` +
    (opciones.filtro ? `<autoFilter ref="${opciones.filtro}"/>` : "") +
    `</worksheet>`
  );
}

const nombreHoja = (n: string, usados: Set<string>): string => {
  const base = n.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Hoja";
  let nombre = base;
  for (let i = 2; usados.has(nombre.toLowerCase()); i++) nombre = `${base.slice(0, 26)} ${i}`;
  usados.add(nombre.toLowerCase());
  return nombre;
};

function hojaResumen(enc: Encabezado, datos: ReporteDatos): string {
  const filas: Fila[] = [];
  const par = (k: string, v: string) => filas.push([texto(`A${filas.length + 1}`, k, ESTILO.etiqueta), texto(`B${filas.length + 1}`, v)]);
  filas.push([texto("A1", enc.reporte, ESTILO.titulo)]);
  par("Empresa", enc.empresa);
  par("Identificación fiscal", enc.identificacionFiscal);
  par("Período", enc.periodo);
  par("Período aplicado sobre", enc.campoPeriodo);
  par("Filtros", enc.filtros.join("; ") || "Ninguno");
  par("Generado", `${enc.generadoEn} por ${enc.generadoPor}`);
  par("Unidades monetarias", "Importes en la moneda indicada; sin conversión entre monedas");
  for (const a of datos.avisos) par("Nota", a);
  filas.push([]);
  if (datos.kpis.length) {
    const r = filas.length + 1;
    filas.push([texto(`A${r}`, "Indicador", ESTILO.encabezado), texto(`B${r}`, "Valor", ESTILO.encabezado), texto(`C${r}`, "Detalle", ESTILO.encabezado)]);
    for (const k of datos.kpis) {
      const n = filas.length + 1;
      filas.push([texto(`A${n}`, k.etiqueta), texto(`B${n}`, k.valor), k.detalle ? texto(`C${n}`, k.detalle) : ""]);
    }
  }
  return hoja(filas, [34, 60, 44]);
}

function hojaTabla(t: Tabla): string {
  const filas: Fila[] = [t.columnas.map((c, i) => texto(`${columnaLetra(i)}1`, c.etiqueta, ESTILO.encabezado))];
  t.filas.forEach((f, r) => filas.push(t.columnas.map((c, i) => celdaDe(`${columnaLetra(i)}${r + 2}`, c, f.celdas[c.clave] ?? null))));
  const anchos = t.columnas.map((c) => {
    const largo = Math.max(c.etiqueta.length, ...t.filas.slice(0, 200).map((f) => String(f.celdas[c.clave] ?? "").length));
    return Math.min(60, Math.max(10, largo + 2));
  });
  const fin = `${columnaLetra(t.columnas.length - 1)}${filas.length}`;
  return hoja(filas, anchos, { congelar: true, filtro: t.filas.length ? `A1:${fin}` : undefined });
}

export function generarXlsx(enc: Encabezado, datos: ReporteDatos): Buffer {
  const usados = new Set<string>(["resumen"]);
  const hojas = [{ nombre: "Resumen", xml: hojaResumen(enc, datos) }, ...datos.tablas.map((t) => ({ nombre: nombreHoja(t.titulo, usados), xml: hojaTabla(t) }))];

  const estilos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.0"/><numFmt numFmtId="166" formatCode="#,##0.0000"/><numFmt numFmtId="167" formatCode="yyyy\\-mm\\-dd"/></numFmts>` +
    `<fonts count="4"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

  const tipos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const relsRaiz =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const libro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets></workbook>`;
  const relsLibro =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const propiedades =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(`${enc.reporte} · ${enc.empresa}`)}</dc:title><dc:creator>${esc(enc.generadoPor)}</dc:creator></cp:coreProperties>`;

  const b = (s: string) => Buffer.from(s, "utf8");
  return crearZip([
    { nombre: "[Content_Types].xml", contenido: b(tipos) },
    { nombre: "_rels/.rels", contenido: b(relsRaiz) },
    { nombre: "docProps/core.xml", contenido: b(propiedades) },
    { nombre: "xl/workbook.xml", contenido: b(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", contenido: b(relsLibro) },
    { nombre: "xl/styles.xml", contenido: b(estilos) },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: b(h.xml) })),
  ]);
}
