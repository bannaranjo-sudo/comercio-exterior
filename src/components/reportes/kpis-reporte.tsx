import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, Hash } from "lucide-react"

import { TarjetaKpi, type Tono } from "@/components/comun/comunes"
import type { Kpi } from "@/lib/reportes/tipos"

const ICONO = { primary: Activity, success: CheckCircle2, warning: AlertTriangle, danger: AlertOctagon, neutral: Hash } as const

export function KpisReporte({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) return null
  return (
    <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => {
        const tono: Tono = k.tono ?? "primary"
        return <TarjetaKpi key={k.etiqueta} titulo={k.etiqueta} valor={<span className="break-words">{k.valor}</span>} icono={ICONO[tono]} tono={tono} detalle={k.detalle} href={k.href} />
      })}
    </section>
  )
}
