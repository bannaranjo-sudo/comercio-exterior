import { AccesoDenegado } from "@/components/acceso-denegado"
import { Campo, EncabezadoPagina, Entrada, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  accionAgregarUsuario, accionCambiarEstadoMiembro, accionCambiarRolMiembro, accionReenviarInvitacion,
} from "@/lib/administracion/acciones"
import { empresasAutorizadas, listarMiembros, listarRolesEmpresa } from "@/lib/administracion/servicio"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"

export const metadata = { title: "Administración · Comercio Exterior" }

const NOMBRE_MODULO: Record<string, string> = {
  administracion: "Administración", operaciones: "Operaciones", logistica: "Logística", inventarios: "Inventarios", costos: "Costos",
  documentos: "Documentos", terceros: "Terceros", reportes: "Reportes", inteligencia: "Centro de Inteligencia",
}

const agrupar = (codigos: Iterable<string>): [string, string[]][] => {
  const mapa = new Map<string, string[]>()
  for (const c of [...codigos].sort()) {
    const [modulo, accion] = c.split(":")
    mapa.set(modulo, [...(mapa.get(modulo) ?? []), accion.replaceAll("_", " ")])
  }
  return [...mapa.entries()]
}

function ListaPermisos({ codigos }: { codigos: Iterable<string> }) {
  const grupos = agrupar(codigos)
  if (grupos.length === 0) return <p className="text-sm text-muted-foreground">Sin permisos.</p>
  return (
    <ul className="space-y-1 text-xs">
      {grupos.map(([modulo, acciones]) => (
        <li key={modulo}>
          <span className="font-medium">{NOMBRE_MODULO[modulo] ?? modulo}</span>: <span className="text-muted-foreground">{acciones.join(", ")}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("administracion:consultar")
  if (!ctx) return <AccesoDenegado detalle="No tiene permiso para consultar la administración de esta empresa." />
  const puedeAdministrar = ctx.permisos.has("administracion:administrar")
  const [empresas, miembros, roles] = await Promise.all([empresasAutorizadas(ctx), listarMiembros(ctx), listarRolesEmpresa(ctx)])
  const opcionesRol = roles.map((r) => [r.id, r.nombre] as const)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina titulo="Administración" descripcion="Usuarios, roles y permisos de la empresa activa." />

      <Seccion titulo="Empresas autorizadas" descripcion="Empresas a las que pertenece su usuario.">
        <ul className="flex flex-wrap gap-2 text-sm">
          {empresas.map((e) => (
            <li key={e.id}>
              <Badge variant={e.activa ? "default" : "outline"}>
                {e.nombre} · {e.rol}
                {e.activa ? " (activa)" : ""}
              </Badge>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Usuarios de la empresa" descripcion={`${miembros.length} usuario(s). Los cambios solo afectan a esta empresa.`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Acceso</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {miembros.map((m) => (
                <TableRow key={m.usuarioId}>
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
                      m.rolNombre
                    )}
                    <details className="mt-1 text-left">
                      <summary className="cursor-pointer text-xs text-muted-foreground">Permisos efectivos</summary>
                      <div className="mt-1"><ListaPermisos codigos={m.permisos} /></div>
                    </details>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <Badge variant={m.membresiaActiva && m.usuarioActivo ? "default" : "secondary"}>{m.membresiaActiva && m.usuarioActivo ? "Activo" : "Inactivo"}</Badge>
                    {!m.tieneCredenciales && <Badge variant="outline">{m.invitacionVigente ? "Invitación pendiente" : "Sin activar"}</Badge>}
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

      {puedeAdministrar && (
        <Seccion
          titulo="Agregar usuario"
          descripcion="Si el correo es nuevo, se genera un enlace de activación de un solo uso para que la persona defina su propia contraseña. No existen contraseñas predeterminadas."
        >
          <FormularioAccion accion={accionAgregarUsuario} etiqueta="Agregar usuario" limpiarAlExito>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Correo electrónico *" nombre="correo"><Entrada name="correo" type="email" maxLength={200} required /></Campo>
              <Campo etiqueta="Nombre completo *" nombre="nombre"><Entrada name="nombre" maxLength={120} required /></Campo>
              <Campo etiqueta="Rol *" nombre="rolId"><Selector name="rolId" opciones={opcionesRol} /></Campo>
            </div>
          </FormularioAccion>
        </Seccion>
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
