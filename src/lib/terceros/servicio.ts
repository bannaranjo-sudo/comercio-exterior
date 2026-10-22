import { AmbitoTercero, RolTercero } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { esErrorPrisma } from "@/lib/db-errores";
import { ErrorValidacion } from "@/lib/errores";
import { correoOpcional, listaFormulario, parsear, texto, textoOpcional, uuid, vaciosANull, z } from "@/lib/validacion";

// Lógica de negocio de terceros. Cada función recibe un ContextoAcceso ya autorizado y filtra
// siempre por ctx.empresaId; el cliente nunca aporta la empresa.

export const TAMANO_PAGINA = 20;

const esquemaTercero = z.object({
  razonSocial: texto("La razón social", 200),
  nombreComercial: textoOpcional("El nombre comercial", 200),
  identificacionFiscal: texto("La identificación fiscal", 40).transform((v) => v.toUpperCase()),
  ambito: z.enum(AmbitoTercero, { error: "Seleccione el ámbito (nacional o internacional)." }),
  roles: listaFormulario(z.enum(RolTercero)).refine((r) => r.length > 0, "Seleccione al menos un rol comercial."),
  pais: texto("El país", 80),
  ciudad: textoOpcional("La ciudad", 80),
  direccion: textoOpcional("La dirección", 250),
  correo: correoOpcional(),
  telefono: textoOpcional("El teléfono", 40),
  contacto: textoOpcional("La persona de contacto", 120),
  observaciones: textoOpcional("Las observaciones", 1000),
});

export type DatosTercero = z.input<typeof esquemaTercero>;

export type FiltrosTerceros = {
  q?: string;
  rol?: string;
  ambito?: string;
  estado?: string; // "activos" | "inactivos" | "todos"
  pagina?: number;
};

export async function listarTerceros(ctx: ContextoAcceso, filtros: FiltrosTerceros = {}) {
  const q = filtros.q?.trim();
  const donde: Prisma.TerceroWhereInput = {
    empresaId: ctx.empresaId,
    ...(filtros.estado === "inactivos" ? { activo: false } : filtros.estado === "todos" ? {} : { activo: true }),
    ...(filtros.rol && filtros.rol in RolTercero ? { roles: { has: filtros.rol as RolTercero } } : {}),
    ...(filtros.ambito && filtros.ambito in AmbitoTercero ? { ambito: filtros.ambito as AmbitoTercero } : {}),
    ...(q
      ? {
          OR: [
            { razonSocial: { contains: q, mode: "insensitive" } },
            { nombreComercial: { contains: q, mode: "insensitive" } },
            { identificacionFiscal: { contains: q, mode: "insensitive" } },
            { ciudad: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const filas = await db.tercero.findMany({
    where: donde,
    orderBy: { razonSocial: "asc" },
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA + 1,
  });
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA, pagina };
}

/** Terceros activos con un rol (para listas desplegables); excluye otras empresas e inactivos. */
export function opcionesTerceros(ctx: ContextoAcceso, rol?: RolTercero) {
  return db.tercero.findMany({
    where: { empresaId: ctx.empresaId, activo: true, ...(rol ? { roles: { has: rol } } : {}) },
    select: { id: true, razonSocial: true, identificacionFiscal: true, pais: true },
    orderBy: { razonSocial: "asc" },
  });
}

export async function obtenerTercero(ctx: ContextoAcceso, id: string) {
  if (!uuid("Tercero").safeParse(id).success) return null;
  return db.tercero.findFirst({
    where: { id, empresaId: ctx.empresaId },
    include: { _count: { select: { operaciones: true } } },
  });
}

export async function crearTercero(ctx: ContextoAcceso, datos: unknown) {
  const d = parsear(esquemaTercero, datos);
  try {
    return await db.tercero.create({ data: { ...d, empresaId: ctx.empresaId, creadoPorId: ctx.usuarioId } });
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Ya existe un tercero con esa identificación fiscal.");
    throw error;
  }
}

export async function actualizarTercero(ctx: ContextoAcceso, id: string, datos: unknown) {
  const d = parsear(esquemaTercero, datos);
  const existente = await obtenerTercero(ctx, id);
  if (!existente) throw new ErrorValidacion("Tercero no encontrado.");
  try {
    return await db.tercero.update({ where: { id: existente.id }, data: vaciosANull(d) });
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Ya existe un tercero con esa identificación fiscal.");
    throw error;
  }
}

/** Los terceros nunca se eliminan: se desactivan (conservan su vínculo con las operaciones). */
export async function cambiarEstadoTercero(ctx: ContextoAcceso, id: string, activo: boolean) {
  const existente = await obtenerTercero(ctx, id);
  if (!existente) throw new ErrorValidacion("Tercero no encontrado.");
  await db.tercero.update({ where: { id: existente.id }, data: { activo } });
}
