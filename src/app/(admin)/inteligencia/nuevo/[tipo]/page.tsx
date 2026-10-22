import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { AreaTexto, Alerta, Campo, EnlaceBoton, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { PasosAnalisis, pasosFlujo, type Paso } from "@/components/inteligencia/pasos-analisis"
import { Button } from "@/components/ui/button"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ErrorValidacion } from "@/lib/errores"
import { accionSolicitarEjecucion } from "@/lib/inteligencia/acciones"
import { revisarExpediente, type NivelHallazgo } from "@/lib/inteligencia/expediente"
import { tipoAnalisis } from "@/lib/inteligencia/tipos-analisis"
import { estadoCapacidades } from "@/lib/inteligencia/vistas"
import { opcionesOperaciones } from "@/lib/operaciones/servicio"
import { cn } from "@/lib/utils"

export const metadata = { title: "Nuevo análisis · Centro de Inteligencia" }

type Props = { params: Promise<{ tipo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const NIVEL: Record<NivelHallazgo, { Icono: typeof CheckCircle2; clase: string; etiqueta: string }> = {
  ok: { Icono: CheckCircle2, clase: "text-success", etiqueta: "Correcto" },
  atencion: { Icono: AlertTriangle, clase: "text-warning", etiqueta: "Requiere atención" },
  pendiente: { Icono: CircleDashed, clase: "text-info-foreground", etiqueta: "Pendiente" },
}

export default async function Page({ params, searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:ejecutar")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite iniciar análisis ni registrar solicitudes." />
  const tipo = tipoAnalisis((await params).tipo)
  if (!tipo) notFound()
  const operaciones = await opcionesOperaciones(ctx)
  const opcionesOp = operaciones.map((o) => [o.id, `${o.numero} · ${o.tercero.razonSocial}`] as const)
  const volver = (
    <Link href="/inteligencia" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> Volver a Nuevo análisis
    </Link>
  )

  // --- Revisión de expediente: verificación por reglas, disponible hoy ---
  if (tipo.id === "expediente") {
    const sp = await searchParams
    const operacionId = typeof sp.operacion === "string" ? sp.operacion : ""
    let revision: Awaited<ReturnType<typeof revisarExpediente>> | null = null
    let error: string | null = null
    if (operacionId) {
      try {
        revision = await revisarExpediente(ctx, operacionId)
      } catch (e) {
        if (!(e instanceof ErrorValidacion)) throw e
        error = e.message
      }
    }
    const pasos: Paso[] = [
      { titulo: "Tipo de análisis", detalle: "Revisión de expediente.", estado: "completado" },
      { titulo: "Operación", detalle: "Seleccione la operación a revisar.", estado: revision ? "completado" : "actual" },
      { titulo: "Resultado", detalle: "Hallazgos por reglas del sistema.", estado: revision ? "actual" : "disponible" },
    ]
    return (
      <div className="space-y-6">
        {volver}
        <Seccion titulo={tipo.nombre} descripcion={tipo.descripcion}>
          <div className="space-y-5">
            <PasosAnalisis pasos={pasos} />
            <form className="flex flex-wrap items-end gap-3" role="search">
              <Campo etiqueta="Operación *" nombre="operacion" className="min-w-64 flex-1">
                <Selector name="operacion" defaultValue={operacionId} vacio="Seleccione una operación…" opciones={opcionesOp} required />
              </Campo>
              <Button type="submit">Iniciar análisis</Button>
            </form>
            <Alerta tono="info">
              Esta revisión usa reglas del sistema sobre los datos de la operación. No utiliza inteligencia artificial ni envía información a
              proveedores externos, y no genera resultados por aprobar.
            </Alerta>
          </div>
        </Seccion>

        {error && <Alerta tono="danger">{error}</Alerta>}
        {revision && (
          <Seccion
            titulo={`Resultado · ${revision.operacion.numero}`}
            descripcion={`${revision.operacion.tercero.razonSocial} · ${revision.resumen.correctos} correcto(s), ${revision.resumen.atencion} con atención, ${revision.resumen.pendientes} pendiente(s).`}
            accion={<EnlaceBoton href={`/operaciones/${revision.operacion.id}`} variante="outline">Abrir expediente</EnlaceBoton>}
          >
            <ul className="divide-y">
              {revision.hallazgos.map((h) => {
                const { Icono, clase, etiqueta } = NIVEL[h.nivel]
                return (
                  <li key={h.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <Icono className={cn("mt-0.5 size-5 shrink-0", clase)} aria-label={etiqueta} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{h.titulo}</p>
                      <p className="text-sm text-muted-foreground">{h.detalle}</p>
                    </div>
                    {h.nivel !== "ok" && (
                      <Link href={h.href} className="shrink-0 text-sm text-primary hover:underline">
                        Resolver
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </Seccion>
        )}
      </div>
    )
  }

  // --- Análisis con IA: hoy solo se registra la solicitud en cola ---
  const capacidades = await estadoCapacidades(ctx)
  const agenteId = tipo.agenteCodigo ? capacidades.agentePorCodigo.get(tipo.agenteCodigo) : undefined
  return (
    <div className="space-y-6">
      {volver}
      <Seccion titulo={tipo.nombre} descripcion={tipo.descripcion}>
        <div className="space-y-5">
          <PasosAnalisis pasos={pasosFlujo({ actual: 2, ejecucionDisponible: capacidades.analisisEjecutable })} />
          <Alerta tono="warning" titulo="La ejecución de este análisis aún no está disponible">
            Puede registrar la solicitud: quedará <strong>en cola</strong> con su trazabilidad, pero no se ejecutará ningún análisis ni se
            llamará a un proveedor de IA hasta que el ejecutor esté implementado.
          </Alerta>
          {!agenteId ? (
            <Alerta tono="danger" titulo="No hay un agente activo para este análisis">
              {ctx.permisos.has("inteligencia:administrar_agentes") ? (
                <Link href="/configuracion/inteligencia">Cree o active los agentes en Configuración → Inteligencia artificial.</Link>
              ) : (
                "Solicite a un administrador que configure los agentes de la empresa."
              )}
            </Alerta>
          ) : (
            <FormularioAccion accion={accionSolicitarEjecucion} etiqueta="Registrar solicitud en cola" limpiarAlExito>
              <input type="hidden" name="agenteId" value={agenteId} />
              <div className="grid gap-4 md:grid-cols-2">
                <Campo etiqueta="Operación vinculada" nombre="operacionId" ayuda="Opcional. Solo operaciones de la empresa activa.">
                  <Selector name="operacionId" vacio="Sin operación" opciones={opcionesOp} />
                </Campo>
                <div className="space-y-1 text-xs text-muted-foreground md:pt-6">
                  <p className="font-medium text-foreground">Información que necesitará el análisis</p>
                  <ul className="list-inside list-disc">
                    {tipo.requiere.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <Campo etiqueta="Descripción de la solicitud *" nombre="descripcion" className="md:col-span-2" ayuda="No incluya datos sensibles innecesarios.">
                  <AreaTexto name="descripcion" minLength={5} maxLength={2000} rows={4} required />
                </Campo>
              </div>
            </FormularioAccion>
          )}
        </div>
      </Seccion>
    </div>
  )
}
