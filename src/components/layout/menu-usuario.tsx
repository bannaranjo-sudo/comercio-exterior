import { Building2, LogOut } from "lucide-react"
import Link from "next/link"

import { cerrarSesion } from "@/lib/auth/acciones"
import { Button } from "@/components/ui/button"

export type DatosSesion = {
  usuario: { nombre: string; correo: string }
  empresa: { nombre: string }
  rol: string
  multiempresa: boolean
}

export function MenuUsuario({ usuario, empresa, rol, multiempresa }: DatosSesion) {
  return (
    <div className="ml-1 flex items-center gap-1">
      <div className="hidden min-w-0 text-right leading-tight md:block">
        <p className="truncate text-sm font-medium">{empresa.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">
          {usuario.nombre} · {rol}
        </p>
      </div>
      {multiempresa && (
        <Link
          href="/seleccionar-empresa"
          aria-label="Cambiar de empresa"
          title="Cambiar de empresa"
          className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Building2 className="size-4" aria-hidden />
        </Link>
      )}
      <form action={cerrarSesion}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  )
}
