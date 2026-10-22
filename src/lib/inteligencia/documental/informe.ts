import type { DatoVerificado, EvidenciaVerificada, InconsistenciaVerificada } from "./evidencia";
import type { Campo } from "./esquema";

// Forma del informe guardado en Resultado.contenido (versión 1) y su lectura segura para la interfaz.

export type InformeDocumental = {
  version: 1;
  tipo: "documental";
  generado: { proveedor: string; modelo: string; simulado: boolean };
  operacion: { id: string; numero: string };
  resumen: string;
  documentos: { id: string; nombre: string; tipo: string; tipoEtiqueta: string; sha256: string; estadoExtraccion: "CON_TEXTO" | "SIN_TEXTO" | "ERROR"; paginas: number; caracteres: number; truncado: boolean; problema: string | null }[];
  datos: DatoVerificado[];
  inconsistencias: InconsistenciaVerificada[];
  faltantes: { elemento: string; detalle?: string }[];
  noEncontrado: Campo[];
  documentosRequeridosFaltantes: { tipo: string; etiqueta: string }[];
  verificacion: { citasTotales: number; citasVerificadas: number; datosSinEvidencia: number };
  advertencias: string[];
};

export type { DatoVerificado, EvidenciaVerificada, InconsistenciaVerificada };

export function leerInforme(contenido: unknown): InformeDocumental | null {
  const c = contenido as Partial<InformeDocumental> | null;
  if (!c || c.tipo !== "documental" || c.version !== 1 || !Array.isArray(c.datos) || !Array.isArray(c.documentos) || typeof c.resumen !== "string") return null;
  return c as InformeDocumental;
}
