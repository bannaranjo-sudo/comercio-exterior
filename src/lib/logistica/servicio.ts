import type { Prisma } from "@/generated/prisma/client";
import { EstadoEnvio, ModalidadTransporte, SeveridadNovedad, TipoEvento } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { fecha, fechaOpcional, parsear, texto, textoOpcional, uuid, uuidOpcional, z } from "@/lib/validacion";

// Seguimiento logístico por operación (sin integraciones externas): datos del transporte,
// hitos y novedades. Todo se filtra por la empresa del contexto autorizado.

const esquemaEnvio = z
  .object({
    medioTransporte: z.preprocess((v) => (v === "" ? undefined : v), z.enum(ModalidadTransporte).optional()),
    numeroGuia: textoOpcional("El número de guía o BL", 60),
    transportadorId: uuidOpcional("El transportador"),
    puertoOrigen: textoOpcional("El puerto o lugar de origen", 120),
    puertoDestino: textoOpcional("El puerto o lugar de destino", 120),
    fechaEstimadaSalida: fechaOpcional("La fecha estimada de salida"),
    fechaRealSalida: fechaOpcional("La fecha real de salida"),
    fechaEstimadaLlegada: fechaOpcional("La fecha estimada de llegada"),
    fechaRealLlegada: fechaOpcional("La fecha real de llegada"),
    estadoEnvio: z.enum(EstadoEnvio, { error: "Seleccione el estado del envío." }),
  })
  .refine((d) => !d.fechaEstimadaSalida || !d.fechaEstimadaLlegada || d.fechaEstimadaLlegada >= d.fechaEstimadaSalida, {
    error: "La llegada estimada no puede ser anterior a la salida estimada.",
  })
  .refine((d) => !d.fechaRealSalida || !d.fechaRealLlegada || d.fechaRealLlegada >= d.fechaRealSalida, {
    error: "La llegada real no puede ser anterior a la salida real.",
  });

const esquemaEvento = z.object({
  tipo: z.enum(TipoEvento, { error: "Seleccione si es un hito o una novedad." }),
  titulo: texto("El título", 150),
  descripcion: textoOpcional("La descripción", 1000),
  fechaEvento: fecha("La fecha del evento"),
  severidad: z.preprocess((v) => (v === "" ? undefined : v), z.enum(SeveridadNovedad).optional()),
});

async function operacionAbierta(tx: Prisma.TransactionClient | typeof db, ctx: ContextoAcceso, id: string) {
  const operacion = uuid("Operación").safeParse(id).success
    ? await tx.operacion.findFirst({ where: { id, empresaId: ctx.empresaId }, select: { id: true, estado: true } })
    : null;
  if (!operacion) throw new ErrorValidacion("Operación no encontrada.");
  if (operacion.estado === "CANCELADA") throw new ErrorValidacion("La operación está cancelada y no admite cambios.");
  return operacion;
}

export function obtenerEnvio(ctx: ContextoAcceso, operacionId: string) {
  return db.envio.findFirst({
    where: { empresaId: ctx.empresaId, operacionId },
    include: { transportador: { select: { razonSocial: true } } },
  });
}

export async function guardarEnvio(ctx: ContextoAcceso, operacionId: string, datos: unknown) {
  const d = parsear(esquemaEnvio, datos);
  await db.$transaction(async (tx) => {
    const operacion = await operacionAbierta(tx, ctx, operacionId);
    if (d.transportadorId) {
      const t = await tx.tercero.findFirst({ where: { id: d.transportadorId, empresaId: ctx.empresaId, activo: true, roles: { has: "TRANSPORTADOR" } } });
      if (!t) throw new ErrorValidacion("El transportador debe ser un tercero activo con rol Transportador.");
    }
    const data = {
      medioTransporte: d.medioTransporte ?? null, numeroGuia: d.numeroGuia ?? null, transportadorId: d.transportadorId ?? null,
      puertoOrigen: d.puertoOrigen ?? null, puertoDestino: d.puertoDestino ?? null,
      fechaEstimadaSalida: d.fechaEstimadaSalida ?? null, fechaRealSalida: d.fechaRealSalida ?? null,
      fechaEstimadaLlegada: d.fechaEstimadaLlegada ?? null, fechaRealLlegada: d.fechaRealLlegada ?? null, estadoEnvio: d.estadoEnvio,
    };
    await tx.envio.upsert({
      where: { operacionId: operacion.id },
      update: data,
      create: { ...data, empresaId: ctx.empresaId, operacionId: operacion.id },
    });
    await tx.operacionHistorial.create({
      data: { empresaId: ctx.empresaId, operacionId: operacion.id, usuarioId: ctx.usuarioId, accion: "LOGISTICA", detalle: { estadoEnvio: d.estadoEnvio } },
    });
  });
}

export function listarEventos(ctx: ContextoAcceso, operacionId: string) {
  return db.eventoLogistico.findMany({
    where: { empresaId: ctx.empresaId, operacionId },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: [{ fechaEvento: "asc" }, { creadoEn: "asc" }],
  });
}

export async function registrarEvento(ctx: ContextoAcceso, operacionId: string, datos: unknown) {
  const d = parsear(esquemaEvento, datos);
  const operacion = await operacionAbierta(db, ctx, operacionId);
  return db.eventoLogistico.create({
    data: {
      empresaId: ctx.empresaId, operacionId: operacion.id, tipo: d.tipo, titulo: d.titulo, descripcion: d.descripcion,
      fechaEvento: d.fechaEvento, severidad: d.tipo === "NOVEDAD" ? (d.severidad ?? "MEDIA") : null, registradoPorId: ctx.usuarioId,
    },
  });
}

export async function resolverNovedad(ctx: ContextoAcceso, eventoId: string) {
  const id = uuid("Evento").safeParse(eventoId).success ? eventoId : "";
  const { count } = await db.eventoLogistico.updateMany({
    where: { id, empresaId: ctx.empresaId, tipo: "NOVEDAD", resuelta: false },
    data: { resuelta: true, resueltaEn: new Date() },
  });
  if (count === 0) throw new ErrorValidacion("La novedad no existe o ya fue resuelta.");
}

/** Envíos de la empresa con su operación (vista global de logística). */
export function listarEnvios(ctx: ContextoAcceso) {
  return db.envio.findMany({
    where: { empresaId: ctx.empresaId, operacion: { estado: { notIn: ["CANCELADA", "FINALIZADA"] } } },
    include: { operacion: { select: { id: true, numero: true, tipo: true, estado: true, tercero: { select: { razonSocial: true } } } } },
    orderBy: [{ fechaEstimadaLlegada: { sort: "asc", nulls: "last" } }],
    take: 50,
  });
}

export function listarNovedadesAbiertas(ctx: ContextoAcceso, limite = 50) {
  return db.eventoLogistico.findMany({
    where: { empresaId: ctx.empresaId, tipo: "NOVEDAD", resuelta: false, operacion: { estado: { not: "CANCELADA" } } },
    include: { operacion: { select: { id: true, numero: true } } },
    orderBy: [{ severidad: "desc" }, { fechaEvento: "desc" }],
    take: limite,
  });
}
