import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EnlaceBoton, EstadoVacio, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { CamposOperacion } from "@/components/operaciones/campos-operacion"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionCrearOperacion } from "@/lib/operaciones/acciones"
import { listarResponsables } from "@/lib/operaciones/servicio"
import { opcionesTerceros } from "@/lib/terceros/servicio"

export const metadata = { title: "Nueva operación · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("operaciones:crear")
  if (!ctx) return <AccesoDenegado />
  const [proveedores, clientes, responsables] = await Promise.all([
    opcionesTerceros(ctx, "PROVEEDOR"),
    opcionesTerceros(ctx, "CLIENTE"),
    listarResponsables(ctx),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <EncabezadoPagina titulo="Nueva operación" descripcion="El número consecutivo se asigna automáticamente al guardar." />
      {proveedores.length + clientes.length === 0 ? (
        <EstadoVacio
          titulo="Primero registre un proveedor o cliente"
          descripcion="Toda operación se vincula a un tercero con rol Proveedor (importación) o Cliente (exportación)."
          accion={ctx.permisos.has("terceros:crear") ? <EnlaceBoton href="/terceros/nuevo">Registrar tercero</EnlaceBoton> : undefined}
        />
      ) : (
        <Seccion titulo="Datos del expediente">
          <FormularioAccion accion={accionCrearOperacion} etiqueta="Crear operación">
            <CamposOperacion proveedores={proveedores} clientes={clientes} responsables={responsables} responsablePorDefecto={ctx.usuarioId} />
          </FormularioAccion>
        </Seccion>
      )}
    </div>
  )
}
