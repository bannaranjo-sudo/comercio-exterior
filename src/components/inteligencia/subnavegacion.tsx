"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const secciones = [
  { nombre: "Panel general", href: "/inteligencia" },
  { nombre: "Agentes", href: "/inteligencia/agentes" },
  { nombre: "Análisis", href: "/inteligencia/analisis" },
  { nombre: "Historial", href: "/inteligencia/historial" },
  { nombre: "Configuración", href: "/inteligencia/configuracion" },
]

export function Subnavegacion() {
  const actual = usePathname()
  return (
    <nav aria-label="Centro de Inteligencia" className="flex gap-1 overflow-x-auto border-b">
      {secciones.map(({ nombre, href }) => {
        const activo = actual === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activo
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {nombre}
          </Link>
        )
      })}
    </nav>
  )
}
