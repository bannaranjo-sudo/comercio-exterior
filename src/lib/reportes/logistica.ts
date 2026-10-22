import type { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ETIQUETA_ESTADO_ENVIO, ETIQUETA_ESTADO_OPERACION, ETIQUETA_MODALIDAD, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas";
import { ESTADOS_ACTIVOS } from "@/lib/operaciones/servicio";
import { donde, type FiltrosReporte } from "./filtros";
import { TAMANO_PAGINA_REPORTE, type Columna, type ReporteDatos } from "./tipos";
import { diasEntre, entero, hoyUTC, iso, limites, validarTope, type Modo } from "./util";

const ACTIVAS = [...ESTADOS_ACTIVOS];


const COLUMNAS: Columna[] = [
  { clave: "numero", etiqueta: "Operación", tipo: "texto" },
  { clave: "tipo", etiqueta: "Tipo", tipo: "texto" },
  { clave: "estado", etiqueta: "Estado operación", tipo: "texto" },
  { clave: "modalidad", etiqueta: "Modalidad", tipo: "texto" },
  { clave: "guia", etiqueta: "Guía / BL", tipo: "texto" },
  { clave: "transportador", etiqueta: "Transportador", tipo: "texto" },
  { clave: "ruta", etiqueta: "Ruta", tipo: "texto" },
  { clave: "salidaEstimada", etiqueta: "Salida estimada", tipo: "fecha" },
  { clave: "salidaReal", etiqueta: "Salida real", tipo: "fecha" },
  { clave: "llegadaEstimada", etiqueta: "Llegada estimada", tipo: "fecha" },
  { clave: "llegadaReal", etiqueta: "Llegada real", tipo: "fecha" },
  { clave: "estadoEnvio", etiqueta: "Estado del envío", tipo: "texto" },
  { clave: "retraso", etiqueta: "Retraso (días)", tipo: "entero" },
  { clave: "hitos", etiqueta: "Hitos", tipo: "entero" },
  { clave: "incidenciasAbiertas", etiqueta: "Incidencias abiertas", tipo: "entero" },
];

export async function reporteLogistica(ctx: ContextoAcceso, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  const hoy = hoyUTC();
  const retrasoCond: Prisma.EnvioWhereInput = { fechaRealLlegada: null, fechaEstimadaLlegada: { lt: hoy } };
  const envioCond: Prisma.EnvioWhereInput | undefined =
    f.estadoEnvio || f.retrasadas ? { ...(f.estadoEnvio ? { estadoEnvio: f.estadoEnvio } : {}), ...(f.retrasadas ? retrasoCond : {}) } : undefined;
  const base = donde(ctx, f);
  const where: Prisma.OperacionWhereInput = {
    AND: [base, envioCond ? { envio: { is: envioCond }, ...(f.retrasadas ? { estado: { in: ACTIVAS } } : {}) } : {}],
  };
  const eventosWhere: Prisma.EventoLogisticoWhereInput = { empresaId: ctx.empresaId, operacion: where };

  const [total, conEnvio, retrasadas, entregadas, filas, porModalidad, porEstadoEnvio, eventos, incidencias] = await Promise.all([
    db.operacion.count({ where }),
    db.operacion.count({ where: { AND: [where, { envio: { isNot: null } }] } }),
    db.operacion.count({ where: { AND: [where, { estado: { in: ACTIVAS }, envio: { is: retrasoCond } }] } }),
    db.operacion.count({ where: { AND: [where, { envio: { is: { fechaRealLlegada: { not: null } } } }] } }),
    db.operacion.findMany({
      where, orderBy: { consecutivo: "desc" }, ...limites(modo),
      select: {
        id: true, numero: true, tipo: true, estado: true, modalidad: true,
        envio: { select: { medioTransporte: true, numeroGuia: true, puertoOrigen: true, puertoDestino: true, estadoEnvio: true, fechaEstimadaSalida: true, fechaRealSalida: true, fechaEstimadaLlegada: true, fechaRealLlegada: true, transportador: { select: { razonSocial: true } } } },
      },
    }),
    db.operacion.groupBy({ by: ["modalidad"], where, _count: { _all: true } }),
    db.envio.groupBy({ by: ["estadoEnvio"], where: { empresaId: ctx.empresaId, operacion: where }, _count: { _all: true } }),
    db.eventoLogistico.groupBy({ by: ["tipo", "resuelta", "severidad"], where: eventosWhere, _count: { _all: true } }),
    db.eventoLogistico.findMany({
      where: { ...eventosWhere, tipo: "NOVEDAD", resuelta: false }, orderBy: [{ severidad: "desc" }, { fechaEvento: "desc" }], take: 15,
      select: { titulo: true, severidad: true, fechaEvento: true, operacion: { select: { id: true, numero: true } } },
    }),
  ]);
  validarTope(filas.length);
  const visibles = filas.slice(0, modo.todo ? filas.length : TAMANO_PAGINA_REPORTE);

  const ids = visibles.map((o) => o.id);
  const porOperacion = ids.length
    ? await db.eventoLogistico.groupBy({ by: ["operacionId", "tipo", "resuelta"], where: { empresaId: ctx.empresaId, operacionId: { in: ids } }, _count: { _all: true } })
    : [];
  const contar = (id: string, tipo: "HITO" | "NOVEDAD", abierta?: boolean) =>
    porOperacion.filter((g) => g.operacionId === id && g.tipo === tipo && (abierta === undefined || g.resuelta === !abierta)).reduce((s, g) => s + g._count._all, 0);

  const suma = (p: (g: (typeof eventos)[number]) => boolean) => eventos.filter(p).reduce((s, g) => s + g._count._all, 0);
  const abiertas = suma((g) => g.tipo === "NOVEDAD" && !g.resuelta);
  const novedadesAbiertasPorSeveridad = (["ALTA", "MEDIA", "BAJA"] as const).map((s) => ({
    etiqueta: ETIQUETA_SEVERIDAD[s], valor: suma((g) => g.tipo === "NOVEDAD" && !g.resuelta && g.severidad === s),
  }));

  return {
    id: "logistica",
    titulo: "Reporte de logística",
    descripcion: "Seguimiento de envíos, hitos, retrasos e incidencias por operación y modalidad de transporte.",
    campoPeriodo: "Fecha de apertura de la operación (el retraso se evalúa a la fecha de hoy)",
    avisos: ["Retraso: días entre la llegada estimada y la real; si aún no llega, entre la estimada y hoy (solo operaciones activas)."],
    kpis: [
      { etiqueta: "Operaciones", valor: entero(total), detalle: `${entero(conEnvio)} con envío registrado` },
      { etiqueta: "Retrasadas", valor: entero(retrasadas), tono: retrasadas > 0 ? "danger" : "neutral" },
      { etiqueta: "Con llegada real", valor: entero(entregadas), tono: "success" },
      { etiqueta: "Hitos registrados", valor: entero(suma((g) => g.tipo === "HITO")) },
      { etiqueta: "Incidencias abiertas", valor: entero(abiertas), tono: abiertas > 0 ? "warning" : "neutral" },
      { etiqueta: "Incidencias resueltas", valor: entero(suma((g) => g.tipo === "NOVEDAD" && g.resuelta)), tono: "success" },
    ],
    graficos: [
      { tipo: "barras", id: "modalidad", titulo: "Operaciones por modalidad de transporte", puntos: porModalidad.map((g) => ({ etiqueta: ETIQUETA_MODALIDAD[g.modalidad], valor: g._count._all })).sort((a, b) => b.valor - a.valor) },
      { tipo: "barras", id: "estado-envio", titulo: "Envíos por estado", puntos: porEstadoEnvio.map((g) => ({ etiqueta: ETIQUETA_ESTADO_ENVIO[g.estadoEnvio], valor: g._count._all })).sort((a, b) => b.valor - a.valor) },
      { tipo: "barras", id: "severidad", titulo: "Incidencias abiertas por severidad", puntos: novedadesAbiertasPorSeveridad.filter((p) => p.valor > 0) },
    ],
    tablas: [
      {
        id: "seguimiento", titulo: "Seguimiento por operación", columnas: COLUMNAS, total, pagina: modo.pagina, tamanoPagina: modo.todo ? undefined : TAMANO_PAGINA_REPORTE,
        filas: visibles.map((o) => {
          const e = o.envio;
          let retraso: number | null = null;
          if (e?.fechaEstimadaLlegada) {
            if (e.fechaRealLlegada) retraso = Math.max(0, diasEntre(e.fechaEstimadaLlegada, e.fechaRealLlegada));
            else if (ACTIVAS.includes(o.estado)) retraso = Math.max(0, diasEntre(e.fechaEstimadaLlegada, hoy));
          }
          return {
            href: `/operaciones/${o.id}/logistica`,
            celdas: {
              numero: o.numero, tipo: ETIQUETA_TIPO_OPERACION[o.tipo], estado: ETIQUETA_ESTADO_OPERACION[o.estado], modalidad: ETIQUETA_MODALIDAD[e?.medioTransporte ?? o.modalidad],
              guia: e?.numeroGuia ?? null, transportador: e?.transportador?.razonSocial ?? null,
              ruta: e ? [e.puertoOrigen, e.puertoDestino].filter(Boolean).join(" → ") || null : null,
              salidaEstimada: iso(e?.fechaEstimadaSalida), salidaReal: iso(e?.fechaRealSalida), llegadaEstimada: iso(e?.fechaEstimadaLlegada), llegadaReal: iso(e?.fechaRealLlegada),
              estadoEnvio: e ? ETIQUETA_ESTADO_ENVIO[e.estadoEnvio] : "Sin envío registrado", retraso, hitos: contar(o.id, "HITO"), incidenciasAbiertas: contar(o.id, "NOVEDAD", true),
            },
          };
        }),
      },
      {
        id: "incidencias", titulo: "Incidencias abiertas", total: abiertas,
        columnas: [
          { clave: "numero", etiqueta: "Operación", tipo: "texto" }, { clave: "titulo", etiqueta: "Incidencia", tipo: "texto" },
          { clave: "severidad", etiqueta: "Severidad", tipo: "texto" }, { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
        ],
        filas: incidencias.map((i) => ({ href: `/operaciones/${i.operacion.id}/logistica`, celdas: { numero: i.operacion.numero, titulo: i.titulo, severidad: i.severidad ? ETIQUETA_SEVERIDAD[i.severidad] : null, fecha: iso(i.fechaEvento) } })),
        nota: abiertas > 15 ? `Se muestran las 15 más graves/recientes de ${abiertas}.` : undefined,
      },
    ],
  };
}
