import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Entrada, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { CamposOperacion } from "@/components/operaciones/campos-operacion"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import {
  ETIQUETA_ESTADO_ENVIO, ETIQUETA_ESTADO_OPERACION, ETIQUETA_INCOTERM, ETIQUETA_MODALIDAD, ETIQUETA_TIPO_OPERACION,
} from "@/lib/etiquetas"
import { formatearFecha, formatearFechaHora, formatearImporte } from "@/lib/formato"
import { accionActualizarOperacion, accionCambiarEstadoOperacion } from "@/lib/operaciones/acciones"
import { esEstadoFinal, historialOperacion, listarResponsables, obtenerOperacion, TRANSICIONES } from "@/lib/operaciones/servicio"
import { opcionesTerceros } from "@/lib/terceros/servicio"

export const metadata = { title: "Expediente · Comercio Exterior" }

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

type DetalleHistorial = { de?: string; a?: string; motivo?: string; numero?: string; cambios?: Record<string, [string, string]> }

function describir(accion: string, detalle: DetalleHistorial | null): string {
  if (accion === "CREACION") return `Operación creada (${detalle?.numero ?? ""})`
  if (accion === "CAMBIO_ESTADO") {
    const nombre = (e?: string) => ETIQUETA_ESTADO_OPERACION[e as keyof typeof ETIQUETA_ESTADO_OPERACION] ?? e
    return `Estado: ${nombre(detalle?.de)} → ${nombre(detalle?.a)}${detalle?.motivo ? ` · Motivo: ${detalle.motivo}` : ""}`
  }
  if (accion === "EDICION") return `Datos modificados: ${Object.keys(detalle?.cambios ?? {}).join(", ")}`
  return accion
}

export default async function Page({ params, searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("operaciones:consultar")
  if (!ctx) return <AccesoDenegado />
  const { id } = await params
  const operacion = await obtenerOperacion(ctx, id)
  if (!operacion) notFound()
  const puedeEditar = ctx.permisos.has("operaciones:editar") && !esEstadoFinal(operacion.estado)
  const creada = (await searchParams).creada === "1"
  const [historial, proveedores, clientes, responsables] = await Promise.all([
    historialOperacion(ctx, operacion.id),
    puedeEditar ? opcionesTerceros(ctx, "PROVEEDOR") : [],
    puedeEditar ? opcionesTerceros(ctx, "CLIENTE") : [],
    puedeEditar ? listarResponsables(ctx) : [],
  ])
  const envio = operacion.envio

  const datos: [string, React.ReactNode][] = [
    ["Tipo", ETIQUETA_TIPO_OPERACION[operacion.tipo]],
    ["Fecha de apertura", formatearFecha(operacion.fechaApertura)],
    [operacion.tipo === "IMPORTACION" ? "Proveedor" : "Cliente", <Link key="t" href={`/terceros/${operacion.terceroId}`} className="text-primary hover:underline">{operacion.tercero.razonSocial}</Link>],
    ["Origen → destino", `${operacion.paisOrigen} → ${operacion.paisDestino}`],
    ["Incoterm", `${ETIQUETA_INCOTERM[operacion.incoterm].split(" · ")[0]} · ${operacion.lugarIncoterm}`],
    ["Valor comercial estimado", formatearImporte(operacion.valorEstimado, operacion.moneda)],
    ["Modalidad", ETIQUETA_MODALIDAD[operacion.modalidad]],
    ["Responsable", operacion.responsable.usuario.nombre],
    ["Creada por", operacion.creadoPor.nombre],
    ["Mercancías", operacion.descripcion],
    ["Observaciones", operacion.observaciones || "—"],
  ]
  const fechas: [string, string][] = envio
    ? [
        ["Salida estimada", formatearFecha(envio.fechaEstimadaSalida)], ["Salida real", formatearFecha(envio.fechaRealSalida)],
        ["Llegada estimada", formatearFecha(envio.fechaEstimadaLlegada)], ["Llegada real", formatearFecha(envio.fechaRealLlegada)],
      ]
    : []

  return (
    <div className="space-y-6">
      {creada && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">Operación creada correctamente. Continúe con documentos, logística y costos.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Seccion titulo="Datos generales" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k} className={k === "Mercancías" || k === "Observaciones" ? "sm:col-span-2" : ""}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </Seccion>

        <div className="space-y-6">
          <Seccion titulo="Fechas" descripcion={envio ? `Envío: ${ETIQUETA_ESTADO_ENVIO[envio.estadoEnvio]}` : "Se registran en la pestaña Logística."}>
            {fechas.length > 0 ? (
              <dl className="space-y-2 text-sm">
                {fechas.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Sin fechas registradas.</p>
            )}
          </Seccion>

          <Seccion titulo="Estado de la operación">
            {esEstadoFinal(operacion.estado) ? (
              <p className="text-sm text-muted-foreground">La operación está {ETIQUETA_ESTADO_OPERACION[operacion.estado].toLowerCase()} y no admite más cambios.</p>
            ) : ctx.permisos.has("operaciones:editar") ? (
              <div className="space-y-4">
                {TRANSICIONES[operacion.estado].map((destino) => (
                  <FormularioAccion
                    key={destino}
                    accion={accionCambiarEstadoOperacion}
                    etiqueta={`Pasar a ${ETIQUETA_ESTADO_OPERACION[destino]}`}
                    variante={destino === "CANCELADA" ? "outline" : "default"}
                  >
                    <input type="hidden" name="id" value={operacion.id} />
                    <input type="hidden" name="estado" value={destino} />
                    {destino === "CANCELADA" && <Entrada name="motivo" placeholder="Motivo de la cancelación *" maxLength={500} aria-label="Motivo de la cancelación" required />}
                  </FormularioAccion>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Su rol no permite cambiar el estado.</p>
            )}
          </Seccion>
        </div>
      </div>

      <Seccion titulo="Historial de cambios" descripcion="Registro de creación, ediciones y cambios de estado.">
        <ol className="space-y-3 border-l pl-4 text-sm">
          {historial.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
              <p>{describir(h.accion, h.detalle as DetalleHistorial | null)}</p>
              <p className="text-xs text-muted-foreground">{h.usuario.nombre} · {formatearFechaHora(h.creadoEn)}</p>
            </li>
          ))}
        </ol>
      </Seccion>

      {puedeEditar && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Editar datos del expediente</summary>
          <div className="mt-4">
            <FormularioAccion accion={accionActualizarOperacion} etiqueta="Guardar cambios">
              <input type="hidden" name="id" value={operacion.id} />
              <CamposOperacion operacion={operacion} proveedores={proveedores} clientes={clientes} responsables={responsables} />
            </FormularioAccion>
          </div>
        </details>
      )}
    </div>
  )
}
