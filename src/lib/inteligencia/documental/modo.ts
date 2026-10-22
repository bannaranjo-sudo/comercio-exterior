import { createHash } from "node:crypto";
import { iaRealPermitida, type Entorno } from "@/lib/despliegue/entorno";

// Modo de ejecución de los análisis con IA. Por defecto está DESHABILITADO: las solicitudes quedan en cola y no se
// ejecuta ni se cobra nada. "simulado" usa un proveedor local sin costo (desarrollo y pruebas). "real" llama a
// OpenAI y exige, además de la clave del servidor, una autorización de UN SOLO USO (ver docs/ANALISIS_DOCUMENTAL.md).

export type ModoAnalisis = "deshabilitado" | "simulado" | "real";

export type EstadoModo = {
  /** Lo configurado en IA_ANALISIS_MODO. */
  configurado: ModoAnalisis;
  /** Lo que realmente se aplicará (el modo real sin sus requisitos degrada a deshabilitado). */
  efectivo: ModoAnalisis;
  motivo: string;
};

export const LIMITES_ANALISIS = {
  maxDocumentos: 8,
  maxPaginasPorDocumento: 40,
  maxCaracteresPorDocumento: 40_000,
  maxCaracteresTotal: 120_000,
  /** Tokens de salida solicitados al modelo para el informe estructurado. */
  tokensSalida: 3_000,
  tiempoMaxMs: 60_000,
  /** Una ejecución EN_CURSO más antigua que esto se considera interrumpida. */
  huerfanaMs: 5 * 60_000,
  simultaneasPorEmpresa: 2,
  enColaPorEmpresa: 25,
  porUsuario: { max: 10, ventanaMs: 60 * 60_000 },
  porEmpresa: { max: 30, ventanaMs: 60 * 60_000 },
} as const;

const MODOS: readonly ModoAnalisis[] = ["deshabilitado", "simulado", "real"];

export const hashAutorizacion = (codigo: string): string => createHash("sha256").update(`analisis-real:${codigo}`).digest("hex");

/** Código de autorización de un solo uso definido en el servidor (IA_ANALISIS_REAL_AUTORIZACION), si es válido. */
export function codigoAutorizacionReal(env: Entorno = process.env): string | null {
  const c = env.IA_ANALISIS_REAL_AUTORIZACION?.trim();
  return c && c.length >= 16 ? c : null;
}

export function estadoModo(env: Entorno = process.env): EstadoModo {
  const bruto = (env.IA_ANALISIS_MODO ?? "deshabilitado").trim().toLowerCase();
  const configurado = (MODOS as readonly string[]).includes(bruto) ? (bruto as ModoAnalisis) : "deshabilitado";
  if (configurado === "simulado") return { configurado, efectivo: "simulado", motivo: "Proveedor simulado: sin llamadas externas ni costo." };
  if (configurado === "real") {
    if (!iaRealPermitida(env)) return { configurado, efectivo: "deshabilitado", motivo: "Modo real sin clave de proveedor habilitada en el servidor." };
    if (!codigoAutorizacionReal(env)) return { configurado, efectivo: "deshabilitado", motivo: "Modo real sin autorización de un solo uso vigente." };
    return { configurado, efectivo: "real", motivo: "Ejecución real autorizada para una única ejecución." };
  }
  return { configurado: "deshabilitado", efectivo: "deshabilitado", motivo: "Ninguna solicitud consume proveedores mientras el servidor no habilite IA_ANALISIS_MODO." };
}
