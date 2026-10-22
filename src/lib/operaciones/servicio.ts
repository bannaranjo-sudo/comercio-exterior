import type { Prisma } from "@/generated/prisma/client";
import { EstadoOperacion, Incoterm, ModalidadTransporte, TipoOperacion } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { fecha, importe, moneda, parsear, texto, textoOpcional, uuid, z } from "@/lib/validacion";

// Lógica de negocio de operaciones de comercio exterior. Toda función recibe un ContextoAcceso ya
// autorizado y filtra por ctx.empresaId; el cliente nunca aporta la empresa.

export const TAMANO_PAGINA = 20;

/** Transiciones permitidas entre estados (FINALIZADA y CANCELADA son finales). */
export const TRANSICIONES: Record<EstadoOperacion, readonly EstadoOperacion[]> = {
  BORRADOR: ["EN_PREPARACION", "CANCELADA"],
  EN_PREPARACION: ["EN_TRANSITO", "CANCELADA"],
  EN_TRANSITO: ["EN_ADUANA", "CANCELADA"],
  EN_ADUANA: ["FINALIZADA", "EN_TRANSITO", "CANCELADA"],
  FINALIZADA: [],
  CANCELADA: [],
};

export const ESTADOS_ACTIVOS: readonly EstadoOperacion[] = ["BORRADOR", "EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA"];
export const esEstadoFinal = (estado: EstadoOperacion): boolean => TRANSICIONES[estado].length === 0;

const camposEditables = {
  descripcion: texto("La descripción de las mercancías", 1000),
  terceroId: uuid("El proveedor o cliente"),
  paisOrigen: texto("El país de origen", 80),
  paisDestino: texto("El país de destino", 80),
  incoterm: z.enum(Incoterm, { error: "Seleccione el Incoterm." }),
  lugarIncoterm: texto("El lugar convenido del Incoterm", 150),
  moneda,
  valorEstimado: importe("El valor comercial estimado"),
  modalidad: z.enum(ModalidadTransporte, { error: "Seleccione la modalidad de transporte." }),
  responsableId: uuid("El responsable"),
  observaciones: textoOpcional("Las observaciones", 2000),
};

const esquemaCreacion = z.object({
  tipo: z.enum(TipoOperacion, { error: "Seleccione el tipo de operación." }),
  fechaApertura: fecha("La fecha de apertura"),
  ...camposEditables,
});
const esquemaEdicion = z.object({ fechaApertura: fecha("La fecha de apertura"), ...camposEditables });

const PREFIJO: Record<TipoOperacion, string> = { IMPORTACION: "IMP", EXPORTACION: "EXP" };

/** Valida que el tercero pertenezca a la empresa, esté activo y tenga el rol que exige el tipo de operación. */
async function validarTercero(tx: Prisma.TransactionClient, ctx: ContextoAcceso, terceroId: string, tipo: TipoOperacion) {
  const tercero = await tx.tercero.findFirst({ where: { id: terceroId, empresaId: ctx.empresaId } });
  if (!tercero) throw new ErrorValidacion("El proveedor o cliente seleccionado no existe.");
  if (!tercero.activo) throw new ErrorValidacion("El tercero seleccionado está inactivo.");
  const requerido = tipo === "IMPORTACION" ? "PROVEEDOR" : "CLIENTE";
  if (!tercero.roles.includes(requerido)) {
    throw new ErrorValidacion(`Una ${tipo === "IMPORTACION" ? "importación" : "exportación"} requiere un tercero con rol ${requerido === "PROVEEDOR" ? "Proveedor" : "Cliente"}.`);
  }
}

async function validarResponsable(tx: Prisma.TransactionClient, ctx: ContextoAcceso, usuarioId: string) {
  const miembro = await tx.empresaUsuario.findFirst({
    where: { empresaId: ctx.empresaId, usuarioId, activo: true, usuario: { activo: true } },
  });
  if (!miembro) throw new ErrorValidacion("El responsable debe ser un usuario activo de la empresa.");
}

export type FiltrosOperaciones = { q?: string; tipo?: string; estado?: string; pagina?: number };

const incluirListado = {
  tercero: { select: { razonSocial: true } },
  responsable: { select: { usuario: { select: { nombre: true } } } },
  envio: { select: { fechaEstimadaLlegada: true, estadoEnvio: true } },
} satisfies Prisma.OperacionInclude;

export async function listarOperaciones(ctx: ContextoAcceso, filtros: FiltrosOperaciones = {}) {
  const q = filtros.q?.trim();
  const donde: Prisma.OperacionWhereInput = {
    empresaId: ctx.empresaId,
    ...(filtros.tipo && filtros.tipo in TipoOperacion ? { tipo: filtros.tipo as TipoOperacion } : {}),
    ...(filtros.estado === "activas"
      ? { estado: { in: [...ESTADOS_ACTIVOS] } }
      : filtros.estado && filtros.estado in EstadoOperacion
        ? { estado: filtros.estado as EstadoOperacion }
        : {}),
    ...(q
      ? {
          OR: [
            { numero: { contains: q, mode: "insensitive" } },
            { descripcion: { contains: q, mode: "insensitive" } },
            { tercero: { razonSocial: { contains: q, mode: "insensitive" } } },
            { envio: { numeroGuia: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const filas = await db.operacion.findMany({
    where: donde,
    include: incluirListado,
    orderBy: { consecutivo: "desc" },
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA + 1,
  });
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA, pagina };
}

export async function obtenerOperacion(ctx: ContextoAcceso, id: string) {
  if (!uuid("Operación").safeParse(id).success) return null;
  return db.operacion.findFirst({
    where: { id, empresaId: ctx.empresaId },
    include: {
      tercero: true,
      responsable: { select: { usuario: { select: { nombre: true, correo: true } } } },
      creadoPor: { select: { nombre: true } },
      envio: true,
    },
  });
}

/** Usuarios activos de la empresa (candidatos a responsable). */
export async function listarResponsables(ctx: ContextoAcceso) {
  const miembros = await db.empresaUsuario.findMany({
    where: { empresaId: ctx.empresaId, activo: true, usuario: { activo: true } },
    select: { usuarioId: true, usuario: { select: { nombre: true } } },
    orderBy: { usuario: { nombre: "asc" } },
  });
  return miembros.map((m) => ({ id: m.usuarioId, nombre: m.usuario.nombre }));
}

/** Siguiente consecutivo de la empresa, atómico y sin huecos dentro de la transacción. */
export async function siguienteConsecutivo(tx: Prisma.TransactionClient, empresaId: string, nombre = "operaciones"): Promise<number> {
  const [fila] = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO contadores (empresa_id, nombre, ultimo) VALUES (${empresaId}::uuid, ${nombre}, 1)
    ON CONFLICT (empresa_id, nombre) DO UPDATE SET ultimo = contadores.ultimo + 1
    RETURNING ultimo`;
  return fila.ultimo;
}

export async function crearOperacion(ctx: ContextoAcceso, datos: unknown) {
  const d = parsear(esquemaCreacion, datos);
  return db.$transaction(async (tx) => {
    await validarTercero(tx, ctx, d.terceroId, d.tipo);
    await validarResponsable(tx, ctx, d.responsableId);
    const consecutivo = await siguienteConsecutivo(tx, ctx.empresaId);
    const numero = `${PREFIJO[d.tipo]}-${d.fechaApertura.getUTCFullYear()}-${String(consecutivo).padStart(4, "0")}`;
    const operacion = await tx.operacion.create({
      data: { ...d, empresaId: ctx.empresaId, consecutivo, numero, creadoPorId: ctx.usuarioId },
    });
    await tx.operacionHistorial.create({
      data: {
        empresaId: ctx.empresaId, operacionId: operacion.id, usuarioId: ctx.usuarioId,
        accion: "CREACION", detalle: { numero, estado: operacion.estado },
      },
    });
    return operacion;
  });
}

const comoTexto = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

export async function actualizarOperacion(ctx: ContextoAcceso, id: string, datos: unknown) {
  const d = parsear(esquemaEdicion, datos);
  return db.$transaction(async (tx) => {
    const actual = await tx.operacion.findFirst({ where: { id, empresaId: ctx.empresaId } });
    if (!actual) throw new ErrorValidacion("Operación no encontrada.");
    if (esEstadoFinal(actual.estado)) throw new ErrorValidacion("Una operación finalizada o cancelada no se puede editar.");
    if (d.terceroId !== actual.terceroId) await validarTercero(tx, ctx, d.terceroId, actual.tipo);
    if (d.responsableId !== actual.responsableId) await validarResponsable(tx, ctx, d.responsableId);

    const nuevos = { ...d, observaciones: d.observaciones ?? null };
    const cambios: Record<string, [string, string]> = {};
    for (const [campo, valor] of Object.entries(nuevos)) {
      const antes = comoTexto(actual[campo as keyof typeof actual]);
      if (antes !== comoTexto(valor)) cambios[campo] = [antes, comoTexto(valor)];
    }
    if (Object.keys(cambios).length === 0) return actual;

    const operacion = await tx.operacion.update({ where: { id: actual.id }, data: nuevos });
    await tx.operacionHistorial.create({
      data: { empresaId: ctx.empresaId, operacionId: actual.id, usuarioId: ctx.usuarioId, accion: "EDICION", detalle: { cambios } },
    });
    return operacion;
  });
}

export async function cambiarEstadoOperacion(ctx: ContextoAcceso, id: string, destino: unknown, motivo?: unknown) {
  const nuevo = parsear(z.enum(EstadoOperacion, { error: "Estado no válido." }), destino);
  const nota = typeof motivo === "string" ? motivo.trim() : "";
  return db.$transaction(async (tx) => {
    const actual = await tx.operacion.findFirst({ where: { id, empresaId: ctx.empresaId } });
    if (!actual) throw new ErrorValidacion("Operación no encontrada.");
    if (!TRANSICIONES[actual.estado].includes(nuevo)) {
      throw new ErrorValidacion("Ese cambio de estado no está permitido desde el estado actual.");
    }
    if (nuevo === "CANCELADA" && nota.length < 5) {
      throw new ErrorValidacion("Indique el motivo de la cancelación (mínimo 5 caracteres).");
    }
    // Condición sobre el estado actual: dos cambios simultáneos no pueden aplicarse ambos.
    const { count } = await tx.operacion.updateMany({
      where: { id: actual.id, empresaId: ctx.empresaId, estado: actual.estado },
      data: { estado: nuevo },
    });
    if (count === 0) throw new ErrorValidacion("La operación cambió mientras la editaba. Recargue la página.");
    await tx.operacionHistorial.create({
      data: {
        empresaId: ctx.empresaId, operacionId: actual.id, usuarioId: ctx.usuarioId, accion: "CAMBIO_ESTADO",
        detalle: { de: actual.estado, a: nuevo, ...(nota ? { motivo: nota.slice(0, 500) } : {}) },
      },
    });
  });
}

export function historialOperacion(ctx: ContextoAcceso, operacionId: string) {
  return db.operacionHistorial.findMany({
    where: { empresaId: ctx.empresaId, operacionId },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { creadoEn: "desc" },
    take: 100,
  });
}

/** Operaciones recientes para listas desplegables de vinculación (solo de la empresa activa). */
export function opcionesOperaciones(ctx: ContextoAcceso, limite = 100) {
  return db.operacion.findMany({
    where: { empresaId: ctx.empresaId, estado: { not: "CANCELADA" } },
    select: { id: true, numero: true, tipo: true, tercero: { select: { razonSocial: true } } },
    orderBy: { consecutivo: "desc" },
    take: limite,
  });
}
