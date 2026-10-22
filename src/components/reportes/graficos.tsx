import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Grafico } from "@/lib/reportes/tipos"

// Gráficos sin dependencias: barras en HTML (accesibles y responsive) y columnas agrupadas en SVG.
// Los colores salen de los tokens --chart-N, que ya tienen variante para modo oscuro.

const SERIES = ["bg-chart-1", "bg-chart-2", "bg-chart-3"]
const SERIES_SVG = ["fill-chart-1", "fill-chart-2", "fill-chart-3"]
const numero = new Intl.NumberFormat("es-CO")

function Barras({ puntos, unidad }: { puntos: { etiqueta: string; valor: number }[]; unidad?: string }) {
  const max = Math.max(...puntos.map((p) => p.valor), 1)
  return (
    <ul className="space-y-2" role="list">
      {puntos.slice(0, 12).map((p) => (
        <li key={p.etiqueta} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
          <span className="truncate text-muted-foreground" title={p.etiqueta}>{p.etiqueta}</span>
          <span className="h-2.5 rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-chart-1" style={{ width: `${Math.max((p.valor / max) * 100, p.valor > 0 ? 2 : 0)}%` }} />
          </span>
          <span className="min-w-8 text-right font-medium tabular-nums">{numero.format(p.valor)}{unidad ? ` ${unidad}` : ""}</span>
        </li>
      ))}
    </ul>
  )
}

function Columnas({ categorias, series, unidad }: { categorias: string[]; series: { nombre: string; valores: number[] }[]; unidad?: string }) {
  const W = 640, H = 240, izq = 52, der = 8, sup = 12, inf = 44
  const max = Math.max(...series.flatMap((s) => s.valores), 1)
  const tope = (() => {
    const potencia = 10 ** Math.floor(Math.log10(max))
    return Math.ceil(max / potencia) * potencia
  })()
  const util = W - izq - der
  const alto = H - sup - inf
  const grupo = util / Math.max(categorias.length, 1)
  const ancho = Math.min(40, (grupo * 0.8) / series.length)
  const paso = categorias.length > 12 ? Math.ceil(categorias.length / 12) : 1
  const marcas = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de columnas: ${series.map((s) => s.nombre).join(", ")}`} className="h-auto w-full">
        {marcas.map((m) => {
          const y = sup + alto - m * alto
          return (
            <g key={m}>
              <line x1={izq} x2={W - der} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
              <text x={izq - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{numero.format(Math.round(tope * m))}</text>
            </g>
          )
        })}
        {categorias.map((c, i) => {
          const x0 = izq + i * grupo + (grupo - ancho * series.length) / 2
          return (
            <g key={c}>
              {series.map((s, j) => {
                const h = (s.valores[i] / tope) * alto
                return (
                  <rect key={s.nombre} x={x0 + j * ancho} y={sup + alto - h} width={ancho - 2} height={Math.max(h, s.valores[i] > 0 ? 1 : 0)} rx={2} className={SERIES_SVG[j % SERIES_SVG.length]}>
                    <title>{`${c} · ${s.nombre}: ${numero.format(s.valores[i])}${unidad ? ` ${unidad}` : ""}`}</title>
                  </rect>
                )
              })}
              {i % paso === 0 && (
                <text x={izq + i * grupo + grupo / 2} y={H - inf + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {c.length > 14 ? `${c.slice(0, 13)}…` : c}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
        {series.map((s, j) => (
          <li key={s.nombre} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${SERIES[j % SERIES.length]}`} aria-hidden />{s.nombre}</li>
        ))}
      </ul>
    </div>
  )
}

export function GraficoReporte({ grafico }: { grafico: Grafico }) {
  const vacio = grafico.tipo === "barras" ? grafico.puntos.length === 0 : grafico.categorias.length === 0
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{grafico.titulo}</CardTitle></CardHeader>
      <CardContent>
        {vacio ? <p className="py-6 text-center text-sm text-muted-foreground">Sin datos para los filtros aplicados.</p>
          : grafico.tipo === "barras" ? <Barras puntos={grafico.puntos} unidad={grafico.unidad} />
          : <Columnas categorias={grafico.categorias} series={grafico.series} unidad={grafico.unidad} />}
      </CardContent>
    </Card>
  )
}
