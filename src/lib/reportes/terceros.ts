import { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ETIQUETA_AMBITO, ETIQUETA_ROL_TERCERO } from "@/lib/etiquetas";
import { donde, type FiltrosReporte } from "./filtros";
import { TAMANO_PAGINA_REPORTE, type ReporteDatos } from "./tipos";
import { CERO, entero, iso, textoMonedas, trozo, type Modo } from "./util";

export async function reporteTerceros(ctx: ContextoAcceso, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  // El filtro de país de este reporte aplica al país del tercero; el resto de filtros, a sus operaciones.
  const terceroWhere: Prisma.TerceroWhereInput = {
    empresaId: ctx.empresaId,
    ...(f.terceroId ? { id: f.terceroId } : {}),
    ...(f.rol ? { roles: { has: f.rol } } : {}),
    ...(f.pais ? { pais: { equals: f.pais, mode: "insensitive" } } : {}),
  };
  const opWhere: Prisma.OperacionWhereInput = { AND: [donde(ctx, { ...f, pais: undefined, terceroId: undefined }), { tercero: terceroWhere }] };

  const [porTercero, porTipoMoneda, universo, porPais, porRol] = await Promise.all([
    db.operacion.groupBy({ by: ["terceroId"], where: opWhere, _count: { _all: true }, _max: { fechaApertura: true } }),
    db.operacion.groupBy({ by: ["terceroId", "tipo", "moneda"], where: opWhere, _count: { _all: true }, _sum: { valorEstimado: true } }),
    db.tercero.count({ where: { ...terceroWhere, activo: true } }),
    db.tercero.groupBy({ by: ["pais"], where: { ...terceroWhere, activo: true }, _count: { _all: true }, orderBy: { _count: { pais: "desc" } }, take: 8 }),
    db.tercero.findMany({ where: { ...terceroWhere, activo: true }, select: { roles: true } }),
  ]);

  const ordenados = [...porTercero].sort((a, b) => b._count._all - a._count._all || (b._max.fechaApertura?.getTime() ?? 0) - (a._max.fechaApertura?.getTime() ?? 0));
  const pagina = trozo(ordenados, modo);
  const detalle = pagina.length
    ? await db.tercero.findMany({ where: { empresaId: ctx.empresaId, id: { in: pagina.map((p) => p.terceroId) } }, select: { id: true, razonSocial: true, identificacionFiscal: true, ambito: true, roles: true, pais: true, activo: true } })
    : [];
  const nombrePorId = new Map(detalle.map((t) => [t.id, t]));
  const topIds = ordenados.slice(0, 8).map((p) => p.terceroId);
  const topNombres = topIds.length ? await db.tercero.findMany({ where: { empresaId: ctx.empresaId, id: { in: topIds } }, select: { id: true, razonSocial: true } }) : [];

  const operaciones = porTercero.reduce((s, g) => s + g._count._all, 0);
  const conteoRol = new Map<string, number>();
  for (const t of porRol) for (const r of t.roles) conteoRol.set(r, (conteoRol.get(r) ?? 0) + 1);

  return {
    id: "terceros",
    titulo: "Reporte de terceros",
    descripcion: "Proveedores, clientes y demás intervinientes con su actividad comercial y las operaciones relacionadas.",
    campoPeriodo: "Fecha de apertura de las operaciones del tercero (el país filtra el país del tercero)",
    avisos: ["Los valores estimados se presentan por moneda; no se convierten ni se consolidan.", "Solo se listan terceros con operaciones que cumplan los filtros."],
    kpis: [
      { etiqueta: "Terceros activos", valor: entero(universo) },
      { etiqueta: "Con actividad", valor: entero(porTercero.length), tono: "success" },
      { etiqueta: "Sin actividad", valor: entero(Math.max(0, universo - porTercero.length)), detalle: "Activos sin operaciones en el período", tono: "neutral" },
      { etiqueta: "Operaciones relacionadas", valor: entero(operaciones) },
      { etiqueta: "Proveedores", valor: entero(conteoRol.get("PROVEEDOR") ?? 0) },
      { etiqueta: "Clientes", valor: entero(conteoRol.get("CLIENTE") ?? 0) },
    ],
    graficos: [
      { tipo: "barras", id: "top", titulo: "Terceros con más operaciones", puntos: topIds.map((id) => ({ etiqueta: topNombres.find((t) => t.id === id)?.razonSocial ?? id, valor: porTercero.find((p) => p.terceroId === id)!._count._all })) },
      { tipo: "barras", id: "pais", titulo: "Terceros activos por país", puntos: porPais.map((g) => ({ etiqueta: g.pais, valor: g._count._all })) },
      { tipo: "barras", id: "rol", titulo: "Terceros activos por rol", puntos: [...conteoRol.entries()].map(([r, n]) => ({ etiqueta: ETIQUETA_ROL_TERCERO[r as keyof typeof ETIQUETA_ROL_TERCERO], valor: n })).sort((a, b) => b.valor - a.valor) },
    ],
    tablas: [
      {
        id: "actividad", titulo: "Actividad comercial por tercero", total: ordenados.length, pagina: modo.pagina, tamanoPagina: modo.todo ? undefined : TAMANO_PAGINA_REPORTE,
        columnas: [
          { clave: "tercero", etiqueta: "Tercero", tipo: "texto" }, { clave: "identificacion", etiqueta: "Identificación", tipo: "texto" }, { clave: "roles", etiqueta: "Roles", tipo: "texto" },
          { clave: "ambito", etiqueta: "Ámbito", tipo: "texto" }, { clave: "pais", etiqueta: "País", tipo: "texto" }, { clave: "operaciones", etiqueta: "Operaciones", tipo: "entero" },
          { clave: "importaciones", etiqueta: "Importaciones", tipo: "entero" }, { clave: "exportaciones", etiqueta: "Exportaciones", tipo: "entero" },
          { clave: "ultima", etiqueta: "Última operación", tipo: "fecha" }, { clave: "valores", etiqueta: "Valor estimado por moneda", tipo: "texto" },
        ],
        filas: pagina.map((p) => {
          const t = nombrePorId.get(p.terceroId);
          const grupos = porTipoMoneda.filter((g) => g.terceroId === p.terceroId);
          const valores = new Map<string, Prisma.Decimal>();
          for (const g of grupos) valores.set(g.moneda, (valores.get(g.moneda) ?? CERO).plus(g._sum.valorEstimado ?? CERO));
          const de = (tipo: string) => grupos.filter((g) => g.tipo === tipo).reduce((s, g) => s + g._count._all, 0);
          return {
            href: `/terceros/${p.terceroId}`,
            celdas: {
              tercero: t?.razonSocial ?? "—", identificacion: t?.identificacionFiscal ?? null, roles: t?.roles.map((r) => ETIQUETA_ROL_TERCERO[r]).join(", ") ?? null,
              ambito: t ? ETIQUETA_AMBITO[t.ambito] : null, pais: t?.pais ?? null, operaciones: p._count._all, importaciones: de("IMPORTACION"), exportaciones: de("EXPORTACION"),
              ultima: iso(p._max.fechaApertura), valores: textoMonedas(valores),
            },
          };
        }),
      },
    ],
  };
}
