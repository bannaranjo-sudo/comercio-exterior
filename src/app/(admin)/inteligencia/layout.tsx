import { Building2, ShieldCheck } from "lucide-react"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina } from "@/components/comun/comunes"
import { Pestanas } from "@/components/comun/pestanas"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { db } from "@/lib/db"
import { contarPorRevisar } from "@/lib/inteligencia/vistas"

export default async function InteligenciaLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const [empresa, porRevisar] = await Promise.all([
    db.empresa.findUnique({ where: { id: ctx.empresaId }, select: { nombreComercial: true, razonSocial: true } }),
    contarPorRevisar(ctx),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        titulo="Centro de Inteligencia"
        etiqueta={
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5 text-primary" aria-hidden /> {empresa?.nombreComercial ?? empresa?.razonSocial}
          </span>
        }
        descripcion="Análisis asistidos para operaciones de comercio exterior, con trazabilidad completa y aprobación humana de todo resultado."
        acciones={
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" aria-hidden /> Sin aprobaciones automáticas
          </span>
        }
      />
      <Pestanas
        etiqueta="Centro de Inteligencia"
        items={[
          { nombre: "Nuevo análisis", href: "/inteligencia", exacto: true, tambien: ["/inteligencia/nuevo"] },
          { nombre: "Solicitudes", href: "/inteligencia/solicitudes" },
          { nombre: "Por revisar", href: "/inteligencia/por-revisar", contador: porRevisar },
          { nombre: "Historial", href: "/inteligencia/historial" },
        ]}
      />
      {children}
    </div>
  )
}
