import { LogOut } from "lucide-react"

import { cerrarSesion } from "@/lib/auth/acciones"
import { Button } from "@/components/ui/button"

export type DatosSesion = {
  usuario: { nombre: string; correo: string }
  empresa: { nombre: string }
  rol: string
  multiempresa: boolean
  /** Permisos efectivos en la empresa activa; solo para mostrar u ocultar entradas (el servidor siempre valida). */
  permisos: string[]
}

export function MenuUsuario({ usuario, rol }: DatosSesion) {
  return (
    <div className="flex items-center gap-1">
      <div className="hidden min-w-0 text-right leading-tight sm:block">
        <p className="truncate text-sm font-medium">{usuario.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">{rol}</p>
      </div>
      <form action={cerrarSesion}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  )
}
