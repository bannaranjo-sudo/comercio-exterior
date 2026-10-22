import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { opcionesBodegas } from "@/lib/inventarios/bodegas";
import { opcionesProductos } from "@/lib/inventarios/productos";
import { listarResponsables, opcionesOperaciones } from "@/lib/operaciones/servicio";
import { opcionesTerceros } from "@/lib/terceros/servicio";
import type { IdReporte } from "./tipos";

export type Par = readonly [string, string];

export type OpcionesFiltros = {
  terceros: Par[]; operaciones: Par[]; responsables: Par[]; paises: Par[]; monedas: Par[]; bodegas: Par[]; productos: Par[];
};

/** Listas desplegables de los filtros, solo con datos de la empresa autorizada y solo las que el reporte usa. */
export async function opcionesFiltros(ctx: ContextoAcceso, id: IdReporte): Promise<OpcionesFiltros> {
  const usaOperaciones = id !== "terceros";
  const [terceros, operaciones, responsables, origenes, destinos, monedas, bodegas, productos] = await Promise.all([
    opcionesTerceros(ctx),
    usaOperaciones ? opcionesOperaciones(ctx, 200) : [],
    id === "inventarios" || id === "terceros" ? [] : listarResponsables(ctx),
    db.operacion.findMany({ where: { empresaId: ctx.empresaId }, distinct: ["paisOrigen"], select: { paisOrigen: true } }),
    db.operacion.findMany({ where: { empresaId: ctx.empresaId }, distinct: ["paisDestino"], select: { paisDestino: true } }),
    id === "costos" ? db.costo.findMany({ where: { empresaId: ctx.empresaId }, distinct: ["moneda"], select: { moneda: true }, orderBy: { moneda: "asc" } }) : [],
    id === "inventarios" ? opcionesBodegas(ctx, false) : [],
    id === "inventarios" ? opcionesProductos(ctx, false) : [],
  ]);
  const paises = new Set<string>();
  for (const o of origenes) paises.add(o.paisOrigen);
  for (const d of destinos) paises.add(d.paisDestino);
  return {
    terceros: terceros.map((t) => [t.id, `${t.razonSocial} (${t.identificacionFiscal})`] as const),
    operaciones: operaciones.map((o) => [o.id, `${o.numero} · ${o.tercero.razonSocial}`] as const),
    responsables: responsables.map((r) => [r.id, r.nombre] as const),
    paises: [...paises].sort((a, b) => a.localeCompare(b)).map((p) => [p, p] as const),
    monedas: monedas.map((m) => [m.moneda, m.moneda] as const),
    bodegas: bodegas.map((b) => [b.id, `${b.codigo} · ${b.nombre}`] as const),
    productos: productos.map((p) => [p.id, `${p.sku} · ${p.nombre}`] as const),
  };
}
