import type { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ETIQUETA_ESTADO_OPERACION, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas";
import { ESTADOS_ACTIVOS } from "@/lib/operaciones/servicio";
import { donde, type FiltrosReporte } from "./filtros";
import type { Fila, Grafico, Kpi, ReporteDatos } from "./tipos";
import { diasEntre, entero, hoyUTC, iso, sumarDias } from "./util";

const ACTIVAS = [...ESTADOS_ACTIVOS];
const VENTANA_PROXIMAS_DIAS = 30;
const LIMITE_LISTA = 15;

/** Meses (AAAA-MM) entre el primero y el último con datos, sin saltos; máximo los últimos 24. */
function mesesContiguos(claves: string[]): string[] {
  if (claves.length === 0) return [];
  const ordenadas = [...claves].sort();
  const [ai, mi] = ordenadas[0].split("-").map(Number);
  const [af, mf] = ordenadas[ordenadas.length - 1].split("-").map(Number);
  const meses: string[] = [];
  for (let a = ai, m = mi; a < af || (a === af && m <= mf); m === 12 ? ((a += 1), (m = 1)) : (m += 1)) {
    meses.push(`${a}-${String(m).padStart(2, "0")}`);
  }
  return meses.slice(-24);
}

export async function reporteResumen(ctx: ContextoAcceso, f: FiltrosReporte): Promise<ReporteDatos> {
  const where = donde(ctx, f);
  const hoy = hoyUTC();
  const puede = (p: string) => ctx.permisos.has(p);
  const activaYFiltrada: Prisma.OperacionWhereInput = { AND: [where, { estado: { in: ACTIVAS } }] };
  const noCancelada: Prisma.OperacionWhereInput = { AND: [where, { estado: { not: "CANCELADA" } }] };

  const [porTipoEstado, porDia, origenes, destinos, retrasadas, proximas] = await Promise.all([
    db.operacion.groupBy({ by: ["tipo", "estado"], where, _count: { _all: true } }),
    db.operacion.groupBy({ by: ["fechaApertura", "tipo"], where, _count: { _all: true } }),
    db.operacion.groupBy({ by: ["paisOrigen"], where, _count: { _all: true }, orderBy: { _count: { paisOrigen: "desc" } }, take: 8 }),
    db.operacion.groupBy({ by: ["paisDestino"], where, _count: { _all: true }, orderBy: { _count: { paisDestino: "desc" } }, take: 8 }),
    db.envio.findMany({
      where: { empresaId: ctx.empresaId, fechaRealLlegada: null, fechaEstimadaLlegada: { lt: hoy }, operacion: activaYFiltrada },
      orderBy: { fechaEstimadaLlegada: "asc" }, take: LIMITE_LISTA,
      select: { fechaEstimadaLlegada: true, estadoEnvio: true, operacion: { select: { id: true, numero: true, tercero: { select: { razonSocial: true } } } } },
    }),
    db.envio.findMany({
      where: { empresaId: ctx.empresaId, fechaRealLlegada: null, fechaEstimadaLlegada: { gte: hoy, lte: sumarDias(hoy, VENTANA_PROXIMAS_DIAS) }, operacion: activaYFiltrada },
      orderBy: { fechaEstimadaLlegada: "asc" }, take: LIMITE_LISTA,
      select: { fechaEstimadaLlegada: true, estadoEnvio: true, operacion: { select: { id: true, numero: true, tercero: { select: { razonSocial: true } } } } },
    }),
  ]);
  const [totalRetrasadas, totalProximas, docsPendientes, docsObservados, incidencias] = await Promise.all([
    db.envio.count({ where: { empresaId: ctx.empresaId, fechaRealLlegada: null, fechaEstimadaLlegada: { lt: hoy }, operacion: activaYFiltrada } }),
    db.envio.count({ where: { empresaId: ctx.empresaId, fechaRealLlegada: null, fechaEstimadaLlegada: { gte: hoy, lte: sumarDias(hoy, VENTANA_PROXIMAS_DIAS) }, operacion: activaYFiltrada } }),
    puede("documentos:consultar") ? db.documento.count({ where: { empresaId: ctx.empresaId, estado: { not: "APROBADO" }, operacion: noCancelada } }) : null,
    puede("documentos:consultar") ? db.documento.count({ where: { empresaId: ctx.empresaId, estado: "OBSERVADO", operacion: noCancelada } }) : null,
    puede("logistica:consultar") ? db.eventoLogistico.count({ where: { empresaId: ctx.empresaId, tipo: "NOVEDAD", resuelta: false, operacion: noCancelada } }) : null,
  ]);

  const total = porTipoEstado.reduce((s, g) => s + g._count._all, 0);
  const deTipo = (t: "IMPORTACION" | "EXPORTACION") => porTipoEstado.filter((g) => g.tipo === t).reduce((s, g) => s + g._count._all, 0);
  const activas = porTipoEstado.filter((g) => ACTIVAS.includes(g.estado)).reduce((s, g) => s + g._count._all, 0);
  const finalizadas = porTipoEstado.filter((g) => g.estado === "FINALIZADA").reduce((s, g) => s + g._count._all, 0);

  const kpis: Kpi[] = [
    { etiqueta: "Operaciones", valor: entero(total), detalle: `${entero(deTipo("IMPORTACION"))} importaciones · ${entero(deTipo("EXPORTACION"))} exportaciones` },
    { etiqueta: "Activas", valor: entero(activas), tono: "primary" },
    { etiqueta: "Finalizadas", valor: entero(finalizadas), tono: "success" },
    { etiqueta: "Retrasadas", valor: entero(totalRetrasadas), detalle: "Llegada estimada vencida sin llegada real", tono: totalRetrasadas > 0 ? "danger" : "neutral" },
    { etiqueta: `Llegan en ${VENTANA_PROXIMAS_DIAS} días`, valor: entero(totalProximas), tono: "warning" },
  ];
  if (docsPendientes !== null) kpis.push({ etiqueta: "Documentos sin aprobar", valor: entero(docsPendientes), detalle: `${entero(docsObservados ?? 0)} observado(s)`, tono: docsPendientes > 0 ? "warning" : "neutral" });
  if (incidencias !== null) kpis.push({ etiqueta: "Incidencias abiertas", valor: entero(incidencias), tono: incidencias > 0 ? "danger" : "neutral" });

  const porMes = new Map<string, { IMPORTACION: number; EXPORTACION: number }>();
  for (const g of porDia) {
    const mes = g.fechaApertura.toISOString().slice(0, 7);
    const fila = porMes.get(mes) ?? { IMPORTACION: 0, EXPORTACION: 0 };
    fila[g.tipo] += g._count._all;
    porMes.set(mes, fila);
  }
  const meses = mesesContiguos([...porMes.keys()]);
  const estados = Object.keys(ETIQUETA_ESTADO_OPERACION) as (keyof typeof ETIQUETA_ESTADO_OPERACION)[];

  const graficos: Grafico[] = [
    {
      tipo: "columnas", id: "por-mes", titulo: "Operaciones por mes de apertura", categorias: meses,
      series: [
        { nombre: "Importaciones", valores: meses.map((m) => porMes.get(m)?.IMPORTACION ?? 0) },
        { nombre: "Exportaciones", valores: meses.map((m) => porMes.get(m)?.EXPORTACION ?? 0) },
      ],
    },
    {
      tipo: "barras", id: "por-estado", titulo: "Operaciones por estado",
      puntos: estados.map((e) => ({ etiqueta: ETIQUETA_ESTADO_OPERACION[e], valor: porTipoEstado.filter((g) => g.estado === e).reduce((s, g) => s + g._count._all, 0) })).filter((p) => p.valor > 0),
    },
    { tipo: "barras", id: "origen", titulo: "Principales países de origen", puntos: origenes.map((g) => ({ etiqueta: g.paisOrigen, valor: g._count._all })) },
    { tipo: "barras", id: "destino", titulo: "Principales países de destino", puntos: destinos.map((g) => ({ etiqueta: g.paisDestino, valor: g._count._all })) },
  ];

  const aFilas = (lista: typeof retrasadas): Fila[] =>
    lista.map((e) => ({
      href: `/operaciones/${e.operacion.id}`,
      celdas: {
        numero: e.operacion.numero, tercero: e.operacion.tercero.razonSocial, llegada: iso(e.fechaEstimadaLlegada), estadoEnvio: e.estadoEnvio,
        dias: e.fechaEstimadaLlegada ? diasEntre(e.fechaEstimadaLlegada, hoy) : null,
      },
    }));
  const columnasEnvio = (diasEtiqueta: string) => [
    { clave: "numero", etiqueta: "Operación", tipo: "texto" as const },
    { clave: "tercero", etiqueta: "Tercero", tipo: "texto" as const },
    { clave: "llegada", etiqueta: "Llegada estimada", tipo: "fecha" as const },
    { clave: "estadoEnvio", etiqueta: "Estado del envío", tipo: "texto" as const },
    { clave: "dias", etiqueta: diasEtiqueta, tipo: "entero" as const },
  ];

  const matriz = estados.map((e) => ({
    celdas: {
      estado: ETIQUETA_ESTADO_OPERACION[e],
      importaciones: porTipoEstado.find((g) => g.tipo === "IMPORTACION" && g.estado === e)?._count._all ?? 0,
      exportaciones: porTipoEstado.find((g) => g.tipo === "EXPORTACION" && g.estado === e)?._count._all ?? 0,
    },
  }));

  return {
    id: "resumen",
    titulo: "Resumen ejecutivo",
    descripcion: "Indicadores generales de operaciones, llegadas, documentos e incidencias de la empresa.",
    campoPeriodo: "Fecha de apertura de la operación (las llegadas y alertas se evalúan a la fecha de hoy)",
    avisos: [],
    kpis,
    graficos,
    tablas: [
      {
        id: "estados", titulo: "Operaciones por tipo y estado", total: matriz.length,
        columnas: [
          { clave: "estado", etiqueta: "Estado", tipo: "texto" }, { clave: "importaciones", etiqueta: ETIQUETA_TIPO_OPERACION.IMPORTACION + "es", tipo: "entero" },
          { clave: "exportaciones", etiqueta: ETIQUETA_TIPO_OPERACION.EXPORTACION + "es", tipo: "entero" },
        ],
        filas: matriz,
      },
      {
        id: "retrasadas", titulo: "Operaciones retrasadas", total: totalRetrasadas, columnas: columnasEnvio("Días de retraso"), filas: aFilas(retrasadas),
        nota: totalRetrasadas > LIMITE_LISTA ? `Se muestran las ${LIMITE_LISTA} más antiguas de ${totalRetrasadas}.` : undefined,
      },
      {
        id: "proximas", titulo: `Próximas a llegar (${VENTANA_PROXIMAS_DIAS} días)`, total: totalProximas,
        columnas: columnasEnvio("Días (negativo = faltan)"), filas: aFilas(proximas),
        nota: totalProximas > LIMITE_LISTA ? `Se muestran las ${LIMITE_LISTA} más cercanas de ${totalProximas}.` : undefined,
      },
    ],
  };
}
