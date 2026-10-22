import { ArrowDownToLine } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, EnlaceBoton, Entrada, EstadoVacio, Paginacion, Selector } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFecha } from "@/lib/formato"
import { opcionesBodegas } from "@/lib/inventarios/bodegas"
import { listarRecepciones } from "@/lib/inventarios/recepciones"

export const metadata = { title: "Recepciones · Inventarios" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const [{ filas, hayMas, pagina }, bodegas] = await Promise.all([
    listarRecepciones(ctx, { q: valor("q"), bodegaId: valor("bodegaId"), pagina: Number(valor("pagina")) || 1 }),
    opcionesBodegas(ctx, false),
  ])
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("bodegaId"))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Recepciones de importación</h2>
        {ctx.permisos.has("inventarios:crear") && (
          <EnlaceBoton href="/inventarios/recepciones/nueva" className="ml-auto">
            <ArrowDownToLine className="size-4" aria-hidden /> Nueva recepción
          </EnlaceBoton>
        )}
      </div>
      <BarraFiltros>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto]" role="search">
          <Entrada name="q" type="search" placeholder="Buscar por número de recepción o de operación…" defaultValue={valor("q")} aria-label="Buscar" />
          <Selector name="bodegaId" aria-label="Bodega" defaultValue={valor("bodegaId")} vacio="Todas las bodegas" opciones={bodegas.map((b) => [b.id, `${b.codigo} · ${b.nombre}`] as const)} />
          <div className="flex gap-2">
            <Button type="submit">Filtrar</Button>
            {hayFiltros && <EnlaceBoton href="/inventarios/recepciones" variante="ghost">Limpiar</EnlaceBoton>}
          </div>
        </form>
      </BarraFiltros>

      {filas.length === 0 ? (
        <EstadoVacio
          icono={ArrowDownToLine}
          titulo={hayFiltros ? "Sin resultados" : "Aún no hay recepciones"}
          descripcion={hayFiltros ? "Ajuste los filtros." : "Las existencias se generan al recibir la mercancía de una importación; crear la operación no las genera."}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Número</TableHead><TableHead>Importación</TableHead><TableHead>Bodega</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Líneas</TableHead><TableHead className="hidden md:table-cell">Registrada por</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium"><Link href={`/inventarios/recepciones/${r.id}`} className="hover:underline">{r.numero}</Link></TableCell>
                    <TableCell><Link href={`/operaciones/${r.operacion.id}`} className="text-primary hover:underline">{r.operacion.numero}</Link></TableCell>
                    <TableCell>{r.bodega.nombre}</TableCell>
                    <TableCell>{formatearFecha(r.fechaRecepcion)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r._count.lineas}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.registradoPor.nombre}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4"><Paginacion pagina={pagina} hayMas={hayMas} base={base} /></div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
