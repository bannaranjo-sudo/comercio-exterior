import { Warehouse } from "lucide-react"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Campo, Entrada, EstadoVacio, InsigniaEstado, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listarResponsables } from "@/lib/operaciones/servicio"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionActualizarBodega, accionCambiarEstadoBodega, accionCrearBodega } from "@/lib/inventarios/acciones"
import { listarBodegas } from "@/lib/inventarios/bodegas"

export const metadata = { title: "Bodegas · Inventarios" }

type Responsable = { id: string; nombre: string }

function CamposBodega({ bodega, responsables }: { bodega?: { codigo: string; nombre: string; direccion: string | null; ciudad: string | null; responsableId: string | null }; responsables: Responsable[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Campo etiqueta="Código *" nombre="codigo"><Entrada name="codigo" defaultValue={bodega?.codigo} maxLength={20} required className="uppercase" /></Campo>
      <Campo etiqueta="Nombre *" nombre="nombre"><Entrada name="nombre" defaultValue={bodega?.nombre} maxLength={120} required /></Campo>
      <Campo etiqueta="Ciudad" nombre="ciudad"><Entrada name="ciudad" defaultValue={bodega?.ciudad ?? ""} maxLength={80} /></Campo>
      <Campo etiqueta="Dirección" nombre="direccion" className="sm:col-span-2"><Entrada name="direccion" defaultValue={bodega?.direccion ?? ""} maxLength={250} /></Campo>
      <Campo etiqueta="Responsable" nombre="responsableId">
        <Selector name="responsableId" defaultValue={bodega?.responsableId ?? ""} vacio="Sin responsable" opciones={responsables.map((r) => [r.id, r.nombre] as const)} />
      </Campo>
    </div>
  )
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const estado = (await searchParams).estado
  const filtro = estado === "inactivos" || estado === "todos" ? estado : "activos"
  const [lista, responsables] = await Promise.all([listarBodegas(ctx, filtro), listarResponsables(ctx)])
  const puedeCrear = ctx.permisos.has("inventarios:crear")
  const puedeEditar = ctx.permisos.has("inventarios:editar")

  return (
    <div className="space-y-6">
      {puedeCrear && (
        <Seccion titulo="Nueva bodega" descripcion="Las existencias se separan por empresa, producto y bodega.">
          <FormularioAccion accion={accionCrearBodega} etiqueta="Crear bodega" limpiarAlExito>
            <CamposBodega responsables={responsables} />
          </FormularioAccion>
        </Seccion>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Bodegas</h2>
        <nav aria-label="Estado" className="ml-auto flex gap-1 text-sm">
          {[["activos", "Activas"], ["inactivos", "Inactivas"], ["todos", "Todas"]].map(([v, t]) => (
            <a key={v} href={`?estado=${v}`} aria-current={filtro === v ? "page" : undefined} className={`rounded-md px-2.5 py-1 ${filtro === v ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t}</a>
          ))}
        </nav>
      </div>

      {lista.length === 0 ? (
        <EstadoVacio icono={Warehouse} titulo="Aún no hay bodegas" descripcion="Cree al menos una bodega para poder recibir mercancía." />
      ) : (
        <Seccion titulo={`${lista.length} bodega(s)`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Código</TableHead><TableHead>Bodega</TableHead><TableHead className="hidden md:table-cell">Ubicación</TableHead><TableHead className="hidden md:table-cell">Responsable</TableHead><TableHead>Referencias con saldo</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((b) => (
                  <TableRow key={b.id} className="align-top">
                    <TableCell className="font-medium">{b.codigo}</TableCell>
                    <TableCell>{b.nombre}</TableCell>
                    <TableCell className="hidden md:table-cell">{[b.ciudad, b.direccion].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.responsable?.nombre ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{b.referencias}</TableCell>
                    <TableCell><InsigniaEstado valor={b.activo ? "ACTIVO" : "INACTIVO"} etiqueta={b.activo ? "Activa" : "Inactiva"} /></TableCell>
                    <TableCell className="text-right">
                      {puedeEditar && (
                        <div className="flex flex-col items-end gap-2">
                          <details className="text-left">
                            <summary className="cursor-pointer text-xs text-primary">Editar</summary>
                            <FormularioAccion accion={accionActualizarBodega} etiqueta="Guardar" variante="outline" className="mt-2 min-w-72 whitespace-normal">
                              <input type="hidden" name="id" value={b.id} />
                              <CamposBodega bodega={b} responsables={responsables} />
                            </FormularioAccion>
                          </details>
                          <FormularioAccion accion={accionCambiarEstadoBodega} etiqueta={b.activo ? "Desactivar" : "Activar"} variante="ghost">
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="activo" value={String(!b.activo)} />
                          </FormularioAccion>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Seccion>
      )}
    </div>
  )
}
