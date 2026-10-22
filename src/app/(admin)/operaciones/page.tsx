import { Plus } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Paginacion, Selector } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_ESTADO_OPERACION, ETIQUETA_TIPO_OPERACION, opciones } from "@/lib/etiquetas"
import { formatearFecha, formatearImporte } from "@/lib/formato"
import { listarOperaciones } from "@/lib/operaciones/servicio"

export const metadata = { title: "Operaciones · Comercio Exterior" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("operaciones:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const { filas, hayMas, pagina } = await listarOperaciones(ctx, {
    q: valor("q"), tipo: valor("tipo"), estado: valor("estado"), pagina: Number(valor("pagina")) || 1,
  })
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("tipo") || valor("estado"))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Operaciones"
        descripcion="Expedientes de importación y exportación."
        acciones={
          ctx.permisos.has("operaciones:crear") && (
            <EnlaceBoton href="/operaciones/nueva">
              <Plus className="size-4" aria-hidden /> Nueva operación
            </EnlaceBoton>
          )
        }
      />

      <Card>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" role="search">
            <Entrada name="q" type="search" placeholder="Buscar por número, mercancía, tercero o guía…" defaultValue={valor("q")} aria-label="Buscar" />
            <Selector name="tipo" aria-label="Tipo" defaultValue={valor("tipo")} vacio="Importaciones y exportaciones" opciones={opciones(ETIQUETA_TIPO_OPERACION)} />
            <Selector
              name="estado"
              aria-label="Estado"
              defaultValue={valor("estado")}
              vacio="Todos los estados"
              opciones={[["activas", "Solo activas"], ...opciones(ETIQUETA_ESTADO_OPERACION)]}
            />
            <div className="flex gap-2">
              <Button type="submit">Filtrar</Button>
              {hayFiltros && (
                <EnlaceBoton href="/operaciones" variante="ghost">
                  Limpiar
                </EnlaceBoton>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo={hayFiltros ? "Sin resultados" : "Aún no hay operaciones registradas"}
          descripcion={hayFiltros ? "Ajuste los filtros de búsqueda." : "Cree la primera importación o exportación. Necesita al menos un proveedor o cliente registrado."}
          accion={
            !hayFiltros && ctx.permisos.has("operaciones:crear") ? <EnlaceBoton href="/operaciones/nueva">Crear operación</EnlaceBoton> : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tercero</TableHead>
                  <TableHead className="hidden lg:table-cell">Mercancía</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Valor estimado</TableHead>
                  <TableHead className="hidden md:table-cell">Llegada est.</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <Link href={`/operaciones/${o.id}`} className="hover:underline">
                        {o.numero}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{formatearFecha(o.fechaApertura)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ETIQUETA_TIPO_OPERACION[o.tipo]}</Badge>
                    </TableCell>
                    <TableCell>{o.tercero.razonSocial}</TableCell>
                    <TableCell className="hidden max-w-64 truncate lg:table-cell">{o.descripcion}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{formatearImporte(o.valorEstimado, o.moneda)}</TableCell>
                    <TableCell className="hidden md:table-cell">{formatearFecha(o.envio?.fechaEstimadaLlegada)}</TableCell>
                    <TableCell>
                      <InsigniaEstado valor={o.estado} etiqueta={ETIQUETA_ESTADO_OPERACION[o.estado]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Paginacion pagina={pagina} hayMas={hayMas} base={base} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
