import { Plus } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Paginacion, Selector } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { estadoDeStock } from "@/lib/inventarios/consultas"
import { formatearCantidad, UNIDADES } from "@/lib/inventarios/cantidades"
import { ETIQUETA_ESTADO_STOCK, TONO_ESTADO_STOCK } from "@/lib/inventarios/etiquetas"
import { categoriasProductos, listarProductos } from "@/lib/inventarios/productos"

export const metadata = { title: "Productos · Inventarios" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const [{ filas, hayMas, pagina }, categorias] = await Promise.all([
    listarProductos(ctx, { q: valor("q"), categoria: valor("categoria"), estado: valor("estado") || "activos", pagina: Number(valor("pagina")) || 1 }),
    categoriasProductos(ctx),
  ])
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("categoria") || valor("estado"))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Catálogo de productos</h2>
        {ctx.permisos.has("inventarios:crear") && (
          <EnlaceBoton href="/inventarios/productos/nuevo" className="ml-auto">
            <Plus className="size-4" aria-hidden /> Nuevo producto
          </EnlaceBoton>
        )}
      </div>
      <BarraFiltros>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" role="search">
          <Entrada name="q" type="search" placeholder="Buscar por SKU, nombre o categoría…" defaultValue={valor("q")} aria-label="Buscar" />
          <Selector name="categoria" aria-label="Categoría" defaultValue={valor("categoria")} vacio="Todas las categorías" opciones={categorias.map((c) => [c, c] as const)} />
          <Selector name="estado" aria-label="Estado" defaultValue={valor("estado") || "activos"} opciones={[["activos", "Activos"], ["inactivos", "Inactivos"], ["todos", "Todos"]]} />
          <div className="flex gap-2">
            <Button type="submit">Filtrar</Button>
            {hayFiltros && <EnlaceBoton href="/inventarios/productos" variante="ghost">Limpiar</EnlaceBoton>}
          </div>
        </form>
      </BarraFiltros>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo={hayFiltros ? "Sin resultados" : "Aún no hay productos"}
          descripcion={hayFiltros ? "Ajuste los filtros de búsqueda." : "Cree los productos que recibirá y despachará en sus bodegas."}
          accion={!hayFiltros && ctx.permisos.has("inventarios:crear") ? <EnlaceBoton href="/inventarios/productos/nuevo">Crear producto</EnlaceBoton> : undefined}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead><TableHead>Producto</TableHead><TableHead className="hidden md:table-cell">Categoría</TableHead>
                  <TableHead className="text-right">Existencias</TableHead><TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((p) => {
                  const estado = estadoDeStock(p.stockTotal, p.stockMinimo)
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium"><Link href={`/inventarios/productos/${p.id}`} className="hover:underline">{p.sku}</Link></TableCell>
                      <TableCell>
                        {p.nombre}
                        <span className="block text-xs text-muted-foreground">{UNIDADES[p.unidad].etiqueta}{p.proveedor ? ` · ${p.proveedor.razonSocial}` : ""}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{p.categoria ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearCantidad(p.stockTotal, p.unidad)}</TableCell>
                      <TableCell>
                        {p.activo ? <InsigniaEstado valor={estado} etiqueta={ETIQUETA_ESTADO_STOCK[estado]} tono={TONO_ESTADO_STOCK[estado]} /> : <InsigniaEstado valor="INACTIVO" etiqueta="Inactivo" />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="px-4"><Paginacion pagina={pagina} hayMas={hayMas} base={base} /></div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
