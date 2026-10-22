import { ClipboardCheck, FileSearch, Landmark, Scale, type LucideIcon } from "lucide-react"

import { EnlaceBoton } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { TipoAnalisis } from "@/lib/inteligencia/tipos-analisis"
import { cn } from "@/lib/utils"

const ICONO: Record<TipoAnalisis["id"], { icono: LucideIcon; clase: string }> = {
  documental: { icono: FileSearch, clase: "bg-info-soft text-info-foreground" },
  arancelario: { icono: Scale, clase: "bg-warning-soft text-warning-foreground" },
  financiero: { icono: Landmark, clase: "bg-success-soft text-success-foreground" },
  expediente: { icono: ClipboardCheck, clase: "bg-neutral-soft text-neutral-foreground" },
}

type Props = {
  tipo: TipoAnalisis
  puedeSolicitar: boolean
  /** El agente que atiende este tipo existe y está activo (solo aplica a análisis con IA). */
  agenteConfigurado: boolean
  puedeConfigurarAgentes: boolean
}

/** Tarjeta de un tipo de análisis con su disponibilidad real. */
export function TarjetaAnalisis({ tipo, puedeSolicitar, agenteConfigurado, puedeConfigurarAgentes }: Props) {
  const { icono: Icono, clase } = ICONO[tipo.id]
  const disponible = tipo.disponibilidad === "disponible"
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", clase)}>
            <Icono className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{tipo.nombre}</h3>
              {disponible ? (
                <Badge className="bg-success-soft text-success-foreground">Disponible</Badge>
              ) : (
                <Badge variant="outline" className="border-warning/50 text-warning-foreground">Próximamente</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tipo.descripcion}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requiere</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
            {tipo.requiere.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        {!disponible && (
          <p className="rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            {agenteConfigurado
              ? "Agente configurado. La ejecución del análisis aún no está implementada: por ahora solo se registra la solicitud en cola."
              : "Aún no hay un agente activo para este análisis. La ejecución tampoco está implementada."}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {disponible ? (
            puedeSolicitar ? (
              <EnlaceBoton href={`/inteligencia/nuevo/${tipo.id}`}>Iniciar análisis</EnlaceBoton>
            ) : (
              <Button disabled>Iniciar análisis</Button>
            )
          ) : (
            <Button disabled title="La ejecución de este análisis aún no está disponible">
              Iniciar análisis
            </Button>
          )}
          {!disponible && puedeSolicitar && agenteConfigurado && (
            <EnlaceBoton href={`/inteligencia/nuevo/${tipo.id}`} variante="outline">
              Registrar solicitud
            </EnlaceBoton>
          )}
          {!disponible && puedeSolicitar && !agenteConfigurado && puedeConfigurarAgentes && (
            <EnlaceBoton href="/configuracion/inteligencia" variante="ghost">
              Configurar agentes
            </EnlaceBoton>
          )}
          {!puedeSolicitar && <span className="text-xs text-muted-foreground">Su rol no permite solicitar análisis.</span>}
        </div>
      </CardContent>
    </Card>
  )
}
