"use server";

import { redirect } from "next/navigation";
import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as servicio from "@/lib/terceros/servicio";
import { datosFormulario } from "@/lib/validacion";

export async function accionCrearTercero(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("terceros:crear", "Tercero creado.", async (ctx) => {
    const tercero = await servicio.crearTercero(ctx, datosFormulario(formData));
    redirect(`/terceros/${tercero.id}?creado=1`);
  });
}

export async function accionActualizarTercero(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("terceros:editar", "Cambios guardados.", async (ctx) => {
    await servicio.actualizarTercero(ctx, String(formData.get("id") ?? ""), datosFormulario(formData));
  });
}

export async function accionCambiarEstadoTercero(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const activo = formData.get("activo") === "true";
  return proteger("terceros:editar", activo ? "Tercero activado." : "Tercero desactivado.", (ctx) =>
    servicio.cambiarEstadoTercero(ctx, String(formData.get("id") ?? ""), activo),
  );
}
