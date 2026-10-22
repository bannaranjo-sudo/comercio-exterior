import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EstadoVacio, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { CamposCosto } from "@/components/costos/campos-costo"
import { TotalesCostos } from "@/components/costos/totales-costos"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionActualizarCosto, accionEliminarCosto, accionRegistrarCosto } from "@/lib/costos/acciones"
import { listarCostos, totalesPorMoneda } from "@/lib/costos/servicio"
import { ETIQUETA_CATEGORIA_COSTO, ETIQUETA_ESTADO_COSTO } from "@/lib/etiquetas"
import { formatearFecha, formatearImporte } from "@/lib/formato"
import { obtenerOperacion } from "@/lib/operaciones/servicio"

export const metadata = { title: "Costos de la operación · Comercio Exterior" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermisoEmpresaActiva("costos:consultar")
  if (!ctx) return <AccesoDenegado />
  const operacion = await obtenerOperacion(ctx, (await params).id)
  if (!operacion) notFound()
  const abierta = operacion.estado !== "CANCELADA"
  const [costos, totales] = await Promise.all([listarCostos(ctx, operacion.id), totalesPorMoneda(ctx, operacion.id)])
  const puedeCrear = ctx.permisos.has("costos:crear") && abierta
  const puedeEditar = ctx.permisos.has("costos:editar") && abierta
  const puedeEliminar = ctx.permisos.has("costos:eliminar") && abierta

  return (
    <div className="space-y-6">
      <TotalesCostos totales={totales} />

      {puedeCrear && (
        <Seccion titulo="Registrar costo" descripcion="Valores estimados o reales. No se calculan impuestos ni se convierten monedas.">
          <FormularioAccion accion={accionRegistrarCosto} etiqueta="Registrar costo" limpiarAlExito>
            <input type="hidden" name="operacionId" value={operacion.id} />
            <CamposCosto monedaPorDefecto={operacion.moneda} />
          </FormularioAccion>
        </Seccion>
      )}

      {costos.length === 0 ? (
        <EstadoVacio titulo="Sin costos registrados" descripcion="Registre el valor comercial, el flete, el seguro y demás gastos de la operación." />
      ) : (
        <Seccion titulo="Detalle de costos">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{formatearFecha(c.fecha)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{c.concepto}</span>
                      <span className="block text-xs text-muted-foreground">
                        {ETIQUETA_CATEGORIA_COSTO[c.categoria]} · {c.registradoPor.nombre}
                        {c.observacion ? ` · ${c.observacion}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <InsigniaEstado valor={c.estado} etiqueta={ETIQUETA_ESTADO_COSTO[c.estado]} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatearImporte(c.valor, c.moneda)}</TableCell>
                    <TableCell className="text-right">
                      {puedeEditar && (
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs text-primary">Editar</summary>
                          <FormularioAccion accion={accionActualizarCosto} etiqueta="Guardar" variante="outline" className="mt-2 min-w-72">
                            <input type="hidden" name="id" value={c.id} />
                            <CamposCosto costo={c} />
                          </FormularioAccion>
                        </details>
                      )}
                      {puedeEliminar && (
                        <details className="mt-1 text-left">
                          <summary className="cursor-pointer text-xs text-destructive">Eliminar</summary>
                          <FormularioAccion accion={accionEliminarCosto} etiqueta="Confirmar eliminación" variante="outline" className="mt-2">
                            <input type="hidden" name="id" value={c.id} />
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
