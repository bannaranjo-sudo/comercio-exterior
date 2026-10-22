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
