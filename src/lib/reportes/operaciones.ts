import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ETIQUETA_ESTADO_OPERACION, ETIQUETA_MODALIDAD, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas";
import { ESTADOS_ACTIVOS } from "@/lib/operaciones/servicio";
import { donde, type FiltrosReporte } from "./filtros";
import { TAMANO_PAGINA_REPORTE, type Columna, type ReporteDatos } from "./tipos";
import { CERO, entero, iso, limites, validarTope, type Modo } from "./util";

const COLUMNAS: Columna[] = [
  { clave: "numero", etiqueta: "Operación", tipo: "texto" },
  { clave: "tipo", etiqueta: "Tipo", tipo: "texto" },
  { clave: "estado", etiqueta: "Estado", tipo: "texto" },
  { clave: "fechaApertura", etiqueta: "Apertura", tipo: "fecha" },
  { clave: "tercero", etiqueta: "Tercero", tipo: "texto" },
  { clave: "paisOrigen", etiqueta: "País de origen", tipo: "texto" },
  { clave: "paisDestino", etiqueta: "País de destino", tipo: "texto" },
  { clave: "modalidad", etiqueta: "Modalidad", tipo: "texto" },
  { clave: "responsable", etiqueta: "Responsable", tipo: "texto" },
  { clave: "llegada", etiqueta: "Llegada estimada", tipo: "fecha" },
  { clave: "moneda", etiqueta: "Moneda", tipo: "texto" },
  { clave: "valorEstimado", etiqueta: "Valor estimado", tipo: "decimal" },
];

export async function reporteOperaciones(ctx: ContextoAcceso, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  const where = donde(ctx, f);
  const [total, porEstado, porMoneda, filas] = await Promise.all([
    db.operacion.count({ where }),
    db.operacion.groupBy({ by: ["estado"], where, _count: { _all: true } }),
    db.operacion.groupBy({ by: ["moneda"], where, _sum: { valorEstimado: true }, _count: { _all: true }, orderBy: { moneda: "asc" } }),
    db.operacion.findMany({
      where,
      orderBy: { consecutivo: "desc" },
      ...limites(modo),
      select: {
        id: true, numero: true, tipo: true, estado: true, fechaApertura: true, paisOrigen: true, paisDestino: true, modalidad: true,
        moneda: true, valorEstimado: true,
        tercero: { select: { razonSocial: true } },
        responsable: { select: { usuario: { select: { nombre: true } } } },
        envio: { select: { fechaEstimadaLlegada: true } },
      },
    }),
  ]);
  validarTope(filas.length);
  const cuenta = (estados: readonly string[]) => porEstado.filter((g) => estados.includes(g.estado)).reduce((s, g) => s + g._count._all, 0);

  return {
    id: "operaciones",
    titulo: "Reporte de operaciones",
    descripcion: "Listado de operaciones de importación y exportación con filtros combinables y acceso directo al expediente.",
    campoPeriodo: "Fecha de apertura de la operación",
    avisos: porMoneda.length > 1 ? ["El valor estimado se presenta por moneda; no se convierte ni se consolida entre monedas."] : [],
    kpis: [
      { etiqueta: "Operaciones", valor: entero(total) },
      { etiqueta: "Activas", valor: entero(cuenta(ESTADOS_ACTIVOS)), tono: "primary" },
      { etiqueta: "Finalizadas", valor: entero(cuenta(["FINALIZADA"])), tono: "success" },
      { etiqueta: "Canceladas", valor: entero(cuenta(["CANCELADA"])), tono: "neutral" },
      ...porMoneda.map((g) => ({ etiqueta: `Valor estimado ${g.moneda}`, valor: (g._sum.valorEstimado ?? CERO).toFixed(2), detalle: `${g._count._all} operación(es)` })),
    ],
    graficos: [
      {
        tipo: "barras", id: "por-estado", titulo: "Operaciones por estado",
        puntos: porEstado.map((g) => ({ etiqueta: ETIQUETA_ESTADO_OPERACION[g.estado], valor: g._count._all })).sort((a, b) => b.valor - a.valor),
      },
    ],
    tablas: [
      {
        id: "operaciones", titulo: "Operaciones", columnas: COLUMNAS, total, pagina: modo.pagina, tamanoPagina: modo.todo ? undefined : TAMANO_PAGINA_REPORTE,
        filas: filas.slice(0, modo.todo ? filas.length : TAMANO_PAGINA_REPORTE).map((o) => ({
          href: `/operaciones/${o.id}`,
          celdas: {
            numero: o.numero, tipo: ETIQUETA_TIPO_OPERACION[o.tipo], estado: ETIQUETA_ESTADO_OPERACION[o.estado], fechaApertura: iso(o.fechaApertura),
            tercero: o.tercero.razonSocial, paisOrigen: o.paisOrigen, paisDestino: o.paisDestino, modalidad: ETIQUETA_MODALIDAD[o.modalidad],
            responsable: o.responsable.usuario.nombre, llegada: iso(o.envio?.fechaEstimadaLlegada), moneda: o.moneda, valorEstimado: o.valorEstimado.toFixed(2),
          },
        })),
      },
    ],
  };
}
