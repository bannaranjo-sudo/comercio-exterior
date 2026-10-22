import { ClipboardList, Plus } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Paginacion, Selector } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { ETIQUETA_ESTADO_SOLICITUD } from "@/lib/inteligencia/etiquetas"
import { listarSolicitudes } from "@/lib/inteligencia/vistas"

export const metadata = { title: "Solicitudes · Centro de Inteligencia" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const estado = valor("estado")
  const { filas, hayMas, pagina } = await listarSolicitudes(ctx, {
    q: valor("q"), agente: valor("tipo"), estado: estado === "abiertas" || estado === "todas" ? undefined : estado,
    vista: estado === "todas" || (estado && estado !== "abiertas") ? "todas" : "abiertas", pagina: Number(valor("pagina")) || 1,
  })
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("tipo") || (estado && estado !== "abiertas"))

  return (
    <div className="space-y-4">
      <BarraFiltros>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" role="search">
          <Entrada name="q" type="search" placeholder="Buscar por descripción, operación o agente…" defaultValue={valor("q")} aria-label="Buscar" />
          <Selector
            name="tipo"
            aria-label="Tipo de análisis"
            defaultValue={valor("tipo")}
            vacio="Todos los tipos"
            opciones={[["documental", "Documental"], ["arancelario", "Arancelario"], ["financiero", "Financiero"], ["orquestador", "Orquestador"]]}
          />
          <Selector
            name="estado"
            aria-label="Estado"
            defaultValue={estado || "abiertas"}
            opciones={[["abiertas", "Abiertas (en cola o en ejecución)"], ["todas", "Todas"], ...Object.entries(ETIQUETA_ESTADO_SOLICITUD)]}
          />
          <div className="flex gap-2">
            <Button type="submit">Filtrar</Button>
            {hayFiltros && <EnlaceBoton href="/inteligencia/solicitudes" variante="ghost">Limpiar</EnlaceBoton>}
          </div>
        </form>
      </BarraFiltros>

      {filas.length === 0 ? (
        <EstadoVacio
          icono={ClipboardList}
          titulo={hayFiltros ? "Sin solicitudes con esos filtros" : "No hay solicitudes abiertas"}
          descripcion={hayFiltros ? "Ajuste los filtros o consulte todas las solicitudes." : "Registre una solicitud desde Nuevo análisis. Quedará en cola con su trazabilidad."}
          accion={
            ctx.permisos.has("inteligencia:ejecutar") ? (
              <EnlaceBoton href="/inteligencia">
                <Plus className="size-4" aria-hidden /> Nuevo análisis
              </EnlaceBoton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Responsable</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.agente.nombre}</TableCell>
                    <TableCell>
                      {s.operacion ? (
                        <Link href={`/operaciones/${s.operacion.id}`} className="text-primary hover:underline">
                          {s.operacion.numero}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatearFechaHora(s.creadoEn)}</TableCell>
                    <TableCell>
                      <InsigniaEstado valor={s.estado} etiqueta={ETIQUETA_ESTADO_SOLICITUD[s.estado]} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{s.solicitadaPor.nombre}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/inteligencia/solicitudes/${s.id}`} className="text-sm text-primary hover:underline">
                        Ver detalle
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4">
              <Paginacion pagina={pagina} hayMas={hayMas} base={base} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
