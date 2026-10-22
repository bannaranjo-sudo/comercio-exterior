import { Download, FileText, Sheet } from "lucide-react"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, EnlaceBoton } from "@/components/comun/comunes"
import { FiltrosReporteForm } from "@/components/reportes/filtros-reporte"
import { GraficoReporte } from "@/components/reportes/graficos"
import { KpisReporte } from "@/components/reportes/kpis-reporte"
import { TablaReporte } from "@/components/reportes/tabla-reporte"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ErrorValidacion } from "@/lib/errores"
import { aQuery, filtrosDeReporte, type FiltrosReporte } from "@/lib/reportes/filtros"
import { esIdReporte, generarParaPantalla, PERMISO_REPORTE, REPORTES } from "@/lib/reportes/indice"
import { opcionesFiltros } from "@/lib/reportes/opciones"

type Props = { params: Promise<{ reporte: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props) {
  const { reporte } = await params
  const nombre = REPORTES.find((r) => r.id === reporte)?.nombre
  return { title: `${nombre ?? "Reporte"} · Reportes` }
}

export default async function Page({ params, searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("reportes:consultar")
  if (!ctx) return <AccesoDenegado />
  const { reporte } = await params
  if (!esIdReporte(reporte)) notFound()
  if (!ctx.permisos.has(PERMISO_REPORTE[reporte])) return <AccesoDenegado detalle="Su rol no tiene acceso a la información de este reporte." />

  const sp = await searchParams
  let filtros: FiltrosReporte = {}
  let error: string | null = null
  try {
    filtros = filtrosDeReporte(reporte, sp)
  } catch (e) {
    if (!(e instanceof ErrorValidacion)) throw e
    error = e.message
  }
  const [opcionesLista, datos] = await Promise.all([opcionesFiltros(ctx, reporte), error ? null : generarParaPantalla(ctx, reporte, filtros)])

  const puedeExportar = ctx.permisos.has("reportes:crear")
  const enlace = (formato: string, tabla?: string) => `/api/reportes/exportar?${aQuery(filtros, { reporte, formato, ...(tabla ? { tabla } : {}) })}`
  const base = new URLSearchParams(aQuery(filtros))

  return (
    <div className="space-y-6">
      <FiltrosReporteForm id={reporte} filtros={filtros} opcionesLista={opcionesLista} />
      {error && <Alerta tono="danger" titulo="Filtros no válidos">{error}</Alerta>}
      {datos && (
        <>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{datos.titulo}</h2>
              <p className="text-sm text-muted-foreground">{datos.descripcion}</p>
              <p className="mt-1 text-xs text-muted-foreground">Período aplicado sobre: {datos.campoPeriodo}.</p>
            </div>
            {puedeExportar ? (
              <div className="flex flex-wrap gap-2" aria-label="Exportar reporte">
                <EnlaceBoton href={enlace("xlsx")} variante="outline"><Sheet className="size-4" aria-hidden /> Excel</EnlaceBoton>
                <EnlaceBoton href={enlace("csv")} variante="outline"><Download className="size-4" aria-hidden /> CSV</EnlaceBoton>
                <EnlaceBoton href={enlace("pdf")} variante="outline"><FileText className="size-4" aria-hidden /> PDF</EnlaceBoton>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Su rol puede consultar reportes pero no exportarlos.</p>
            )}
          </div>
          {datos.avisos.map((a) => <Alerta key={a} tono="info">{a}</Alerta>)}
          <KpisReporte kpis={datos.kpis} />
          {datos.graficos.length > 0 && (
            <section aria-label="Gráficos" className="grid gap-4 lg:grid-cols-2">
              {datos.graficos.map((g) => <GraficoReporte key={g.id} grafico={g} />)}
            </section>
          )}
          {datos.tablas.map((t, i) => (
            <TablaReporte
              key={t.id}
              tabla={t}
              base={i === 0 ? base : undefined}
              acciones={puedeExportar ? <a href={enlace("csv", t.id)} className="text-xs text-primary hover:underline">CSV de esta tabla</a> : undefined}
            />
          ))}
        </>
      )}
    </div>
  )
}
