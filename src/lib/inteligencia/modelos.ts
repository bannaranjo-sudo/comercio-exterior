import type { ProveedorIA } from "@/generated/prisma/enums";

// Modelos autorizados por proveedor. Se configuran en el servidor (sin cambiar código) con
// OPENAI_MODELOS_PERMITIDOS="modelo-a,modelo-b". Un proveedor sin lista admite cualquier identificador válido.
const OPENAI_POR_DEFECTO = ["gpt-5-mini", "gpt-5", "gpt-4.1-mini", "gpt-4.1"];

export function modelosPermitidos(proveedor: ProveedorIA): readonly string[] | null {
  if (proveedor !== "OPENAI") return null;
  const configurados = (process.env.OPENAI_MODELOS_PERMITIDOS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return configurados.length > 0 ? configurados : OPENAI_POR_DEFECTO;
}
