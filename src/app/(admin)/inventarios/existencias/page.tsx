import { Boxes } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Selector } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { opcionesBodegas } from "@/lib/inventarios/bodegas"
import { formatearCantidad } from "@/lib/inventarios/cantidades"
import { listarExistencias } from "@/lib/inventarios/consultas"
import { ETIQUETA_ESTADO_STOCK, TONO_ESTADO_STOCK } from "@/lib/inventarios/etiquetas"

export const metadata = { title: "Existencias · Inventarios" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const [filas, bodegas] = await Promise.all([
    listarExistencias(ctx, { q: valor("q"), bodegaId: valor("bodegaId"), estado: valor("estado") }),
    opcionesBodegas(ctx, false),
  ])
  const hayFiltros = Boolean(valor("q") || valor("bodegaId") || valor("estado"))

  return (
    <div className="space-y-4">
      <BarraFiltros>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" role="search">
          <Entrada name="q" type="search" placeholder="Buscar por SKU o nombre…" defaultValue={valor("q")} aria-label="Buscar" />
          <Selector name="bodegaId" aria-label="Bodega" defaultValue={valor("bodegaId")} vacio="Todas las bodegas" opciones={bodegas.map((b) => [b.id, `${b.codigo} · ${b.nombre}`] as const)} />
          <Selector name="estado" aria-label="Estado" defaultValue={valor("estado")} vacio="Todos los estados" opciones={[["con_stock", "Con existencias"], ["sin_stock", "Sin existencias"], ["bajo_minimo", "Bajo el mínimo"]]} />
          <div className="flex gap-2">
            <Button type="submit">Filtrar</Button>
            {hayFiltros && <EnlaceBoton href="/inventarios/existencias" variante="ghost">Limpiar</EnlaceBoton>}
          </div>
        </form>
      </BarraFiltros>

      {filas.length === 0 ? (
        <EstadoVacio icono={Boxes} titulo={hayFiltros ? "Sin resultados" : "Sin productos"} descripcion={hayFiltros ? "Ajuste los filtros." : "Cree productos y reciba mercancía para ver existencias."} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="hidden sm:table-cell text-right">Mínimo</TableHead><TableHead>Por bodega</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.productoId} className="align-top">
                    <TableCell><Link href={`/inventarios/productos/${f.productoId}`} className="font-medium hover:underline">{f.sku}</Link><div className="text-xs text-muted-foreground">{f.nombre}</div></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatearCantidad(f.total, f.unidad)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatearCantidad(f.stockMinimo, f.unidad)}</TableCell>
                    <TableCell className="text-xs">{f.bodegas.length === 0 ? "—" : f.bodegas.map((b) => <div key={b.bodegaId}>{b.nombre}: <span className="tabular-nums">{formatearCantidad(b.cantidad, f.unidad)}</span></div>)}</TableCell>
                    <TableCell><InsigniaEstado valor={f.estado} etiqueta={ETIQUETA_ESTADO_STOCK[f.estado]} tono={TONO_ESTADO_STOCK[f.estado]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
