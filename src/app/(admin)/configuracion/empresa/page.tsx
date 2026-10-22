import { Alerta, Seccion } from "@/components/comun/comunes"
import { InsigniaEstado } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { empresasAutorizadas } from "@/lib/administracion/servicio"
import { exigirMembresiaEmpresaActiva } from "@/lib/auth/sesion"
import { db } from "@/lib/db"
import { formatearFecha } from "@/lib/formato"

export const metadata = { title: "Empresa · Configuración" }

export default async function Page() {
  const ctx = await exigirMembresiaEmpresaActiva()
  const [empresa, autorizadas, usuariosActivos] = await Promise.all([
    db.empresa.findUniqueOrThrow({ where: { id: ctx.empresaId } }),
    empresasAutorizadas(ctx),
    db.empresaUsuario.count({ where: { empresaId: ctx.empresaId, activo: true, usuario: { activo: true } } }),
  ])
  const datos: [string, React.ReactNode][] = [
    ["Razón social", empresa.razonSocial],
    ["Nombre comercial", empresa.nombreComercial ?? "—"],
    ["Identificación fiscal", empresa.identificacionFiscal],
    ["Estado", <InsigniaEstado key="e" valor={empresa.activa ? "ACTIVO" : "INACTIVO"} etiqueta={empresa.activa ? "Activa" : "Inactiva"} />],
    ["Usuarios activos", String(usuariosActivos)],
    ["Registrada", formatearFecha(empresa.creadoEn)],
  ]

  return (
    <div className="space-y-6">
      <Seccion titulo="Datos de la empresa" descripcion="Información registrada de la empresa activa.">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {datos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <Alerta tono="info" className="mt-4">
          La edición de los datos de la empresa todavía no está disponible. Hoy esta sección es de solo lectura.
        </Alerta>
      </Seccion>

      <Seccion titulo="Empresas autorizadas" descripcion="Empresas a las que pertenece su usuario. Use «Cambiar empresa» en el menú lateral para alternar.">
        <ul className="flex flex-wrap gap-2 text-sm">
          {autorizadas.map((e) => (
            <li key={e.id}>
              <Badge variant={e.activa ? "default" : "outline"}>
                {e.nombre} · {e.rol}
                {e.activa ? " (activa)" : ""}
              </Badge>
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}
