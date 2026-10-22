"use server";

import { redirect } from "next/navigation";
import type { EstadoAccion } from "@/lib/acciones";
import { activarCuenta } from "@/lib/auth/activacion";
import { ErrorValidacion } from "@/lib/errores";

// Acción pública (no hay sesión): su única protección es el token de un solo uso del enlace.
export async function accionActivarCuenta(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  try {
    await activarCuenta(String(formData.get("token") ?? ""), String(formData.get("clave") ?? ""), String(formData.get("confirmacion") ?? ""));
  } catch (error) {
    if (error instanceof ErrorValidacion) return { error: error.message };
    throw error;
  }
  redirect("/acceso");
}
