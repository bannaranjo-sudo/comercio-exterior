import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { CamposTercero } from "@/components/terceros/campos-tercero"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionCrearTercero } from "@/lib/terceros/acciones"

export const metadata = { title: "Nuevo tercero · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("terceros:crear")
  if (!ctx) return <AccesoDenegado />
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <EncabezadoPagina titulo="Nuevo tercero" descripcion="Los campos marcados con * son obligatorios." />
      <Seccion titulo="Datos del tercero">
        <FormularioAccion accion={accionCrearTercero} etiqueta="Crear tercero">
          <CamposTercero />
        </FormularioAccion>
      </Seccion>
    </div>
  )
}
