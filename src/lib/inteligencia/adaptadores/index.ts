import { adaptadorOpenAI } from "@/lib/inteligencia/adaptadores/openai";
import { adaptadorRegistrado, registrarAdaptador } from "@/lib/inteligencia/proveedores";

/** Registra los adaptadores reales sin reemplazar los ya registrados (p. ej. simulados en pruebas). */
export function registrarAdaptadoresPredeterminados(): void {
  if (!adaptadorRegistrado("OPENAI")) registrarAdaptador(adaptadorOpenAI);
}
