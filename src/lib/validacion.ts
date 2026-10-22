import { z } from "zod";
import { ErrorValidacion } from "@/lib/errores";

export { z };

/** Convierte FormData en objeto: campos vacíos ausentes se omiten; claves repetidas se agrupan en listas. */
export function datosFormulario(formData: FormData): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const clave of new Set(formData.keys())) {
    const valores = formData.getAll(clave);
    salida[clave] = valores.length > 1 ? valores : valores[0];
  }
  return salida;
}

/** Valida con zod y lanza ErrorValidacion con un mensaje legible (primer problema). */
export function parsear<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;
  const [problema] = resultado.error.issues;
  throw new ErrorValidacion(problema.message);
}

const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const texto = (etiqueta: string, max = 200) =>
  z
    .string({ error: `${etiqueta} es obligatorio.` })
    .trim()
    .min(1, `${etiqueta} es obligatorio.`)
    .max(max, `${etiqueta} admite hasta ${max} caracteres.`);

export const textoOpcional = (etiqueta: string, max = 500) =>
  z.preprocess(vacioAUndefined, z.string().trim().max(max, `${etiqueta} admite hasta ${max} caracteres.`).optional());

export const correoOpcional = () =>
  z.preprocess(vacioAUndefined, z.email("El correo electrónico no es válido.").max(200, "El correo admite hasta 200 caracteres.").optional());

export const uuid = (etiqueta: string) => z.uuid({ error: `${etiqueta} no es válido.` });

export const uuidOpcional = (etiqueta: string) => z.preprocess(vacioAUndefined, z.uuid({ error: `${etiqueta} no es válido.` }).optional());

/** Fecha "AAAA-MM-DD" como Date a medianoche UTC (columnas @db.Date). */
export const fecha = (etiqueta: string) =>
  z
    .string({ error: `${etiqueta} es obligatoria.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${etiqueta} no es válida.`)
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), `${etiqueta} no es válida.`)
    .transform((s) => new Date(`${s}T00:00:00Z`));

export const fechaOpcional = (etiqueta: string) => z.preprocess(vacioAUndefined, fecha(etiqueta).optional());

/** Moneda ISO 4217 de tres letras mayúsculas. */
export const moneda = z
  .string({ error: "La moneda es obligatoria." })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "La moneda debe ser un código de 3 letras (p. ej. USD).");

/** Importe decimal exacto (hasta 2 decimales, sin separador de miles); se conserva como texto. */
export const importe = (etiqueta: string) =>
  z
    .string({ error: `${etiqueta} es obligatorio.` })
    .trim()
    .regex(/^\d{1,16}([.,]\d{1,2})?$/, `${etiqueta} no es válido (use dígitos y hasta 2 decimales).`)
    .transform((s) => s.replace(",", "."));

export const booleanoFormulario = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const listaFormulario = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(esquema));

/** En ediciones, un campo opcional vacío debe limpiar el valor guardado (null), no ignorarse. */
export const vaciosANull = <T extends Record<string, unknown>>(datos: T): { [K in keyof T]: Exclude<T[K], undefined> | (undefined extends T[K] ? null : never) } =>
  Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v === undefined ? null : v])) as never;
