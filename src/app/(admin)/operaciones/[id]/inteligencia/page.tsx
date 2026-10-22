import { BrainCircuit, FileSearch } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EnlaceBoton, EstadoVacio, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { ETIQUETA_ESTADO_SOLICITUD, ETIQUETA_REVISION, estadoRevision } from "@/lib/inteligencia/etiquetas"
import { listarAnalisisDeOperacion } from "@/lib/inteligencia/vistas"
import { obtenerOperacion } from "@/lib/operaciones/servicio"

export const metadata = { title: "Inteligencia de la operación · Comercio Exterior" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const operacion = await obtenerOperacion(ctx, (await params).id)
  if (!operacion) notFound()
  const analisis = await listarAnalisisDeOperacion(ctx, operacion.id)
  const puedeSolicitar = ctx.permisos.has("inteligencia:ejecutar")

  return (
    <Seccion
      titulo="Análisis asistido por IA"
      descripcion="Los informes siempre requieren revisión humana y no modifican la operación, el inventario ni los costos."
      accion={puedeSolicitar ? <EnlaceBoton href={`/inteligencia/nuevo/documental?operacion=${operacion.id}`}><FileSearch className="size-4" aria-hidden /> Nuevo análisis documental</EnlaceBoton> : undefined}
    >
      {analisis.length === 0 ? (
        <EstadoVacio
          icono={BrainCircuit}
          titulo={`Aún no hay análisis de la operación ${operacion.numero}`}
          descripcion="Inicie un análisis documental para extraer y contrastar los datos de sus PDF. Quedará registrado aquí con su estado de revisión."
        />
      ) : (
        <ul className="divide-y">
          {analisis.map((a) => {
            const revision = estadoRevision(a)
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <Link href={`/inteligencia/solicitudes/${a.id}`} className="font-medium text-primary hover:underline">{a.agente.nombre}</Link>
                <span className="text-xs text-muted-foreground">{formatearFechaHora(a.creadoEn)} · {a.solicitadaPor.nombre}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <InsigniaEstado valor={a.estado} etiqueta={ETIQUETA_ESTADO_SOLICITUD[a.estado]} />
                  {revision && <span className="text-xs text-muted-foreground">{ETIQUETA_REVISION[revision]}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Seccion>
  )
}
