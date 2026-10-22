import type { EstadoEjecucion } from "@/generated/prisma/enums";

// "Solicitud registrada" nunca debe confundirse con "análisis ejecutado": el estado inicial se llama "En cola".
export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoEjecucion, string> = {
  PENDIENTE: "En cola",
  EN_CURSO: "En ejecución",
  COMPLETADA: "Completada",
  FALLIDA: "Fallida",
  CANCELADA: "Cancelada",
};

export const DESCRIPCION_ESTADO_SOLICITUD: Record<EstadoEjecucion, string> = {
  PENDIENTE: "La solicitud está registrada y en cola. Todavía no se ha ejecutado ningún análisis.",
  EN_CURSO: "El análisis se está ejecutando.",
  COMPLETADA: "El análisis terminó. Revise el resultado.",
  FALLIDA: "El análisis no pudo completarse.",
  CANCELADA: "La solicitud fue cancelada.",
};

export type EstadoRevision = "SIN_ENVIAR" | "PENDIENTE" | "APROBADO" | "RECHAZADO" | "DEVUELTO";

export const ETIQUETA_REVISION: Record<EstadoRevision, string> = {
  SIN_ENVIAR: "Sin enviar a revisión",
  PENDIENTE: "Por revisar",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  DEVUELTO: "Devuelto con observaciones",
};

/** Estado de revisión humana de una solicitud: solo tiene sentido cuando el análisis terminó y generó un resultado. */
export function estadoRevision(solicitud: { estado: string; resultados: { aprobacion: { estado: string } | null }[] }): EstadoRevision | null {
  if (solicitud.estado !== "COMPLETADA" || solicitud.resultados.length === 0) return null;
  return (solicitud.resultados[0].aprobacion?.estado as EstadoRevision | undefined) ?? "SIN_ENVIAR";
}
