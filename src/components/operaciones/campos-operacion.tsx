import type { Operacion, Tercero } from "@/generated/prisma/client"
import { AreaTexto, Campo, Entrada, Selector } from "@/components/comun/comunes"
import { aInputFecha, hoyLocal } from "@/lib/formato"
import { ETIQUETA_INCOTERM, ETIQUETA_MODALIDAD, ETIQUETA_TIPO_OPERACION, opciones } from "@/lib/etiquetas"

type TerceroOpcion = Pick<Tercero, "id" | "razonSocial" | "identificacionFiscal">

type Props = {
  operacion?: Operacion
  proveedores: TerceroOpcion[]
  clientes: TerceroOpcion[]
  responsables: { id: string; nombre: string }[]
  responsablePorDefecto?: string
}

const etiquetaTercero = (t: TerceroOpcion) => `${t.razonSocial} (${t.identificacionFiscal})`

/** Campos del expediente de importación/exportación (alta y edición). */
export function CamposOperacion({ operacion, proveedores, clientes, responsables, responsablePorDefecto }: Props) {
  const hoy = hoyLocal()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {!operacion && (
          <Campo etiqueta="Tipo de operación *" nombre="tipo">
            <Selector name="tipo" defaultValue="IMPORTACION" opciones={opciones(ETIQUETA_TIPO_OPERACION)} />
          </Campo>
        )}
        <Campo etiqueta="Fecha de apertura *" nombre="fechaApertura">
          <Entrada name="fechaApertura" type="date" defaultValue={aInputFecha(operacion?.fechaApertura) || hoy} required />
        </Campo>
        <Campo
          etiqueta="Proveedor (importación) o cliente (exportación) *"
          nombre="terceroId"
          ayuda="Una importación exige un tercero con rol Proveedor; una exportación, con rol Cliente."
          className="sm:col-span-2"
        >
          <select
            id="terceroId"
            name="terceroId"
            defaultValue={operacion?.terceroId ?? ""}
            required
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="" disabled>
              Seleccione un tercero…
            </option>
            <optgroup label="Proveedores">
              {proveedores.map((t) => (
                <option key={`p-${t.id}`} value={t.id}>
                  {etiquetaTercero(t)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Clientes">
              {clientes.map((t) => (
                <option key={`c-${t.id}`} value={t.id}>
                  {etiquetaTercero(t)}
                </option>
              ))}
            </optgroup>
          </select>
        </Campo>
        <Campo etiqueta="Descripción general de las mercancías *" nombre="descripcion" className="sm:col-span-2">
          <AreaTexto name="descripcion" defaultValue={operacion?.descripcion} maxLength={1000} required />
        </Campo>
        <Campo etiqueta="País de origen *" nombre="paisOrigen">
          <Entrada name="paisOrigen" defaultValue={operacion?.paisOrigen} maxLength={80} required />
        </Campo>
        <Campo etiqueta="País de destino *" nombre="paisDestino">
          <Entrada name="paisDestino" defaultValue={operacion?.paisDestino ?? "Colombia"} maxLength={80} required />
        </Campo>
        <Campo etiqueta="Incoterm *" nombre="incoterm">
          <Selector name="incoterm" defaultValue={operacion?.incoterm ?? "FOB"} opciones={opciones(ETIQUETA_INCOTERM)} />
        </Campo>
        <Campo etiqueta="Lugar convenido *" nombre="lugarIncoterm">
          <Entrada name="lugarIncoterm" defaultValue={operacion?.lugarIncoterm} maxLength={150} placeholder="Puerto o lugar del Incoterm" required />
        </Campo>
        <Campo etiqueta="Moneda *" nombre="moneda" ayuda="Código ISO de 3 letras (USD, EUR, COP…).">
          <Entrada name="moneda" defaultValue={operacion?.moneda ?? "USD"} maxLength={3} list="monedas" required className="uppercase" />
          <datalist id="monedas">
            {["USD", "EUR", "COP", "CNY", "GBP", "MXN", "BRL"].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Campo>
        <Campo etiqueta="Valor comercial estimado *" nombre="valorEstimado">
          <Entrada name="valorEstimado" inputMode="decimal" defaultValue={operacion?.valorEstimado.toFixed(2)} placeholder="0.00" required />
        </Campo>
        <Campo etiqueta="Modalidad de transporte *" nombre="modalidad">
          <Selector name="modalidad" defaultValue={operacion?.modalidad ?? "MARITIMO"} opciones={opciones(ETIQUETA_MODALIDAD)} />
        </Campo>
        <Campo etiqueta="Responsable interno *" nombre="responsableId">
          <Selector
            name="responsableId"
            defaultValue={operacion?.responsableId ?? responsablePorDefecto}
            opciones={responsables.map((r) => [r.id, r.nombre] as const)}
          />
        </Campo>
        <Campo etiqueta="Observaciones" nombre="observaciones" className="sm:col-span-2">
          <AreaTexto name="observaciones" defaultValue={operacion?.observaciones ?? ""} maxLength={2000} />
        </Campo>
      </div>
    </div>
  )
}
