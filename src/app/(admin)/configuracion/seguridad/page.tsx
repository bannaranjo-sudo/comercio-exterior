import { LogOut } from "lucide-react"

import { Alerta, Seccion } from "@/components/comun/comunes"
import { ListaPermisos } from "@/components/configuracion/lista-permisos"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { cerrarSesion } from "@/lib/auth/acciones"
import { exigirMembresiaEmpresaActiva } from "@/lib/auth/sesion"
import { db } from "@/lib/db"

export const metadata = { title: "Seguridad y preferencias · Configuración" }

export default async function Page() {
  const ctx = await exigirMembresiaEmpresaActiva()
  const [usuario, empresa] = await Promise.all([
    db.usuario.findUniqueOrThrow({ where: { id: ctx.usuarioId }, select: { nombre: true, correo: true } }),
    db.empresa.findUniqueOrThrow({ where: { id: ctx.empresaId }, select: { nombreComercial: true, razonSocial: true } }),
  ])

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo="Su sesión" descripcion="Cuenta y empresa con las que está trabajando.">
          <dl className="space-y-3 text-sm">
            {(
              [
                ["Usuario", usuario.nombre],
                ["Correo", usuario.correo],
                ["Empresa activa", empresa.nombreComercial ?? empresa.razonSocial],
                ["Rol en la empresa", ctx.rolNombre],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <form action={cerrarSesion} className="mt-4">
            <Button type="submit" variant="outline">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </Button>
          </form>
        </Seccion>

        <Seccion titulo="Preferencias" descripcion="Se guardan en este navegador.">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <p className="font-medium">Apariencia</p>
              <p className="text-muted-foreground">Alterne entre modo claro y oscuro.</p>
            </div>
            <ThemeToggle />
          </div>
        </Seccion>
      </div>

      <Seccion titulo="Sus permisos efectivos" descripcion="Calculados desde su rol en la empresa activa.">
        <ListaPermisos codigos={ctx.permisos} />
      </Seccion>

      <Seccion titulo="Medidas de seguridad vigentes" descripcion="Información de lo que el sistema aplica hoy.">
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>Sesión de 8 horas con cookie protegida (httpOnly); cada solicitud valida su sesión y su empresa en el servidor.</li>
          <li>Aislamiento de información por empresa en consultas, escrituras y relaciones de la base de datos.</li>
          <li>Sin registro público: las cuentas nuevas se activan con un enlace de un solo uso que vence en 48 horas.</li>
          <li>Documentos almacenados de forma privada y entregados solo mediante una ruta autenticada y autorizada.</li>
          <li>Credenciales de proveedores de IA solo en variables de entorno del servidor.</li>
        </ul>
        <Alerta tono="info" className="mt-4">
          El cambio de contraseña desde la aplicación y la verificación en dos pasos todavía no están disponibles.
        </Alerta>
      </Seccion>
    </div>
  )
}
