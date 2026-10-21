import { APICallError } from "ai";
import { ErrorProveedorNoDisponible } from "@/lib/inteligencia/proveedores";

export type CodigoErrorProveedor =
  | "NO_CONFIGURADO"
  | "AUTENTICACION"
  | "LIMITE_USO"
  | "MODELO_NO_DISPONIBLE"
  | "CONEXION"
  | "PROVEEDOR_NO_DISPONIBLE"
  | "LIMITE_SOLICITUDES"
  | "DESCONOCIDO";

// Mensajes seguros para mostrar en el navegador: nunca incluyen texto devuelto por el proveedor.
const MENSAJES: Record<CodigoErrorProveedor, string> = {
  NO_CONFIGURADO: "La clave del proveedor no está configurada en el servidor.",
  AUTENTICACION: "El proveedor rechazó las credenciales del servidor.",
  LIMITE_USO: "El proveedor alcanzó su límite de uso o cuota. Intente más tarde.",
  MODELO_NO_DISPONIBLE: "El modelo no está disponible para esta cuenta.",
  CONEXION: "No se pudo conectar con el proveedor.",
  PROVEEDOR_NO_DISPONIBLE: "El proveedor aún no tiene un adaptador conectado.",
  LIMITE_SOLICITUDES: "Se superó el límite de solicitudes permitido. Intente en unos minutos.",
  DESCONOCIDO: "Ocurrió un error inesperado al consultar al proveedor.",
};

export class ErrorProveedorIA extends Error {
  constructor(readonly codigo: CodigoErrorProveedor) {
    super(MENSAJES[codigo]);
    this.name = "ErrorProveedorIA";
  }
}

const CODIGOS_RED = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

/** Traduce cualquier fallo a un ErrorProveedorIA sin conservar el mensaje original (puede contener datos sensibles). */
export function traducirError(error: unknown): ErrorProveedorIA {
  if (error instanceof ErrorProveedorIA) return error;
  if (error instanceof ErrorProveedorNoDisponible) return new ErrorProveedorIA("PROVEEDOR_NO_DISPONIBLE");

  if (APICallError.isInstance(error)) {
    const estado = error.statusCode;
    if (estado === 401 || estado === 403) return new ErrorProveedorIA("AUTENTICACION");
    if (estado === 429) return new ErrorProveedorIA("LIMITE_USO");
    if (estado === 404) return new ErrorProveedorIA("MODELO_NO_DISPONIBLE");
    if (estado === undefined || estado >= 500) return new ErrorProveedorIA("CONEXION");
    return new ErrorProveedorIA("DESCONOCIDO");
  }

  const e = error as { name?: string; code?: string; cause?: { code?: string } } | null;
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return new ErrorProveedorIA("CONEXION");
  if (CODIGOS_RED.has(e?.code ?? "") || CODIGOS_RED.has(e?.cause?.code ?? "")) {
    return new ErrorProveedorIA("CONEXION");
  }
  return new ErrorProveedorIA("DESCONOCIDO");
}
