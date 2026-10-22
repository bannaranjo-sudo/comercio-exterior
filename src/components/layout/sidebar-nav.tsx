"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, Ship } from "lucide-react"

import type { DatosSesion } from "@/components/layout/menu-usuario"
import { grupos, moduloActivo } from "@/config/modulos"
import { cn } from "@/lib/utils"

type Props = {
  colapsado?: boolean
  alNavegar?: () => void
  sesion: DatosSesion
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")

export function SidebarNav({ colapsado = false, alNavegar, sesion }: Props) {
  const actual = moduloActivo(usePathname())
  const permisos = new Set(sesion.permisos)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Ship className="size-4" aria-hidden />
        </span>
        {!colapsado && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-tight text-white">Comercio Exterior</span>
            <span className="block truncate text-[11px] text-sidebar-muted">Operación y logística</span>
          </span>
        )}
      </div>

      <div className="shrink-0 border-b border-sidebar-border p-3">
        {colapsado ? (
          <span
            className="mx-auto flex size-9 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-semibold text-white"
            title={`Empresa activa: ${sesion.empresa.nombre}`}
            role="img"
            aria-label={`Empresa activa: ${sesion.empresa.nombre}`}
          >
            {iniciales(sesion.empresa.nombre)}
          </span>
        ) : (
          <div className="rounded-lg bg-sidebar-accent p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">Empresa activa</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-white" title={sesion.empresa.nombre}>
              {sesion.empresa.nombre}
            </p>
            {sesion.multiempresa && (
              <Link
                href="/seleccionar-empresa"
                onClick={alNavegar}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-sidebar-muted outline-none hover:text-white focus-visible:text-white focus-visible:underline"
              >
                <ArrowLeftRight className="size-3" aria-hidden /> Cambiar empresa
              </Link>
            )}
          </div>
        )}
      </div>

      <nav aria-label="Principal" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin]">
        {grupos.map((grupo) => {
          const visibles = grupo.items.filter((m) => !m.permiso || permisos.has(m.permiso))
          if (visibles.length === 0) return null
          return (
            <div key={grupo.titulo}>
              {colapsado ? (
                <div className="mx-2 mb-2 border-t border-sidebar-border" role="separator" />
              ) : (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">{grupo.titulo}</p>
              )}
              <ul className="space-y-0.5">
                {visibles.map(({ nombre, href, icono: Icono }) => {
                  const activo = actual.href === href
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={alNavegar}
                        title={colapsado ? nombre : undefined}
                        aria-current={activo ? "page" : undefined}
                        className={cn(
                          "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                          activo
                            ? "bg-sidebar-accent text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white",
                          colapsado && "justify-center",
                        )}
                      >
                        <Icono className={cn("size-4 shrink-0", activo && "text-sidebar-primary")} aria-hidden />
                        {colapsado ? <span className="sr-only">{nombre}</span> : <span className="truncate">{nombre}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
