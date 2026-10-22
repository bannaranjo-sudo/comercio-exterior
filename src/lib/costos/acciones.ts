"use server";

import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as servicio from "@/lib/costos/servicio";
import { datosFormulario } from "@/lib/validacion";

export async function accionRegistrarCosto(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("costos:crear", "Costo registrado.", async (ctx) => {
    await servicio.registrarCosto(ctx, String(formData.get("operacionId") ?? ""), datosFormulario(formData));
  });
}

export async function accionActualizarCosto(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("costos:editar", "Costo actualizado.", (ctx) =>
    servicio.actualizarCosto(ctx, String(formData.get("id") ?? ""), datosFormulario(formData)),
  );
}

export async function accionEliminarCosto(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("costos:eliminar", "Costo eliminado.", (ctx) => servicio.eliminarCosto(ctx, String(formData.get("id") ?? "")));
}
