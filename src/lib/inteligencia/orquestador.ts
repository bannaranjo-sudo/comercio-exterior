// Estructura para el agente orquestador. Solo define contratos: la planificación real
// (y las llamadas a modelos) se implementará al integrar un proveedor.

export type PasoPlan = {
  agenteCodigo: string;
  objetivo: string;
  /** Índices de pasos previos de los que depende. */
  dependeDe: readonly number[];
};

export type PlanOrquestacion = { pasos: readonly PasoPlan[] };

export type SolicitudOrquestacion = {
  empresaId: string;
  descripcion: string;
  agentesDisponibles: readonly string[];
};

export interface Orquestador {
  planificar(solicitud: SolicitudOrquestacion): Promise<PlanOrquestacion>;
}

export class ErrorNoImplementado extends Error {
  constructor(funcion: string) {
    super(`${funcion} aún no está implementado.`);
    this.name = "ErrorNoImplementado";
  }
}

export const orquestadorPendiente: Orquestador = {
  planificar: () => Promise.reject(new ErrorNoImplementado("El orquestador")),
};
