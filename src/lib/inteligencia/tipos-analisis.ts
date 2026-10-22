// Catálogo de tipos de análisis del Centro de Inteligencia y su disponibilidad REAL.
//
// - "disponible": se puede ejecutar hoy (aquí solo la revisión por reglas, que no usa IA).
// - "proximamente": la solicitud puede registrarse en cola, pero NO se ejecuta ningún análisis.

/** Interruptor único: pasa a true únicamente cuando exista un ejecutor real de análisis con agentes. */
export const EJECUCION_ANALISIS_DISPONIBLE = false;

export type DisponibilidadAnalisis = "disponible" | "proximamente";

export type TipoAnalisis = {
  id: "documental" | "arancelario" | "financiero" | "expediente";
  nombre: string;
  descripcion: string;
  /** Información o documentos que el análisis necesitará. */
  requiere: readonly string[];
  /** Código del agente que lo atenderá (si aplica). */
  agenteCodigo?: string;
  disponibilidad: DisponibilidadAnalisis;
};

export const TIPOS_ANALISIS: readonly TipoAnalisis[] = [
  {
    id: "documental",
    nombre: "Análisis documental",
    descripcion: "Revisión asistida de facturas, listas de empaque, certificados de origen y documentos de transporte.",
    requiere: ["Operación con documentos PDF cargados", "Tipo de documento a revisar"],
    agenteCodigo: "documental",
    disponibilidad: "proximamente",
  },
  {
    id: "arancelario",
    nombre: "Análisis arancelario",
    descripcion: "Apoyo a la clasificación arancelaria de mercancías y a la identificación de gravámenes aplicables.",
    requiere: ["Descripción técnica de la mercancía", "Ficha técnica o catálogo (opcional)"],
    agenteCodigo: "arancelario",
    disponibilidad: "proximamente",
  },
  {
    id: "financiero",
    nombre: "Análisis financiero",
    descripcion: "Revisión de costos estimados y reales, desviaciones y liquidación de una operación.",
    requiere: ["Operación con costos registrados"],
    agenteCodigo: "financiero",
    disponibilidad: "proximamente",
  },
  {
    id: "expediente",
    nombre: "Revisión de expediente",
    descripcion:
      "Verifica documentos faltantes, datos de transporte, novedades abiertas y costos de una operación. Funciona con reglas del sistema, sin IA.",
    requiere: ["Una operación existente"],
    disponibilidad: "disponible",
  },
];

export const tipoAnalisis = (id: string): TipoAnalisis | undefined => TIPOS_ANALISIS.find((t) => t.id === id);
