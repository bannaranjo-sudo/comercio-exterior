import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { CamposProducto } from "@/components/inventarios/campos-producto"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionCrearProducto } from "@/lib/inventarios/acciones"
import { categoriasProductos } from "@/lib/inventarios/productos"
import { opcionesTerceros } from "@/lib/terceros/servicio"

export const metadata = { title: "Nuevo producto · Inventarios" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:crear")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite crear productos." />
  const [proveedores, categorias] = await Promise.all([opcionesTerceros(ctx, "PROVEEDOR"), categoriasProductos(ctx)])
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/inventarios/productos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Productos
      </Link>
      <Seccion titulo="Nuevo producto" descripcion="Los campos marcados con * son obligatorios.">
        <FormularioAccion accion={accionCrearProducto} etiqueta="Crear producto">
          <CamposProducto proveedores={proveedores} categorias={categorias} />
        </FormularioAccion>
      </Seccion>
    </div>
  )
}
