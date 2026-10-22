import { Download } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Paginacion, Selector } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { listarDocumentos } from "@/lib/documentos/servicio"
import { ETIQUETA_ESTADO_DOCUMENTO, ETIQUETA_TIPO_DOCUMENTO, opciones } from "@/lib/etiquetas"
import { formatearFechaHora, formatearTamano } from "@/lib/formato"

export const metadata = { title: "Documentos · Comercio Exterior" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("documentos:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const { filas, hayMas, pagina } = await listarDocumentos(ctx, { q: valor("q"), estado: valor("estado"), tipo: valor("tipo"), pagina: Number(valor("pagina")) || 1 })
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("estado") || valor("tipo"))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Documentos"
        descripcion="Archivos de todas las operaciones. Para cargar un documento, abra la operación y use su pestaña Documentos."
      />
      <Card>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" role="search">
            <Entrada name="q" type="search" placeholder="Buscar por archivo o número de operación…" defaultValue={valor("q")} aria-label="Buscar" />
            <Selector name="estado" aria-label="Estado" defaultValue={valor("estado")} vacio="Todos los estados" opciones={[["por_revisar", "Por revisar (sin aprobar)"], ...opciones(ETIQUETA_ESTADO_DOCUMENTO)]} />
            <Selector name="tipo" aria-label="Tipo" defaultValue={valor("tipo")} vacio="Todos los tipos" opciones={opciones(ETIQUETA_TIPO_DOCUMENTO)} />
            <div className="flex gap-2">
              <Button type="submit">Filtrar</Button>
              {hayFiltros && <EnlaceBoton href="/documentos" variante="ghost">Limpiar</EnlaceBoton>}
            </div>
          </form>
        </CardContent>
      </Card>

      {filas.length === 0 ? (
        <EstadoVacio titulo={hayFiltros ? "Sin resultados" : "Aún no hay documentos cargados"} descripcion={hayFiltros ? "Ajuste los filtros de búsqueda." : "Los documentos se cargan desde la pestaña Documentos de cada operación."} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operación</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Cargado</TableHead>
                  <TableHead className="text-right">Descarga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <Link href={`/operaciones/${d.operacion.id}/documentos`} className="hover:underline">{d.operacion.numero}</Link>
                    </TableCell>
                    <TableCell>{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</TableCell>
                    <TableCell className="max-w-56 truncate">
                      {d.nombreOriginal} <span className="text-xs text-muted-foreground">({formatearTamano(d.tamanoBytes)})</span>
                    </TableCell>
                    <TableCell><InsigniaEstado valor={d.estado} etiqueta={ETIQUETA_ESTADO_DOCUMENTO[d.estado]} /></TableCell>
                    <TableCell className="hidden text-xs md:table-cell">{formatearFechaHora(d.creadoEn)}<span className="block text-muted-foreground">{d.subidoPor.nombre}</span></TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/documentos/${d.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" aria-label={`Descargar ${d.nombreOriginal}`}>
                        <Download className="size-4" aria-hidden /> PDF
                      </a>
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
