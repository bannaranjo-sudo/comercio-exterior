import type { ProveedorIA } from "@/generated/prisma/enums";

// Capa de abstracción multiproveedor. No hay adaptadores registrados todavía: ninguna
// llamada a servicios de IA es posible hasta que se registre uno (p. ej. sobre Vercel AI SDK).

export const PROVEEDORES = {
  OPENAI: { nombre: "OpenAI", prefijo: "openai" },
  ANTHROPIC: { nombre: "Anthropic", prefijo: "anthropic" },
  GOOGLE: { nombre: "Google", prefijo: "google" },
  SIMULADO: { nombre: "Simulado (pruebas)", prefijo: "simulado" },
} as const satisfies Record<ProveedorIA, { nombre: string; prefijo: string }>;

/** Proveedores con adaptador implementado en el código. */
export const PROVEEDORES_IMPLEMENTADOS: readonly ProveedorIA[] = ["OPENAI"];

/** Proveedores configurables por la empresa (SIMULADO es interno: solo para pruebas sin costo). */
export const LISTA_PROVEEDORES: ProveedorIA[] = ["OPENAI", "ANTHROPIC", "GOOGLE"];

export const esProveedor = (valor: unknown): valor is ProveedorIA =>
  typeof valor === "string" && (LISTA_PROVEEDORES as string[]).includes(valor);

export type ReferenciaModelo = { proveedor: ProveedorIA; modelo: string };

/** Identificador "proveedor/modelo", el formato que usa Vercel AI SDK para referenciar modelos. */
export const idModeloAISDK = ({ proveedor, modelo }: ReferenciaModelo): string =>
  `${PROVEEDORES[proveedor].prefijo}/${modelo}`;

export type SolicitudGeneracion = {
  referencia: ReferenciaModelo;
  sistema?: string;
  mensajes: readonly { rol: "user" | "assistant"; contenido: string }[];
  temperatura?: number;
  maximoTokens?: number;
  /** Tope de tokens de salida que esta solicitud puede pedir (acotado por LIMITES.tokensSalidaAbsoluto). */
  topeTokens?: number;
  /** Tiempo máximo de espera de esta solicitud (acotado por LIMITES.tiempoAbsolutoMs). */
  tiempoMaxMs?: number;
};

export type RespuestaGeneracion = {
  texto: string;
  /** Motivo de finalización informado por el proveedor (p. ej. "stop", "length"). */
  motivoFin?: string;
  /** Métricas que el proveedor no informa quedan indefinidas; nunca se asumen en 0. */
  uso?: { tokensEntrada?: number; tokensSalida?: number; tokensRazonamiento?: number };
};

export interface AdaptadorProveedor {
  readonly proveedor: ProveedorIA;
  generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion>;
}

export class ErrorProveedorNoDisponible extends Error {
  constructor(proveedor: ProveedorIA) {
    super(`No hay un adaptador registrado para ${PROVEEDORES[proveedor].nombre}.`);
    this.name = "ErrorProveedorNoDisponible";
  }
}

const adaptadores = new Map<ProveedorIA, AdaptadorProveedor>();

export function registrarAdaptador(adaptador: AdaptadorProveedor): void {
  adaptadores.set(adaptador.proveedor, adaptador);
}

export const adaptadorRegistrado = (proveedor: ProveedorIA): boolean => adaptadores.has(proveedor);

export function obtenerAdaptador(proveedor: ProveedorIA): AdaptadorProveedor {
  const adaptador = adaptadores.get(proveedor);
  if (!adaptador) throw new ErrorProveedorNoDisponible(proveedor);
  return adaptador;
}
