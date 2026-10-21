import { AccesoDenegado } from "@/components/acceso-denegado"
import { claseCampo } from "@/components/inteligencia/estilos"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import {
  accionAsignarModelo,
  accionCambiarEstadoAgente,
  accionCrearAgente,
  accionInicializarAgentes,
} from "@/lib/inteligencia/acciones"
import { modelosPermitidos } from "@/lib/inteligencia/modelos"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { listarAgentes, listarProveedores } from "@/lib/inteligencia/servicio"

export const metadata = { title: "Agentes · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const puedeAdministrar = ctx.permisos.has("inteligencia:administrar_agentes")
  const [agentes, proveedores] = await Promise.all([listarAgentes(ctx), listarProveedores(ctx)])
  const habilitados = proveedores.filter((p) => p.habilitado)
  const modelosOpenAI = modelosPermitidos("OPENAI") ?? []

  return (
    <div className="space-y-6">
      <datalist id="modelos-autorizados">{modelosOpenAI.map((m) => <option key={m} value={m} />)}</datalist>
      {agentes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sin agentes configurados</CardTitle>
            <CardDescription>
              {puedeAdministrar
                ? "Cree el orquestador y los agentes especialistas predeterminados de esta empresa."
                : "Un administrador debe crear los agentes de esta empresa."}
            </CardDescription>
          </CardHeader>
          {puedeAdministrar && (
            <CardContent>
              <FormularioAccion accion={accionInicializarAgentes} etiqueta="Crear agentes predeterminados" />
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {agentes.map((agente) => (
          <Card key={agente.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{agente.nombre}</CardTitle>
                <Badge variant="outline">{agente.tipo === "ORQUESTADOR" ? "Orquestador" : "Especialista"}</Badge>
                <Badge variant={agente.activo ? "default" : "secondary"}>{agente.activo ? "Activo" : "Inactivo"}</Badge>
              </div>
              <CardDescription>
                {agente.descripcion ?? "Sin descripción."}
                {agente.orquestador && ` Coordinado por ${agente.orquestador.nombre}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium">Modelos asignados</p>
                {agente.asignaciones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin modelo asignado.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {agente.asignaciones.map((a) => (
                      <li key={a.id}>
                        <span className="text-muted-foreground">Prioridad {a.prioridad}:</span>{" "}
                        {PROVEEDORES[a.proveedor].nombre} · <span className="font-mono text-xs">{a.modelo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {puedeAdministrar && (
                <>
                  <FormularioAccion accion={accionAsignarModelo} etiqueta="Asignar modelo" variante="outline">
                    <input type="hidden" name="agenteId" value={agente.id} />
                    <div className="grid grid-cols-[1fr_1fr_4rem] gap-2">
                      <select name="proveedor" aria-label="Proveedor" className={claseCampo} required>
                        {habilitados.length === 0 && <option value="">Sin proveedores habilitados</option>}
                        {habilitados.map((p) => (
                          <option key={p.proveedor} value={p.proveedor}>
                            {PROVEEDORES[p.proveedor].nombre}
                          </option>
                        ))}
                      </select>
                      <input name="modelo" aria-label="Modelo" placeholder="Modelo" list="modelos-autorizados" maxLength={100} className={claseCampo} required />
                      <input name="prioridad" aria-label="Prioridad" type="number" min={1} max={5} defaultValue={1} className={claseCampo} />
                    </div>
                  </FormularioAccion>
                  <FormularioAccion
                    accion={accionCambiarEstadoAgente}
                    etiqueta={agente.activo ? "Desactivar" : "Activar"}
                    variante="ghost"
                  >
                    <input type="hidden" name="agenteId" value={agente.id} />
                    <input type="hidden" name="activo" value={String(!agente.activo)} />
                  </FormularioAccion>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {puedeAdministrar && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo agente</CardTitle>
            <CardDescription>Los agentes nuevos quedan coordinados por el orquestador, si existe.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAccion accion={accionCrearAgente} etiqueta="Crear agente">
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="codigo" aria-label="Código" placeholder="codigo-unico" maxLength={40} className={claseCampo} required />
                <input name="nombre" aria-label="Nombre" placeholder="Nombre del agente" maxLength={80} className={claseCampo} required />
              </div>
              <input name="descripcion" aria-label="Descripción" placeholder="Descripción (opcional)" maxLength={500} className={claseCampo} />
              <textarea
                name="instrucciones"
                aria-label="Instrucciones"
                placeholder="Instrucciones del agente (opcional)"
                maxLength={4000}
                rows={3}
                className={`${claseCampo} h-auto py-1.5`}
              />
            </FormularioAccion>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
