import { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { esErrorPrisma } from "@/lib/db-errores";
import { ErrorValidacion } from "@/lib/errores";
import { parsear, texto, textoOpcional, uuid, uuidOpcional, z } from "@/lib/validacion";

const esquemaBodega = z.object({
  codigo: texto("El código", 20)
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z0-9][A-Z0-9._-]*$/.test(v), "El código solo admite letras, números y . _ -"),
  nombre: texto("El nombre", 120),
  direccion: textoOpcional("La dirección", 250),
  ciudad: textoOpcional("La ciudad", 80),
  responsableId: uuidOpcional("El responsable"),
});

export async function listarBodegas(ctx: ContextoAcceso, estado: string = "activos") {
  const bodegas = await db.bodega.findMany({
    where: { empresaId: ctx.empresaId, ...(estado === "inactivos" ? { activo: false } : estado === "todos" ? {} : { activo: true }) },
    include: { responsable: { select: { nombre: true } } },
    orderBy: { nombre: "asc" },
  });
  const sumas = await db.existenciaInventario.groupBy({ by: ["bodegaId"], where: { empresaId: ctx.empresaId }, _sum: { cantidad: true }, _count: { _all: true } });
  const porBodega = new Map(sumas.map((s) => [s.bodegaId, s]));
  return bodegas.map((b) => ({ ...b, referencias: porBodega.get(b.id)?._count._all ?? 0 }));
}

export function opcionesBodegas(ctx: ContextoAcceso, soloActivas = true) {
  return db.bodega.findMany({
    where: { empresaId: ctx.empresaId, ...(soloActivas ? { activo: true } : {}) },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

export async function obtenerBodega(ctx: ContextoAcceso, id: string) {
  if (!uuid("Bodega").safeParse(id).success) return null;
  return db.bodega.findFirst({ where: { id, empresaId: ctx.empresaId }, include: { responsable: { select: { id: true, nombre: true } } } });
}

async function validarResponsable(ctx: ContextoAcceso, responsableId?: string) {
  if (!responsableId) return;
  const miembro = await db.empresaUsuario.findFirst({ where: { empresaId: ctx.empresaId, usuarioId: responsableId, activo: true, usuario: { activo: true } } });
  if (!miembro) throw new ErrorValidacion("El responsable debe ser un usuario activo de la empresa.");
}

export async function crearBodega(ctx: ContextoAcceso, datos: unknown) {
  const d = parsear(esquemaBodega, datos);
  await validarResponsable(ctx, d.responsableId);
  try {
    return await db.bodega.create({ data: { ...d, empresaId: ctx.empresaId, creadoPorId: ctx.usuarioId } });
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Ya existe una bodega con ese código.");
    throw error;
  }
}

export async function actualizarBodega(ctx: ContextoAcceso, id: string, datos: unknown) {
  const d = parsear(esquemaBodega, datos);
  const bodega = await obtenerBodega(ctx, id);
  if (!bodega) throw new ErrorValidacion("Bodega no encontrada.");
  await validarResponsable(ctx, d.responsableId);
  try {
    return await db.bodega.update({ where: { id: bodega.id }, data: {
        codigo: d.codigo, nombre: d.nombre, direccion: d.direccion ?? null, ciudad: d.ciudad ?? null, responsableId: d.responsableId ?? null,
      },
    });
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Ya existe una bodega con ese código.");
    throw error;
  }
}

/** Las bodegas no se eliminan: se desactivan (solo si no conservan existencias). */
export async function cambiarEstadoBodega(ctx: ContextoAcceso, id: string, activo: boolean) {
  const bodega = await obtenerBodega(ctx, id);
  if (!bodega) throw new ErrorValidacion("Bodega no encontrada.");
  if (!activo) {
    const { _sum } = await db.existenciaInventario.aggregate({ where: { empresaId: ctx.empresaId, bodegaId: bodega.id }, _sum: { cantidad: true } });
    if ((_sum.cantidad ?? new Prisma.Decimal(0)).gt(0)) {
      throw new ErrorValidacion("La bodega tiene existencias. Transfiéralas o registre salidas antes de desactivarla.");
    }
  }
  await db.bodega.update({ where: { id: bodega.id }, data: { activo } });
}
