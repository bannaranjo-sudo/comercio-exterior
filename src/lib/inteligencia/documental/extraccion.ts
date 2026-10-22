import { LIMITES_ANALISIS } from "./modo";

// Extracción de texto de PDF (capa independiente del modelo): solo PDF con texto seleccionable, sin OCR.

export type CodigoExtraccion = "PDF_CORRUPTO" | "PDF_PROTEGIDO";

export class ErrorExtraccion extends Error {
  constructor(readonly codigo: CodigoExtraccion, mensaje: string) {
    super(mensaje);
    this.name = "ErrorExtraccion";
  }
}

export type PaginaExtraida = { numero: number; texto: string };

export type ExtraccionPdf = {
  /** CON_TEXTO: hay texto seleccionable. SIN_TEXTO: probablemente escaneado (imagen); no se aplica OCR. */
  estado: "CON_TEXTO" | "SIN_TEXTO";
  totalPaginas: number;
  paginas: PaginaExtraida[];
  caracteres: number;
  /** Se recortaron páginas o caracteres por los límites de análisis. */
  truncado: boolean;
};

/** Texto mínimo para considerar que un PDF "tiene texto": evita tratar metadatos o marcas sueltas como contenido. */
const MIN_CARACTERES_UTILES = 20;

export const normalizarTexto = (s: string): string => s.replace(/\s+/g, " ").trim();

export async function extraerTextoPdf(contenido: Buffer): Promise<ExtraccionPdf> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(contenido));
  } catch (error) {
    const nombre = (error as { name?: string }).name ?? "";
    if (nombre === "PasswordException") throw new ErrorExtraccion("PDF_PROTEGIDO", "El PDF está protegido con contraseña.");
    throw new ErrorExtraccion("PDF_CORRUPTO", "No se pudo leer el PDF: está dañado o no es válido.");
  }
  try {
    const totalPaginas = doc.numPages;
    if (totalPaginas < 1) throw new ErrorExtraccion("PDF_CORRUPTO", "El PDF no contiene páginas.");
    const { text } = await extractText(doc, { mergePages: false });
    let restantes = LIMITES_ANALISIS.maxCaracteresPorDocumento;
    let truncado = totalPaginas > LIMITES_ANALISIS.maxPaginasPorDocumento;
    const paginas: PaginaExtraida[] = [];
    for (const [i, bruto] of text.slice(0, LIMITES_ANALISIS.maxPaginasPorDocumento).entries()) {
      if (restantes <= 0) {
        truncado = true;
        break;
      }
      let t = normalizarTexto(bruto);
      if (t.length > restantes) {
        t = t.slice(0, restantes);
        truncado = true;
      }
      restantes -= t.length;
      paginas.push({ numero: i + 1, texto: t });
    }
    const caracteres = paginas.reduce((s, p) => s + p.texto.length, 0);
    return { estado: caracteres >= MIN_CARACTERES_UTILES ? "CON_TEXTO" : "SIN_TEXTO", totalPaginas, paginas, caracteres, truncado };
  } catch (error) {
    if (error instanceof ErrorExtraccion) throw error;
    throw new ErrorExtraccion("PDF_CORRUPTO", "No se pudo extraer el texto del PDF.");
  }
}
