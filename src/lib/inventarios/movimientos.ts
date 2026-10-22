import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { MovimientoInventario, UnidadMedida } from "@/generated/prisma/client";
import type { SentidoMovimiento, TipoMovimiento } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { esErrorPrisma } from "@/lib/db-errores";
import { ErrorValidacion } from "@/lib/errores";
import { formatearCantidad, parsearCantidad } from "@/lib/inventarios/cantidades";
import { parsear, textoOpcional, uuid, uuidOpcional, z } from "@/lib/validacion";

// Motor de inventario. Reglas:
//  - Los saldos viven en `existencias` (NUMERIC exacto) y solo cambian dentro de la transacción que crea el movimiento.
//  - Una salida solo se aplica si el saldo alcanza (UPDATE condicional): dos salidas simultáneas no pueden dejarlo negativo.
//  - Una transferencia bloquea ambas filas en orden determinista (sin interbloqueos) y escribe salida y entrada juntas.
//  - Los movimientos son inmutables (trigger en la base): se corrigen con movimientos compensatorios.

export type Tx = Prisma.TransactionClient;
type Sentido = SentidoMovimiento;

export type ResultadoMovimiento = { duplicado: boolean; movimientos: MovimientoInventario[] };

const OPCIONES_TX = { timeout: 15_000, maxWait: 10_000 } as const;

// --- Saldos ---------------------------------------------------------------------------------------

/** Garantiza que existan las filas de saldo y las bloquea en orden de bodega (evita interbloqueos). */
export async function bloquearSaldos(tx: Tx, empresaId: string, productoId: string, bodegaIds: string[]): Promise<void> {
  const ordenadas = [...new Set(bodegaIds)].sort();
  for (const bodegaId of ordenadas) {
    await tx.$executeRaw`
      INSERT INTO existencias (empresa_id, producto_id, bodega_id, cantidad, actualizado_en)
      VALUES (${empresaId}::uuid, ${productoId}::uuid, ${bodegaId}::uuid, 0, now())
      ON CONFLICT (producto_id, bodega_id) DO NOTHING`;
  }
  await tx.$queryRaw`
    SELECT cantidad FROM existencias
    WHERE empresa_id = ${empresaId}::uuid AND producto_id = ${productoId}::uuid
      AND bodega_id::text IN (${Prisma.join(ordenadas)})
    ORDER BY bodega_id FOR UPDATE`;
}

export async function sumarSaldo(tx: Tx, empresaId: string, productoId: string, bodegaId: string, cantidad: string): Promise<string> {
  const [fila] = await tx.$queryRaw<{ cantidad: string }[]>`
    INSERT INTO existencias (empresa_id, producto_id, bodega_id, cantidad, actualizado_en)
    VALUES (${empresaId}::uuid, ${productoId}::uuid, ${bodegaId}::uuid, ${cantidad}::numeric, now())
    ON CONFLICT (producto_id, bodega_id)
    DO UPDATE SET cantidad = existencias.cantidad + EXCLUDED.cantidad, actualizado_en = now()
    RETURNING cantidad::text AS cantidad`;
  return fila.cantidad;
}

export async function restarSaldo(
  tx: Tx, empresaId: string, productoId: string, bodegaId: string, cantidad: string, unidad?: UnidadMedida,
): Promise<string> {
  const filas = await tx.$queryRaw<{ cantidad: string }[]>`
    UPDATE existencias SET cantidad = cantidad - ${cantidad}::numeric, actualizado_en = now()
    WHERE empresa_id = ${empresaId}::uuid AND producto_id = ${productoId}::uuid AND bodega_id = ${bodegaId}::uuid
      AND cantidad >= ${cantidad}::numeric
    RETURNING cantidad::text AS cantidad`;
  if (filas.length === 0) {
    const actual = await tx.existenciaInventario.findUnique({ where: { productoId_bodegaId: { productoId, bodegaId } } });
    throw new ErrorValidacion(
      `Existencias insuficientes: disponible ${formatearCantidad(actual?.cantidad ?? "0", unidad)}, solicitado ${formatearCantidad(cantidad, unidad)}.`,
    );
  }
  return filas[0].cantidad;
}

// --- Entidades ------------------------------------------------------------------------------------

async function cargar(tx: Tx, ctx: ContextoAcceso, productoId: string, bodegaIds: string[], exigirActivos = true) {
  const producto = await tx.producto.findFirst({ where: { id: productoId, empresaId: ctx.empresaId } });
  if (!producto) throw new ErrorValidacion("El producto no existe en esta empresa.");
  if (exigirActivos && !producto.activo) throw new ErrorValidacion("El producto está inactivo.");
  const bodegas = await tx.bodega.findMany({ where: { id: { in: bodegaIds }, empresaId: ctx.empresaId } });
  for (const id of bodegaIds) {
    const b = bodegas.find((x) => x.id === id);
    if (!b) throw new ErrorValidacion("La bodega no existe en esta empresa.");
    if (exigirActivos && !b.activo) throw new ErrorValidacion(`La bodega ${b.nombre} está inactiva.`);
  }
  return { producto, bodegas };
}

// --- Registro de movimientos ----------------------------------------------------------------------

const esquemaMovimiento = z.object({
  productoId: uuid("El producto"),
  bodegaId: uuid("La bodega"),
  cantidad: z.string({ error: "La cantidad es obligatoria." }),
  motivo: textoOpcional("El motivo", 500),
  referencia: textoOpcional("La referencia", 120),
  operacionId: uuidOpcional("La operación"),
  claveIdempotencia: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(100).optional()),
});

type DatosMovimiento = z.infer<typeof esquemaMovimiento>;

async function validarOperacion(tx: Tx, ctx: ContextoAcceso, operacionId?: string) {
  if (!operacionId) return;
  const op = await tx.operacion.findFirst({ where: { id: operacionId, empresaId: ctx.empresaId }, select: { id: true } });
  if (!op) throw new ErrorValidacion("La operación seleccionada no existe en esta empresa.");
}

async function previo(ctx: ContextoAcceso, clave?: string): Promise<ResultadoMovimiento | null> {
  if (!clave) return null;
  const grupo = await db.movimientoInventario.findMany({
    where: { empresaId: ctx.empresaId, claveIdempotencia: { in: [clave, `${clave}:entrada`] } },
    orderBy: { creadoEn: "asc" },
  });
  return grupo.length ? { duplicado: true, movimientos: grupo } : null;
}

/** Ejecuta la operación dentro de una transacción; ante una clave de idempotencia repetida devuelve lo ya registrado. */
async function ejecutar(
  ctx: ContextoAcceso, clave: string | undefined, operacion: (tx: Tx) => Promise<MovimientoInventario[]>,
): Promise<ResultadoMovimiento> {
  const repetido = await previo(ctx, clave);
  if (repetido) return repetido;
  try {
    const movimientos = await db.$transaction(operacion, OPCIONES_TX);
    return { duplicado: false, movimientos };
  } catch (error) {
    if (clave && esErrorPrisma(error, "P2002")) {
      const concurrente = await previo(ctx, clave);
      if (concurrente) return concurrente;
    }
    throw error;
  }
}

async function movimientoSimple(
  ctx: ContextoAcceso,
  d: DatosMovimiento,
  tipo: TipoMovimiento,
  sentido: Sentido,
  opciones: { motivoMinimo?: number } = {},
): Promise<ResultadoMovimiento> {
  const motivo = d.motivo ?? undefined;
  if (opciones.motivoMinimo && (motivo?.length ?? 0) < opciones.motivoMinimo) {
    throw new ErrorValidacion(`El motivo es obligatorio (mínimo ${opciones.motivoMinimo} caracteres).`);
  }
  return ejecutar(ctx, d.claveIdempotencia, async (tx) => {
    const { producto } = await cargar(tx, ctx, d.productoId, [d.bodegaId]);
    const cantidad = parsearCantidad(d.cantidad, producto.unidad, "La cantidad");
    await validarOperacion(tx, ctx, d.operacionId);
    await bloquearSaldos(tx, ctx.empresaId, producto.id, [d.bodegaId]);
    const saldo =
      sentido === "ENTRADA"
        ? await sumarSaldo(tx, ctx.empresaId, producto.id, d.bodegaId, cantidad)
        : await restarSaldo(tx, ctx.empresaId, producto.id, d.bodegaId, cantidad, producto.unidad);
    const movimiento = await tx.movimientoInventario.create({
      data: {
        empresaId: ctx.empresaId, productoId: producto.id, bodegaId: d.bodegaId, tipo, sentido, cantidad, saldoPosterior: saldo,
        motivo, referencia: d.referencia, operacionId: d.operacionId, claveIdempotencia: d.claveIdempotencia, usuarioId: ctx.usuarioId,
      },
    });
    return [movimiento];
  });
}

export const registrarEntrada = async (ctx: ContextoAcceso, datos: unknown) =>
  movimientoSimple(ctx, parsear(esquemaMovimiento, datos), "ENTRADA", "ENTRADA", { motivoMinimo: 3 });

export const registrarSalida = async (ctx: ContextoAcceso, datos: unknown) =>
  movimientoSimple(ctx, parsear(esquemaMovimiento, datos), "SALIDA", "SALIDA", { motivoMinimo: 3 });

const esquemaAjuste = esquemaMovimiento.extend({ direccion: z.enum(["AUMENTAR", "DISMINUIR"], { error: "Indique si el ajuste aumenta o disminuye." }) });

/** Ajuste con justificación obligatoria (mínimo 10 caracteres). */
export async function registrarAjuste(ctx: ContextoAcceso, datos: unknown) {
  const d = parsear(esquemaAjuste, datos);
  return movimientoSimple(ctx, d, "AJUSTE", d.direccion === "AUMENTAR" ? "ENTRADA" : "SALIDA", { motivoMinimo: 10 });
}

const esquemaTransferencia = esquemaMovimiento
  .omit({ bodegaId: true })
  .extend({ origenId: uuid("La bodega de origen"), destinoId: uuid("La bodega de destino") });

/** Salida de origen y entrada en destino en una sola transacción. */
export async function registrarTransferencia(ctx: ContextoAcceso, datos: unknown): Promise<ResultadoMovimiento> {
  const d = parsear(esquemaTransferencia, datos);
  if (d.origenId === d.destinoId) throw new ErrorValidacion("La bodega de destino debe ser distinta de la de origen.");
  if ((d.motivo?.length ?? 0) < 3) throw new ErrorValidacion("El motivo es obligatorio (mínimo 3 caracteres).");
  return ejecutar(ctx, d.claveIdempotencia, async (tx) => {
    const { producto } = await cargar(tx, ctx, d.productoId, [d.origenId, d.destinoId]);
    const cantidad = parsearCantidad(d.cantidad, producto.unidad, "La cantidad");
    await validarOperacion(tx, ctx, d.operacionId);
    await bloquearSaldos(tx, ctx.empresaId, producto.id, [d.origenId, d.destinoId]);
    const saldoOrigen = await restarSaldo(tx, ctx.empresaId, producto.id, d.origenId, cantidad, producto.unidad);
    const saldoDestino = await sumarSaldo(tx, ctx.empresaId, producto.id, d.destinoId, cantidad);
    const grupoId = randomUUID();
    const comunes = {
      empresaId: ctx.empresaId, productoId: producto.id, tipo: "TRANSFERENCIA" as const, cantidad, motivo: d.motivo,
      referencia: d.referencia, operacionId: d.operacionId, grupoId, usuarioId: ctx.usuarioId,
    };
    const salida = await tx.movimientoInventario.create({
      data: { ...comunes, bodegaId: d.origenId, sentido: "SALIDA", saldoPosterior: saldoOrigen, claveIdempotencia: d.claveIdempotencia },
    });
    const entrada = await tx.movimientoInventario.create({
      data: { ...comunes, bodegaId: d.destinoId, sentido: "ENTRADA", saldoPosterior: saldoDestino, claveIdempotencia: d.claveIdempotencia ? `${d.claveIdempotencia}:entrada` : undefined },
    });
    return [salida, entrada];
  });
}

/**
 * Compensa un movimiento confirmado creando el movimiento inverso (el original no se toca). Una transferencia se
 * compensa completa (ambas patas). Un movimiento solo puede compensarse una vez; una compensación no se compensa.
 */
export async function compensarMovimiento(ctx: ContextoAcceso, movimientoId: string, motivo: unknown): Promise<ResultadoMovimiento> {
  const razon = typeof motivo === "string" ? motivo.trim() : "";
  if (razon.length < 10) throw new ErrorValidacion("La justificación de la compensación es obligatoria (mínimo 10 caracteres).");
  if (!uuid("Movimiento").safeParse(movimientoId).success) throw new ErrorValidacion("Movimiento no encontrado.");

  try {
    return await compensar(ctx, movimientoId, razon);
  } catch (error) {
    if (esErrorPrisma(error, "P2002")) throw new ErrorValidacion("Este movimiento ya fue compensado.");
    throw error;
  }
}

function compensar(ctx: ContextoAcceso, movimientoId: string, razon: string): Promise<ResultadoMovimiento> {
  return ejecutar(ctx, undefined, async (tx) => {
    const original = await tx.movimientoInventario.findFirst({ where: { id: movimientoId, empresaId: ctx.empresaId } });
    if (!original) throw new ErrorValidacion("Movimiento no encontrado.");
    if (original.tipo === "COMPENSACION") throw new ErrorValidacion("Una compensación no puede compensarse de nuevo.");
    const grupo = original.grupoId
      ? await tx.movimientoInventario.findMany({ where: { empresaId: ctx.empresaId, grupoId: original.grupoId }, orderBy: { creadoEn: "asc" } })
      : [original];
    const yaCompensados = await tx.movimientoInventario.count({ where: { empresaId: ctx.empresaId, compensaDeId: { in: grupo.map((g) => g.id) } } });
    if (yaCompensados > 0) throw new ErrorValidacion("Este movimiento ya fue compensado.");

    const producto = await tx.producto.findFirstOrThrow({ where: { id: original.productoId, empresaId: ctx.empresaId } });
    await bloquearSaldos(tx, ctx.empresaId, producto.id, grupo.map((g) => g.bodegaId));
    const grupoId = grupo.length > 1 ? randomUUID() : undefined;
    // Las salidas inversas (de las entradas originales) van primero: si no hay saldo, se rechaza antes de tocar nada.
    const ordenados = [...grupo].sort((a, b) => (a.sentido === "ENTRADA" ? -1 : 1) - (b.sentido === "ENTRADA" ? -1 : 1));
    const creados: MovimientoInventario[] = [];
    for (const m of ordenados) {
      const cantidad = m.cantidad.toFixed(4);
      const sentido: Sentido = m.sentido === "ENTRADA" ? "SALIDA" : "ENTRADA";
      const saldo =
        sentido === "ENTRADA"
          ? await sumarSaldo(tx, ctx.empresaId, producto.id, m.bodegaId, cantidad)
          : await restarSaldo(tx, ctx.empresaId, producto.id, m.bodegaId, cantidad, producto.unidad);
      creados.push(
        await tx.movimientoInventario.create({
          data: {
            empresaId: ctx.empresaId, productoId: producto.id, bodegaId: m.bodegaId, tipo: "COMPENSACION", sentido, cantidad, saldoPosterior: saldo,
            motivo: razon, referencia: `Compensa ${m.tipo.toLowerCase()} del ${m.creadoEn.toISOString().slice(0, 10)}`,
            grupoId, compensaDeId: m.id, usuarioId: ctx.usuarioId,
          },
        }),
      );
    }
    return creados;
  });
}
