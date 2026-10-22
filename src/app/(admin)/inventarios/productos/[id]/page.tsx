import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { CamposProducto } from "@/components/inventarios/campos-producto"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionActualizarProducto, accionCambiarEstadoProducto } from "@/lib/inventarios/acciones"
import { formatearCantidad, UNIDADES } from "@/lib/inventarios/cantidades"
import { estadoDeStock } from "@/lib/inventarios/consultas"
import { ETIQUETA_ESTADO_STOCK, TONO_ESTADO_STOCK } from "@/lib/inventarios/etiquetas"
import { categoriasProductos, obtenerProducto } from "@/lib/inventarios/productos"
import { opcionesTerceros } from "@/lib/terceros/servicio"

export const metadata = { title: "Producto · Inventarios" }

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ params, searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const producto = await obtenerProducto(ctx, (await params).id)
  if (!producto) notFound()
  const puedeEditar = ctx.permisos.has("inventarios:editar")
  const [proveedores, categorias] = puedeEditar ? await Promise.all([opcionesTerceros(ctx, "PROVEEDOR"), categoriasProductos(ctx)]) : [[], []]
  const estado = estadoDeStock(producto.stockTotal, producto.stockMinimo)
  const creado = (await searchParams).creado === "1"

  return (
    <div className="space-y-6">
      <Link href="/inventarios/productos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Productos
      </Link>
      {creado && <Alerta tono="success">Producto creado correctamente.</Alerta>}

      <Seccion
        titulo={`${producto.sku} · ${producto.nombre}`}
        descripcion={`${UNIDADES[producto.unidad].etiqueta} · ${producto.cantidadMovimientos} movimiento(s) registrado(s)`}
        accion={producto.activo ? <InsigniaEstado valor={estado} etiqueta={ETIQUETA_ESTADO_STOCK[estado]} tono={TONO_ESTADO_STOCK[estado]} /> : <InsigniaEstado valor="INACTIVO" etiqueta="Inactivo" />}
      >
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Existencias totales</dt><dd className="text-lg font-semibold tabular-nums">{formatearCantidad(producto.stockTotal, producto.unidad)}</dd></div>
          <div><dt className="text-muted-foreground">Stock mínimo</dt><dd className="tabular-nums">{formatearCantidad(producto.stockMinimo, producto.unidad)}</dd></div>
          <div><dt className="text-muted-foreground">Proveedor habitual</dt><dd>{producto.proveedor?.razonSocial ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">País de origen</dt><dd>{producto.paisOrigen ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Código arancelario</dt><dd>{producto.codigoArancelario ? <>{producto.codigoArancelario} <span className="text-xs text-muted-foreground">(sujeto a validación)</span></> : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Categoría</dt><dd>{producto.categoria ?? "—"}</dd></div>
        </dl>
      </Seccion>

      <Seccion titulo="Existencias por bodega">
        {producto.existencias.filter((e) => e.cantidad.gt(0)).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin existencias en ninguna bodega.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Bodega</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
            <TableBody>
              {producto.existencias.filter((e) => e.cantidad.gt(0)).map((e) => (
                <TableRow key={e.bodegaId}><TableCell>{e.bodega.codigo} · {e.bodega.nombre}</TableCell><TableCell className="text-right tabular-nums">{formatearCantidad(e.cantidad, producto.unidad)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Link href={`/inventarios/movimientos?productoId=${producto.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">Ver movimientos del producto</Link>
      </Seccion>

      {puedeEditar && (
        <>
          <Seccion titulo="Editar producto">
            <FormularioAccion accion={accionActualizarProducto} etiqueta="Guardar cambios">
              <input type="hidden" name="id" value={producto.id} />
              <CamposProducto producto={producto} proveedores={proveedores} categorias={categorias} unidadBloqueada={producto.cantidadMovimientos > 0} />
            </FormularioAccion>
          </Seccion>
          <Seccion titulo={producto.activo ? "Desactivar producto" : "Activar producto"} descripcion="Los productos no se eliminan. Para desactivar no debe tener existencias; conserva su historial de movimientos.">
            <FormularioAccion accion={accionCambiarEstadoProducto} etiqueta={producto.activo ? "Desactivar" : "Activar"} variante="outline">
              <input type="hidden" name="id" value={producto.id} />
              <input type="hidden" name="activo" value={String(!producto.activo)} />
            </FormularioAccion>
          </Seccion>
        </>
      )}
    </div>
  )
}
