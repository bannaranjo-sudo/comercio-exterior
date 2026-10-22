import { BrainCircuit } from "lucide-react"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EnlaceBoton, Seccion } from "@/components/comun/comunes"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { obtenerOperacion } from "@/lib/operaciones/servicio"

export const metadata = { title: "Inteligencia de la operación · Comercio Exterior" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const operacion = await obtenerOperacion(ctx, (await params).id)
  if (!operacion) notFound()

  return (
    <Seccion titulo="Análisis asistido por IA" descripcion="Sección preparada para la integración con los agentes del Centro de Inteligencia.">
      <div className="flex flex-col items-start gap-3 text-sm">
        <BrainCircuit className="size-6 text-primary" aria-hidden />
        <p className="max-w-2xl text-muted-foreground">
          Aún no se ejecutan análisis sobre la operación {operacion.numero}. Cuando los agentes documental, arancelario y financiero se activen,
          sus resultados —siempre sujetos a aprobación humana— aparecerán aquí.
        </p>
        <EnlaceBoton href="/inteligencia" variante="outline">
          Ir al Centro de Inteligencia
        </EnlaceBoton>
      </div>
    </Seccion>
  )
}
