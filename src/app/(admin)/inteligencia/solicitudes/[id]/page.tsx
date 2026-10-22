import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { AutoRefresco } from "@/components/inteligencia/auto-refresco"
import { DecisionRevision } from "@/components/inteligencia/decision-revision"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { InformeDocumentalVista } from "@/components/inteligencia/informe-documental"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { accionDecidirAprobacion } from "@/lib/inteligencia/acciones"
import { accionCancelarAnalisis, accionEjecutarAnalisis, accionEnviarARevision, accionReintentarAnalisis } from "@/lib/inteligencia/acciones-analisis"
import { esAnalisisDocumental } from "@/lib/inteligencia/documental/analisis"
import { leerInforme } from "@/lib/inteligencia/documental/informe"
import { estadoModo } from "@/lib/inteligencia/documental/modo"
import { DESCRIPCION_ESTADO_SOLICITUD, ETIQUETA_ESTADO_SOLICITUD, ETIQUETA_REVISION, estadoRevision } from "@/lib/inteligencia/etiquetas"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { obtenerSolicitud } from "@/lib/inteligencia/vistas"

export const metadata = { title: "Detalle de solicitud · Centro de Inteligencia" }
export const maxDuration = 120

const TONO_REVISION = { SIN_ENVIAR: "neutral", PENDIENTE: "warning", APROBADO: "success", RECHAZADO: "danger", DEVUELTO: "warning" } as const

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const solicitud = await obtenerSolicitud(ctx, (await params).id)
  if (!solicitud) notFound()
  const sp = await searchParams
  const entrada = solicitud.entrada as { descripcion?: string; documentoIds?: string[] } | null
  const documental = esAnalisisDocumental(solicitud.entrada)
  const resultado = solicitud.resultados[0]
  const informe = documental && resultado ? leerInforme(resultado.contenido) : null
  const revision = estadoRevision(solicitud)
  const puedeEjecutar = ctx.permisos.has("inteligencia:ejecutar")
  const puedeAprobar = ctx.permisos.has("inteligencia:aprobar")
  const modo = estadoModo()

  const datos: [string, React.ReactNode][] = [
    ["Tipo de análisis", solicitud.agente.nombre],
    ["Operación", solicitud.operacion ? <Link key="o" href={`/operaciones/${solicitud.operacion.id}`} className="text-primary hover:underline">{solicitud.operacion.numero}</Link> : "Sin operación vinculada"],
    ["Solicitada por", solicitud.solicitadaPor.nombre],
    ["Fecha de solicitud", formatearFechaHora(solicitud.creadoEn)],
    ["Proveedor y modelo", solicitud.proveedor && solicitud.modelo ? `${PROVEEDORES[solicitud.proveedor].nombre} · ${solicitud.modelo}` : "Sin ejecutar"],
    ["Inicio / fin de ejecución", solicitud.iniciadaEn ? `${formatearFechaHora(solicitud.iniciadaEn)} → ${formatearFechaHora(solicitud.finalizadaEn)}` : "—"],
    ...(documental ? ([["Documentos seleccionados", String(entrada?.documentoIds?.length ?? 0)]] as [string, React.ReactNode][]) : []),
  ]

  return (
    <div className="space-y-6">
      <Link href="/inteligencia/solicitudes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Solicitudes
      </Link>
      {solicitud.estado === "EN_CURSO" && <AutoRefresco />}
      {sp.cola === "1" && solicitud.estado === "PENDIENTE" && (
        <Alerta tono="warning" titulo="Solicitud en cola: el análisis NO se ha ejecutado">
          La ejecución está deshabilitada en este entorno. {modo.motivo}
        </Alerta>
      )}

      <Seccion
        titulo={solicitud.agente.nombre}
        descripcion={DESCRIPCION_ESTADO_SOLICITUD[solicitud.estado]}
        accion={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <InsigniaEstado valor={solicitud.estado} etiqueta={ETIQUETA_ESTADO_SOLICITUD[solicitud.estado]} />
            {revision && <InsigniaEstado valor={revision} etiqueta={ETIQUETA_REVISION[revision]} tono={TONO_REVISION[revision]} />}
          </div>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {datos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {entrada?.descripcion && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Descripción</dt>
              <dd className="whitespace-pre-wrap break-words">{entrada.descripcion}</dd>
            </div>
          )}
          {solicitud.error && (
            <div className="sm:col-span-2">
              <Alerta tono="danger" titulo="El análisis no se completó">{solicitud.error}</Alerta>
            </div>
          )}
        </dl>

        {documental && puedeEjecutar && (solicitud.estado === "PENDIENTE" || solicitud.estado === "FALLIDA") && (
          <div className="mt-5 flex flex-wrap items-start gap-3 border-t pt-4">
            {solicitud.estado === "PENDIENTE" && modo.efectivo !== "deshabilitado" && (
              <FormularioAccion accion={accionEjecutarAnalisis} etiqueta="Ejecutar análisis">
                <input type="hidden" name="id" value={solicitud.id} />
              </FormularioAccion>
            )}
            {solicitud.estado === "PENDIENTE" && modo.efectivo === "deshabilitado" && (
              <p className="text-sm text-muted-foreground">Ejecución deshabilitada en el servidor: la solicitud permanece en cola.</p>
            )}
            {solicitud.estado === "FALLIDA" && (
              <FormularioAccion accion={accionReintentarAnalisis} etiqueta="Reintentar" variante="outline">
                <input type="hidden" name="id" value={solicitud.id} />
              </FormularioAccion>
            )}
            {solicitud.estado === "PENDIENTE" && (
              <FormularioAccion accion={accionCancelarAnalisis} etiqueta="Cancelar solicitud" variante="ghost">
                <input type="hidden" name="id" value={solicitud.id} />
              </FormularioAccion>
            )}
          </div>
        )}
      </Seccion>

      {resultado && documental && (
        <Seccion titulo="Revisión humana" descripcion="Todo informe requiere la decisión de una persona con permiso. Nada se aprueba ni se aplica automáticamente.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Estado:</span>
              {revision && <InsigniaEstado valor={revision} etiqueta={ETIQUETA_REVISION[revision]} tono={TONO_REVISION[revision]} />}
              {resultado.aprobacion?.decididaPor && <span className="text-xs text-muted-foreground">por {resultado.aprobacion.decididaPor.nombre} · {formatearFechaHora(resultado.aprobacion.decididaEn)}</span>}
            </div>
            {resultado.aprobacion?.comentario && resultado.aprobacion.estado !== "PENDIENTE" && (
              <Alerta tono={resultado.aprobacion.estado === "DEVUELTO" ? "warning" : "info"} titulo={resultado.aprobacion.estado === "DEVUELTO" ? "Observaciones del revisor" : "Comentario del revisor"}>
                {resultado.aprobacion.comentario}
              </Alerta>
            )}
            {(revision === "SIN_ENVIAR" || revision === "DEVUELTO") &&
              (puedeEjecutar ? (
                <FormularioAccion accion={accionEnviarARevision} etiqueta={revision === "DEVUELTO" ? "Reenviar a revisión" : "Enviar a revisión"}>
                  <input type="hidden" name="resultadoId" value={resultado.id} />
                </FormularioAccion>
              ) : (
                <p className="text-sm text-muted-foreground">Su rol no permite enviar el informe a revisión.</p>
              ))}
            {revision === "PENDIENTE" && resultado.aprobacion &&
              (puedeAprobar ? (
                <DecisionRevision accion={accionDecidirAprobacion} aprobacionId={resultado.aprobacion.id} idCampo={`obs-${resultado.id}`} />
              ) : (
                <p className="text-sm text-muted-foreground">Pendiente de decisión. Su rol puede consultar el informe, pero no decidir.</p>
              ))}
          </div>
        </Seccion>
      )}

      {informe ? (
        <InformeDocumentalVista informe={informe} />
      ) : (
        <Seccion titulo="Resultados" descripcion="Cada resultado requiere aprobación humana.">
          {solicitud.resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {solicitud.estado === "PENDIENTE" ? "Sin resultados: la solicitud está en cola y no se ha ejecutado." : solicitud.estado === "EN_CURSO" ? "El análisis se está ejecutando…" : "Esta solicitud no generó resultados."}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {solicitud.resultados.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.titulo}</span>
                  <InsigniaEstado valor={r.aprobacion?.estado ?? "PENDIENTE"} etiqueta={r.aprobacion?.estado === "APROBADO" ? "Aprobado" : r.aprobacion?.estado === "RECHAZADO" ? "Rechazado" : r.aprobacion?.estado === "DEVUELTO" ? "Devuelto" : "Por revisar"} />
                  {r.aprobacion?.decididaPor && <span className="text-xs text-muted-foreground">por {r.aprobacion.decididaPor.nombre}</span>}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      )}
    </div>
  )
}
