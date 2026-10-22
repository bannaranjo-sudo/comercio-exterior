import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, InsigniaEstado } from "@/components/comun/comunes"
import { Pestanas } from "@/components/comun/pestanas"
import { Badge } from "@/components/ui/badge"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_ESTADO_OPERACION, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas"
import { obtenerOperacion } from "@/lib/operaciones/servicio"

type Props = { children: React.ReactNode; params: Promise<{ id: string }> }

export default async function Layout({ children, params }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("operaciones:consultar")
  if (!ctx) return <AccesoDenegado />
  const { id } = await params
  const operacion = await obtenerOperacion(ctx, id)
  if (!operacion) notFound()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/operaciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Operaciones
      </Link>
      <EncabezadoPagina
        titulo={operacion.numero}
        descripcion={`${operacion.tercero.razonSocial} · ${operacion.descripcion.slice(0, 120)}`}
        acciones={
          <>
            <Badge variant="outline">{ETIQUETA_TIPO_OPERACION[operacion.tipo]}</Badge>
            <InsigniaEstado valor={operacion.estado} etiqueta={ETIQUETA_ESTADO_OPERACION[operacion.estado]} />
          </>
        }
      />
      <Pestanas
        etiqueta="Secciones del expediente"
        items={[
          { nombre: "General", href: `/operaciones/${operacion.id}`, exacto: true },
          { nombre: "Documentos", href: `/operaciones/${operacion.id}/documentos` },
          { nombre: "Logística", href: `/operaciones/${operacion.id}/logistica` },
          { nombre: "Costos", href: `/operaciones/${operacion.id}/costos` },
          { nombre: "Inteligencia", href: `/operaciones/${operacion.id}/inteligencia` },
        ]}
      />
      {children}
    </div>
  )
}
