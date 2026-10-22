"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

/** Navegación por pestañas del expediente de una operación. */
export function PestanasOperacion({ id }: { id: string }) {
  const actual = usePathname()
  const pestanas = [
    { nombre: "General", href: `/operaciones/${id}` },
    { nombre: "Documentos", href: `/operaciones/${id}/documentos` },
    { nombre: "Logística", href: `/operaciones/${id}/logistica` },
    { nombre: "Costos", href: `/operaciones/${id}/costos` },
    { nombre: "Inteligencia", href: `/operaciones/${id}/inteligencia` },
  ]
  return (
    <nav aria-label="Secciones del expediente" className="flex gap-1 overflow-x-auto border-b">
      {pestanas.map(({ nombre, href }) => {
        const activo = actual === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activo ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {nombre}
          </Link>
        )
      })}
    </nav>
  )
}
