import { ShieldCheck } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, EstadoVacio, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { DecisionRevision } from "@/components/inteligencia/decision-revision"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { accionDecidirAprobacion } from "@/lib/inteligencia/acciones"
import { leerInforme } from "@/lib/inteligencia/documental/informe"
import { listarResultadosPorRevisar } from "@/lib/inteligencia/vistas"

export const metadata = { title: "Por revisar · Centro de Inteligencia" }

const textoDe = (contenido: unknown): string => {
  if (typeof contenido === "string") return contenido
  const texto = (contenido as { texto?: unknown } | null)?.texto
  if (typeof texto === "string") return texto
  return JSON.stringify(contenido, null, 2).slice(0, 4000)
}

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const puedeAprobar = ctx.permisos.has("inteligencia:aprobar")
  const resultados = await listarResultadosPorRevisar(ctx)

  if (resultados.length === 0) {
    return (
      <EstadoVacio
        icono={ShieldCheck}
        titulo="No hay resultados pendientes de revisión"
        descripcion="Los resultados de análisis aparecerán aquí. Ninguno se aprueba automáticamente: siempre requiere la decisión de una persona con permiso."
      />
    )
  }

  return (
    <div className="space-y-4">
      {!puedeAprobar && <Alerta tono="info">Puede consultar los resultados, pero su rol no permite aprobarlos o rechazarlos.</Alerta>}
      {resultados.map((r) => (
        <Seccion
          key={r.id}
          titulo={r.titulo}
          descripcion={`${r.ejecucion.agente.nombre} · solicitado por ${r.ejecucion.solicitadaPor.nombre} · ${formatearFechaHora(r.creadoEn)}`}
          accion={<Link href={`/inteligencia/solicitudes/${r.ejecucion.id}`} className="text-sm text-primary hover:underline">Ver solicitud</Link>}
        >
          {(() => {
            const informe = leerInforme(r.contenido)
            if (!informe) return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-xs">{textoDe(r.contenido)}</pre>
            const altas = informe.inconsistencias.filter((i) => i.nivel === "alto").length
            return (
              <div className="space-y-2 text-sm">
                <p className="break-words">{informe.resumen}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{informe.datos.length} dato(s) extraído(s)</span>·<span>{informe.inconsistencias.length} inconsistencia(s)</span>
                  {altas > 0 && <InsigniaEstado valor="alto" etiqueta={`${altas} de atención alta`} tono="danger" />}
                  {informe.generado.simulado && <InsigniaEstado valor="simulado" etiqueta="Demostración (simulado)" tono="warning" />}
                </div>
                <Link href={`/inteligencia/solicitudes/${r.ejecucion.id}`} className="text-primary hover:underline">Abrir el informe completo para revisarlo</Link>
              </div>
            )
          })()}
          {puedeAprobar && r.aprobacion && r.ejecucion.solicitadaPorId !== ctx.usuarioId && (
            <div className="mt-4">
              <DecisionRevision accion={accionDecidirAprobacion} aprobacionId={r.aprobacion.id} idCampo={`obs-${r.id}`} />
            </div>
          )}
          {puedeAprobar && r.aprobacion && r.ejecucion.solicitadaPorId === ctx.usuarioId && (
            <p className="mt-4 text-sm text-muted-foreground">Usted solicitó este análisis: debe decidir otra persona con permiso de aprobación.</p>
          )}
        </Seccion>
      ))}
    </div>
  )
}
