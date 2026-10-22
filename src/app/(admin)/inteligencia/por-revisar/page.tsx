import { ShieldCheck } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, Campo, Entrada, EstadoVacio, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { accionDecidirAprobacion } from "@/lib/inteligencia/acciones"
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
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-xs">{textoDe(r.contenido)}</pre>
          {puedeAprobar && r.aprobacion && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(["APROBADO", "RECHAZADO"] as const).map((decision) => (
                <FormularioAccion
                  key={decision}
                  accion={accionDecidirAprobacion}
                  etiqueta={decision === "APROBADO" ? "Aprobar resultado" : "Rechazar resultado"}
                  variante={decision === "APROBADO" ? "default" : "outline"}
                >
                  <input type="hidden" name="aprobacionId" value={r.aprobacion!.id} />
                  <input type="hidden" name="decision" value={decision} />
                  <Campo etiqueta="Comentario (opcional)" nombre={`comentario-${r.id}-${decision}`}>
                    <Entrada name="comentario" maxLength={500} />
                  </Campo>
                </FormularioAccion>
              ))}
            </div>
          )}
        </Seccion>
      ))}
    </div>
  )
}
