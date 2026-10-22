import { cn } from "@/lib/utils"

export type EstadoPaso = "completado" | "actual" | "disponible" | "proximamente"

export type Paso = { titulo: string; detalle: string; estado: EstadoPaso }

const ETIQUETA: Record<EstadoPaso, string> = {
  completado: "Listo",
  actual: "En curso",
  disponible: "Disponible",
  proximamente: "Próximamente",
}

/**
 * Estructura visual reutilizable del flujo de análisis. Los pasos que aún no existen se muestran
 * explícitamente como "Próximamente": nunca se presentan como funcionales.
 */
export function PasosAnalisis({ pasos }: { pasos: Paso[] }) {
  return (
    <ol
      className="grid gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--pasos),minmax(0,1fr))]"
      style={{ "--pasos": pasos.length } as React.CSSProperties}
      aria-label="Pasos del análisis"
    >
      {pasos.map((p, i) => (
        <li
          key={p.titulo}
          className={cn(
            "rounded-lg border p-3 text-sm",
            p.estado === "actual" && "border-primary bg-info-soft/60",
            p.estado === "completado" && "border-success/40 bg-success-soft/50",
            p.estado === "proximamente" && "border-dashed bg-muted/40 text-muted-foreground",
          )}
          aria-current={p.estado === "actual" ? "step" : undefined}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                p.estado === "actual" ? "bg-primary text-primary-foreground" : p.estado === "completado" ? "bg-success text-white dark:text-background" : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide">{ETIQUETA[p.estado]}</span>
          </div>
          <p className="font-medium text-foreground">{p.titulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{p.detalle}</p>
        </li>
      ))}
    </ol>
  )
}

/** Los cinco pasos del flujo completo; `actual` indica el paso vigente (1–5) y `hasta` los ya funcionales. */
export function pasosFlujo(opciones: { actual: 1 | 2 | 3; ejecucionDisponible: boolean }): Paso[] {
  const { actual, ejecucionDisponible } = opciones
  const estado = (n: number, funcional: boolean): EstadoPaso =>
    n < actual ? "completado" : n === actual ? "actual" : funcional ? "disponible" : "proximamente"
  return [
    { titulo: "Tipo de análisis", detalle: "Elija qué desea analizar.", estado: estado(1, true) },
    { titulo: "Operación e insumos", detalle: "Vincule una operación o describa lo que necesita.", estado: estado(2, true) },
    { titulo: "Revisar antes de ejecutar", detalle: "Confirme la información que se utilizará.", estado: estado(3, ejecucionDisponible) },
    { titulo: "Resultado", detalle: "Consulte el resultado del análisis.", estado: ejecucionDisponible ? "disponible" : "proximamente" },
    { titulo: "Aprobación humana", detalle: "Todo resultado se remite a una persona.", estado: ejecucionDisponible ? "disponible" : "proximamente" },
  ]
}
