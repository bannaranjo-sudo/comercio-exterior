"use client"

import { usePathname } from "next/navigation"
import {
  Bell,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  User,
} from "lucide-react"

import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { moduloActivo } from "@/config/modulos"

type Props = {
  colapsado: boolean
  alAlternarColapso: () => void
  alAbrirMenu: () => void
}

export function Topbar({ colapsado, alAlternarColapso, alAbrirMenu }: Props) {
  const { nombre } = moduloActivo(usePathname())
  const IconoColapso = colapsado ? PanelLeftOpen : PanelLeftClose

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={alAbrirMenu}
        aria-label="Abrir menú de navegación"
      >
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

      <p className="truncate text-base font-semibold tracking-tight">{nombre}</p>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <div className="relative hidden md:block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Buscar…"
            aria-label="Buscar"
            className="w-56 pl-8 lg:w-72"
            disabled
          />
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buscar" disabled>
          <Search className="size-4" aria-hidden />
        </Button>
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Notificaciones" disabled>
          <Bell className="size-4" aria-hidden />
        </Button>
        <span
          className="ml-1 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
          title="Espacio reservado para el perfil"
          role="img"
          aria-label="Perfil (pendiente)"
        >
          <User className="size-4" aria-hidden />
        </span>
      </div>
    </header>
  )
}
