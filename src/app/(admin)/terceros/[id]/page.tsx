import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { CamposTercero } from "@/components/terceros/campos-tercero"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionActualizarTercero, accionCambiarEstadoTercero } from "@/lib/terceros/acciones"
import { obtenerTercero } from "@/lib/terceros/servicio"

export const metadata = { title: "Tercero · Comercio Exterior" }

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ params, searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("terceros:consultar")
  if (!ctx) return <AccesoDenegado />
  const { id } = await params
  const tercero = await obtenerTercero(ctx, id)
  if (!tercero) notFound()
  const puedeEditar = ctx.permisos.has("terceros:editar")
  const creado = (await searchParams).creado === "1"

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <EncabezadoPagina
        titulo={tercero.razonSocial}
        descripcion={`${tercero.identificacionFiscal} · ${tercero._count.operaciones} operación(es) vinculada(s)`}
        acciones={<InsigniaEstado valor={tercero.activo ? "ACTIVO" : "INACTIVO"} etiqueta={tercero.activo ? "Activo" : "Inactivo"} />}
      />
      {creado && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          Tercero creado correctamente.
        </p>
      )}

      <Seccion titulo="Datos del tercero" descripcion={puedeEditar ? undefined : "Solo lectura: su rol no permite editar."}>
        {puedeEditar ? (
          <FormularioAccion accion={accionActualizarTercero} etiqueta="Guardar cambios">
            <input type="hidden" name="id" value={tercero.id} />
            <CamposTercero tercero={tercero} />
          </FormularioAccion>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {(
              [
                ["País", tercero.pais],
                ["Ciudad", tercero.ciudad],
                ["Dirección", tercero.direccion],
                ["Correo", tercero.correo],
                ["Teléfono", tercero.telefono],
                ["Contacto", tercero.contacto],
                ["Observaciones", tercero.observaciones],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </Seccion>

      {puedeEditar && (
        <Seccion
          titulo={tercero.activo ? "Desactivar tercero" : "Activar tercero"}
          descripcion="Los terceros no se eliminan: se desactivan para conservar el historial de sus operaciones."
        >
          <FormularioAccion accion={accionCambiarEstadoTercero} etiqueta={tercero.activo ? "Desactivar" : "Activar"} variante="outline">
            <input type="hidden" name="id" value={tercero.id} />
            <input type="hidden" name="activo" value={String(!tercero.activo)} />
          </FormularioAccion>
        </Seccion>
      )}
    </div>
  )
}
