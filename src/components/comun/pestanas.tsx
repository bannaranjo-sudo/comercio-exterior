"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export type ItemPestana = {
  nombre: string
  href: string
  /** Solo coincide con la ruta exacta (para la pestaña "índice"). */
  exacto?: boolean
  /** Prefijos adicionales que también marcan la pestaña como activa. */
  tambien?: string[]
  /** Contador opcional (p. ej. elementos pendientes); no se muestra si es 0 o indefinido. */
  contador?: number
}

/** Pestañas de navegación por rutas. Reemplaza a las pestañas específicas de cada módulo. */
export function Pestanas({ items, etiqueta }: { items: ItemPestana[]; etiqueta: string }) {
  const actual = usePathname()
  const coincide = (prefijo: string) => actual === prefijo || actual.startsWith(`${prefijo}/`)
  return (
    <nav aria-label={etiqueta} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {items.map((item) => {
        const activo = (item.exacto ? actual === item.href : coincide(item.href)) || (item.tambien?.some(coincide) ?? false)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:text-foreground focus-visible:underline",
              activo ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.nombre}
            {item.contador ? (
              <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold leading-none text-warning-foreground">
                {item.contador}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
