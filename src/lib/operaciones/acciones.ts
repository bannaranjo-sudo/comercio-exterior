"use server";

import { redirect } from "next/navigation";
import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as servicio from "@/lib/operaciones/servicio";
import { datosFormulario } from "@/lib/validacion";

export async function accionCrearOperacion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("operaciones:crear", "Operación creada.", async (ctx) => {
    const operacion = await servicio.crearOperacion(ctx, datosFormulario(formData));
    redirect(`/operaciones/${operacion.id}?creada=1`);
  });
}

export async function accionActualizarOperacion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("operaciones:editar", "Cambios guardados.", async (ctx) => {
    await servicio.actualizarOperacion(ctx, String(formData.get("id") ?? ""), datosFormulario(formData));
  });
}

export async function accionCambiarEstadoOperacion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("operaciones:editar", "Estado actualizado.", async (ctx) => {
    await servicio.cambiarEstadoOperacion(ctx, String(formData.get("id") ?? ""), formData.get("estado"), formData.get("motivo"));
  });
}
