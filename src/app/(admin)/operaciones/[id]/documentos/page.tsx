import { CheckCircle2, Download, FileWarning } from "lucide-react"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { AreaTexto, Campo, Entrada, EstadoVacio, InsigniaEstado, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionCambiarEstadoDocumento, accionGuardarRequisitos, accionSubirDocumento } from "@/lib/documentos/acciones"
import { listarDocumentosOperacion, MAX_BYTES_DOCUMENTO, requisitosDocumentales, verificarDocumentosOperacion } from "@/lib/documentos/servicio"
import { ETIQUETA_ESTADO_DOCUMENTO, ETIQUETA_TIPO_DOCUMENTO, opciones } from "@/lib/etiquetas"
import { formatearFechaHora, formatearTamano } from "@/lib/formato"
import { obtenerOperacion } from "@/lib/operaciones/servicio"

export const metadata = { title: "Documentos de la operación · Comercio Exterior" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermisoEmpresaActiva("documentos:consultar")
  if (!ctx) return <AccesoDenegado />
  const operacion = await obtenerOperacion(ctx, (await params).id)
  if (!operacion) notFound()
  const [lista, documentos, requeridos] = await Promise.all([
    verificarDocumentosOperacion(ctx, operacion),
    listarDocumentosOperacion(ctx, operacion.id),
    requisitosDocumentales(ctx, operacion.tipo),
  ])
  const puedeCargar = ctx.permisos.has("documentos:crear") && operacion.estado !== "CANCELADA"
  const puedeEditar = ctx.permisos.has("documentos:editar")
  const faltantes = lista.filter((l) => l.faltante).length

  return (
    <div className="space-y-6">
      <Seccion
        titulo="Documentos requeridos"
        descripcion={faltantes === 0 ? "Todos los documentos requeridos tienen al menos un archivo cargado." : `${faltantes} documento(s) requerido(s) sin cargar.`}
      >
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay documentos obligatorios configurados para este tipo de operación.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {lista.map((l) => (
              <li key={l.tipo} className="flex items-center gap-2 text-sm">
                {l.faltante ? <FileWarning className="size-4 text-destructive" aria-hidden /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />}
                <span>{ETIQUETA_TIPO_DOCUMENTO[l.tipo]}</span>
                {l.faltante ? <Badge variant="destructive">Faltante</Badge> : l.estado && <InsigniaEstado valor={l.estado} etiqueta={ETIQUETA_ESTADO_DOCUMENTO[l.estado]} />}
              </li>
            ))}
          </ul>
        )}
        {puedeEditar && (
          <details className="mt-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Configurar documentos requeridos para {operacion.tipo === "IMPORTACION" ? "importaciones" : "exportaciones"}</summary>
            <FormularioAccion accion={accionGuardarRequisitos} etiqueta="Guardar lista" variante="outline" className="mt-3">
              <input type="hidden" name="tipoOperacion" value={operacion.tipo} />
              <div className="grid gap-2 sm:grid-cols-2">
                {opciones(ETIQUETA_TIPO_DOCUMENTO).map(([valor, etiqueta]) => (
                  <label key={valor} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="tipos" value={valor} defaultChecked={requeridos.includes(valor)} className="size-4" />
                    {etiqueta}
                  </label>
                ))}
              </div>
            </FormularioAccion>
          </details>
        )}
      </Seccion>

      {puedeCargar && (
        <Seccion titulo="Cargar documento" descripcion={`Solo PDF, hasta ${formatearTamano(MAX_BYTES_DOCUMENTO)}. Se almacena de forma privada.`}>
          <FormularioAccion accion={accionSubirDocumento} etiqueta="Cargar documento" limpiarAlExito>
            <input type="hidden" name="operacionId" value={operacion.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Tipo de documento *" nombre="tipo">
                <Selector name="tipo" defaultValue="FACTURA_COMERCIAL" opciones={opciones(ETIQUETA_TIPO_DOCUMENTO)} />
              </Campo>
              <Campo etiqueta="Archivo PDF *" nombre="archivo">
                <Entrada name="archivo" type="file" accept=".pdf,application/pdf" required />
              </Campo>
              <Campo etiqueta="Observaciones" nombre="observaciones" className="sm:col-span-2">
                <AreaTexto name="observaciones" maxLength={500} rows={2} />
              </Campo>
            </div>
          </FormularioAccion>
        </Seccion>
      )}

      {documentos.length === 0 ? (
        <EstadoVacio titulo="Sin documentos cargados" descripcion="Cargue la factura comercial y demás soportes de la operación." />
      ) : (
        <Seccion titulo="Documentos cargados">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Cargado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</TableCell>
                    <TableCell className="max-w-64">
                      <span className="block truncate font-medium">{d.nombreOriginal}</span>
                      <span className="text-xs text-muted-foreground">{formatearTamano(d.tamanoBytes)}</span>
                      {d.observaciones && <span className="block text-xs text-muted-foreground">{d.observaciones}</span>}
                    </TableCell>
                    <TableCell>
                      <InsigniaEstado valor={d.estado} etiqueta={ETIQUETA_ESTADO_DOCUMENTO[d.estado]} />
                    </TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {formatearFechaHora(d.creadoEn)}
                      <span className="block text-muted-foreground">{d.subidoPor.nombre}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/documentos/${d.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                        <Download className="size-4" aria-hidden /> Descargar
                      </a>
                      {puedeEditar && (
                        <details className="mt-1 text-left">
                          <summary className="cursor-pointer text-xs text-muted-foreground">Cambiar estado</summary>
                          <FormularioAccion accion={accionCambiarEstadoDocumento} etiqueta="Actualizar" variante="outline" className="mt-2 min-w-56">
                            <input type="hidden" name="id" value={d.id} />
                            <Selector name="estado" defaultValue={d.estado} opciones={opciones(ETIQUETA_ESTADO_DOCUMENTO)} aria-label="Estado" />
                            <Entrada name="observaciones" placeholder="Observación (obligatoria si se observa)" maxLength={500} aria-label="Observación" />
                          </FormularioAccion>
                        </details>
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
