import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ETIQUETA_CATEGORIA_COSTO } from "@/lib/etiquetas"
import { formatearImporte } from "@/lib/formato"
import type { TotalMoneda } from "@/lib/costos/servicio"

/** Totales y subtotales por moneda. Nunca suma monedas distintas ni aplica tasas de cambio. */
export function TotalesCostos({ totales }: { totales: TotalMoneda[] }) {
  if (totales.length === 0) return null
  return (
    <div className="space-y-4">
      {totales.length > 1 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Hay costos en {totales.length} monedas ({totales.map((t) => t.moneda).join(", ")}). Los totales se muestran por separado: no
          existe una tasa de cambio registrada, por lo que no hay consolidación cambiaria.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {totales.map((t) => (
          <Card key={t.moneda}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Total en {t.moneda}</CardTitle>
                <Badge variant="outline">{t.moneda}</Badge>
              </div>
              <CardDescription>
                Estimado {formatearImporte(t.estimado, t.moneda)} · Real {formatearImporte(t.real, t.moneda)} · Diferencia (real − estimado){" "}
                {formatearImporte(t.diferencia, t.moneda)}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Estimado</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.categorias.map((c) => (
                    <TableRow key={c.categoria}>
                      <TableCell>{ETIQUETA_CATEGORIA_COSTO[c.categoria]}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearImporte(c.estimado, t.moneda)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearImporte(c.real, t.moneda)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearImporte(t.estimado, t.moneda)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearImporte(t.real, t.moneda)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
