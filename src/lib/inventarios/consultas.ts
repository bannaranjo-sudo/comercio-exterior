import { Prisma } from "@/generated/prisma/client";
import { TipoMovimiento } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { uuid } from "@/lib/validacion";

// Consultas de existencias y movimientos. Los saldos salen de la tabla `existencias`, que solo se modifica
// dentro de la transacción de cada movimiento; los movimientos conservan el saldo posterior para auditoría.

export const TAMANO_PAGINA = 25;
export type EstadoStock = "SIN_STOCK" | "BAJO_MINIMO" | "OK";
export type FiltroEstadoStock = "todas" | "con_stock" | "sin_stock" | "bajo_minimo";

const CERO = new Prisma.Decimal(0);

export type FilaExistencia = {
  productoId: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  unidad: import("@/generated/prisma/enums").UnidadMedida;
  stockMinimo: Prisma.Decimal;
  total: Prisma.Decimal;
  estado: EstadoStock;
  bodegas: { bodegaId: string; codigo: string; nombre: string; cantidad: Prisma.Decimal }[];
};

export function estadoDeStock(total: Prisma.Decimal, minimo: Prisma.Decimal): EstadoStock {
  if (total.lte(0)) return "SIN_STOCK";
  if (minimo.gt(0) && total.lte(minimo)) return "BAJO_MINIMO";
  return "OK";
}

/** Existencias por producto (total y por bodega) de los productos activos; opcionalmente de una sola bodega. */
export async function listarExistencias(
  ctx: ContextoAcceso,
  filtros: { bodegaId?: string; q?: string; estado?: string } = {},
): Promise<FilaExistencia[]> {
  const q = filtros.q?.trim();
  const bodegaId = filtros.bodegaId && uuid("Bodega").safeParse(filtros.bodegaId).success ? filtros.bodegaId : undefined;
  const [productos, filas] = await Promise.all([
    db.producto.findMany({
      where: {
        empresaId: ctx.empresaId,
        activo: true,
        ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { nombre: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: { id: true, sku: true, nombre: true, categoria: true, unidad: true, stockMinimo: true },
      orderBy: { nombre: "asc" },
    }),
    db.existenciaInventario.findMany({
      where: { empresaId: ctx.empresaId, cantidad: { gt: 0 }, ...(bodegaId ? { bodegaId } : {}) },
      include: { bodega: { select: { codigo: true, nombre: true } } },
    }),
  ]);
  const porProducto = new Map<string, FilaExistencia["bodegas"]>();
  for (const f of filas) {
    const lista = porProducto.get(f.productoId) ?? [];
    lista.push({ bodegaId: f.bodegaId, codigo: f.bodega.codigo, nombre: f.bodega.nombre, cantidad: f.cantidad });
    porProducto.set(f.productoId, lista);
  }
  const resultado = productos.map((p) => {
    const bodegas = (porProducto.get(p.id) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const total = bodegas.reduce((s, b) => s.plus(b.cantidad), CERO);
    return { productoId: p.id, sku: p.sku, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, stockMinimo: p.stockMinimo, total, estado: estadoDeStock(total, p.stockMinimo), bodegas };
  });
  switch (filtros.estado) {
    case "con_stock": return resultado.filter((r) => r.total.gt(0));
    case "sin_stock": return resultado.filter((r) => r.estado === "SIN_STOCK");
    case "bajo_minimo": return resultado.filter((r) => r.estado === "BAJO_MINIMO");
    default: return resultado;
  }
}

export type FiltrosMovimientos = {
  tipo?: string; productoId?: string; bodegaId?: string; desde?: string; hasta?: string; q?: string; pagina?: number;
};

const fechaUTC = (valor?: string, finDeDia = false): Date | undefined => {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (finDeDia) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

const esUuid = (v?: string) => (v && uuid("Id").safeParse(v).success ? v : undefined);

export async function listarMovimientos(ctx: ContextoAcceso, filtros: FiltrosMovimientos = {}) {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const desde = fechaUTC(filtros.desde);
  const hasta = fechaUTC(filtros.hasta, true);
  const q = filtros.q?.trim();
  const filas = await db.movimientoInventario.findMany({
    where: {
      empresaId: ctx.empresaId,
      ...(filtros.tipo && filtros.tipo in TipoMovimiento ? { tipo: filtros.tipo as TipoMovimiento } : {}),
      ...(esUuid(filtros.productoId) ? { productoId: filtros.productoId } : {}),
      ...(esUuid(filtros.bodegaId) ? { bodegaId: filtros.bodegaId } : {}),
      ...(desde || hasta ? { creadoEn: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } } : {}),
      ...(q ? { OR: [{ referencia: { contains: q, mode: "insensitive" } }, { motivo: { contains: q, mode: "insensitive" } }, { producto: { sku: { contains: q, mode: "insensitive" } } }, { producto: { nombre: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: {
      producto: { select: { sku: true, nombre: true, unidad: true } },
      bodega: { select: { codigo: true, nombre: true } },
      usuario: { select: { nombre: true } },
      operacion: { select: { id: true, numero: true } },
      compensadoPor: { select: { id: true } },
    },
    orderBy: { creadoEn: "desc" },
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA + 1,
  });
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA, pagina };
}

export async function resumenInventario(ctx: ContextoAcceso) {
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const [existencias, bodegasActivas, movimientos30, recepciones30, recientes] = await Promise.all([
    listarExistencias(ctx),
    db.bodega.count({ where: { empresaId: ctx.empresaId, activo: true } }),
    db.movimientoInventario.count({ where: { empresaId: ctx.empresaId, creadoEn: { gte: hace30 } } }),
    db.recepcion.count({ where: { empresaId: ctx.empresaId, creadoEn: { gte: hace30 } } }),
    db.movimientoInventario.findMany({
      where: { empresaId: ctx.empresaId },
      include: { producto: { select: { sku: true, nombre: true, unidad: true } }, bodega: { select: { nombre: true } } },
      orderBy: { creadoEn: "desc" },
      take: 8,
    }),
  ]);
  return {
    productosActivos: existencias.length,
    bodegasActivas,
    conStock: existencias.filter((e) => e.total.gt(0)).length,
    sinStock: existencias.filter((e) => e.estado === "SIN_STOCK"),
    bajoMinimo: existencias.filter((e) => e.estado === "BAJO_MINIMO"),
    movimientos30,
    recepciones30,
    recientes,
  };
}
