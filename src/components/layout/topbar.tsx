"use client"

import { usePathname } from "next/navigation"
import { Building2, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { MenuUsuario, type DatosSesion } from "@/components/layout/menu-usuario"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { moduloActivo } from "@/config/modulos"

type Props = {
  colapsado: boolean
  alAlternarColapso: () => void
  alAbrirMenu: () => void
  sesion: DatosSesion
}

export function Topbar({ colapsado, alAlternarColapso, alAbrirMenu, sesion }: Props) {
  const { nombre } = moduloActivo(usePathname())
  const IconoColapso = colapsado ? PanelLeftOpen : PanelLeftClose

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={alAbrirMenu} aria-label="Abrir menú de navegación">
        <Menu className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={alAlternarColapso}
        aria-label={colapsado ? "Expandir barra lateral" : "Contraer barra lateral"}
      >
        <IconoColapso className="size-4" aria-hidden />
      </Button>

      <p className="truncate text-sm font-semibold tracking-tight">{nombre}</p>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <span
          className="hidden max-w-56 items-center gap-1.5 truncate rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground md:inline-flex"
          title="Empresa activa"
        >
          <Building2 className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{sesion.empresa.nombre}</span>
        </span>
        <ThemeToggle />
        <MenuUsuario {...sesion} />
      </div>
    </header>
  )
}
