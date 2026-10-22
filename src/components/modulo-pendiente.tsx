import { Construction } from "lucide-react"

import { EncabezadoPagina, EstadoVacio } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Modulo } from "@/config/modulos"

// Alcance previsto de módulos que todavía no tienen funcionalidades. Es una descripción de lo planificado,
// no una funcionalidad disponible.
const ALCANCE_PREVISTO: Record<string, string[]> = {
  "/reportes": ["Informes operativos por periodo", "Informes de costos por operación", "Indicadores gerenciales", "Exportación de resultados"],
}

export function ModuloPendiente({ modulo }: { modulo: Modulo }) {
  const alcance = ALCANCE_PREVISTO[modulo.href] ?? []
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <EncabezadoPagina titulo={modulo.nombre} descripcion={modulo.descripcion} acciones={<Badge variant="outline" className="border-warning/50 text-warning-foreground">En desarrollo</Badge>} />
      <EstadoVacio
        icono={Construction}
        titulo="Este módulo todavía no está disponible"
        descripcion="Aún no tiene funcionalidades ni datos. Se implementará en una etapa posterior; mientras tanto no se muestra información de ejemplo."
      />
      {alcance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alcance previsto</CardTitle>
            <CardDescription>Planificación indicativa; sujeta a cambios.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {alcance.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
