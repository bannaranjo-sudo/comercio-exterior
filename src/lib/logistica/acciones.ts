"use server";

import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as servicio from "@/lib/logistica/servicio";
import { datosFormulario } from "@/lib/validacion";

export async function accionGuardarEnvio(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("logistica:editar", "Datos de transporte guardados.", (ctx) =>
    servicio.guardarEnvio(ctx, String(formData.get("operacionId") ?? ""), datosFormulario(formData)),
  );
}

export async function accionRegistrarEvento(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("logistica:crear", "Evento registrado.", async (ctx) => {
    await servicio.registrarEvento(ctx, String(formData.get("operacionId") ?? ""), datosFormulario(formData));
  });
}

export async function accionResolverNovedad(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("logistica:editar", "Novedad marcada como resuelta.", (ctx) =>
    servicio.resolverNovedad(ctx, String(formData.get("id") ?? "")),
  );
}
