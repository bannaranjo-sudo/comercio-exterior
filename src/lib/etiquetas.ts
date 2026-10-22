import type {
  AmbitoTercero,
  CategoriaCosto,
  EstadoCosto,
  EstadoDocumento,
  EstadoEnvio,
  EstadoOperacion,
  Incoterm,
  ModalidadTransporte,
  RolTercero,
  SeveridadNovedad,
  TipoDocumento,
  TipoEvento,
  TipoOperacion,
} from "@/generated/prisma/enums";

// Etiquetas en español de los valores enumerados (compartidas por servidor y cliente).

export const ETIQUETA_ROL_TERCERO: Record<RolTercero, string> = {
  PROVEEDOR: "Proveedor",
  CLIENTE: "Cliente",
  AGENTE_ADUANA: "Agente de aduana",
  TRANSPORTADOR: "Transportador",
  OPERADOR_LOGISTICO: "Operador logístico",
  OTRO: "Otro interviniente",
};

export const ETIQUETA_AMBITO: Record<AmbitoTercero, string> = {
  NACIONAL: "Nacional",
  INTERNACIONAL: "Internacional",
};

export const ETIQUETA_TIPO_OPERACION: Record<TipoOperacion, string> = {
  IMPORTACION: "Importación",
  EXPORTACION: "Exportación",
};

export const ETIQUETA_ESTADO_OPERACION: Record<EstadoOperacion, string> = {
  BORRADOR: "Borrador",
  EN_PREPARACION: "En preparación",
  EN_TRANSITO: "En tránsito",
  EN_ADUANA: "En aduana",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
};

export const ETIQUETA_INCOTERM: Record<Incoterm, string> = {
  EXW: "EXW · En fábrica", FCA: "FCA · Franco transportista", FAS: "FAS · Franco al costado del buque",
  FOB: "FOB · Franco a bordo", CFR: "CFR · Costo y flete", CIF: "CIF · Costo, seguro y flete",
  CPT: "CPT · Transporte pagado hasta", CIP: "CIP · Transporte y seguro pagados hasta",
  DAP: "DAP · Entregado en lugar", DPU: "DPU · Entregado en lugar descargado", DDP: "DDP · Entregado con derechos pagados",
};

export const ETIQUETA_MODALIDAD: Record<ModalidadTransporte, string> = {
  MARITIMO: "Marítimo", AEREO: "Aéreo", TERRESTRE: "Terrestre", MULTIMODAL: "Multimodal",
};

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  FACTURA_COMERCIAL: "Factura comercial",
  LISTA_EMPAQUE: "Lista de empaque",
  DOCUMENTO_TRANSPORTE: "Documento de transporte",
  CERTIFICADO_ORIGEN: "Certificado de origen",
  FICHA_TECNICA: "Ficha técnica",
  DECLARACION_ADUANERA: "Declaración de importación/exportación",
  POLIZA_SEGURO: "Póliza de seguro",
  OTRO: "Otros soportes",
};

export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  PENDIENTE: "Pendiente", RECIBIDO: "Recibido", OBSERVADO: "Observado", APROBADO: "Aprobado",
};

export const ETIQUETA_ESTADO_ENVIO: Record<EstadoEnvio, string> = {
  PROGRAMADO: "Programado", EN_TRANSITO: "En tránsito", EN_PUERTO: "En puerto", ENTREGADO: "Entregado", RETRASADO: "Retrasado",
};

export const ETIQUETA_TIPO_EVENTO: Record<TipoEvento, string> = { HITO: "Hito", NOVEDAD: "Novedad" };

export const ETIQUETA_SEVERIDAD: Record<SeveridadNovedad, string> = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta" };

export const ETIQUETA_CATEGORIA_COSTO: Record<CategoriaCosto, string> = {
  VALOR_COMERCIAL: "Valor comercial",
  FLETE_INTERNACIONAL: "Flete internacional",
  SEGURO: "Seguro",
  GASTOS_PORTUARIOS: "Gastos portuarios",
  AGENCIA_ADUANAS: "Agencia de aduanas",
  TRANSPORTE_NACIONAL: "Transporte nacional",
  ALMACENAMIENTO: "Almacenamiento",
  TRIBUTOS_ADUANEROS: "Tributos aduaneros",
  OTROS: "Otros gastos",
};

export const ETIQUETA_ESTADO_COSTO: Record<EstadoCosto, string> = { ESTIMADO: "Estimado", REAL: "Real" };

/** Pares [valor, etiqueta] para listas desplegables. */
export const opciones = <K extends string>(mapa: Record<K, string>): [K, string][] => Object.entries(mapa) as [K, string][];
