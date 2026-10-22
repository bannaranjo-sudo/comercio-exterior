import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { DESCRIPCION_ESTADO_SOLICITUD, ETIQUETA_ESTADO_SOLICITUD } from "@/lib/inteligencia/etiquetas"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { obtenerSolicitud } from "@/lib/inteligencia/vistas"

export const metadata = { title: "Detalle de solicitud · Centro de Inteligencia" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const solicitud = await obtenerSolicitud(ctx, (await params).id)
  if (!solicitud) notFound()
  const descripcion = (solicitud.entrada as { descripcion?: string } | null)?.descripcion

  const datos: [string, React.ReactNode][] = [
    ["Tipo de análisis", solicitud.agente.nombre],
    ["Operación", solicitud.operacion ? <Link key="o" href={`/operaciones/${solicitud.operacion.id}`} className="text-primary hover:underline">{solicitud.operacion.numero}</Link> : "Sin operación vinculada"],
    ["Solicitada por", solicitud.solicitadaPor.nombre],
    ["Fecha de solicitud", formatearFechaHora(solicitud.creadoEn)],
    ["Proveedor y modelo", solicitud.proveedor && solicitud.modelo ? `${PROVEEDORES[solicitud.proveedor].nombre} · ${solicitud.modelo}` : "Sin ejecutar"],
    ["Inicio / fin de ejecución", solicitud.iniciadaEn ? `${formatearFechaHora(solicitud.iniciadaEn)} → ${formatearFechaHora(solicitud.finalizadaEn)}` : "—"],
  ]

  return (
    <div className="space-y-6">
      <Link href="/inteligencia/solicitudes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Solicitudes
      </Link>
      <Seccion titulo={solicitud.agente.nombre} descripcion={DESCRIPCION_ESTADO_SOLICITUD[solicitud.estado]} accion={<InsigniaEstado valor={solicitud.estado} etiqueta={ETIQUETA_ESTADO_SOLICITUD[solicitud.estado]} />}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {datos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Descripción</dt>
            <dd className="whitespace-pre-wrap break-words">{descripcion ?? "—"}</dd>
          </div>
          {solicitud.error && (
            <div className="sm:col-span-2">
              <Alerta tono="danger" titulo="Error de ejecución">{solicitud.error}</Alerta>
            </div>
          )}
        </dl>
      </Seccion>

      <Seccion titulo="Resultados" descripcion="Cada resultado requiere aprobación humana.">
        {solicitud.resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {solicitud.estado === "PENDIENTE" ? "Sin resultados: la solicitud está en cola y no se ha ejecutado." : "Esta solicitud no generó resultados."}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {solicitud.resultados.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.titulo}</span>
                <InsigniaEstado valor={r.aprobacion?.estado ?? "PENDIENTE"} etiqueta={r.aprobacion?.estado === "APROBADO" ? "Aprobado" : r.aprobacion?.estado === "RECHAZADO" ? "Rechazado" : "Por revisar"} />
                {r.aprobacion?.decididaPor && <span className="text-xs text-muted-foreground">por {r.aprobacion.decididaPor.nombre}</span>}
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  )
}
