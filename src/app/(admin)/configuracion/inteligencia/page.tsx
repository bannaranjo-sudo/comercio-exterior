import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, AreaTexto, Campo, Entrada, InsigniaEstado, Selector, Seccion } from "@/components/comun/comunes"
import { claseCampo } from "@/components/inteligencia/estilos"
import { EstadoCapacidades } from "@/components/inteligencia/estado-capacidades"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirMembresiaEmpresaActiva } from "@/lib/auth/sesion"
import { puedeVerSeccion, SECCIONES_CONFIGURACION } from "@/lib/configuracion"
import { formatearFechaHora } from "@/lib/formato"
import {
  accionAsignarModelo, accionCambiarEstadoAgente, accionCrearAgente, accionGuardarProveedor,
  accionInicializarAgentes, accionProbarConexion,
} from "@/lib/inteligencia/acciones"
import { LIMITES } from "@/lib/inteligencia/limites"
import { modelosPermitidos } from "@/lib/inteligencia/modelos"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { estadoIntegracion, listarAgentes, listarProveedores, listarUso } from "@/lib/inteligencia/servicio"
import { estadoCapacidades } from "@/lib/inteligencia/vistas"

export const metadata = { title: "Inteligencia artificial · Configuración" }

const ESTADO_PRUEBA = { EXITOSA: "Generación exitosa", FALLIDA: "Fallida", SIN_CONTENIDO: "API accesible, sin texto", EN_CURSO: "En curso" } as const

export default async function Page() {
  const ctx = await exigirMembresiaEmpresaActiva()
  // Configuración técnica: más restrictiva que el Centro de Inteligencia operativo.
  if (!puedeVerSeccion(SECCIONES_CONFIGURACION.find((s) => s.id === "inteligencia")!, ctx.permisos)) {
    return <AccesoDenegado detalle="La configuración técnica de inteligencia artificial requiere permisos de configuración o administración de agentes." />
  }
  const puedeConfigurar = ctx.permisos.has("inteligencia:configurar")
  const puedeAdministrarAgentes = ctx.permisos.has("inteligencia:administrar_agentes")
  const [capacidades, proveedores, agentes, uso] = await Promise.all([
    estadoCapacidades(ctx), listarProveedores(ctx), listarAgentes(ctx), listarUso(ctx),
  ])
  const integracion = estadoIntegracion()
  const habilitados = proveedores.filter((p) => p.habilitado)
  const modelosOpenAI = modelosPermitidos("OPENAI") ?? []

  return (
    <div className="space-y-6">
      <Seccion titulo="Estado de la integración" descripcion="Niveles independientes: cada uno debe cumplirse por separado.">
        <EstadoCapacidades capacidades={capacidades} />
        {!capacidades.ejecutorImplementado && (
          <Alerta tono="warning" className="mt-4" titulo="Ejecución de análisis no disponible">
            OpenAI está integrado y la conexión puede verificarse, pero el ejecutor de análisis con agentes aún no está implementado. Las solicitudes
            solo se registran en cola.
          </Alerta>
        )}
      </Seccion>

      <section aria-labelledby="titulo-proveedores" className="space-y-3">
        <h2 id="titulo-proveedores" className="text-base font-semibold">Proveedores</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {capacidades.proveedores.map((p) => {
            const config = proveedores.find((x) => x.proveedor === p.proveedor)!
            return (
              <Card key={p.proveedor}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{PROVEEDORES[p.proveedor].nombre}</CardTitle>
                    <InsigniaEstado valor={p.habilitado ? "ACTIVO" : "INACTIVO"} etiqueta={p.habilitado ? "Habilitado" : "Deshabilitado"} />
                  </div>
                  <CardDescription>
                    {p.adaptadorDisponible ? "Adaptador disponible" : "Adaptador no implementado"} ·{" "}
                    {p.credencialConfigurada ? "credencial configurada" : "sin credencial"} ·{" "}
                    {p.conexionVerificada ? `conexión verificada (${formatearFechaHora(p.conexionVerificada.fecha)})` : "conexión sin verificar"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {puedeConfigurar ? (
                    <FormularioAccion accion={accionGuardarProveedor} etiqueta="Guardar" variante="outline">
                      <input type="hidden" name="proveedor" value={p.proveedor} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="habilitado" defaultChecked={p.habilitado} className="size-4" />
                        Habilitar para esta empresa
                      </label>
                      <textarea name="notas" defaultValue={config.notas} maxLength={500} rows={2} aria-label={`Notas de ${PROVEEDORES[p.proveedor].nombre}`} placeholder="Notas internas (opcional)" className={`${claseCampo} h-auto py-1.5`} />
                    </FormularioAccion>
                  ) : (
                    <p className="text-sm text-muted-foreground">{config.notas || "Solo lectura: su rol no permite configurar proveedores."}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Seccion
        titulo="Conexión con OpenAI"
        descripcion="La clave existe solo como variable de entorno del servidor: no se guarda en la base de datos ni se muestra."
        accion={<Badge variant="outline">{integracion.pruebaRealAutorizada ? "Pruebas reales autorizadas" : "Pruebas reales no autorizadas"}</Badge>}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modelos autorizados</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {modelosOpenAI.map((m) => (
                <Badge key={m} variant="secondary" className="font-mono">{m}</Badge>
              ))}
            </div>
          </div>
          {puedeConfigurar ? (
            <FormularioAccion accion={accionProbarConexion} etiqueta="Probar conexión" variante="outline">
              <input type="hidden" name="proveedor" value="OPENAI" />
              <div className="max-w-xs">
                <Campo etiqueta="Modelo de prueba" nombre="modelo">
                  <Selector name="modelo" opciones={modelosOpenAI.map((m) => [m, m] as const)} />
                </Campo>
              </div>
            </FormularioAccion>
          ) : (
            <p className="text-sm text-muted-foreground">Solo quienes configuran el módulo pueden probar la conexión.</p>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registro técnico de pruebas</p>
            {uso.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no se han registrado pruebas de conexión.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead className="text-right">Duración</TableHead>
                      <TableHead className="text-right">Tokens ent. / sal.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uso.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-xs">{formatearFechaHora(u.creadoEn)}</TableCell>
                        <TableCell>{PROVEEDORES[u.proveedor].nombre} · {u.modelo}</TableCell>
                        <TableCell>
                          <InsigniaEstado valor={u.estado} etiqueta={u.estado === "FALLIDA" ? `Fallida (${u.codigoError})` : u.estado === "SIN_CONTENIDO" ? `${ESTADO_PRUEBA.SIN_CONTENIDO} (${u.motivoFin ?? "n/d"})` : ESTADO_PRUEBA[u.estado]} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{u.duracionMs === null ? "—" : `${u.duracionMs} ms`}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.tokensEntrada ?? "—"} / {u.tokensSalida ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </Seccion>

      <section aria-labelledby="titulo-agentes" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="titulo-agentes" className="text-base font-semibold">Agentes y modelos asignados</h2>
          <span className="text-sm text-muted-foreground">Cada agente puede usar su propio proveedor y modelo.</span>
        </div>

        {agentes.length === 0 && (
          <Alerta tono="info" titulo="Sin agentes configurados">
            {puedeAdministrarAgentes ? (
              <FormularioAccion accion={accionInicializarAgentes} etiqueta="Crear agentes predeterminados" className="mt-2" />
            ) : (
              "Un administrador debe crear los agentes de esta empresa."
            )}
          </Alerta>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {agentes.map((agente) => (
            <Card key={agente.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{agente.nombre}</CardTitle>
                  <Badge variant="outline">{agente.tipo === "ORQUESTADOR" ? "Orquestador" : "Especialista"}</Badge>
                  <InsigniaEstado valor={agente.activo ? "ACTIVO" : "INACTIVO"} etiqueta={agente.activo ? "Activo" : "Inactivo"} />
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
                          <span className="text-muted-foreground">Prioridad {a.prioridad}:</span> {PROVEEDORES[a.proveedor].nombre} ·{" "}
                          <span className="font-mono text-xs">{a.modelo}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {puedeAdministrarAgentes && (
                  <>
                    <FormularioAccion accion={accionAsignarModelo} etiqueta="Asignar modelo" variante="outline">
                      <input type="hidden" name="agenteId" value={agente.id} />
                      <div className="grid grid-cols-[1fr_1fr_4rem] gap-2">
                        <select name="proveedor" aria-label="Proveedor" className={claseCampo} required>
                          {habilitados.length === 0 && <option value="">Sin proveedores habilitados</option>}
                          {habilitados.map((p) => (
                            <option key={p.proveedor} value={p.proveedor}>{PROVEEDORES[p.proveedor].nombre}</option>
                          ))}
                        </select>
                        <input name="modelo" aria-label="Modelo" placeholder="Modelo" list="modelos-autorizados" maxLength={100} className={claseCampo} required />
                        <input name="prioridad" aria-label="Prioridad" type="number" min={1} max={5} defaultValue={1} className={claseCampo} />
                      </div>
                    </FormularioAccion>
                    <FormularioAccion accion={accionCambiarEstadoAgente} etiqueta={agente.activo ? "Desactivar" : "Activar"} variante="ghost">
                      <input type="hidden" name="agenteId" value={agente.id} />
                      <input type="hidden" name="activo" value={String(!agente.activo)} />
                    </FormularioAccion>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <datalist id="modelos-autorizados">{modelosOpenAI.map((m) => <option key={m} value={m} />)}</datalist>

        {puedeAdministrarAgentes && (
          <Seccion titulo="Nuevo agente" descripcion="Los agentes nuevos quedan coordinados por el orquestador, si existe.">
            <FormularioAccion accion={accionCrearAgente} etiqueta="Crear agente" limpiarAlExito>
              <div className="grid gap-3 sm:grid-cols-2">
                <Entrada name="codigo" aria-label="Código" placeholder="codigo-unico" maxLength={40} required />
                <Entrada name="nombre" aria-label="Nombre" placeholder="Nombre del agente" maxLength={80} required />
              </div>
              <Entrada name="descripcion" aria-label="Descripción" placeholder="Descripción (opcional)" maxLength={500} />
              <AreaTexto name="instrucciones" aria-label="Instrucciones" placeholder="Instrucciones del agente (opcional)" maxLength={4000} rows={3} />
            </FormularioAccion>
          </Seccion>
        )}
      </section>

      <Seccion titulo="Parámetros de seguridad y límites" descripcion="Valores vigentes definidos en el sistema (solo lectura).">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["Tokens de salida máximos", String(LIMITES.tokensSalidaMax)],
              ["Tokens de salida de la prueba", String(LIMITES.tokensSalidaPrueba)],
              ["Tiempo máximo por llamada", `${LIMITES.tiempoMaxMs / 1000} s`],
              ["Pruebas de conexión", `${LIMITES.pruebas.max} cada ${LIMITES.pruebas.ventanaMs / 60000} min por empresa`],
              ["Llamadas totales", `${LIMITES.solicitudes.max} por minuto por empresa`],
              ["Aprobación de resultados", "Siempre humana; nunca automática"],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Seccion>
    </div>
  )
}
