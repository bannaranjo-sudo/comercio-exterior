import { AccesoDenegado } from "@/components/acceso-denegado"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { claseCampo } from "@/components/inteligencia/estilos"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionGuardarProveedor, accionProbarConexion } from "@/lib/inteligencia/acciones"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { estadoIntegracion, listarProveedores, listarUso } from "@/lib/inteligencia/servicio"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata = { title: "Configuración de IA · Comercio Exterior" }

const fecha = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" })

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const puedeConfigurar = ctx.permisos.has("inteligencia:configurar")
  const [proveedores, uso] = await Promise.all([listarProveedores(ctx), listarUso(ctx)])
  const integracion = estadoIntegracion()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Habilite los proveedores que esta empresa podrá usar. Las credenciales (claves de API) no se
        capturan ni almacenan en esta etapa.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {proveedores.map(({ proveedor, habilitado, notas }) => (
          <Card key={proveedor}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{PROVEEDORES[proveedor].nombre}</CardTitle>
                <Badge variant={habilitado ? "default" : "secondary"}>
                  {habilitado ? "Habilitado" : "Deshabilitado"}
                </Badge>
              </div>
              <CardDescription>Sin adaptador conectado.</CardDescription>
            </CardHeader>
            <CardContent>
              {puedeConfigurar ? (
                <FormularioAccion accion={accionGuardarProveedor} etiqueta="Guardar">
                  <input type="hidden" name="proveedor" value={proveedor} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="habilitado" defaultChecked={habilitado} className="size-4" />
                    Habilitar para esta empresa
                  </label>
                  <textarea
                    name="notas"
                    defaultValue={notas}
                    maxLength={500}
                    rows={2}
                    aria-label={`Notas de ${PROVEEDORES[proveedor].nombre}`}
                    placeholder="Notas internas (opcional)"
                    className={`${claseCampo} h-auto py-1.5`}
                  />
                </FormularioAccion>
              ) : (
                <p className="text-sm text-muted-foreground">{notas || "Solo lectura."}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Conexión con OpenAI</CardTitle>
            <Badge variant={integracion.claveOpenAIConfigurada ? "default" : "secondary"}>
              {integracion.claveOpenAIConfigurada ? "Clave del servidor configurada" : "Clave del servidor no configurada"}
            </Badge>
            <Badge variant={integracion.pruebaRealAutorizada ? "default" : "secondary"}>
              {integracion.pruebaRealAutorizada ? "Prueba real autorizada" : "Prueba real no autorizada"}
            </Badge>
          </div>
          <CardDescription>
            La clave se define solo como variable de entorno del servidor. La prueba envía un mensaje mínimo y
            muestra únicamente estado, modelo y consumo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {puedeConfigurar ? (
            <FormularioAccion accion={accionProbarConexion} etiqueta="Probar conexión" variante="outline">
              <input type="hidden" name="proveedor" value="OPENAI" />
              <select name="modelo" aria-label="Modelo de OpenAI" className={claseCampo} required>
                {integracion.modelosOpenAI.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FormularioAccion>
          ) : (
            <p className="text-sm text-muted-foreground">Solo quienes configuran el módulo pueden probar la conexión.</p>
          )}

          {uso.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Tokens (ent./sal.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uso.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{fecha.format(u.creadoEn)}</TableCell>
                    <TableCell>{PROVEEDORES[u.proveedor].nombre} · {u.modelo}</TableCell>
                    <TableCell>
                      <Badge variant={u.estado === "FALLIDA" ? "destructive" : "secondary"}>
                        {u.estado === "FALLIDA" ? `Fallida (${u.codigoError})` : u.estado === "EXITOSA" ? "Exitosa" : "En curso"}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.duracionMs === null ? "—" : `${u.duracionMs} ms`}</TableCell>
                    <TableCell>{u.tokensEntrada ?? "—"} / {u.tokensSalida ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
