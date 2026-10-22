// Modelo común de los reportes: cada consulta devuelve la misma estructura, que la pantalla dibuja y los
// exportadores (CSV, Excel, PDF) serializan sin recalcular nada.

export type TipoColumna = "texto" | "entero" | "decimal" | "fecha";

export type Columna = {
  clave: string;
  etiqueta: string;
  tipo: TipoColumna;
  /** Decimales a mostrar para columnas "decimal" (por defecto 2). */
  decimales?: number;
};

/** texto → string · entero → number · decimal → string exacto (nunca float) · fecha → "AAAA-MM-DD". */
export type Valor = string | number | null;

export type Fila = { celdas: Record<string, Valor>; href?: string };

export type Tabla = {
  id: string;
  titulo: string;
  columnas: Columna[];
  filas: Fila[];
  /** Total de filas que cumplen los filtros (puede ser mayor que `filas` si está paginada o limitada). */
  total: number;
  pagina?: number;
  tamanoPagina?: number;
  /** Nota sobre el contenido (p. ej. límites). */
  nota?: string;
};

export type Kpi = { etiqueta: string; valor: string; detalle?: string; tono?: "primary" | "success" | "warning" | "danger" | "neutral"; href?: string };

export type PuntoGrafico = { etiqueta: string; valor: number; detalle?: string };

export type Grafico =
  | { tipo: "barras"; id: string; titulo: string; unidad?: string; puntos: PuntoGrafico[] }
  | { tipo: "columnas"; id: string; titulo: string; unidad?: string; categorias: string[]; series: { nombre: string; valores: number[] }[] };

export type IdReporte = "resumen" | "operaciones" | "logistica" | "costos" | "inventarios" | "documentos" | "terceros";

export type ReporteDatos = {
  id: IdReporte;
  titulo: string;
  descripcion: string;
  /** Campo sobre el que se aplica el período (se informa en pantalla y en las exportaciones). */
  campoPeriodo: string;
  kpis: Kpi[];
  graficos: Grafico[];
  /** La primera tabla es la principal (la que se pagina y la que exporta CSV por defecto). */
  tablas: Tabla[];
  /** Avisos de datos (p. ej. monedas separadas). */
  avisos: string[];
};

export const TAMANO_PAGINA_REPORTE = 20;
/** Tope de filas de una exportación completa; si se supera, se rechaza en vez de truncar en silencio. */
export const MAX_FILAS_EXPORTACION = 20_000;
