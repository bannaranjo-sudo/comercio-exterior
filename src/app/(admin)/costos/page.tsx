import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EstadoVacio, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { TotalesCostos } from "@/components/costos/totales-costos"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { costosRecientes, totalesPorMoneda } from "@/lib/costos/servicio"
import { ETIQUETA_CATEGORIA_COSTO, ETIQUETA_ESTADO_COSTO } from "@/lib/etiquetas"
import { formatearFecha, formatearImporte } from "@/lib/formato"

export const metadata = { title: "Costos · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("costos:consultar")
  if (!ctx) return <AccesoDenegado />
  const [totales, recientes] = await Promise.all([totalesPorMoneda(ctx), costosRecientes(ctx)])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina titulo="Costos" descripcion="Consolidado de costos de todas las operaciones, por moneda. Los costos se registran en cada operación." />
      {recientes.length === 0 ? (
        <EstadoVacio titulo="Aún no hay costos registrados" descripcion="Registre costos estimados o reales en la pestaña Costos de una operación." />
      ) : (
        <>
          <TotalesCostos totales={totales} />
          <Seccion titulo="Últimos costos registrados">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operación</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link href={`/operaciones/${c.operacion.id}/costos`} className="hover:underline">{c.operacion.numero}</Link>
                      </TableCell>
                      <TableCell>
                        {c.concepto}
                        <span className="block text-xs text-muted-foreground">{ETIQUETA_CATEGORIA_COSTO[c.categoria]} · {formatearFecha(c.fecha)}</span>
                      </TableCell>
                      <TableCell><InsigniaEstado valor={c.estado} etiqueta={ETIQUETA_ESTADO_COSTO[c.estado]} /></TableCell>
                      <TableCell className="text-right tabular-nums">{formatearImporte(c.valor, c.moneda)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Seccion>
        </>
      )}
    </div>
  )
}
