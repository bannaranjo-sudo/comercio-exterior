"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { EstadoAccion } from "@/lib/acciones"

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>
  aprobacionId: string
  /** Identificador único del campo (varios formularios en una misma página). */
  idCampo: string
}

/** Decisión humana sobre un resultado: aprobar, rechazar o devolver con observaciones (obligatorias al devolver). */
export function DecisionRevision({ accion, aprobacionId, idCampo }: Props) {
  const [estado, ejecutar, pendiente] = useActionState(accion, {} as EstadoAccion)
  return (
    <form action={ejecutar} className="space-y-3">
      <input type="hidden" name="aprobacionId" value={aprobacionId} />
      <div className="grid gap-1">
        <label htmlFor={idCampo} className="text-sm font-medium">Observaciones <span className="font-normal text-muted-foreground">(obligatorias para devolver)</span></label>
        <textarea
          id={idCampo}
          name="comentario"
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" name="decision" value="APROBADO" disabled={pendiente}>Aprobar</Button>
        <Button type="submit" size="sm" variant="outline" name="decision" value="DEVUELTO" disabled={pendiente}>Devolver con observaciones</Button>
        <Button type="submit" size="sm" variant="outline" name="decision" value="RECHAZADO" disabled={pendiente}>Rechazar</Button>
        {estado.error && <p role="alert" className="text-sm text-destructive">{estado.error}</p>}
        {estado.ok && !estado.error && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{estado.ok}</p>}
      </div>
    </form>
  )
}
