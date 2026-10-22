import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, AreaTexto, Campo, Entrada, EnlaceBoton, Selector, Seccion } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { ClaveIdempotencia } from "@/components/inventarios/clave-idempotencia"
import { Button } from "@/components/ui/button"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_TIPO_DOCUMENTO } from "@/lib/etiquetas"
import { hoyLocal } from "@/lib/formato"
import { accionRegistrarRecepcion } from "@/lib/inventarios/acciones"
import { opcionesBodegas } from "@/lib/inventarios/bodegas"
import { ETIQUETA_UNIDAD } from "@/lib/inventarios/cantidades"
import { opcionesProductos } from "@/lib/inventarios/productos"
import { documentosDeOperacion, importacionesParaRecibir, MAX_LINEAS_RECEPCION } from "@/lib/inventarios/recepciones"

export const metadata = { title: "Nueva recepción · Inventarios" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:crear")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite registrar recepciones." />
  const operacionId = typeof (await searchParams).operacion === "string" ? ((await searchParams).operacion as string) : ""
  const [importaciones, bodegas, productos] = await Promise.all([importacionesParaRecibir(ctx), opcionesBodegas(ctx), opcionesProductos(ctx)])
  const operacion = importaciones.find((o) => o.id === operacionId)
  const documentos = operacion ? await documentosDeOperacion(ctx, operacion.id) : []
  const faltan = bodegas.length === 0 || productos.length === 0

  const volver = (
    <Link href="/inventarios/recepciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> Recepciones
    </Link>
  )

  if (importaciones.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        {volver}
        <Alerta tono="info" titulo="No hay importaciones disponibles">
          Las recepciones se vinculan a una operación de importación no cancelada. <Link href="/operaciones/nueva">Cree una importación</Link> primero.
        </Alerta>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      {volver}
      {faltan && (
        <Alerta tono="warning" titulo="Falta configuración">
          {bodegas.length === 0 && <>Cree una <Link href="/inventarios/bodegas">bodega</Link>. </>}
          {productos.length === 0 && <>Cree al menos un <Link href="/inventarios/productos/nuevo">producto</Link>.</>}
        </Alerta>
      )}

      <Seccion titulo="1. Importación de origen" descripcion="Seleccione la operación de importación de la que recibe la mercancía.">
        <form className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Operación de importación *" nombre="operacion" className="min-w-72 flex-1">
            <Selector name="operacion" defaultValue={operacionId} vacio="Seleccione una importación…" opciones={importaciones.map((o) => [o.id, `${o.numero} · ${o.tercero.razonSocial}`] as const)} required />
          </Campo>
          <Button type="submit" variant="outline">Continuar</Button>
        </form>
      </Seccion>

      {operacion && !faltan && (
        <Seccion titulo={`2. Mercancía recibida · ${operacion.numero}`} descripcion="Complete una fila por producto (las filas vacías se ignoran). La cantidad esperada es opcional; si difiere de lo recibido, explique la diferencia.">
          <FormularioAccion accion={accionRegistrarRecepcion} etiqueta="Registrar recepción">
            <ClaveIdempotencia />
            <input type="hidden" name="operacionId" value={operacion.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Bodega de destino *" nombre="bodegaId">
                <Selector name="bodegaId" opciones={bodegas.map((b) => [b.id, `${b.codigo} · ${b.nombre}`] as const)} required />
              </Campo>
              <Campo etiqueta="Fecha de recepción *" nombre="fechaRecepcion">
                <Entrada name="fechaRecepcion" type="date" defaultValue={hoyLocal()} required />
              </Campo>
              <Campo etiqueta="Documento de soporte" nombre="documentoId" ayuda="Documentos cargados en la operación.">
                <Selector name="documentoId" vacio="Sin documento" opciones={documentos.map((d) => [d.id, `${ETIQUETA_TIPO_DOCUMENTO[d.tipo]} · ${d.nombreOriginal}`] as const)} />
              </Campo>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Productos recibidos</p>
              <div className="hidden gap-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[3fr_1fr_1fr_2fr]">
                <span>Producto</span><span>Esperada</span><span>Recibida</span><span>Observación / diferencia</span>
              </div>
              {Array.from({ length: MAX_LINEAS_RECEPCION }, (_, i) => (
                <div key={i} className="grid gap-2 lg:grid-cols-[3fr_1fr_1fr_2fr]">
                  <Selector name={`productoId_${i}`} aria-label={`Producto ${i + 1}`} vacio="— Producto —" opciones={productos.map((p) => [p.id, `${p.sku} · ${p.nombre} (${ETIQUETA_UNIDAD[p.unidad]})`] as const)} />
                  <Entrada name={`cantidadEsperada_${i}`} inputMode="decimal" placeholder="Esperada" aria-label={`Cantidad esperada ${i + 1}`} />
                  <Entrada name={`cantidadRecibida_${i}`} inputMode="decimal" placeholder="Recibida" aria-label={`Cantidad recibida ${i + 1}`} />
                  <Entrada name={`observacion_${i}`} maxLength={300} placeholder="Observación" aria-label={`Observación ${i + 1}`} />
                </div>
              ))}
            </div>

            <Campo etiqueta="Observaciones generales" nombre="observaciones">
              <AreaTexto name="observaciones" maxLength={1000} rows={2} />
            </Campo>
          </FormularioAccion>
        </Seccion>
      )}
      {!operacion && operacionId && <Alerta tono="danger">La operación seleccionada no está disponible para recibir mercancía.</Alerta>}
      <div className="hidden"><EnlaceBoton href="/inventarios/recepciones">Cancelar</EnlaceBoton></div>
    </div>
  )
}
