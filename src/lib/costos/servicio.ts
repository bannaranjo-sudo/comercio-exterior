import { Prisma } from "@/generated/prisma/client";
import { CategoriaCosto, EstadoCosto } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { fecha, importe, moneda, parsear, texto, textoOpcional, uuid, z } from "@/lib/validacion";

// Costos por operación. Los importes son Decimal exacto (Postgres NUMERIC); las sumas se hacen en la
// base y se agrupan SIEMPRE por moneda: nunca se mezclan monedas ni se inventan tasas de cambio.

const esquemaCosto = z.object({
  categoria: z.enum(CategoriaCosto, { error: "Seleccione la categoría." }),
  concepto: texto("El concepto", 200),
  valor: importe("El valor"),
  moneda,
  fecha: fecha("La fecha"),
  estado: z.enum(EstadoCosto, { error: "Seleccione si el costo es estimado o real." }),
  observacion: textoOpcional("La observación", 500),
});

async function operacionAbierta(ctx: ContextoAcceso, id: string) {
  const operacion = uuid("Operación").safeParse(id).success
    ? await db.operacion.findFirst({ where: { id, empresaId: ctx.empresaId }, select: { id: true, estado: true } })
    : null;
  if (!operacion) throw new ErrorValidacion("Operación no encontrada.");
  if (operacion.estado === "CANCELADA") throw new ErrorValidacion("La operación está cancelada y no admite cambios.");
  return operacion;
}

export function listarCostos(ctx: ContextoAcceso, operacionId: string) {
  return db.costo.findMany({
    where: { empresaId: ctx.empresaId, operacionId },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
  });
}

export async function registrarCosto(ctx: ContextoAcceso, operacionId: string, datos: unknown) {
  const d = parsear(esquemaCosto, datos);
  const operacion = await operacionAbierta(ctx, operacionId);
  return db.$transaction(async (tx) => {
    const costo = await tx.costo.create({ data: { ...d, empresaId: ctx.empresaId, operacionId: operacion.id, registradoPorId: ctx.usuarioId } });
    await tx.operacionHistorial.create({
      data: { empresaId: ctx.empresaId, operacionId: operacion.id, usuarioId: ctx.usuarioId, accion: "COSTO", detalle: { concepto: d.concepto, valor: d.valor, moneda: d.moneda, estado: d.estado } },
    });
    return costo;
  });
}

export async function actualizarCosto(ctx: ContextoAcceso, costoId: string, datos: unknown) {
  const d = parsear(esquemaCosto, datos);
  const costo = uuid("Costo").safeParse(costoId).success ? await db.costo.findFirst({ where: { id: costoId, empresaId: ctx.empresaId } }) : null;
  if (!costo) throw new ErrorValidacion("Costo no encontrado.");
  await operacionAbierta(ctx, costo.operacionId);
  await db.costo.update({ where: { id: costo.id }, data: { ...d, observacion: d.observacion ?? null } });
}

export async function eliminarCosto(ctx: ContextoAcceso, costoId: string) {
  const costo = uuid("Costo").safeParse(costoId).success ? await db.costo.findFirst({ where: { id: costoId, empresaId: ctx.empresaId } }) : null;
  if (!costo) throw new ErrorValidacion("Costo no encontrado.");
  await operacionAbierta(ctx, costo.operacionId);
  await db.$transaction([
    db.costo.delete({ where: { id: costo.id } }),
    db.operacionHistorial.create({
      data: { empresaId: ctx.empresaId, operacionId: costo.operacionId, usuarioId: ctx.usuarioId, accion: "COSTO_ELIMINADO", detalle: { concepto: costo.concepto, valor: costo.valor.toFixed(2), moneda: costo.moneda, estado: costo.estado } },
    }),
  ]);
}

export type TotalMoneda = {
  moneda: string;
  estimado: string;
  real: string;
  /** real − estimado (solo informativo; ambos en la misma moneda). */
  diferencia: string;
  categorias: { categoria: CategoriaCosto; estimado: string; real: string }[];
};

const CERO = new Prisma.Decimal(0);

/** Subtotales por categoría y totales por moneda; sin conversión cambiaria. */
export async function totalesPorMoneda(ctx: ContextoAcceso, operacionId?: string): Promise<TotalMoneda[]> {
  const grupos = await db.costo.groupBy({
    by: ["moneda", "categoria", "estado"],
    where: { empresaId: ctx.empresaId, ...(operacionId ? { operacionId } : {}) },
    _sum: { valor: true },
  });
  const porMoneda = new Map<string, Map<CategoriaCosto, { estimado: Prisma.Decimal; real: Prisma.Decimal }>>();
  for (const g of grupos) {
    const categorias = porMoneda.get(g.moneda) ?? new Map();
    const acumulado = categorias.get(g.categoria) ?? { estimado: CERO, real: CERO };
    const suma = g._sum.valor ?? CERO;
    if (g.estado === "ESTIMADO") acumulado.estimado = acumulado.estimado.plus(suma);
    else acumulado.real = acumulado.real.plus(suma);
    categorias.set(g.categoria, acumulado);
    porMoneda.set(g.moneda, categorias);
  }
  return [...porMoneda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, categorias]) => {
      const filas = [...categorias.entries()].map(([categoria, v]) => ({ categoria, ...v }));
      const estimado = filas.reduce((s, f) => s.plus(f.estimado), CERO);
      const real = filas.reduce((s, f) => s.plus(f.real), CERO);
      return {
        moneda,
        estimado: estimado.toFixed(2),
        real: real.toFixed(2),
        diferencia: real.minus(estimado).toFixed(2),
        categorias: filas.map((f) => ({ categoria: f.categoria, estimado: f.estimado.toFixed(2), real: f.real.toFixed(2) })),
      };
    });
}

/** Últimos costos registrados en la empresa (vista global). */
export function costosRecientes(ctx: ContextoAcceso, limite = 15) {
  return db.costo.findMany({
    where: { empresaId: ctx.empresaId },
    include: { operacion: { select: { id: true, numero: true } } },
    orderBy: { creadoEn: "desc" },
    take: limite,
  });
}
