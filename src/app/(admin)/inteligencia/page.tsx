import { ArrowRight, ClipboardList, ShieldAlert } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, EstadoVacio, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { EstadoCapacidades } from "@/components/inteligencia/estado-capacidades"
import { PasosAnalisis, pasosFlujo } from "@/components/inteligencia/pasos-analisis"
import { TarjetaAnalisis } from "@/components/inteligencia/tarjeta-analisis"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { TIPOS_ANALISIS } from "@/lib/inteligencia/tipos-analisis"
import { contarPorRevisar, estadoCapacidades, listarSolicitudes } from "@/lib/inteligencia/vistas"
import { ETIQUETA_ESTADO_SOLICITUD } from "@/lib/inteligencia/etiquetas"

export const metadata = { title: "Nuevo análisis · Centro de Inteligencia" }

// Abre directamente en "Nuevo análisis": tipos de análisis, estado real de disponibilidad y actividad reciente.
export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const [capacidades, recientes, porRevisar] = await Promise.all([
    estadoCapacidades(ctx),
    listarSolicitudes(ctx, { pagina: 1 }),
    contarPorRevisar(ctx),
  ])
  const puedeSolicitar = ctx.permisos.has("inteligencia:ejecutar")
  const puedeConfigurar = ctx.permisos.has("inteligencia:configurar") || ctx.permisos.has("inteligencia:administrar_agentes")

  return (
    <div className="space-y-6">
      {porRevisar > 0 && (
        <Alerta tono="warning" titulo={`${porRevisar} resultado(s) pendiente(s) de revisión`}>
          Requieren la decisión de una persona. <Link href="/inteligencia/por-revisar" className="font-medium">Revisar ahora</Link>
        </Alerta>
      )}

      <Seccion
        titulo="Estado de disponibilidad"
        descripcion="Estados independientes: que un nivel esté listo no implica que el siguiente lo esté."
        accion={
          puedeConfigurar ? (
            <Link href="/configuracion/inteligencia" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Configuración <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : undefined
        }
      >
        <EstadoCapacidades capacidades={capacidades} compacto />
      </Seccion>

      <section aria-labelledby="titulo-tipos" className="space-y-3">
        <h2 id="titulo-tipos" className="text-base font-semibold">
          ¿Qué desea analizar?
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {TIPOS_ANALISIS.map((tipo) => (
            <TarjetaAnalisis
              key={tipo.id}
              tipo={tipo}
              puedeSolicitar={puedeSolicitar}
              agenteConfigurado={Boolean(tipo.agenteCodigo && capacidades.agentePorCodigo.has(tipo.agenteCodigo))}
              puedeConfigurarAgentes={ctx.permisos.has("inteligencia:administrar_agentes")}
              modoEjecucion={capacidades.modo.efectivo}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion
          titulo="Actividad reciente"
          descripcion="Últimas solicitudes de la empresa."
          className="lg:col-span-2"
          accion={
            <Link href="/inteligencia/solicitudes" className="text-sm text-primary hover:underline">
              Ver todas
            </Link>
          }
        >
          {recientes.filas.length === 0 ? (
            <EstadoVacio
              icono={ClipboardList}
              titulo="Aún no hay solicitudes"
              descripcion="Cuando registre una solicitud o ejecute una revisión aparecerá aquí con su trazabilidad."
            />
          ) : (
            <ul className="divide-y">
              {recientes.filas.slice(0, 5).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                  <Link href={`/inteligencia/solicitudes/${s.id}`} className="font-medium hover:underline">
                    {s.agente.nombre}
                  </Link>
                  {s.operacion && <span className="text-muted-foreground">{s.operacion.numero}</span>}
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatearFechaHora(s.creadoEn)}</span>
                    <InsigniaEstado valor={s.estado} etiqueta={ETIQUETA_ESTADO_SOLICITUD[s.estado]} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Resultados por revisar" descripcion="Toda salida requiere decisión humana.">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning-foreground">
              <ShieldAlert className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{porRevisar}</p>
              <p className="text-xs text-muted-foreground">pendiente(s) de aprobación</p>
            </div>
          </div>
          <Link href="/inteligencia/por-revisar" className="mt-3 inline-block text-sm text-primary hover:underline">
            Ir a Por revisar
          </Link>
        </Seccion>
      </div>

      <Seccion titulo="Cómo funcionará el flujo de análisis" descripcion="Los pasos marcados como Próximamente no están habilitados en este entorno.">
        <PasosAnalisis pasos={pasosFlujo({ actual: 1, ejecucionDisponible: capacidades.analisisEjecutable })} />
      </Seccion>
    </div>
  )
}
