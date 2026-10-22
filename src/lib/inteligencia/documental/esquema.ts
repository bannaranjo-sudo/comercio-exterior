import { z } from "zod";

// Contrato del informe que produce el modelo. Todo lo que no cumpla este esquema se rechaza: no se "repara" ni se inventa.

export const CAMPOS = [
  "proveedor", "comprador", "numero_factura", "fecha_factura", "mercancia", "cantidad", "unidad", "valor_unitario", "valor_total",
  "moneda", "incoterm", "pais_origen", "caracteristica_tecnica", "otro",
] as const;
export type Campo = (typeof CAMPOS)[number];

export const ETIQUETA_CAMPO: Record<Campo, string> = {
  proveedor: "Proveedor", comprador: "Comprador", numero_factura: "Número de factura", fecha_factura: "Fecha de factura",
  mercancia: "Descripción de la mercancía", cantidad: "Cantidad", unidad: "Unidad", valor_unitario: "Valor unitario",
  valor_total: "Valor total", moneda: "Moneda", incoterm: "Incoterm", pais_origen: "País de origen declarado",
  caracteristica_tecnica: "Característica técnica", otro: "Otro dato",
};

const evidencia = z.object({
  documentoId: z.string().max(60),
  pagina: z.number().int().min(1).max(1000).nullish(),
  cita: z.string().trim().min(3).max(300),
});

const dato = z.object({
  campo: z.enum(CAMPOS),
  etiqueta: z.string().trim().max(80).optional(),
  valor: z.string().trim().min(1).max(500),
  tipo: z.enum(["extraido", "inferido"]),
  explicacion: z.string().trim().max(300).optional(),
  evidencia: z.array(evidencia).max(4).default([]),
});

const inconsistencia = z.object({
  titulo: z.string().trim().min(3).max(120),
  detalle: z.string().trim().min(3).max(600),
  nivel: z.enum(["bajo", "medio", "alto"]),
  evidencia: z.array(evidencia).max(6).default([]),
});

export const salidaModeloSchema = z.object({
  resumen: z.string().trim().min(1).max(1500),
  datos: z.array(dato).max(60),
  inconsistencias: z.array(inconsistencia).max(30),
  faltantes: z.array(z.object({ elemento: z.string().trim().min(2).max(120), detalle: z.string().trim().max(300).optional() })).max(30),
  noEncontrado: z.array(z.enum(CAMPOS)).max(20),
});
export type SalidaModelo = z.infer<typeof salidaModeloSchema>;
export type EvidenciaModelo = z.infer<typeof evidencia>;

/** Interpreta la respuesta textual del modelo (JSON, con o sin bloque de código) y la valida contra el esquema. */
export function interpretarSalida(texto: string): { ok: true; salida: SalidaModelo } | { ok: false; motivo: string } {
  let t = texto.trim();
  const bloque = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (bloque) t = bloque[1];
  let json: unknown;
  try {
    json = JSON.parse(t);
  } catch {
    return { ok: false, motivo: "La respuesta no es JSON válido." };
  }
  const r = salidaModeloSchema.safeParse(json);
  if (!r.success) return { ok: false, motivo: `La respuesta no cumple el esquema (${r.error.issues[0]?.path.join(".") || "raíz"}).` };
  return { ok: true, salida: r.data };
}

export const DESCRIPCION_ESQUEMA = `{
  "resumen": "texto breve en español",
  "datos": [{"campo": "<${CAMPOS.join("|")}>", "etiqueta": "opcional", "valor": "texto", "tipo": "extraido|inferido", "explicacion": "opcional", "evidencia": [{"documentoId": "id del documento", "pagina": 1, "cita": "fragmento literal del documento"}]}],
  "inconsistencias": [{"titulo": "...", "detalle": "...", "nivel": "bajo|medio|alto", "evidencia": [...]}],
  "faltantes": [{"elemento": "...", "detalle": "opcional"}],
  "noEncontrado": ["<campo>", "..."]
}`;
