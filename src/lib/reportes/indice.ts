import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { reporteCostos } from "./costos";
import { reporteDocumentos } from "./documentos";
import { describirFiltros, describirPeriodo, type FiltrosReporte } from "./filtros";
import { reporteInventarios } from "./inventarios";
import { reporteLogistica } from "./logistica";
import { reporteOperaciones } from "./operaciones";
import { reporteResumen } from "./resumen";
import { reporteTerceros } from "./terceros";
import type { IdReporte, ReporteDatos } from "./tipos";
import { modoExportacion, paginaPantalla, type Modo } from "./util";

/** Permiso del módulo de origen que exige cada reporte, además de `reportes:consultar`. */
export const PERMISO_REPORTE: Record<IdReporte, string> = {
  resumen: "operaciones:consultar",
  operaciones: "operaciones:consultar",
  logistica: "logistica:consultar",
  costos: "costos:consultar",
  inventarios: "inventarios:consultar",
  documentos: "documentos:consultar",
  terceros: "terceros:consultar",
};

export const REPORTES: { id: IdReporte; nombre: string }[] = [
  { id: "resumen", nombre: "Resumen ejecutivo" },
  { id: "operaciones", nombre: "Operaciones" },
  { id: "logistica", nombre: "Logística" },
  { id: "costos", nombre: "Costos" },
  { id: "inventarios", nombre: "Inventarios" },
  { id: "documentos", nombre: "Documentos" },
  { id: "terceros", nombre: "Terceros" },
];

export const esIdReporte = (v: string): v is IdReporte => REPORTES.some((r) => r.id === v);

export const reportesDisponibles = (ctx: ContextoAcceso) =>
  ctx.permisos.has("reportes:consultar") ? REPORTES.filter((r) => ctx.permisos.has(PERMISO_REPORTE[r.id])) : [];

/** Genera un reporte para la empresa del contexto; valida permisos de reportes y del módulo de origen. */
export function generarReporte(ctx: ContextoAcceso, id: IdReporte, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  if (!ctx.permisos.has("reportes:consultar") || !ctx.permisos.has(PERMISO_REPORTE[id])) {
    throw new ErrorValidacion("No tiene permiso para este reporte.");
  }
  switch (id) {
    case "resumen": return reporteResumen(ctx, f);
    case "operaciones": return reporteOperaciones(ctx, f, modo);
    case "logistica": return reporteLogistica(ctx, f, modo);
    case "costos": return reporteCostos(ctx, f, modo);
    case "inventarios": return reporteInventarios(ctx, f, modo);
    case "documentos": return reporteDocumentos(ctx, f, modo);
    case "terceros": return reporteTerceros(ctx, f, modo);
  }
}

export const generarParaPantalla = (ctx: ContextoAcceso, id: IdReporte, f: FiltrosReporte) => generarReporte(ctx, id, f, paginaPantalla(f.pagina));
export const generarParaExportar = (ctx: ContextoAcceso, id: IdReporte, f: FiltrosReporte) => generarReporte(ctx, id, f, modoExportacion);

/** Metadatos de identificación que acompañan a toda exportación. */
export type Encabezado = { empresa: string; identificacionFiscal: string; reporte: string; periodo: string; campoPeriodo: string; filtros: string[]; generadoEn: string; generadoPor: string };

/** Nombres legibles de los filtros por id (solo de la empresa autorizada) para describirlos en las exportaciones. */
export async function nombresFiltros(ctx: ContextoAcceso, f: FiltrosReporte) {
  const [t, o, r, b, p] = await Promise.all([
    f.terceroId ? db.tercero.findFirst({ where: { id: f.terceroId, empresaId: ctx.empresaId }, select: { razonSocial: true } }) : null,
    f.operacionId ? db.operacion.findFirst({ where: { id: f.operacionId, empresaId: ctx.empresaId }, select: { numero: true } }) : null,
    f.responsableId ? db.empresaUsuario.findFirst({ where: { usuarioId: f.responsableId, empresaId: ctx.empresaId }, select: { usuario: { select: { nombre: true } } } }) : null,
    f.bodegaId ? db.bodega.findFirst({ where: { id: f.bodegaId, empresaId: ctx.empresaId }, select: { nombre: true } }) : null,
    f.productoId ? db.producto.findFirst({ where: { id: f.productoId, empresaId: ctx.empresaId }, select: { sku: true } }) : null,
  ]);
  return { tercero: t?.razonSocial, operacion: o?.numero, responsable: r?.usuario.nombre, bodega: b?.nombre, producto: p?.sku };
}

export async function construirEncabezado(ctx: ContextoAcceso, datos: ReporteDatos, f: FiltrosReporte, generadoEn: string): Promise<Encabezado> {
  const [empresa, usuario, nombres] = await Promise.all([
    db.empresa.findUniqueOrThrow({ where: { id: ctx.empresaId }, select: { razonSocial: true, identificacionFiscal: true } }),
    db.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { nombre: true } }),
    nombresFiltros(ctx, f),
  ]);
  return {
    empresa: empresa.razonSocial, identificacionFiscal: empresa.identificacionFiscal, reporte: datos.titulo, periodo: describirPeriodo(f),
    campoPeriodo: datos.campoPeriodo, filtros: describirFiltros(f, nombres), generadoEn, generadoPor: usuario?.nombre ?? "—",
  };
}
