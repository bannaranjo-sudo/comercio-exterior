"use client"

import { useActionState, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EstadoAccion } from "@/lib/acciones"

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>
  etiqueta: string
  variante?: "default" | "outline" | "secondary" | "ghost"
  className?: string
  /** Vacía los campos cuando la acción termina correctamente (formularios de alta). */
  limpiarAlExito?: boolean
  children?: React.ReactNode
}

/** Formulario que ejecuta una acción de servidor protegida y muestra el resultado. */
export function FormularioAccion({ accion, etiqueta, variante = "default", className, limpiarAlExito, children }: Props) {
  const [estado, ejecutar, pendiente] = useActionState(accion, {} as EstadoAccion)
  const formulario = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (limpiarAlExito && estado.ok) formulario.current?.reset()
  }, [estado, limpiarAlExito])

  return (
    <form ref={formulario} action={ejecutar} className={cn("space-y-3", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={variante} disabled={pendiente}>
          {pendiente ? "Guardando…" : etiqueta}
        </Button>
        {estado.error && (
          <p role="alert" className="text-sm text-destructive">
            {estado.error}
          </p>
        )}
        {estado.ok && !estado.error && (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            {estado.ok}
          </p>
        )}
      </div>
    </form>
  )
}
