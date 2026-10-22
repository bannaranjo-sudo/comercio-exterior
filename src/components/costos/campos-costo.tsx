import type { Costo } from "@/generated/prisma/client"
import { Campo, Entrada, Selector } from "@/components/comun/comunes"
import { ETIQUETA_CATEGORIA_COSTO, ETIQUETA_ESTADO_COSTO, opciones } from "@/lib/etiquetas"
import { aInputFecha, hoyLocal } from "@/lib/formato"

/** Campos del formulario de costos (alta y edición). */
export function CamposCosto({ costo, monedaPorDefecto = "USD" }: { costo?: Costo; monedaPorDefecto?: string }) {
  const hoy = hoyLocal()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Categoría *" nombre="categoria">
        <Selector name="categoria" defaultValue={costo?.categoria ?? "FLETE_INTERNACIONAL"} opciones={opciones(ETIQUETA_CATEGORIA_COSTO)} />
      </Campo>
      <Campo etiqueta="Estado *" nombre="estado">
        <Selector name="estado" defaultValue={costo?.estado ?? "ESTIMADO"} opciones={opciones(ETIQUETA_ESTADO_COSTO)} />
      </Campo>
      <Campo etiqueta="Concepto *" nombre="concepto" className="sm:col-span-2">
        <Entrada name="concepto" defaultValue={costo?.concepto} maxLength={200} required />
      </Campo>
      <Campo etiqueta="Valor *" nombre="valor">
        <Entrada name="valor" inputMode="decimal" defaultValue={costo?.valor.toFixed(2)} placeholder="0.00" required />
      </Campo>
      <Campo etiqueta="Moneda *" nombre="moneda">
        <Entrada name="moneda" defaultValue={costo?.moneda ?? monedaPorDefecto} maxLength={3} list="monedas-costo" required className="uppercase" />
        <datalist id="monedas-costo">
          {["USD", "EUR", "COP", "CNY", "GBP"].map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Campo>
      <Campo etiqueta="Fecha *" nombre="fecha">
        <Entrada name="fecha" type="date" defaultValue={aInputFecha(costo?.fecha) || hoy} required />
      </Campo>
      <Campo etiqueta="Observación" nombre="observacion">
        <Entrada name="observacion" defaultValue={costo?.observacion ?? ""} maxLength={500} />
      </Campo>
    </div>
  )
}
