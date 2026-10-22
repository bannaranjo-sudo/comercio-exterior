import { ArrowLeftRight } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, Campo, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Paginacion, Selector } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { accionCompensarMovimiento } from "@/lib/inventarios/acciones"
import { opcionesBodegas } from "@/lib/inventarios/bodegas"
import { formatearCantidad } from "@/lib/inventarios/cantidades"
import { listarMovimientos } from "@/lib/inventarios/consultas"
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/inventarios/etiquetas"
import { opcionesProductos } from "@/lib/inventarios/productos"

export const metadata = { title: "Movimientos · Inventarios" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const [{ filas, hayMas, pagina }, bodegas, productos] = await Promise.all([
    listarMovimientos(ctx, { tipo: valor("tipo"), productoId: valor("productoId"), bodegaId: valor("bodegaId"), desde: valor("desde"), hasta: valor("hasta"), q: valor("q"), pagina: Number(valor("pagina")) || 1 }),
    opcionesBodegas(ctx, false),
    opcionesProductos(ctx, false),
  ])
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = ["q", "tipo", "productoId", "bodegaId", "desde", "hasta"].some((k) => valor(k))
  const puedeCrear = ctx.permisos.has("inventarios:crear")
  const puedeCompensar = ctx.permisos.has("inventarios:eliminar")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Historial de movimientos</h2>
        {puedeCrear && <EnlaceBoton href="/inventarios/movimientos/nuevo" className="ml-auto"><ArrowLeftRight className="size-4" aria-hidden /> Registrar movimiento</EnlaceBoton>}
      </div>
      <BarraFiltros>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <Entrada name="q" type="search" placeholder="Buscar por motivo, referencia o producto…" defaultValue={valor("q")} aria-label="Buscar" className="lg:col-span-2" />
          <Selector name="tipo" aria-label="Tipo" defaultValue={valor("tipo")} vacio="Todos los tipos" opciones={Object.entries(ETIQUETA_TIPO_MOVIMIENTO)} />
          <Selector name="productoId" aria-label="Producto" defaultValue={valor("productoId")} vacio="Todos los productos" opciones={productos.map((p) => [p.id, `${p.sku} · ${p.nombre}`] as const)} />
          <Selector name="bodegaId" aria-label="Bodega" defaultValue={valor("bodegaId")} vacio="Todas las bodegas" opciones={bodegas.map((b) => [b.id, `${b.codigo} · ${b.nombre}`] as const)} />
          <Entrada name="desde" type="date" defaultValue={valor("desde")} aria-label="Desde" />
          <Entrada name="hasta" type="date" defaultValue={valor("hasta")} aria-label="Hasta" />
          <div className="flex gap-2">
            <Button type="submit">Filtrar</Button>
            {hayFiltros && <EnlaceBoton href="/inventarios/movimientos" variante="ghost">Limpiar</EnlaceBoton>}
          </div>
        </form>
      </BarraFiltros>

      {filas.length === 0 ? (
        <EstadoVacio icono={ArrowLeftRight} titulo={hayFiltros ? "Sin resultados" : "Aún no hay movimientos"} descripcion={hayFiltros ? "Ajuste los filtros." : "Los movimientos se generan al recibir mercancía o registrar entradas, salidas, transferencias y ajustes."} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Producto</TableHead><TableHead>Bodega</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="hidden md:table-cell text-right">Saldo</TableHead><TableHead className="hidden lg:table-cell">Motivo / referencia</TableHead><TableHead className="hidden md:table-cell">Usuario</TableHead>{puedeCompensar && <TableHead className="text-right">Corrección</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {filas.map((m) => {
                  const entrada = m.sentido === "ENTRADA"
                  return (
                    <TableRow key={m.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-xs">{formatearFechaHora(m.creadoEn)}</TableCell>
                      <TableCell><InsigniaEstado valor={m.tipo} etiqueta={ETIQUETA_TIPO_MOVIMIENTO[m.tipo]} tono={entrada ? "success" : "warning"} /></TableCell>
                      <TableCell>{m.producto.sku}<div className="text-xs text-muted-foreground">{m.producto.nombre}</div></TableCell>
                      <TableCell>{m.bodega.nombre}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${entrada ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{entrada ? "+" : "−"}{formatearCantidad(m.cantidad, m.producto.unidad)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatearCantidad(m.saldoPosterior, m.producto.unidad)}</TableCell>
                      <TableCell className="hidden max-w-64 text-xs lg:table-cell">{m.motivo ?? "—"}{m.referencia && <div className="text-muted-foreground">Ref.: {m.referencia}</div>}{m.operacion && <Link href={`/operaciones/${m.operacion.id}`} className="text-primary hover:underline">{m.operacion.numero}</Link>}</TableCell>
                      <TableCell className="hidden md:table-cell">{m.usuario.nombre}</TableCell>
                      {puedeCompensar && (
                        <TableCell className="text-right">
                          {m.compensadoPor ? <span className="text-xs text-muted-foreground">Compensado</span> : m.tipo === "COMPENSACION" ? <span className="text-xs text-muted-foreground">—</span> : (
                            <details className="text-left">
                              <summary className="cursor-pointer text-xs text-primary">Compensar</summary>
                              <FormularioAccion accion={accionCompensarMovimiento} etiqueta="Registrar compensación" variante="outline" className="mt-2 min-w-64 whitespace-normal">
                                <input type="hidden" name="id" value={m.id} />
                                <Campo etiqueta="Motivo (mín. 10 caracteres) *" nombre={`motivo-${m.id}`}><Entrada id={`motivo-${m.id}`} name="motivo" minLength={10} maxLength={500} required /></Campo>
                              </FormularioAccion>
                            </details>
                          )}
                        </TableCell>
                      )}
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
