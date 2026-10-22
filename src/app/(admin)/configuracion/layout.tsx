import { Building2 } from "lucide-react"

import { EncabezadoPagina } from "@/components/comun/comunes"
import { Pestanas } from "@/components/comun/pestanas"
import { exigirMembresiaEmpresaActiva } from "@/lib/auth/sesion"
import { seccionesVisibles } from "@/lib/configuracion"
import { db } from "@/lib/db"

export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirMembresiaEmpresaActiva()
  const empresa = await db.empresa.findUnique({ where: { id: ctx.empresaId }, select: { nombreComercial: true, razonSocial: true } })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        titulo="Configuración"
        etiqueta={
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5 text-primary" aria-hidden /> {empresa?.nombreComercial ?? empresa?.razonSocial}
          </span>
        }
        descripcion="Administración de la empresa activa: accesos, inteligencia artificial, seguridad y preferencias."
      />
      <Pestanas
        etiqueta="Secciones de configuración"
        items={[{ nombre: "Resumen", href: "/configuracion", exacto: true }, ...seccionesVisibles(ctx.permisos).map((s) => ({ nombre: s.nombre, href: s.href }))]}
      />
      {children}
    </div>
  )
}
