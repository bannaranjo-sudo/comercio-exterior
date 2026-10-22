import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, Campo, Entrada, InsigniaEstado, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  accionAgregarUsuario, accionCambiarEstadoMiembro, accionCambiarRolMiembro, accionReenviarInvitacion,
} from "@/lib/administracion/acciones"
import { listarMiembros, listarRolesEmpresa } from "@/lib/administracion/servicio"
import { ListaPermisos } from "@/components/configuracion/lista-permisos"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"

export const metadata = { title: "Usuarios y accesos · Configuración" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("administracion:consultar")
  if (!ctx) return <AccesoDenegado detalle="No tiene permiso para consultar usuarios y accesos de esta empresa." />
  const puedeAdministrar = ctx.permisos.has("administracion:administrar")
  const [miembros, roles] = await Promise.all([listarMiembros(ctx), listarRolesEmpresa(ctx)])
  const opcionesRol = roles.map((r) => [r.id, r.nombre] as const)

  return (
    <div className="space-y-6">
      <Seccion titulo="Usuarios de la empresa" descripcion={`${miembros.length} usuario(s). Los cambios solo afectan a esta empresa; siempre debe quedar al menos un administrador activo.`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol y permisos</TableHead>
                <TableHead>Acceso</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {miembros.map((m) => (
                <TableRow key={m.usuarioId} className="align-top">
                  <TableCell>
                    <span className="font-medium">{m.nombre}</span>
                    <span className="block text-xs text-muted-foreground">{m.correo}</span>
                  </TableCell>
                  <TableCell>
                    {puedeAdministrar ? (
                      <FormularioAccion accion={accionCambiarRolMiembro} etiqueta="Cambiar" variante="outline" className="min-w-44">
                        <input type="hidden" name="usuarioId" value={m.usuarioId} />
                        <Selector name="rolId" defaultValue={m.rolId} opciones={opcionesRol} aria-label={`Rol de ${m.nombre}`} />
                      </FormularioAccion>
                    ) : (
                      <Badge variant="outline">{m.rolNombre}</Badge>
                    )}
                    <details className="mt-1 text-left">
                      <summary className="cursor-pointer text-xs text-muted-foreground">Permisos efectivos</summary>
                      <div className="mt-1 whitespace-normal">
                        <ListaPermisos codigos={m.permisos} />
                      </div>
                    </details>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <InsigniaEstado valor={m.membresiaActiva && m.usuarioActivo ? "ACTIVO" : "INACTIVO"} etiqueta={m.membresiaActiva && m.usuarioActivo ? "Activo" : "Inactivo"} />
                      {!m.tieneCredenciales && <InsigniaEstado valor="PENDIENTE" etiqueta={m.invitacionVigente ? "Invitación pendiente" : "Sin activar"} />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {puedeAdministrar && (
                      <div className="flex flex-col items-end gap-2">
                        <FormularioAccion accion={accionCambiarEstadoMiembro} etiqueta={m.membresiaActiva ? "Desactivar" : "Activar"} variante="outline">
                          <input type="hidden" name="usuarioId" value={m.usuarioId} />
                          <input type="hidden" name="activo" value={String(!m.membresiaActiva)} />
                        </FormularioAccion>
                        {!m.tieneCredenciales && (
                          <FormularioAccion accion={accionReenviarInvitacion} etiqueta="Nuevo enlace de activación" variante="ghost">
                            <input type="hidden" name="usuarioId" value={m.usuarioId} />
                          </FormularioAccion>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Seccion>

      {puedeAdministrar ? (
        <Seccion
          titulo="Agregar usuario"
          descripcion="Si el correo es nuevo, se genera un enlace de activación de un solo uso (48 h) para que la persona defina su propia contraseña. No existen contraseñas predeterminadas."
        >
          <FormularioAccion accion={accionAgregarUsuario} etiqueta="Agregar usuario" limpiarAlExito>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Correo electrónico *" nombre="correo"><Entrada name="correo" type="email" maxLength={200} required /></Campo>
              <Campo etiqueta="Nombre completo *" nombre="nombre"><Entrada name="nombre" maxLength={120} required /></Campo>
              <Campo etiqueta="Rol *" nombre="rolId"><Selector name="rolId" opciones={opcionesRol} /></Campo>
            </div>
          </FormularioAccion>
        </Seccion>
      ) : (
        <Alerta tono="info">Puede consultar usuarios y permisos, pero su rol no permite administrarlos.</Alerta>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Roles de la empresa" descripcion="Permisos concedidos por cada rol.">
          <div className="space-y-4">
            {roles.map((r) => (
              <div key={r.id}>
                <p className="text-sm font-medium">{r.nombre}</p>
                {r.descripcion && <p className="text-xs text-muted-foreground">{r.descripcion}</p>}
                <div className="mt-1"><ListaPermisos codigos={r.permisos.map((p) => p.permiso.codigo)} /></div>
              </div>
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Sus permisos efectivos" descripcion="Calculados desde su rol en esta empresa.">
          <ListaPermisos codigos={ctx.permisos} />
        </Seccion>
      </div>
    </div>
  )
}
