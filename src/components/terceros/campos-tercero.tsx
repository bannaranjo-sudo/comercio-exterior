import type { Tercero } from "@/generated/prisma/client"
import { AreaTexto, Campo, Entrada, Selector } from "@/components/comun/comunes"
import { ETIQUETA_AMBITO, ETIQUETA_ROL_TERCERO, opciones } from "@/lib/etiquetas"

/** Campos del formulario de terceros (alta y edición). */
export function CamposTercero({ tercero }: { tercero?: Tercero }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Razón social *" nombre="razonSocial">
          <Entrada name="razonSocial" defaultValue={tercero?.razonSocial} maxLength={200} required />
        </Campo>
        <Campo etiqueta="Nombre comercial" nombre="nombreComercial">
          <Entrada name="nombreComercial" defaultValue={tercero?.nombreComercial ?? ""} maxLength={200} />
        </Campo>
        <Campo etiqueta="Identificación fiscal (NIT / Tax ID) *" nombre="identificacionFiscal">
          <Entrada name="identificacionFiscal" defaultValue={tercero?.identificacionFiscal} maxLength={40} required />
        </Campo>
        <Campo etiqueta="Ámbito *" nombre="ambito">
          <Selector name="ambito" defaultValue={tercero?.ambito ?? "NACIONAL"} opciones={opciones(ETIQUETA_AMBITO)} />
        </Campo>
        <Campo etiqueta="País *" nombre="pais">
          <Entrada name="pais" defaultValue={tercero?.pais ?? "Colombia"} maxLength={80} required />
        </Campo>
        <Campo etiqueta="Ciudad" nombre="ciudad">
          <Entrada name="ciudad" defaultValue={tercero?.ciudad ?? ""} maxLength={80} />
        </Campo>
        <Campo etiqueta="Dirección" nombre="direccion" className="sm:col-span-2">
          <Entrada name="direccion" defaultValue={tercero?.direccion ?? ""} maxLength={250} />
        </Campo>
        <Campo etiqueta="Correo electrónico" nombre="correo">
          <Entrada name="correo" type="email" defaultValue={tercero?.correo ?? ""} maxLength={200} />
        </Campo>
        <Campo etiqueta="Teléfono" nombre="telefono">
          <Entrada name="telefono" defaultValue={tercero?.telefono ?? ""} maxLength={40} />
        </Campo>
        <Campo etiqueta="Persona de contacto" nombre="contacto" className="sm:col-span-2">
          <Entrada name="contacto" defaultValue={tercero?.contacto ?? ""} maxLength={120} />
        </Campo>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Roles comerciales * (puede seleccionar varios)</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {opciones(ETIQUETA_ROL_TERCERO).map(([valor, etiqueta]) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="roles" value={valor} defaultChecked={tercero?.roles.includes(valor)} className="size-4" />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <Campo etiqueta="Observaciones" nombre="observaciones">
        <AreaTexto name="observaciones" defaultValue={tercero?.observaciones ?? ""} maxLength={1000} />
      </Campo>
    </div>
  )
}
