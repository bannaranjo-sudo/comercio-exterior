import { AlertTriangle, ArrowDownToLine, Boxes, PackageCheck, PackageX, Warehouse } from "lucide-react"
import Link from "next/link"

import { EnlaceBoton, EstadoVacio, InsigniaEstado, Seccion, TarjetaKpi } from "@/components/comun/comunes"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { formatearCantidad } from "@/lib/inventarios/cantidades"
import { resumenInventario } from "@/lib/inventarios/consultas"
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/inventarios/etiquetas"

export const metadata = { title: "Inventarios · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return null // el layout ya muestra el acceso denegado
  const r = await resumenInventario(ctx)
  const vacio = r.productosActivos === 0 && r.bodegasActivas === 0
  const puedeCrear = ctx.permisos.has("inventarios:crear")

  return (
    <div className="space-y-6">
      {vacio && (
        <EstadoVacio
          icono={Boxes}
          titulo="Comience configurando su inventario"
          descripcion="1) Cree sus productos · 2) cree al menos una bodega · 3) registre la recepción de una importación para generar las primeras existencias."
          accion={
            puedeCrear ? (
              <div className="flex gap-2">
                <EnlaceBoton href="/inventarios/productos/nuevo" variante="outline">Nuevo producto</EnlaceBoton>
                <EnlaceBoton href="/inventarios/bodegas">Crear bodega</EnlaceBoton>
              </div>
            ) : undefined
          }
        />
      )}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKpi titulo="Productos activos" valor={r.productosActivos} icono={Boxes} tono="primary" detalle={`${r.conStock} con existencias`} href="/inventarios/productos" />
        <TarjetaKpi titulo="Bodegas activas" valor={r.bodegasActivas} icono={Warehouse} tono="neutral" href="/inventarios/bodegas" />
        <TarjetaKpi titulo="Sin existencias" valor={r.sinStock.length} icono={PackageX} tono={r.sinStock.length ? "danger" : "success"} href="/inventarios/existencias?estado=sin_stock" />
        <TarjetaKpi titulo="Bajo stock mínimo" valor={r.bajoMinimo.length} icono={AlertTriangle} tono={r.bajoMinimo.length ? "warning" : "success"} href="/inventarios/existencias?estado=bajo_minimo" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Alertas de stock" descripcion="Productos agotados o bajo su mínimo configurado." className="lg:col-span-1">
          {r.sinStock.length + r.bajoMinimo.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <PackageCheck className="size-4 text-success" aria-hidden /> Sin alertas de stock.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...r.bajoMinimo, ...r.sinStock].slice(0, 8).map((f) => (
                <li key={f.productoId} className="flex items-center gap-2">
                  <InsigniaEstado valor={f.estado} etiqueta={f.estado === "SIN_STOCK" ? "Agotado" : "Bajo mínimo"} tono={f.estado === "SIN_STOCK" ? "danger" : "warning"} />
                  <Link href={`/inventarios/productos/${f.productoId}`} className="min-w-0 truncate hover:underline">
                    {f.sku} · {f.nombre}
                  </Link>
                  <span className="ml-auto tabular-nums text-muted-foreground">{formatearCantidad(f.total, f.unidad)}</span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion
          titulo="Movimientos recientes"
          descripcion={`${r.movimientos30} movimiento(s) y ${r.recepciones30} recepción(es) en los últimos 30 días.`}
          className="lg:col-span-2"
          accion={<Link href="/inventarios/movimientos" className="text-sm text-primary hover:underline">Ver todos</Link>}
        >
          {r.recientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay movimientos. Registre una recepción de importación o una entrada manual.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Producto</TableHead><TableHead>Bodega</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {r.recientes.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{formatearFechaHora(m.creadoEn)}</TableCell>
                      <TableCell>{ETIQUETA_TIPO_MOVIMIENTO[m.tipo]}</TableCell>
                      <TableCell>{m.producto.sku}</TableCell>
                      <TableCell>{m.bodega.nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={m.sentido === "ENTRADA" ? "text-success-foreground" : "text-warning-foreground"}>
                          {m.sentido === "ENTRADA" ? "+" : "−"}{formatearCantidad(m.cantidad, m.producto.unidad)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Seccion>
      </div>

      {puedeCrear && (
        <div className="flex flex-wrap gap-2">
          <EnlaceBoton href="/inventarios/recepciones/nueva">
            <ArrowDownToLine className="size-4" aria-hidden /> Registrar recepción de importación
          </EnlaceBoton>
          <EnlaceBoton href="/inventarios/movimientos/nuevo?tipo=salida" variante="outline">Registrar salida</EnlaceBoton>
        </div>
      )}
    </div>
  )
}
