import { Prisma } from "@/generated/prisma/client";
import { UnidadMedida } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { esErrorPrisma } from "@/lib/db-errores";
import { ErrorValidacion } from "@/lib/errores";
import { parsearCantidad } from "@/lib/inventarios/cantidades";
import { parsear, texto, textoOpcional, uuid, uuidOpcional, z } from "@/lib/validacion";

export const TAMANO_PAGINA = 20;

const esquemaProducto = z.object({
  sku: texto("El código (SKU)", 40)
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z0-9][A-Z0-9._\-/]*$/.test(v), "El código (SKU) solo admite letras, números y . _ - /"),
  nombre: texto("El nombre", 200),
  descripcion: textoOpcional("La descripción", 1000),
  categoria: textoOpcional("La categoría", 80),
  unidad: z.enum(UnidadMedida, { error: "Seleccione la unidad de medida." }),
  paisOrigen: textoOpcional("El país de origen", 80),
  codigoArancelario: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().regex(/^[0-9][0-9. ]{3,15}$/, "El código arancelario debe tener entre 4 y 16 dígitos (puede usar puntos).").optional(),
  ),
  proveedorId: uuidOpcional("El proveedor"),
  stockMinimo: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), z.string()),
});

export type FiltrosProductos = { q?: string; categoria?: string; estado?: string; pagina?: number };

export async function listarProductos(ctx: ContextoAcceso, filtros: FiltrosProductos = {}) {
  const q = filtros.q?.trim();
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const filas = await db.producto.findMany({
    where: {
      empresaId: ctx.empresaId,
      ...(filtros.estado === "inactivos" ? { activo: false } : filtros.estado === "todos" ? {} : { activo: true }),
      ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { nombre: { contains: q, mode: "insensitive" } },
              { categoria: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { proveedor: { select: { razonSocial: true } } },
    orderBy: { nombre: "asc" },
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA + 1,
  });
  const visibles = filas.slice(0, TAMANO_PAGINA);
  const sumas = visibles.length
    ? await db.existenciaInventario.groupBy({
        by: ["productoId"],
        where: { empresaId: ctx.empresaId, productoId: { in: visibles.map((p) => p.id) } },
        _sum: { cantidad: true },
      })
    : [];
  const stock = new Map(sumas.map((s) => [s.productoId, s._sum.cantidad ?? new Prisma.Decimal(0)]));
  return {
    filas: visibles.map((p) => ({ ...p, stockTotal: stock.get(p.id) ?? new Prisma.Decimal(0) })),
    hayMas: filas.length > TAMANO_PAGINA,
    pagina,
  };
}

export async function categoriasProductos(ctx: ContextoAcceso): Promise<string[]> {
  const filas = await db.producto.findMany({
    where: { empresaId: ctx.empresaId, categoria: { not: null } },
    select: { categoria: true },
    distinct: ["categoria"],
    orderBy: { categoria: "asc" },
  });
  return filas.map((f) => f.categoria!).filter(Boolean);
}

export function opcionesProductos(ctx: ContextoAcceso, soloActivos = true) {
  return db.producto.findMany({
    where: { empresaId: ctx.empresaId, ...(soloActivos ? { activo: true } : {}) },
    select: { id: true, sku: true, nombre: true, unidad: true },
    orderBy: { nombre: "asc" },
  });
}

export async function obtenerProducto(ctx: ContextoAcceso, id: string) {
  if (!uuid("Producto").safeParse(id).success) return null;
  const producto = await db.producto.findFirst({
    where: { id, empresaId: ctx.empresaId },
    include: { proveedor: { select: { id: true, razonSocial: true } } },
  });
  if (!producto) return null;
  const [existencias, movimientos] = await Promise.all([
    db.existenciaInventario.findMany({
      where: { empresaId: ctx.empresaId, productoId: id },
      include: { bodega: { select: { codigo: true, nombre: true } } },
      orderBy: { bodega: { nombre: "asc" } },
    }),
    db.movimientoInventario.count({ where: { empresaId: ctx.empresaId, productoId: id } }),
  ]);
  const total = existencias.reduce((s, e) => s.plus(e.cantidad), new Prisma.Decimal(0));
  return { ...producto, existencias, stockTotal: total, cantidadMovimientos: movimientos };
}

async function validarProveedor(ctx: ContextoAcceso, proveedorId?: string) {
  if (!proveedorId) return;
  const t = await db.tercero.findFirst({ where: { id: proveedorId, empresaId: ctx.empresaId, activo: true, roles: { has: "PROVEEDOR" } } });
  if (!t) throw new ErrorValidacion("El proveedor debe ser un tercero activo con rol Proveedor de esta empresa.");
}

export async function crearProducto(ctx: ContextoAcceso, datos: unknown) {
  const d = parsear(esquemaProducto, datos);
  const stockMinimo = parsearCantidad(d.stockMinimo, d.unidad, "El stock mínimo", true);
  await validarProveedor(ctx, d.proveedorId);
  try {
    return await db.producto.create({ data: { ...d, stockMinimo, empresaId: ctx.empresaId, creadoPorId: ctx.usuarioId } });
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Ya existe un producto con ese código (SKU).");
    throw error;
  }
}

export async function actualizarProducto(ctx: ContextoAcceso, id: string, datos: unknown) {
  const d = parsear(esquemaProducto, datos);
  const actual = await obtenerProducto(ctx, id);
  if (!actual) throw new ErrorValidacion("Producto no encontrado.");
  if (d.unidad !== actual.unidad && actual.cantidadMovimientos > 0) {
    throw new ErrorValidacion("No se puede cambiar la unidad de un producto que ya tiene movimientos.");
  }
  const stockMinimo = parsearCantidad(d.stockMinimo, d.unidad, "El stock mínimo", true);
  await validarProveedor(ctx, d.proveedorId);
  try {
    return await db.producto.update({ where: { id: actual.id }, data: {
        sku: d.sku, nombre: d.nombre, unidad: d.unidad, stockMinimo,
        descripcion: d.descripcion ?? null, categoria: d.categoria ?? null, paisOrigen: d.paisOrigen ?? null,
        codigoArancelario: d.codigoArancelario ?? null, proveedorId: d.proveedorId ?? null,
      },
    });
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Ya existe un producto con ese código (SKU).");
    throw error;
  }
}

/** Los productos nunca se eliminan: se desactivan (solo si no tienen existencias). */
export async function cambiarEstadoProducto(ctx: ContextoAcceso, id: string, activo: boolean) {
  const producto = await obtenerProducto(ctx, id);
  if (!producto) throw new ErrorValidacion("Producto no encontrado.");
  if (!activo && producto.stockTotal.gt(0)) {
    throw new ErrorValidacion("El producto tiene existencias. Registre salidas o ajustes antes de desactivarlo.");
  }
  await db.producto.update({ where: { id: producto.id }, data: { activo } });
}
