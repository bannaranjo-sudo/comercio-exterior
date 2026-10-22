import { normalizarTexto } from "./extraccion";
import type { EvidenciaModelo, SalidaModelo } from "./esquema";
import type { DocumentoAnalizado } from "./prompt";

// Verificación de evidencia: el modelo cita, el sistema comprueba. Una cita solo se acepta si aparece literalmente
// (ignorando mayúsculas, espacios y tildes) en el texto del documento citado; la página se corrige o se descarta según
// dónde se encuentre realmente. Lo que no se pueda verificar se marca como tal y no se presenta como evidencia.

const clave = (s: string): string => normalizarTexto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type EvidenciaVerificada = {
  documentoId: string;
  documento: string | null;
  pagina: number | null;
  cita: string;
  verificada: boolean;
};

export function verificarEvidencia(ev: EvidenciaModelo, docs: readonly DocumentoAnalizado[]): EvidenciaVerificada {
  const doc = docs.find((d) => d.id === ev.documentoId);
  const base = { documentoId: ev.documentoId, documento: doc?.nombre ?? null, cita: ev.cita };
  if (!doc?.extraccion) return { ...base, pagina: null, verificada: false };
  const buscada = clave(ev.cita);
  if (buscada.length < 3) return { ...base, pagina: null, verificada: false };
  const paginas = doc.extraccion.paginas.map((p) => ({ numero: p.numero, texto: clave(p.texto) }));
  // Primero la página indicada; si no coincide, cualquier otra página donde sí conste.
  const indicada = ev.pagina ? paginas.find((p) => p.numero === ev.pagina && p.texto.includes(buscada)) : undefined;
  const hallada = indicada ?? paginas.find((p) => p.texto.includes(buscada));
  return hallada ? { ...base, pagina: hallada.numero, verificada: true } : { ...base, pagina: null, verificada: false };
}

export type DatoVerificado = {
  campo: SalidaModelo["datos"][number]["campo"];
  etiqueta: string | null;
  valor: string;
  /** extraido: respaldado por evidencia verificada · inferido: deducción del modelo · sin_evidencia: dicho como extraído pero sin cita verificable. */
  clasificacion: "extraido" | "inferido" | "sin_evidencia";
  explicacion: string | null;
  evidencia: EvidenciaVerificada[];
};

export type InconsistenciaVerificada = {
  titulo: string;
  detalle: string;
  nivel: "bajo" | "medio" | "alto";
  evidencia: EvidenciaVerificada[];
};

export function verificarSalida(salida: SalidaModelo, docs: readonly DocumentoAnalizado[]) {
  const datos: DatoVerificado[] = salida.datos.map((d) => {
    const evidencia = d.evidencia.map((e) => verificarEvidencia(e, docs));
    const respaldado = evidencia.some((e) => e.verificada);
    return {
      campo: d.campo,
      etiqueta: d.etiqueta ?? null,
      valor: d.valor,
      clasificacion: d.tipo === "inferido" ? "inferido" : respaldado ? "extraido" : "sin_evidencia",
      explicacion: d.explicacion ?? null,
      evidencia,
    };
  });
  const inconsistencias: InconsistenciaVerificada[] = salida.inconsistencias.map((i) => ({
    titulo: i.titulo, detalle: i.detalle, nivel: i.nivel, evidencia: i.evidencia.map((e) => verificarEvidencia(e, docs)),
  }));
  const todas = [...datos.flatMap((d) => d.evidencia), ...inconsistencias.flatMap((i) => i.evidencia)];
  return {
    datos,
    inconsistencias,
    verificacion: {
      citasTotales: todas.length,
      citasVerificadas: todas.filter((e) => e.verificada).length,
      datosSinEvidencia: datos.filter((d) => d.clasificacion === "sin_evidencia").length,
    },
  };
}
