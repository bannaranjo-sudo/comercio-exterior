import { AlertTriangle, Flag } from "lucide-react"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { AreaTexto, Campo, Entrada, EstadoVacio, InsigniaEstado, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_ESTADO_ENVIO, ETIQUETA_MODALIDAD, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_EVENTO, opciones } from "@/lib/etiquetas"
import { aInputFecha, hoyLocal, formatearFecha } from "@/lib/formato"
import { accionGuardarEnvio, accionRegistrarEvento, accionResolverNovedad } from "@/lib/logistica/acciones"
import { listarEventos, obtenerEnvio } from "@/lib/logistica/servicio"
import { obtenerOperacion } from "@/lib/operaciones/servicio"
import { opcionesTerceros } from "@/lib/terceros/servicio"

export const metadata = { title: "Logística de la operación · Comercio Exterior" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermisoEmpresaActiva("logistica:consultar")
  if (!ctx) return <AccesoDenegado />
  const operacion = await obtenerOperacion(ctx, (await params).id)
  if (!operacion) notFound()
  const abierta = operacion.estado !== "CANCELADA"
  const puedeEditar = ctx.permisos.has("logistica:editar") && abierta
  const puedeRegistrar = ctx.permisos.has("logistica:crear") && abierta
  const [envio, eventos, transportadores] = await Promise.all([
    obtenerEnvio(ctx, operacion.id),
    listarEventos(ctx, operacion.id),
    puedeEditar ? opcionesTerceros(ctx, "TRANSPORTADOR") : [],
  ])
  const hoy = hoyLocal()

  return (
    <div className="space-y-6">
      <Seccion
        titulo="Transporte internacional"
        descripcion={envio ? "Estado actual del envío y fechas de la operación." : "Aún no se han registrado los datos de transporte."}
      >
        {puedeEditar ? (
          <FormularioAccion accion={accionGuardarEnvio} etiqueta="Guardar transporte">
            <input type="hidden" name="operacionId" value={operacion.id} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Medio de transporte" nombre="medioTransporte">
                <Selector name="medioTransporte" defaultValue={envio?.medioTransporte ?? operacion.modalidad} opciones={opciones(ETIQUETA_MODALIDAD)} />
              </Campo>
              <Campo etiqueta="Número de guía o BL" nombre="numeroGuia">
                <Entrada name="numeroGuia" defaultValue={envio?.numeroGuia ?? ""} maxLength={60} />
              </Campo>
              <Campo etiqueta="Transportador" nombre="transportadorId" ayuda="Terceros con rol Transportador.">
                <Selector name="transportadorId" defaultValue={envio?.transportadorId ?? ""} vacio="Sin asignar" opciones={transportadores.map((t) => [t.id, t.razonSocial] as const)} />
              </Campo>
              <Campo etiqueta="Puerto o lugar de origen" nombre="puertoOrigen">
                <Entrada name="puertoOrigen" defaultValue={envio?.puertoOrigen ?? ""} maxLength={120} />
              </Campo>
              <Campo etiqueta="Puerto o lugar de destino" nombre="puertoDestino">
                <Entrada name="puertoDestino" defaultValue={envio?.puertoDestino ?? ""} maxLength={120} />
              </Campo>
              <Campo etiqueta="Estado del envío" nombre="estadoEnvio">
                <Selector name="estadoEnvio" defaultValue={envio?.estadoEnvio ?? "PROGRAMADO"} opciones={opciones(ETIQUETA_ESTADO_ENVIO)} />
              </Campo>
              <Campo etiqueta="Salida estimada" nombre="fechaEstimadaSalida">
                <Entrada name="fechaEstimadaSalida" type="date" defaultValue={aInputFecha(envio?.fechaEstimadaSalida)} />
              </Campo>
              <Campo etiqueta="Salida real" nombre="fechaRealSalida">
                <Entrada name="fechaRealSalida" type="date" defaultValue={aInputFecha(envio?.fechaRealSalida)} />
              </Campo>
              <span className="hidden lg:block" />
              <Campo etiqueta="Llegada estimada" nombre="fechaEstimadaLlegada">
                <Entrada name="fechaEstimadaLlegada" type="date" defaultValue={aInputFecha(envio?.fechaEstimadaLlegada)} />
              </Campo>
              <Campo etiqueta="Llegada real" nombre="fechaRealLlegada">
                <Entrada name="fechaRealLlegada" type="date" defaultValue={aInputFecha(envio?.fechaRealLlegada)} />
              </Campo>
            </div>
          </FormularioAccion>
        ) : envio ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {(
              [
                ["Medio", envio.medioTransporte ? ETIQUETA_MODALIDAD[envio.medioTransporte] : "—"], ["Guía / BL", envio.numeroGuia ?? "—"],
                ["Transportador", envio.transportador?.razonSocial ?? "—"], ["Origen", envio.puertoOrigen ?? "—"], ["Destino", envio.puertoDestino ?? "—"],
                ["Estado", ETIQUETA_ESTADO_ENVIO[envio.estadoEnvio]], ["Salida estimada", formatearFecha(envio.fechaEstimadaSalida)],
                ["Salida real", formatearFecha(envio.fechaRealSalida)], ["Llegada estimada", formatearFecha(envio.fechaEstimadaLlegada)],
                ["Llegada real", formatearFecha(envio.fechaRealLlegada)],
              ] as const
            ).map(([k, v]) => (
              <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos de transporte.</p>
        )}
      </Seccion>

      <div className="grid gap-6 lg:grid-cols-5">
        <Seccion titulo="Línea de tiempo" descripcion="Hitos y novedades en orden cronológico." className="lg:col-span-3">
          {eventos.length === 0 ? (
            <EstadoVacio titulo="Sin eventos registrados" descripcion="Registre hitos (zarpe, llegada, nacionalización…) y novedades o incidencias." />
          ) : (
            <ol className="space-y-4 border-l pl-5">
              {eventos.map((ev) => (
                <li key={ev.id} className="relative text-sm">
                  <span className="absolute -left-[1.7rem] top-0.5 flex size-5 items-center justify-center rounded-full border bg-background" aria-hidden>
                    {ev.tipo === "HITO" ? <Flag className="size-3 text-primary" /> : <AlertTriangle className={`size-3 ${ev.resuelta ? "text-muted-foreground" : "text-destructive"}`} />}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ev.titulo}</span>
                    <Badge variant="outline">{ETIQUETA_TIPO_EVENTO[ev.tipo]}</Badge>
                    {ev.severidad && <InsigniaEstado valor={ev.severidad} etiqueta={`Severidad ${ETIQUETA_SEVERIDAD[ev.severidad].toLowerCase()}`} />}
                    {ev.tipo === "NOVEDAD" && <Badge variant={ev.resuelta ? "secondary" : "destructive"}>{ev.resuelta ? "Resuelta" : "Abierta"}</Badge>}
                  </div>
                  {ev.descripcion && <p className="text-muted-foreground">{ev.descripcion}</p>}
                  <p className="text-xs text-muted-foreground">{formatearFecha(ev.fechaEvento)} · {ev.registradoPor.nombre}</p>
                  {ev.tipo === "NOVEDAD" && !ev.resuelta && puedeEditar && (
                    <FormularioAccion accion={accionResolverNovedad} etiqueta="Marcar como resuelta" variante="outline" className="mt-1">
                      <input type="hidden" name="id" value={ev.id} />
                    </FormularioAccion>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Seccion>

        {puedeRegistrar && (
          <Seccion titulo="Registrar hito o novedad" className="lg:col-span-2">
            <FormularioAccion accion={accionRegistrarEvento} etiqueta="Registrar" limpiarAlExito>
              <input type="hidden" name="operacionId" value={operacion.id} />
              <Campo etiqueta="Tipo *" nombre="tipo">
                <Selector name="tipo" defaultValue="HITO" opciones={opciones(ETIQUETA_TIPO_EVENTO)} />
              </Campo>
              <Campo etiqueta="Título *" nombre="titulo">
                <Entrada name="titulo" maxLength={150} placeholder="Ej.: Zarpe del buque" required />
              </Campo>
              <Campo etiqueta="Fecha *" nombre="fechaEvento">
                <Entrada name="fechaEvento" type="date" defaultValue={hoy} required />
              </Campo>
              <Campo etiqueta="Severidad (solo novedades)" nombre="severidad">
                <Selector name="severidad" defaultValue="" vacio="No aplica / media" opciones={opciones(ETIQUETA_SEVERIDAD)} />
              </Campo>
              <Campo etiqueta="Descripción" nombre="descripcion">
                <AreaTexto name="descripcion" maxLength={1000} rows={2} />
              </Campo>
            </FormularioAccion>
          </Seccion>
        )}
      </div>
    </div>
  )
}
