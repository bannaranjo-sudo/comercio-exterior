import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina } from "@/components/comun/comunes"
import { Pestanas } from "@/components/comun/pestanas"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { reportesDisponibles } from "@/lib/reportes/indice"

export default async function ReportesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirPermisoEmpresaActiva("reportes:consultar")
  if (!ctx) return <AccesoDenegado />
  const reportes = reportesDisponibles(ctx)
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina titulo="Reportes" descripcion="Informes ejecutivos y operativos con datos reales de la empresa activa, filtros combinables y exportación a Excel, CSV y PDF." />
      <Pestanas etiqueta="Reportes" items={reportes.map((r) => ({ nombre: r.nombre, href: `/reportes/${r.id}` }))} />
      {children}
    </div>
  )
}
