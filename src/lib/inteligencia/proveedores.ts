import type { ProveedorIA } from "@/generated/prisma/enums";

// Capa de abstracción multiproveedor. No hay adaptadores registrados todavía: ninguna
// llamada a servicios de IA es posible hasta que se registre uno (p. ej. sobre Vercel AI SDK).

export const PROVEEDORES = {
  OPENAI: { nombre: "OpenAI", prefijo: "openai" },
  ANTHROPIC: { nombre: "Anthropic", prefijo: "anthropic" },
  GOOGLE: { nombre: "Google", prefijo: "google" },
} as const satisfies Record<ProveedorIA, { nombre: string; prefijo: string }>;

export const LISTA_PROVEEDORES = Object.keys(PROVEEDORES) as ProveedorIA[];

export const esProveedor = (valor: unknown): valor is ProveedorIA =>
  typeof valor === "string" && Object.hasOwn(PROVEEDORES, valor);

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
};

export type RespuestaGeneracion = {
  texto: string;
  uso?: { tokensEntrada: number; tokensSalida: number };
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

export function obtenerAdaptador(proveedor: ProveedorIA): AdaptadorProveedor {
  const adaptador = adaptadores.get(proveedor);
  if (!adaptador) throw new ErrorProveedorNoDisponible(proveedor);
  return adaptador;
}
