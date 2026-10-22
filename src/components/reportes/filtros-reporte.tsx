import { BarraFiltros, EnlaceBoton, Entrada, Selector } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import {
  ETIQUETA_CATEGORIA_COSTO, ETIQUETA_ESTADO_COSTO, ETIQUETA_ESTADO_DOCUMENTO, ETIQUETA_ESTADO_ENVIO, ETIQUETA_ESTADO_OPERACION, ETIQUETA_MODALIDAD,
  ETIQUETA_ROL_TERCERO, ETIQUETA_TIPO_OPERACION, opciones,
} from "@/lib/etiquetas"
import { CAMPOS_POR_REPORTE, type FiltrosReporte } from "@/lib/reportes/filtros"
import type { OpcionesFiltros } from "@/lib/reportes/opciones"
import type { IdReporte } from "@/lib/reportes/tipos"

type Campo = keyof Omit<FiltrosReporte, "pagina" | "desde" | "hasta">

const ETIQUETA_PERIODO: Record<IdReporte, string> = {
  resumen: "Apertura", operaciones: "Apertura", logistica: "Apertura", costos: "Fecha del costo", inventarios: "Movimiento", documentos: "Apertura", terceros: "Apertura",
}

export function FiltrosReporteForm({ id, filtros, opcionesLista }: { id: IdReporte; filtros: FiltrosReporte; opcionesLista: OpcionesFiltros }) {
  const campos = new Set(CAMPOS_POR_REPORTE[id])
  const v = (k: Campo | "desde" | "hasta") => (filtros[k] ?? "") as string
  const hayFiltros = Object.entries(filtros).some(([k, x]) => k !== "pagina" && x !== undefined)
  const sel = (k: Campo, etiqueta: string, vacio: string, lista: readonly (readonly [string, string])[]) =>
    campos.has(k) && (
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        {etiqueta}
        <Selector name={k} defaultValue={v(k)} vacio={vacio} opciones={lista} />
      </label>
    )
  return (
    <BarraFiltros>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filtros del reporte">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Desde ({ETIQUETA_PERIODO[id].toLowerCase()})
          <Entrada name="desde" type="date" defaultValue={v("desde")} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Hasta
          <Entrada name="hasta" type="date" defaultValue={v("hasta")} />
        </label>
        {sel("tipo", "Tipo de operación", "Todos", opciones(ETIQUETA_TIPO_OPERACION))}
        {sel("estado", "Estado de la operación", "Todos", opciones(ETIQUETA_ESTADO_OPERACION))}
        {sel("pais", id === "terceros" ? "País del tercero" : "País (origen o destino)", "Todos", opcionesLista.paises)}
        {sel("terceroId", "Tercero", "Todos", opcionesLista.terceros)}
        {sel("operacionId", "Operación", "Todas", opcionesLista.operaciones)}
        {sel("responsableId", "Responsable", "Todos", opcionesLista.responsables)}
        {sel("modalidad", "Modalidad", "Todas", opciones(ETIQUETA_MODALIDAD))}
        {sel("estadoEnvio", "Estado del envío", "Todos", opciones(ETIQUETA_ESTADO_ENVIO))}
        {sel("moneda", "Moneda", "Todas", opcionesLista.monedas)}
        {sel("categoria", "Categoría de costo", "Todas", opciones(ETIQUETA_CATEGORIA_COSTO))}
        {sel("estadoCosto", "Tipo de costo", "Estimado y real", opciones(ETIQUETA_ESTADO_COSTO))}
        {sel("bodegaId", "Bodega", "Todas", opcionesLista.bodegas)}
        {sel("productoId", "Producto", "Todos", opcionesLista.productos)}
        {sel("estadoStock", "Estado de stock", "Todos", [["con_stock", "Con existencias"], ["sin_stock", "Sin existencias"], ["bajo_minimo", "Bajo el mínimo"]])}
        {sel("estadoDocumento", "Estado del documento", "Todos", opciones(ETIQUETA_ESTADO_DOCUMENTO))}
        {sel("rol", "Rol del tercero", "Todos", opciones(ETIQUETA_ROL_TERCERO))}
        {campos.has("retrasadas") && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="retrasadas" value="1" defaultChecked={filtros.retrasadas === "1"} className="size-4 accent-primary" /> Solo retrasadas</label>
        )}
        {campos.has("incompletos") && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="incompletos" value="1" defaultChecked={filtros.incompletos === "1"} className="size-4 accent-primary" /> Solo expedientes incompletos</label>
        )}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit">Aplicar filtros</Button>
          {hayFiltros && <EnlaceBoton href={`/reportes/${id}`} variante="ghost">Limpiar</EnlaceBoton>}
        </div>
      </form>
    </BarraFiltros>
  )
}
