import { Prisma } from "@/generated/prisma/client";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { formatearCantidad, UNIDADES } from "@/lib/inventarios/cantidades";
import { listarExistencias } from "@/lib/inventarios/consultas";
import { ETIQUETA_ESTADO_STOCK, ETIQUETA_SENTIDO, ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/inventarios/etiquetas";
import { donde, rangoFecha, rangoMarca, type FiltrosReporte } from "./filtros";
import { TAMANO_PAGINA_REPORTE, type ReporteDatos } from "./tipos";
import { entero, iso, trozo, validarTope, type Modo } from "./util";

const LIMITE_MOVIMIENTOS_PANTALLA = 50;

export async function reporteInventarios(ctx: ContextoAcceso, f: FiltrosReporte, modo: Modo): Promise<ReporteDatos> {
  const marca = rangoMarca(f);
  const fecha = rangoFecha(f);
  const filtroOp = f.terceroId || f.operacionId || f.pais || f.tipo || f.estado || f.modalidad || f.responsableId;
  const movWhere: Prisma.MovimientoInventarioWhereInput = {
    empresaId: ctx.empresaId,
    ...(marca ? { creadoEn: marca } : {}),
    ...(f.productoId ? { productoId: f.productoId } : {}),
    ...(f.bodegaId ? { bodegaId: f.bodegaId } : {}),
    ...(filtroOp ? { operacion: donde(ctx, f, false) } : {}),
  };
  const recWhere: Prisma.RecepcionWhereInput = {
    empresaId: ctx.empresaId,
    ...(fecha ? { fechaRecepcion: fecha } : {}),
    ...(f.bodegaId ? { bodegaId: f.bodegaId } : {}),
    ...(f.productoId ? { lineas: { some: { productoId: f.productoId } } } : {}),
    operacion: donde(ctx, f, false),
  };

  const [todas, bodegas, porTipo, totalRecepciones, recepciones, movimientos, totalMovimientos, discrepancias] = await Promise.all([
    listarExistencias(ctx, { bodegaId: f.bodegaId, estado: f.estadoStock }),
    db.bodega.findMany({ where: { empresaId: ctx.empresaId, activo: true }, select: { id: true } }),
    db.movimientoInventario.groupBy({ by: ["tipo", "sentido"], where: movWhere, _count: { _all: true } }),
    db.recepcion.count({ where: recWhere }),
    db.recepcion.findMany({
      where: recWhere, orderBy: { creadoEn: "desc" }, take: modo.todo ? 5_001 : 15,
      select: { id: true, numero: true, fechaRecepcion: true, bodega: { select: { nombre: true } }, operacion: { select: { numero: true } }, _count: { select: { lineas: true } }, registradoPor: { select: { nombre: true } } },
    }),
    db.movimientoInventario.findMany({
      where: movWhere, orderBy: { creadoEn: "desc" }, take: modo.todo ? 20_001 : LIMITE_MOVIMIENTOS_PANTALLA,
      select: {
        id: true, creadoEn: true, tipo: true, sentido: true, cantidad: true, saldoPosterior: true, motivo: true, referencia: true,
        producto: { select: { sku: true, nombre: true, unidad: true } }, bodega: { select: { nombre: true } }, usuario: { select: { nombre: true } },
      },
    }),
    db.movimientoInventario.count({ where: movWhere }),
    // Conciliación: el saldo de cada producto/bodega debe ser igual a entradas − salidas del historial.
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM existencias e
      LEFT JOIN (
        SELECT producto_id, bodega_id, sum(CASE WHEN sentido = 'ENTRADA' THEN cantidad ELSE -cantidad END) AS saldo
        FROM movimientos_inventario WHERE empresa_id = ${ctx.empresaId}::uuid GROUP BY producto_id, bodega_id
      ) m ON m.producto_id = e.producto_id AND m.bodega_id = e.bodega_id
      WHERE e.empresa_id = ${ctx.empresaId}::uuid AND e.cantidad <> COALESCE(m.saldo, 0)`,
  ]);
  validarTope(recepciones.length);
  validarTope(movimientos.length);

  const filasProductos = f.productoId ? todas.filter((p) => p.productoId === f.productoId) : todas;
  const sinStock = filasProductos.filter((p) => p.estado === "SIN_STOCK").length;
  const bajo = filasProductos.filter((p) => p.estado === "BAJO_MINIMO").length;
  const descuadres = Number(discrepancias[0]?.n ?? 0);
  const contar = (p: (g: (typeof porTipo)[number]) => boolean) => porTipo.filter(p).reduce((s, g) => s + g._count._all, 0);

  const principal = trozo(filasProductos, modo);
  const visiblesMov = movimientos.slice(0, modo.todo ? movimientos.length : LIMITE_MOVIMIENTOS_PANTALLA);
  const visiblesRec = recepciones.slice(0, modo.todo ? recepciones.length : 15);

  return {
    id: "inventarios",
    titulo: "Reporte de inventarios",
    descripcion: "Productos, bodegas, existencias, stock mínimo, recepciones y movimientos, conciliados con el motor de inventarios.",
    campoPeriodo: "Fecha del movimiento y de la recepción (las existencias son el saldo actual)",
    avisos: ["Las cantidades se expresan en la unidad de cada producto y no se suman entre unidades distintas.", "Sin valoración contable: este reporte no calcula costos de inventario."],
    kpis: [
      { etiqueta: "Productos activos", valor: entero(filasProductos.length) },
      { etiqueta: "Bodegas activas", valor: entero(bodegas.length) },
      { etiqueta: "Sin existencias", valor: entero(sinStock), tono: sinStock > 0 ? "warning" : "neutral" },
      { etiqueta: "Bajo el mínimo", valor: entero(bajo), tono: bajo > 0 ? "danger" : "neutral" },
      { etiqueta: "Recepciones del período", valor: entero(totalRecepciones) },
      { etiqueta: "Movimientos del período", valor: entero(totalMovimientos), detalle: `${entero(contar((g) => g.sentido === "ENTRADA"))} entradas · ${entero(contar((g) => g.sentido === "SALIDA"))} salidas` },
      { etiqueta: "Conciliación saldo vs historial", valor: descuadres === 0 ? "Conciliado" : `${descuadres} diferencia(s)`, detalle: "Entradas − salidas del historial frente al saldo", tono: descuadres === 0 ? "success" : "danger" },
    ],
    graficos: [
      {
        tipo: "barras", id: "movimientos-tipo", titulo: "Movimientos por tipo",
        puntos: porTipo.map((g) => ({ etiqueta: `${ETIQUETA_TIPO_MOVIMIENTO[g.tipo]} (${ETIQUETA_SENTIDO[g.sentido].toLowerCase()})`, valor: g._count._all })).sort((a, b) => b.valor - a.valor),
      },
      {
        tipo: "barras", id: "estado-stock", titulo: "Productos por estado de stock",
        puntos: (["OK", "BAJO_MINIMO", "SIN_STOCK"] as const).map((e) => ({ etiqueta: ETIQUETA_ESTADO_STOCK[e], valor: filasProductos.filter((p) => p.estado === e).length })).filter((p) => p.valor > 0),
      },
    ],
    tablas: [
      {
        id: "existencias", titulo: "Existencias por producto", total: filasProductos.length, pagina: modo.pagina, tamanoPagina: modo.todo ? undefined : TAMANO_PAGINA_REPORTE,
        columnas: [
          { clave: "sku", etiqueta: "SKU", tipo: "texto" }, { clave: "producto", etiqueta: "Producto", tipo: "texto" }, { clave: "categoria", etiqueta: "Categoría", tipo: "texto" },
          { clave: "unidad", etiqueta: "Unidad", tipo: "texto" }, { clave: "total", etiqueta: "Existencias", tipo: "decimal", decimales: 4 }, { clave: "minimo", etiqueta: "Stock mínimo", tipo: "decimal", decimales: 4 },
          { clave: "estado", etiqueta: "Estado", tipo: "texto" }, { clave: "bodegas", etiqueta: "Por bodega", tipo: "texto" },
        ],
        filas: principal.map((p) => ({
          href: `/inventarios/productos/${p.productoId}`,
          celdas: {
            sku: p.sku, producto: p.nombre, categoria: p.categoria, unidad: UNIDADES[p.unidad].simbolo, total: p.total.toFixed(4), minimo: p.stockMinimo.toFixed(4),
            estado: ETIQUETA_ESTADO_STOCK[p.estado], bodegas: p.bodegas.map((b) => `${b.nombre}: ${formatearCantidad(b.cantidad, p.unidad)}`).join(" · ") || null,
          },
        })),
      },
      {
        id: "recepciones", titulo: "Recepciones del período", total: totalRecepciones, nota: !modo.todo && totalRecepciones > 15 ? `Se muestran las 15 más recientes de ${totalRecepciones}.` : undefined,
        columnas: [
          { clave: "numero", etiqueta: "Recepción", tipo: "texto" }, { clave: "operacion", etiqueta: "Importación", tipo: "texto" }, { clave: "bodega", etiqueta: "Bodega", tipo: "texto" },
          { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" }, { clave: "lineas", etiqueta: "Líneas", tipo: "entero" }, { clave: "usuario", etiqueta: "Registrada por", tipo: "texto" },
        ],
        filas: visiblesRec.map((r) => ({ href: `/inventarios/recepciones/${r.id}`, celdas: { numero: r.numero, operacion: r.operacion.numero, bodega: r.bodega.nombre, fecha: iso(r.fechaRecepcion), lineas: r._count.lineas, usuario: r.registradoPor.nombre } })),
      },
      {
        id: "movimientos", titulo: "Movimientos del período", total: totalMovimientos, nota: !modo.todo && totalMovimientos > LIMITE_MOVIMIENTOS_PANTALLA ? `Se muestran los ${LIMITE_MOVIMIENTOS_PANTALLA} más recientes de ${totalMovimientos}; la exportación incluye todos.` : undefined,
        columnas: [
          { clave: "fecha", etiqueta: "Fecha", tipo: "texto" }, { clave: "tipo", etiqueta: "Tipo", tipo: "texto" }, { clave: "sentido", etiqueta: "Sentido", tipo: "texto" },
          { clave: "sku", etiqueta: "SKU", tipo: "texto" }, { clave: "producto", etiqueta: "Producto", tipo: "texto" }, { clave: "bodega", etiqueta: "Bodega", tipo: "texto" },
          { clave: "unidad", etiqueta: "Unidad", tipo: "texto" }, { clave: "cantidad", etiqueta: "Cantidad", tipo: "decimal", decimales: 4 }, { clave: "saldo", etiqueta: "Saldo posterior", tipo: "decimal", decimales: 4 },
          { clave: "motivo", etiqueta: "Motivo", tipo: "texto" }, { clave: "referencia", etiqueta: "Referencia", tipo: "texto" }, { clave: "usuario", etiqueta: "Usuario", tipo: "texto" },
        ],
        filas: visiblesMov.map((m) => ({
          celdas: {
            fecha: m.creadoEn.toISOString().slice(0, 16).replace("T", " ") + " UTC", tipo: ETIQUETA_TIPO_MOVIMIENTO[m.tipo], sentido: ETIQUETA_SENTIDO[m.sentido], sku: m.producto.sku, producto: m.producto.nombre,
            bodega: m.bodega.nombre, unidad: UNIDADES[m.producto.unidad].simbolo, cantidad: m.cantidad.toFixed(4), saldo: m.saldoPosterior.toFixed(4), motivo: m.motivo, referencia: m.referencia, usuario: m.usuario.nombre,
          },
        })),
      },
    ],
  };
}
