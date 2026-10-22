import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, Campo, Entrada, Seccion, Selector } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { ClaveIdempotencia } from "@/components/inventarios/clave-idempotencia"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionRegistrarAjuste, accionRegistrarEntrada, accionRegistrarSalida, accionRegistrarTransferencia } from "@/lib/inventarios/acciones"
import { opcionesBodegas } from "@/lib/inventarios/bodegas"
import { ETIQUETA_UNIDAD } from "@/lib/inventarios/cantidades"
import { opcionesProductos } from "@/lib/inventarios/productos"

export const metadata = { title: "Registrar movimiento · Inventarios" }

type Opcion = readonly [string, string]

function CamposBase({ productos, bodegas, etiquetaBodega = "Bodega", nombreBodega = "bodegaId", motivo }: { productos: Opcion[]; bodegas: Opcion[]; etiquetaBodega?: string; nombreBodega?: string; motivo: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Producto *" nombre="productoId"><Selector name="productoId" vacio="Seleccione…" opciones={productos} required /></Campo>
      <Campo etiqueta={`${etiquetaBodega} *`} nombre={nombreBodega}><Selector name={nombreBodega} vacio="Seleccione…" opciones={bodegas} required /></Campo>
      <Campo etiqueta="Cantidad *" nombre="cantidad" ayuda="Hasta 4 decimales; enteros para unidades, cajas y pares."><Entrada name="cantidad" inputMode="decimal" required /></Campo>
      <Campo etiqueta={motivo} nombre="motivo"><Entrada name="motivo" maxLength={500} required /></Campo>
      <Campo etiqueta="Referencia" nombre="referencia"><Entrada name="referencia" maxLength={120} /></Campo>
    </div>
  )
}

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:crear")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite registrar movimientos." />
  const [prods, bods] = await Promise.all([opcionesProductos(ctx), opcionesBodegas(ctx)])
  const productos = prods.map((p) => [p.id, `${p.sku} · ${p.nombre} (${ETIQUETA_UNIDAD[p.unidad]})`] as const)
  const bodegas = bods.map((b) => [b.id, `${b.codigo} · ${b.nombre}`] as const)
  const puedeAjustar = ctx.permisos.has("inventarios:eliminar")

  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/inventarios/movimientos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Movimientos
      </Link>
      {productos.length === 0 || bodegas.length === 0 ? (
        <Alerta tono="warning" titulo="Falta configuración">Necesita al menos un <Link href="/inventarios/productos/nuevo">producto</Link> y una <Link href="/inventarios/bodegas">bodega</Link> activos. Las entradas por importación se registran como <Link href="/inventarios/recepciones/nueva">recepciones</Link>.</Alerta>
      ) : (
        <>
          <Seccion titulo="Salida" descripcion="Descuenta existencias; se rechaza si el saldo es insuficiente.">
            <FormularioAccion accion={accionRegistrarSalida} etiqueta="Registrar salida" limpiarAlExito>
              <ClaveIdempotencia />
              <CamposBase productos={productos} bodegas={bodegas} motivo="Motivo (despacho, venta, consumo…) *" />
            </FormularioAccion>
          </Seccion>
          <Seccion titulo="Transferencia entre bodegas" descripcion="Salida de origen y entrada en destino en una sola operación atómica.">
            <FormularioAccion accion={accionRegistrarTransferencia} etiqueta="Registrar transferencia" limpiarAlExito>
              <ClaveIdempotencia />
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Producto *" nombre="productoId"><Selector name="productoId" vacio="Seleccione…" opciones={productos} required /></Campo>
                <Campo etiqueta="Cantidad *" nombre="cantidad"><Entrada name="cantidad" inputMode="decimal" required /></Campo>
                <Campo etiqueta="Bodega de origen *" nombre="origenId"><Selector name="origenId" vacio="Seleccione…" opciones={bodegas} required /></Campo>
                <Campo etiqueta="Bodega de destino *" nombre="destinoId"><Selector name="destinoId" vacio="Seleccione…" opciones={bodegas} required /></Campo>
                <Campo etiqueta="Motivo *" nombre="motivo"><Entrada name="motivo" maxLength={500} required /></Campo>
                <Campo etiqueta="Referencia" nombre="referencia"><Entrada name="referencia" maxLength={120} /></Campo>
              </div>
            </FormularioAccion>
          </Seccion>
          <Seccion titulo="Entrada manual" descripcion="Para ingresos que no provienen de una importación (devoluciones, producción local…).">
            <FormularioAccion accion={accionRegistrarEntrada} etiqueta="Registrar entrada" limpiarAlExito>
              <ClaveIdempotencia />
              <CamposBase productos={productos} bodegas={bodegas} motivo="Motivo *" />
            </FormularioAccion>
          </Seccion>
          {puedeAjustar && (
            <Seccion titulo="Ajuste de inventario" descripcion="Corrige diferencias de conteo. Exige justificación de al menos 10 caracteres y queda auditado.">
              <FormularioAccion accion={accionRegistrarAjuste} etiqueta="Registrar ajuste" limpiarAlExito>
                <ClaveIdempotencia />
                <Campo etiqueta="Dirección del ajuste *" nombre="direccion"><Selector name="direccion" vacio="Seleccione…" opciones={[["AUMENTAR", "Aumentar existencias"], ["DISMINUIR", "Disminuir existencias"]]} required /></Campo>
                <CamposBase productos={productos} bodegas={bodegas} motivo="Justificación (mín. 10 caracteres) *" />
              </FormularioAccion>
            </Seccion>
          )}
        </>
      )}
    </div>
  )
}
