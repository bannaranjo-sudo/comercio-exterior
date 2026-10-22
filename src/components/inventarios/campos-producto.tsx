import type { Producto } from "@/generated/prisma/client"
import { AreaTexto, Campo, Entrada, Selector } from "@/components/comun/comunes"
import { ETIQUETA_UNIDAD } from "@/lib/inventarios/cantidades"
import { opciones } from "@/lib/etiquetas"

type Props = {
  producto?: Producto
  proveedores: { id: string; razonSocial: string }[]
  categorias: string[]
  /** La unidad no puede cambiar cuando el producto ya tiene movimientos. */
  unidadBloqueada?: boolean
}

/** Campos del formulario de productos (alta y edición). */
export function CamposProducto({ producto, proveedores, categorias, unidadBloqueada }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Código interno (SKU) *" nombre="sku" ayuda="Único por empresa. Letras, números y . _ - /">
        <Entrada name="sku" defaultValue={producto?.sku} maxLength={40} required className="uppercase" />
      </Campo>
      <Campo etiqueta="Nombre *" nombre="nombre">
        <Entrada name="nombre" defaultValue={producto?.nombre} maxLength={200} required />
      </Campo>
      <Campo etiqueta="Categoría" nombre="categoria">
        <Entrada name="categoria" defaultValue={producto?.categoria ?? ""} maxLength={80} list="categorias-producto" />
        <datalist id="categorias-producto">
          {categorias.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Campo>
      <Campo etiqueta="Unidad de medida *" nombre="unidad" ayuda={unidadBloqueada ? "No se puede cambiar: el producto ya tiene movimientos." : "Define si admite cantidades fraccionarias."}>
        <Selector name="unidad" defaultValue={producto?.unidad ?? "UNIDAD"} opciones={opciones(ETIQUETA_UNIDAD)} disabled={unidadBloqueada} />
        {unidadBloqueada && <input type="hidden" name="unidad" value={producto?.unidad} />}
      </Campo>
      <Campo etiqueta="País de origen" nombre="paisOrigen">
        <Entrada name="paisOrigen" defaultValue={producto?.paisOrigen ?? ""} maxLength={80} />
      </Campo>
      <Campo etiqueta="Código arancelario" nombre="codigoArancelario" ayuda="Dato informativo sujeto a validación aduanera; el sistema no lo verifica.">
        <Entrada name="codigoArancelario" defaultValue={producto?.codigoArancelario ?? ""} maxLength={16} inputMode="numeric" />
      </Campo>
      <Campo etiqueta="Proveedor habitual" nombre="proveedorId">
        <Selector name="proveedorId" defaultValue={producto?.proveedorId ?? ""} vacio="Sin proveedor" opciones={proveedores.map((p) => [p.id, p.razonSocial] as const)} />
      </Campo>
      <Campo etiqueta="Stock mínimo" nombre="stockMinimo" ayuda="Genera una alerta cuando el total llega a este valor. 0 = sin alerta.">
        <Entrada name="stockMinimo" inputMode="decimal" defaultValue={producto ? producto.stockMinimo.toFixed(4).replace(/\.?0+$/, "") || "0" : "0"} />
      </Campo>
      <Campo etiqueta="Descripción" nombre="descripcion" className="sm:col-span-2">
        <AreaTexto name="descripcion" defaultValue={producto?.descripcion ?? ""} maxLength={1000} rows={3} />
      </Campo>
    </div>
  )
}
