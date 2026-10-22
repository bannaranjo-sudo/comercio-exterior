import type { IdReporte } from "./tipos";
import type { Prisma } from "@/generated/prisma/client";
import {
  CategoriaCosto, EstadoCosto, EstadoDocumento, EstadoEnvio, EstadoOperacion, ModalidadTransporte, RolTercero, TipoOperacion,
} from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { ErrorValidacion } from "@/lib/errores";
import { z } from "@/lib/validacion";

// Filtros de los reportes. Se leen de la URL pero se validan siempre en el servidor; la empresa NUNCA viene
// del cliente (sale del contexto autorizado). Un valor no válido se rechaza, no se ignora en silencio.

const vacio = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess(vacio, esquema.optional());

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.").refine(
  (s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); },
  "La fecha no es válida.",
);
const ID = z.uuid({ error: "Un identificador del filtro no es válido." });

const esquema = z.object({
  desde: opcional(FECHA),
  hasta: opcional(FECHA),
  tipo: opcional(z.enum(TipoOperacion, { error: "El tipo de operación no es válido." })),
  estado: opcional(z.enum(EstadoOperacion, { error: "El estado no es válido." })),
  pais: opcional(z.string().trim().max(80, "El país no es válido.")),
  terceroId: opcional(ID),
  operacionId: opcional(ID),
  responsableId: opcional(ID),
  modalidad: opcional(z.enum(ModalidadTransporte, { error: "La modalidad no es válida." })),
  moneda: opcional(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "La moneda no es válida.")),
  categoria: opcional(z.enum(CategoriaCosto, { error: "La categoría no es válida." })),
  estadoCosto: opcional(z.enum(EstadoCosto, { error: "El estado del costo no es válido." })),
  estadoEnvio: opcional(z.enum(EstadoEnvio, { error: "El estado del envío no es válido." })),
  retrasadas: opcional(z.enum(["1"], { error: "Valor no válido." })),
  bodegaId: opcional(ID),
  productoId: opcional(ID),
  estadoStock: opcional(z.enum(["con_stock", "sin_stock", "bajo_minimo"], { error: "El estado de stock no es válido." })),
  estadoDocumento: opcional(z.enum(EstadoDocumento, { error: "El estado del documento no es válido." })),
  incompletos: opcional(z.enum(["1"], { error: "Valor no válido." })),
  rol: opcional(z.enum(RolTercero, { error: "El rol no es válido." })),
  pagina: z.preprocess(vacio, z.coerce.number().int().min(1).max(100_000).optional()),
});

export type FiltrosReporte = z.infer<typeof esquema>;
export type ParametrosBrutos = Record<string, string | string[] | undefined>;

export function parsearFiltros(brutos: ParametrosBrutos): FiltrosReporte {
  const planos: Record<string, unknown> = {};
  for (const clave of Object.keys(esquema.shape)) {
    const v = brutos[clave];
    if (v !== undefined) planos[clave] = Array.isArray(v) ? v[0] : v;
  }
  const r = esquema.safeParse(planos);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const f = r.data;
  if (f.desde && f.hasta && f.desde > f.hasta) throw new ErrorValidacion("La fecha inicial no puede ser posterior a la final.");
  return f;
}

const aFecha = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : undefined);

/** Rango [desde, hasta] sobre una columna @db.Date. */
export function rangoFecha(f: FiltrosReporte): { gte?: Date; lte?: Date } | undefined {
  const gte = aFecha(f.desde);
  const lte = aFecha(f.hasta);
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined;
}

/** Rango sobre un timestamp: incluye todo el día final. */
export function rangoMarca(f: FiltrosReporte): { gte?: Date; lt?: Date } | undefined {
  const gte = aFecha(f.desde);
  const hasta = aFecha(f.hasta);
  const lt = hasta ? new Date(hasta.getTime() + 86_400_000) : undefined;
  return gte || lt ? { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } : undefined;
}

/** Filtro de operaciones de la empresa autorizada. `conPeriodo` aplica el rango sobre la fecha de apertura. */
export function donde(ctx: ContextoAcceso, f: FiltrosReporte, conPeriodo = true): Prisma.OperacionWhereInput {
  const periodo = conPeriodo ? rangoFecha(f) : undefined;
  return {
    empresaId: ctx.empresaId,
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.estado ? { estado: f.estado } : {}),
    ...(f.terceroId ? { terceroId: f.terceroId } : {}),
    ...(f.operacionId ? { id: f.operacionId } : {}),
    ...(f.responsableId ? { responsableId: f.responsableId } : {}),
    ...(f.modalidad ? { modalidad: f.modalidad } : {}),
    ...(periodo ? { fechaApertura: periodo } : {}),
    ...(f.pais
      ? { OR: [{ paisOrigen: { equals: f.pais, mode: "insensitive" } }, { paisDestino: { equals: f.pais, mode: "insensitive" } }] }
      : {}),
  };
}

/** Texto legible de los filtros activos (pantalla y exportaciones). */
export function describirFiltros(f: FiltrosReporte, nombres: { tercero?: string; operacion?: string; responsable?: string; bodega?: string; producto?: string } = {}): string[] {
  const partes: [string, string | undefined][] = [
    ["Tipo", f.tipo], ["Estado", f.estado], ["País", f.pais], ["Tercero", nombres.tercero ?? f.terceroId],
    ["Operación", nombres.operacion ?? f.operacionId], ["Responsable", nombres.responsable ?? f.responsableId],
    ["Modalidad", f.modalidad], ["Moneda", f.moneda], ["Categoría de costo", f.categoria], ["Estado del costo", f.estadoCosto],
    ["Estado del envío", f.estadoEnvio], ["Solo retrasadas", f.retrasadas ? "Sí" : undefined], ["Bodega", nombres.bodega ?? f.bodegaId],
    ["Producto", nombres.producto ?? f.productoId], ["Estado de stock", f.estadoStock], ["Estado del documento", f.estadoDocumento],
    ["Solo incompletos", f.incompletos ? "Sí" : undefined], ["Rol", f.rol],
  ];
  return partes.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
}

export function describirPeriodo(f: FiltrosReporte): string {
  if (f.desde && f.hasta) return `${f.desde} a ${f.hasta}`;
  if (f.desde) return `Desde ${f.desde}`;
  if (f.hasta) return `Hasta ${f.hasta}`;
  return "Todo el histórico";
}

/** Query string de los filtros activos (sin paginación), para enlaces de exportación y de navegación. */
export function aQuery(f: FiltrosReporte, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && k !== "pagina") q.set(k, String(v));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

type CampoFiltro = keyof Omit<FiltrosReporte, "pagina" | "desde" | "hasta">;

/** Filtros (además del período) que usa cada reporte; los demás se descartan para que lo mostrado, lo aplicado y lo exportado coincidan. */
export const CAMPOS_POR_REPORTE: Record<IdReporte, CampoFiltro[]> = {
  resumen: ["tipo", "estado", "pais", "terceroId", "responsableId", "modalidad"],
  operaciones: ["tipo", "estado", "pais", "terceroId", "operacionId", "responsableId", "modalidad"],
  logistica: ["tipo", "estado", "pais", "terceroId", "operacionId", "modalidad", "estadoEnvio", "retrasadas"],
  costos: ["tipo", "pais", "terceroId", "operacionId", "moneda", "categoria", "estadoCosto"],
  inventarios: ["bodegaId", "productoId", "estadoStock", "operacionId", "terceroId"],
  documentos: ["tipo", "estado", "terceroId", "operacionId", "estadoDocumento", "incompletos"],
  terceros: ["tipo", "terceroId", "pais", "rol"],
};

/** Valida los filtros de la URL y conserva solo los que aplican al reporte indicado. */
export function filtrosDeReporte(id: IdReporte, brutos: ParametrosBrutos): FiltrosReporte {
  const f = parsearFiltros(brutos);
  const permitidos = new Set<string>(["desde", "hasta", "pagina", ...CAMPOS_POR_REPORTE[id]]);
  return Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== undefined && permitidos.has(k))) as FiltrosReporte;
}
