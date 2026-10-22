import { FileSpreadsheet } from "lucide-react"
import Link from "next/link"

import { EstadoVacio, Paginacion, Seccion } from "@/components/comun/comunes"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { esNumerica, formatearValor } from "@/lib/reportes/presentacion"
import type { Tabla } from "@/lib/reportes/tipos"
import { cn } from "@/lib/utils"

/** Tabla de un reporte: números alineados a la derecha, primera columna enlazada al registro original. */
export function TablaReporte({ tabla, base, acciones }: { tabla: Tabla; base?: URLSearchParams; acciones?: React.ReactNode }) {
  const paginada = tabla.pagina !== undefined && tabla.tamanoPagina !== undefined
  const hayMas = paginada ? tabla.pagina! * tabla.tamanoPagina! < tabla.total : false
  return (
    <Seccion titulo={`${tabla.titulo} (${new Intl.NumberFormat("es-CO").format(tabla.total)})`} descripcion={tabla.nota} accion={acciones}>
      {tabla.filas.length === 0 ? (
        <EstadoVacio icono={FileSpreadsheet} titulo="Sin registros" descripcion="No hay datos que cumplan los filtros aplicados. Amplíe el período o limpie los filtros." />
      ) : (
        <>
          <div className="-mx-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {tabla.columnas.map((c) => (
                    <TableHead key={c.clave} className={cn("whitespace-nowrap", esNumerica(c) && "text-right")}>{c.etiqueta}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabla.filas.map((f, i) => (
                  <TableRow key={i}>
                    {tabla.columnas.map((c, j) => {
                      const texto = formatearValor(c, f.celdas[c.clave] ?? null)
                      return (
                        <TableCell key={c.clave} className={cn(esNumerica(c) ? "text-right tabular-nums" : "max-w-72 truncate", j === 0 && "font-medium")} title={texto.length > 40 ? texto : undefined}>
                          {j === 0 && f.href ? <Link href={f.href} className="text-primary hover:underline">{texto}</Link> : texto}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {paginada && base && <Paginacion pagina={tabla.pagina!} hayMas={hayMas} base={base} />}
        </>
      )}
    </Seccion>
  )
}
