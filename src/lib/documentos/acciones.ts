"use server";

import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as servicio from "@/lib/documentos/servicio";
import { datosFormulario } from "@/lib/validacion";

export async function accionSubirDocumento(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("documentos:crear", "Documento cargado.", async (ctx) => {
    await servicio.subirDocumento(ctx, datosFormulario(formData), formData.get("archivo"));
  });
}

export async function accionCambiarEstadoDocumento(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("documentos:editar", "Estado del documento actualizado.", async (ctx) => {
    await servicio.cambiarEstadoDocumento(ctx, String(formData.get("id") ?? ""), formData.get("estado"), formData.get("observaciones"));
  });
}

export async function accionGuardarRequisitos(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("documentos:editar", "Lista de documentos requeridos guardada.", async (ctx) => {
    await servicio.guardarRequisitos(ctx, formData.get("tipoOperacion"), formData.getAll("tipos"));
  });
}
