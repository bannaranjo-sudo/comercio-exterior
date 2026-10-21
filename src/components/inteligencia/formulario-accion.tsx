"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EstadoAccion } from "@/lib/inteligencia/acciones"

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>
  etiqueta: string
  variante?: "default" | "outline" | "secondary" | "ghost"
  className?: string
  children?: React.ReactNode
}

/** Formulario que ejecuta una acción de servidor protegida y muestra el resultado. */
export function FormularioAccion({ accion, etiqueta, variante = "default", className, children }: Props) {
  const [estado, ejecutar, pendiente] = useActionState(accion, {} as EstadoAccion)

  return (
    <form action={ejecutar} className={cn("space-y-3", className)}>
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
          <p role="status" className="text-sm text-muted-foreground">
            {estado.ok}
          </p>
        )}
      </div>
    </form>
  )
}
