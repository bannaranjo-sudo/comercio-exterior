import type { SentidoMovimiento, TipoMovimiento } from "@/generated/prisma/enums";
import type { EstadoStock } from "@/lib/inventarios/consultas";

export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  RECEPCION: "Recepción",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
  COMPENSACION: "Compensación",
};

export const ETIQUETA_SENTIDO: Record<SentidoMovimiento, string> = { ENTRADA: "Entrada", SALIDA: "Salida" };

export const ETIQUETA_ESTADO_STOCK: Record<EstadoStock, string> = {
  OK: "Con existencias",
  BAJO_MINIMO: "Bajo mínimo",
  SIN_STOCK: "Sin existencias",
};

export const TONO_ESTADO_STOCK = { OK: "success", BAJO_MINIMO: "warning", SIN_STOCK: "danger" } as const;
