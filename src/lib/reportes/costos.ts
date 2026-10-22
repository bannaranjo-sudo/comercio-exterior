import { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ETIQUETA_CATEGORIA_COSTO } from "@/lib/etiquetas";
import { donde, rangoFecha, type FiltrosReporte } from "./filtros";
import { TAMANO_PAGINA_REPORTE, type Fila, type Grafico, type Kpi, type ReporteDatos } from "./tipos";
import { CERO, entero, limites, validarTope, type Modo } from "./util";

/** Variación solo cuando existen costos estimados y reales; sin uno de los dos no hay con qué comparar. */
const variacion = (estimado: Prisma.Decimal, real: Prisma.Decimal): string | null => (estimado.gt(0) && real.gt(0) ? real.minus(estimado).toFixed(2) : null);

const variacionPct = (estimado: Prisma.Decimal, real: Prisma.Decimal): string | null =>
  estimado.gt(0) && real.gt(0) ? real.minus(estimado).div(estimado).times(100).toFixed(1) : null;

export async function reporteCostos(ctx: ContextoAcceso, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  const opWhere = donde(ctx, f, false);
  const periodo = rangoFecha(f);
  const costoWhere: Prisma.CostoWhereInput = {
    empresaId: ctx.empresaId,
    operacion: opWhere,
    ...(periodo ? { fecha: periodo } : {}),
    ...(f.moneda ? { moneda: f.moneda } : {}),
    ...(f.categoria ? { categoria: f.categoria } : {}),
    ...(f.estadoCosto ? { estado: f.estadoCosto } : {}),
  };
  const opsConCostos: Prisma.OperacionWhereInput = { AND: [opWhere, { costos: { some: { ...costoWhere, operacion: undefined } } }] };

  const [grupos, totalOps, ops] = await Promise.all([
    db.costo.groupBy({ by: ["moneda", "categoria", "estado"], where: costoWhere, _sum: { valor: true }, _count: { _all: true } }),
    db.operacion.count({ where: opsConCostos }),
    db.operacion.findMany({ where: opsConCostos, orderBy: { consecutivo: "desc" }, ...limites(modo), select: { id: true, numero: true, tercero: { select: { razonSocial: true } } } }),
  ]);
  validarTope(ops.length);
  const visibles = ops.slice(0, modo.todo ? ops.length : TAMANO_PAGINA_REPORTE);
  const porOp = visibles.length
    ? await db.costo.groupBy({ by: ["operacionId", "moneda", "estado"], where: { ...costoWhere, operacionId: { in: visibles.map((o) => o.id) } }, _sum: { valor: true } })
    : [];

  // Totales por moneda y por categoría (sin conversión cambiaria).
  type Acum = { estimado: Prisma.Decimal; real: Prisma.Decimal };
  const porMoneda = new Map<string, Acum>();
  const porCategoria = new Map<string, Map<string, Acum>>();
  const sumar = (m: Map<string, Acum>, clave: string, estado: string, v: Prisma.Decimal) => {
    const a = m.get(clave) ?? { estimado: CERO, real: CERO };
    if (estado === "ESTIMADO") a.estimado = a.estimado.plus(v);
    else a.real = a.real.plus(v);
    m.set(clave, a);
  };
  let registros = 0;
  for (const g of grupos) {
    const v = g._sum.valor ?? CERO;
    registros += g._count._all;
    sumar(porMoneda, g.moneda, g.estado, v);
    const cat = porCategoria.get(g.moneda) ?? new Map<string, Acum>();
    sumar(cat, g.categoria, g.estado, v);
    porCategoria.set(g.moneda, cat);
  }
  const monedas = [...porMoneda.keys()].sort();

  const kpis: Kpi[] = [{ etiqueta: "Registros de costo", valor: entero(registros), detalle: `${entero(totalOps)} operación(es)` }];
  for (const m of monedas) {
    const a = porMoneda.get(m)!;
    const dif = variacion(a.estimado, a.real);
    kpis.push(
      { etiqueta: `Estimado ${m}`, valor: a.estimado.toFixed(2) },
      { etiqueta: `Real ${m}`, valor: a.real.toFixed(2) },
      { etiqueta: `Variación ${m} (real − estimado)`, valor: dif ?? "—", detalle: dif ? `${variacionPct(a.estimado, a.real)} % sobre lo estimado` : "Requiere costos estimados y reales", tono: dif ? (Number(dif) > 0 ? "warning" : Number(dif) < 0 ? "success" : "neutral") : "neutral" },
    );
  }

  const graficos: Grafico[] = monedas.slice(0, 4).map((m) => {
    const cats = [...porCategoria.get(m)!.entries()];
    return {
      tipo: "columnas" as const, id: `categorias-${m}`, titulo: `Costos por categoría · ${m}`, unidad: m,
      categorias: cats.map(([c]) => ETIQUETA_CATEGORIA_COSTO[c as keyof typeof ETIQUETA_CATEGORIA_COSTO]),
      series: [{ nombre: "Estimado", valores: cats.map(([, a]) => Number(a.estimado.toFixed(2))) }, { nombre: "Real", valores: cats.map(([, a]) => Number(a.real.toFixed(2))) }],
    };
  });

  const filasOp: Fila[] = [];
  for (const o of visibles) {
    const mons = [...new Set(porOp.filter((g) => g.operacionId === o.id).map((g) => g.moneda))].sort();
    for (const m of mons) {
      const suma = (e: string) => porOp.find((g) => g.operacionId === o.id && g.moneda === m && g.estado === e)?._sum.valor ?? CERO;
      const est = suma("ESTIMADO");
      const real = suma("REAL");
      filasOp.push({
        href: `/operaciones/${o.id}/costos`,
        celdas: { numero: o.numero, tercero: o.tercero.razonSocial, moneda: m, estimado: est.toFixed(2), real: real.toFixed(2), variacion: variacion(est, real), variacionPct: variacionPct(est, real) },
      });
    }
  }

  const filasCat: Fila[] = monedas.flatMap((m) =>
    [...porCategoria.get(m)!.entries()].map(([c, a]) => ({
      celdas: { moneda: m, categoria: ETIQUETA_CATEGORIA_COSTO[c as keyof typeof ETIQUETA_CATEGORIA_COSTO], estimado: a.estimado.toFixed(2), real: a.real.toFixed(2), variacion: variacion(a.estimado, a.real), variacionPct: variacionPct(a.estimado, a.real) },
    })),
  );
  const dec = (clave: string, etiqueta: string) => ({ clave, etiqueta, tipo: "decimal" as const });

  return {
    id: "costos",
    titulo: "Reporte de costos",
    descripcion: "Costos estimados y reales por operación y categoría, con variaciones y totales separados por moneda.",
    campoPeriodo: "Fecha del costo",
    avisos: ["Cada moneda se presenta por separado: no se aplican tasas de cambio ni se consolidan monedas distintas.", "Variación = real − estimado dentro de la misma moneda (positiva: costo real superior al estimado); solo se calcula cuando hay costos estimados y reales."],
    kpis,
    graficos,
    tablas: [
      {
        id: "por-operacion", titulo: "Costos por operación y moneda", total: totalOps, pagina: modo.pagina, tamanoPagina: modo.todo ? undefined : TAMANO_PAGINA_REPORTE,
        columnas: [
          { clave: "numero", etiqueta: "Operación", tipo: "texto" }, { clave: "tercero", etiqueta: "Tercero", tipo: "texto" }, { clave: "moneda", etiqueta: "Moneda", tipo: "texto" },
          dec("estimado", "Estimado"), dec("real", "Real"), dec("variacion", "Variación"), { clave: "variacionPct", etiqueta: "Variación %", tipo: "decimal", decimales: 1 },
        ],
        filas: filasOp,
        nota: "El total corresponde a operaciones; una operación con varias monedas ocupa una fila por moneda.",
      },
      {
        id: "por-categoria", titulo: "Desglose por categoría", total: filasCat.length,
        columnas: [{ clave: "moneda", etiqueta: "Moneda", tipo: "texto" }, { clave: "categoria", etiqueta: "Categoría", tipo: "texto" }, dec("estimado", "Estimado"), dec("real", "Real"), dec("variacion", "Variación"), { clave: "variacionPct", etiqueta: "Variación %", tipo: "decimal", decimales: 1 }],
        filas: filasCat,
      },
    ],
  };
}
