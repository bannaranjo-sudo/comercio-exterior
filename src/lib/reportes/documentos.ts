import type { Prisma } from "@/generated/prisma/client";
import type { EstadoDocumento, TipoDocumento, TipoOperacion } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { requisitosDocumentales } from "@/lib/documentos/servicio";
import { ETIQUETA_ESTADO_DOCUMENTO, ETIQUETA_ESTADO_OPERACION, ETIQUETA_TIPO_DOCUMENTO, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas";
import { donde, type FiltrosReporte } from "./filtros";
import { MAX_FILAS_EXPORTACION, TAMANO_PAGINA_REPORTE, type ReporteDatos } from "./tipos";
import { entero, iso, porcentaje, trozo, validarTope, type Modo } from "./util";

const ORDEN: EstadoDocumento[] = ["APROBADO", "RECIBIDO", "OBSERVADO", "PENDIENTE"];

/**
 * Cumplimiento del checklist: un requisito se cumple solo con un documento APROBADO. El requisito sin ningún
 * documento cuenta como faltante; con documento en otro estado se cuenta en ese estado (el mejor disponible).
 */
export async function reporteDocumentos(ctx: ContextoAcceso, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  const base = donde(ctx, f);
  const where: Prisma.OperacionWhereInput = {
    AND: [base, f.estado ? {} : { estado: { not: "CANCELADA" } }, f.estadoDocumento ? { documentos: { some: { estado: f.estadoDocumento } } } : {}],
  };

  const [ops, requisitos, grupos, abiertos] = await Promise.all([
    db.operacion.findMany({
      where, orderBy: { consecutivo: "desc" }, take: MAX_FILAS_EXPORTACION + 1,
      select: { id: true, numero: true, tipo: true, estado: true, fechaApertura: true, tercero: { select: { razonSocial: true } } },
    }),
    Promise.all((["IMPORTACION", "EXPORTACION"] as const).map(async (t) => [t, await requisitosDocumentales(ctx, t)] as const)),
    db.documento.groupBy({ by: ["operacionId", "tipo", "estado"], where: { empresaId: ctx.empresaId, operacion: where }, _count: { _all: true } }),
    db.documento.findMany({
      where: { empresaId: ctx.empresaId, estado: { in: ["OBSERVADO", "PENDIENTE"] }, operacion: where },
      orderBy: { creadoEn: "desc" }, take: modo.todo ? MAX_FILAS_EXPORTACION + 1 : 15,
      select: { nombreOriginal: true, tipo: true, estado: true, observaciones: true, creadoEn: true, operacion: { select: { id: true, numero: true } } },
    }),
  ]);
  validarTope(ops.length);
  validarTope(abiertos.length);
  const requeridosPor = new Map<TipoOperacion, TipoDocumento[]>(requisitos);

  const evaluadas = ops.map((o) => {
    const requeridos = requeridosPor.get(o.tipo) ?? [];
    const propios = grupos.filter((g) => g.operacionId === o.id);
    const c = { aprobados: 0, recibidos: 0, observados: 0, pendientes: 0, faltantes: [] as TipoDocumento[] };
    for (const tipo of requeridos) {
      const estados = propios.filter((g) => g.tipo === tipo).map((g) => g.estado);
      const mejor = ORDEN.find((e) => estados.includes(e));
      if (!mejor) c.faltantes.push(tipo);
      else if (mejor === "APROBADO") c.aprobados += 1;
      else if (mejor === "RECIBIDO") c.recibidos += 1;
      else if (mejor === "OBSERVADO") c.observados += 1;
      else c.pendientes += 1;
    }
    return { o, requeridos: requeridos.length, ...c, completo: c.aprobados === requeridos.length };
  });

  const incompletas = evaluadas.filter((e) => !e.completo);
  const lista = f.incompletos ? incompletas : evaluadas;
  const totalReq = evaluadas.reduce((s, e) => s + e.requeridos, 0);
  const totalApr = evaluadas.reduce((s, e) => s + e.aprobados, 0);
  const porEstado = (e: EstadoDocumento) => grupos.filter((g) => g.estado === e).reduce((s, g) => s + g._count._all, 0);
  const faltantesPorTipo = new Map<TipoDocumento, number>();
  for (const e of evaluadas) for (const t of e.faltantes) faltantesPorTipo.set(t, (faltantesPorTipo.get(t) ?? 0) + 1);

  return {
    id: "documentos",
    titulo: "Reporte de documentos",
    descripcion: "Soportes recibidos, pendientes, observados y aprobados, y cumplimiento del checklist documental por expediente.",
    campoPeriodo: "Fecha de apertura de la operación",
    avisos: ["Un documento requerido se considera cumplido solo cuando está APROBADO. Operaciones canceladas excluidas salvo que se filtre por ese estado."],
    kpis: [
      { etiqueta: "Expedientes evaluados", valor: entero(evaluadas.length) },
      { etiqueta: "Expedientes completos", valor: entero(evaluadas.length - incompletas.length), tono: "success" },
      { etiqueta: "Expedientes incompletos", valor: entero(incompletas.length), tono: incompletas.length > 0 ? "warning" : "neutral" },
      { etiqueta: "Cumplimiento del checklist", valor: porcentaje(totalApr, totalReq), detalle: `${entero(totalApr)} de ${entero(totalReq)} requisitos aprobados` },
      { etiqueta: "Documentos aprobados", valor: entero(porEstado("APROBADO")), tono: "success" },
      { etiqueta: "Recibidos", valor: entero(porEstado("RECIBIDO")), tono: "primary" },
      { etiqueta: "Observados", valor: entero(porEstado("OBSERVADO")), tono: porEstado("OBSERVADO") > 0 ? "danger" : "neutral" },
      { etiqueta: "Pendientes", valor: entero(porEstado("PENDIENTE")), tono: "warning" },
    ],
    graficos: [
      { tipo: "barras", id: "estado-doc", titulo: "Documentos por estado", puntos: ORDEN.map((e) => ({ etiqueta: ETIQUETA_ESTADO_DOCUMENTO[e], valor: porEstado(e) })).filter((p) => p.valor > 0) },
      { tipo: "barras", id: "faltantes", titulo: "Documentos requeridos sin cargar", puntos: [...faltantesPorTipo.entries()].map(([t, n]) => ({ etiqueta: ETIQUETA_TIPO_DOCUMENTO[t], valor: n })).sort((a, b) => b.valor - a.valor) },
    ],
    tablas: [
      {
        id: "expedientes", titulo: "Cumplimiento documental por expediente", total: lista.length, pagina: modo.pagina, tamanoPagina: modo.todo ? undefined : TAMANO_PAGINA_REPORTE,
        columnas: [
          { clave: "numero", etiqueta: "Operación", tipo: "texto" }, { clave: "tipo", etiqueta: "Tipo", tipo: "texto" }, { clave: "estado", etiqueta: "Estado", tipo: "texto" },
          { clave: "tercero", etiqueta: "Tercero", tipo: "texto" }, { clave: "requeridos", etiqueta: "Requeridos", tipo: "entero" }, { clave: "aprobados", etiqueta: "Aprobados", tipo: "entero" },
          { clave: "recibidos", etiqueta: "Recibidos", tipo: "entero" }, { clave: "observados", etiqueta: "Observados", tipo: "entero" }, { clave: "pendientes", etiqueta: "Pendientes", tipo: "entero" },
          { clave: "faltantes", etiqueta: "Sin cargar", tipo: "entero" }, { clave: "cumplimiento", etiqueta: "Cumplimiento %", tipo: "decimal", decimales: 1 }, { clave: "detalleFaltantes", etiqueta: "Documentos sin cargar", tipo: "texto" },
        ],
        filas: trozo(lista, modo).map((e) => ({
          href: `/operaciones/${e.o.id}/documentos`,
          celdas: {
            numero: e.o.numero, tipo: ETIQUETA_TIPO_OPERACION[e.o.tipo], estado: ETIQUETA_ESTADO_OPERACION[e.o.estado], tercero: e.o.tercero.razonSocial, requeridos: e.requeridos, aprobados: e.aprobados,
            recibidos: e.recibidos, observados: e.observados, pendientes: e.pendientes, faltantes: e.faltantes.length,
            cumplimiento: e.requeridos === 0 ? "100.0" : ((e.aprobados / e.requeridos) * 100).toFixed(1), detalleFaltantes: e.faltantes.map((t) => ETIQUETA_TIPO_DOCUMENTO[t]).join(", ") || null,
          },
        })),
      },
      {
        id: "observados", titulo: "Documentos observados o pendientes", total: porEstado("OBSERVADO") + porEstado("PENDIENTE"),
        nota: !modo.todo && porEstado("OBSERVADO") + porEstado("PENDIENTE") > 15 ? "Se muestran los 15 más recientes." : undefined,
        columnas: [
          { clave: "operacion", etiqueta: "Operación", tipo: "texto" }, { clave: "documento", etiqueta: "Documento", tipo: "texto" }, { clave: "tipo", etiqueta: "Tipo", tipo: "texto" },
          { clave: "estado", etiqueta: "Estado", tipo: "texto" }, { clave: "fecha", etiqueta: "Cargado", tipo: "fecha" }, { clave: "observaciones", etiqueta: "Observaciones", tipo: "texto" },
        ],
        filas: abiertos.slice(0, modo.todo ? abiertos.length : 15).map((d) => ({
          href: `/operaciones/${d.operacion.id}/documentos`,
          celdas: { operacion: d.operacion.numero, documento: d.nombreOriginal, tipo: ETIQUETA_TIPO_DOCUMENTO[d.tipo], estado: ETIQUETA_ESTADO_DOCUMENTO[d.estado], fecha: iso(d.creadoEn), observaciones: d.observaciones },
        })),
      },
    ],
  };
}
