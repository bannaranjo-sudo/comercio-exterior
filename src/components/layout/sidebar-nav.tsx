"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Ship } from "lucide-react"

import { modulos, moduloActivo } from "@/config/modulos"
import { cn } from "@/lib/utils"

type Props = {
  colapsado?: boolean
  alNavegar?: () => void
}

export function SidebarNav({ colapsado = false, alNavegar }: Props) {
  const actual = moduloActivo(usePathname())

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Ship className="size-4" aria-hidden />
        </span>
        {!colapsado && (
          <span className="truncate text-sm font-semibold tracking-tight">
            Comercio Exterior
          </span>
        )}
      </div>
      <nav aria-label="Principal" className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {modulos.map(({ nombre, href, icono: Icono }) => {
            const activo = actual.href === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={alNavegar}
                  title={colapsado ? nombre : undefined}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    activo
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    colapsado && "justify-center",
                  )}
                >
                  <Icono className="size-4 shrink-0" aria-hidden />
                  {colapsado ? (
                    <span className="sr-only">{nombre}</span>
                  ) : (
                    <span className="truncate">{nombre}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
