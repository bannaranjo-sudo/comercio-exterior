import { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { esErrorPrisma } from "@/lib/db-errores";
import { ErrorValidacion } from "@/lib/errores";
import { parsearCantidad } from "@/lib/inventarios/cantidades";
import { bloquearSaldos, sumarSaldo } from "@/lib/inventarios/movimientos";
import { siguienteConsecutivo } from "@/lib/operaciones/servicio";
import { fecha, parsear, textoOpcional, uuid, uuidOpcional, z } from "@/lib/validacion";

export const TAMANO_PAGINA = 20;
export const MAX_LINEAS_RECEPCION = 8;

const esquemaCabecera = z.object({
  operacionId: uuid("La operación de importación"),
  bodegaId: uuid("La bodega de destino"),
  fechaRecepcion: fecha("La fecha de recepción"),
  documentoId: uuidOpcional("El documento de soporte"),
  observaciones: textoOpcional("Las observaciones", 1000),
  claveIdempotencia: z.string({ error: "Falta el identificador de la solicitud." }).trim().min(8).max(100),
});

const esquemaLinea = z.object({
  productoId: uuid("El producto"),
  cantidadEsperada: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional()),
  cantidadRecibida: z.string({ error: "La cantidad recibida es obligatoria." }),
  observacion: textoOpcional("La observación", 300),
});

export type LineaRecepcion = z.input<typeof esquemaLinea>;

export type ResultadoRecepcion = { duplicada: boolean; recepcion: { id: string; numero: string } };

async function existente(ctx: ContextoAcceso, clave: string) {
  return db.recepcion.findUnique({ where: { empresaId_claveIdempotencia: { empresaId: ctx.empresaId, claveIdempotencia: clave } }, select: { id: true, numero: true } });
}

/**
 * Registra una recepción de mercancía de una importación y genera, en la misma transacción, un movimiento de
 * entrada por cada línea. Un reenvío con la misma clave de idempotencia no duplica nada.
 */
export async function registrarRecepcion(ctx: ContextoAcceso, datos: unknown, lineas: unknown): Promise<ResultadoRecepcion> {
  const cab = parsear(esquemaCabecera, datos);
  const previa = await existente(ctx, cab.claveIdempotencia);
  if (previa) return { duplicada: true, recepcion: previa };

  const entradas = parsear(z.array(esquemaLinea).min(1, "Agregue al menos un producto recibido.").max(MAX_LINEAS_RECEPCION), lineas);
  if (new Set(entradas.map((l) => l.productoId)).size !== entradas.length) {
    throw new ErrorValidacion("Un mismo producto no puede repetirse en la recepción; sume las cantidades en una sola línea.");
  }

  try {
    const recepcion = await db.$transaction(
      async (tx) => {
        const operacion = await tx.operacion.findFirst({ where: { id: cab.operacionId, empresaId: ctx.empresaId } });
        if (!operacion) throw new ErrorValidacion("La operación no existe en esta empresa.");
        if (operacion.tipo !== "IMPORTACION") throw new ErrorValidacion("Solo se pueden recibir mercancías de operaciones de importación.");
        if (operacion.estado === "CANCELADA") throw new ErrorValidacion("La operación está cancelada.");

        const bodega = await tx.bodega.findFirst({ where: { id: cab.bodegaId, empresaId: ctx.empresaId } });
        if (!bodega) throw new ErrorValidacion("La bodega no existe en esta empresa.");
        if (!bodega.activo) throw new ErrorValidacion("La bodega de destino está inactiva.");

        if (cab.documentoId) {
          const doc = await tx.documento.findFirst({ where: { id: cab.documentoId, empresaId: ctx.empresaId, operacionId: operacion.id } });
          if (!doc) throw new ErrorValidacion("El documento de soporte debe pertenecer a la operación seleccionada.");
        }

        const productos = await tx.producto.findMany({ where: { id: { in: entradas.map((l) => l.productoId) }, empresaId: ctx.empresaId } });
        const lineasValidas = entradas
          .map((l) => {
            const producto = productos.find((p) => p.id === l.productoId);
            if (!producto) throw new ErrorValidacion("Un producto de la recepción no existe en esta empresa.");
            if (!producto.activo) throw new ErrorValidacion(`El producto ${producto.sku} está inactivo.`);
            const recibida = parsearCantidad(l.cantidadRecibida, producto.unidad, `La cantidad recibida de ${producto.sku}`);
            const esperada = l.cantidadEsperada ? parsearCantidad(l.cantidadEsperada, producto.unidad, `La cantidad esperada de ${producto.sku}`) : undefined;
            if (esperada && !new Prisma.Decimal(esperada).eq(recibida) && !l.observacion) {
              throw new ErrorValidacion(`Explique la diferencia entre lo esperado y lo recibido de ${producto.sku} en la observación de la línea.`);
            }
            return { producto, recibida, esperada, observacion: l.observacion };
          })
          .sort((a, b) => a.producto.id.localeCompare(b.producto.id)); // orden determinista: sin interbloqueos entre recepciones

        const consecutivo = await siguienteConsecutivo(tx, ctx.empresaId, "recepciones");
        const numero = `REC-${cab.fechaRecepcion.getUTCFullYear()}-${String(consecutivo).padStart(4, "0")}`;
        const nueva = await tx.recepcion.create({
          data: {
            empresaId: ctx.empresaId, numero, operacionId: operacion.id, bodegaId: bodega.id, fechaRecepcion: cab.fechaRecepcion,
            documentoId: cab.documentoId, claveIdempotencia: cab.claveIdempotencia, observaciones: cab.observaciones, registradoPorId: ctx.usuarioId,
          },
        });
        await tx.recepcionLinea.createMany({
          data: lineasValidas.map((l) => ({
            empresaId: ctx.empresaId, recepcionId: nueva.id, productoId: l.producto.id,
            cantidadRecibida: l.recibida, cantidadEsperada: l.esperada, observacion: l.observacion,
          })),
        });

        for (const l of lineasValidas) {
          await bloquearSaldos(tx, ctx.empresaId, l.producto.id, [bodega.id]);
          const saldo = await sumarSaldo(tx, ctx.empresaId, l.producto.id, bodega.id, l.recibida);
          await tx.movimientoInventario.create({
            data: {
              empresaId: ctx.empresaId, productoId: l.producto.id, bodegaId: bodega.id, tipo: "RECEPCION", sentido: "ENTRADA", cantidad: l.recibida,
              saldoPosterior: saldo, motivo: `Recepción de importación ${operacion.numero}`, referencia: numero, recepcionId: nueva.id,
              operacionId: operacion.id, usuarioId: ctx.usuarioId,
            },
          });
        }
        await tx.operacionHistorial.create({
          data: { empresaId: ctx.empresaId, operacionId: operacion.id, usuarioId: ctx.usuarioId, accion: "RECEPCION", detalle: { numero, lineas: lineasValidas.length } },
        });
        return { id: nueva.id, numero };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    return { duplicada: false, recepcion };
  } catch (error) {
    // Dos envíos simultáneos con la misma clave: el segundo revierte todo y devuelve la recepción ya registrada.
    if (esErrorPrisma(error, "P2002")) {
      const concurrente = await existente(ctx, cab.claveIdempotencia);
      if (concurrente) return { duplicada: true, recepcion: concurrente };
    }
    throw error;
  }
}

export type FiltrosRecepciones = { q?: string; bodegaId?: string; pagina?: number };

export async function listarRecepciones(ctx: ContextoAcceso, filtros: FiltrosRecepciones = {}) {
  const q = filtros.q?.trim();
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const filas = await db.recepcion.findMany({
    where: {
      empresaId: ctx.empresaId,
      ...(filtros.bodegaId && uuid("Bodega").safeParse(filtros.bodegaId).success ? { bodegaId: filtros.bodegaId } : {}),
      ...(q ? { OR: [{ numero: { contains: q, mode: "insensitive" } }, { operacion: { numero: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: {
      operacion: { select: { id: true, numero: true } },
      bodega: { select: { nombre: true } },
      registradoPor: { select: { nombre: true } },
      _count: { select: { lineas: true } },
    },
    orderBy: { creadoEn: "desc" },
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA + 1,
  });
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA, pagina };
}

export async function obtenerRecepcion(ctx: ContextoAcceso, id: string) {
  if (!uuid("Recepción").safeParse(id).success) return null;
  return db.recepcion.findFirst({
    where: { id, empresaId: ctx.empresaId },
    include: {
      operacion: { select: { id: true, numero: true, tercero: { select: { razonSocial: true } } } },
      bodega: { select: { id: true, codigo: true, nombre: true } },
      documento: { select: { id: true, nombreOriginal: true, tipo: true } },
      registradoPor: { select: { nombre: true } },
      lineas: { include: { producto: { select: { sku: true, nombre: true, unidad: true } } } },
      movimientos: { select: { id: true, compensadoPor: { select: { id: true } } } },
    },
  });
}

/** Importaciones candidatas a recibir mercancía (no canceladas), de la empresa activa. */
export function importacionesParaRecibir(ctx: ContextoAcceso) {
  return db.operacion.findMany({
    where: { empresaId: ctx.empresaId, tipo: "IMPORTACION", estado: { not: "CANCELADA" } },
    select: { id: true, numero: true, tercero: { select: { razonSocial: true } } },
    orderBy: { consecutivo: "desc" },
    take: 100,
  });
}

/** Documentos de una operación (para elegir el soporte de la recepción). */
export function documentosDeOperacion(ctx: ContextoAcceso, operacionId: string) {
  return db.documento.findMany({
    where: { empresaId: ctx.empresaId, operacionId },
    select: { id: true, nombreOriginal: true, tipo: true },
    orderBy: { creadoEn: "desc" },
  });
}
