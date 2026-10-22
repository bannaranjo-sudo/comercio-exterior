"use server";

import { redirect } from "next/navigation";
import { proteger, type EstadoAccion } from "@/lib/acciones";
import { cancelarAnalisis, ejecutarAnalisis, enviarARevision, reintentarAnalisis, solicitarAnalisisDocumental } from "@/lib/inteligencia/documental/analisis";

// Acciones del análisis documental. Todas exigen sesión y permiso en la empresa activa (validada en el servidor);
// la empresa nunca llega desde el cliente. Ninguna modifica operaciones, inventarios ni costos.

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function accionSolicitarAnalisisDocumental(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:ejecutar", "Solicitud registrada.", async (ctx) => {
    const r = await solicitarAnalisisDocumental(ctx, { operacionId: texto(formData, "operacionId"), documentoIds: formData.getAll("documentoId") });
    redirect(`/inteligencia/solicitudes/${r.ejecucionId}${r.ejecutada ? "" : "?cola=1"}`);
  });
}

export async function accionEjecutarAnalisis(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:ejecutar", "Análisis ejecutado.", (ctx) => ejecutarAnalisis(ctx, texto(formData, "id")));
}

export async function accionReintentarAnalisis(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:ejecutar", "Reintento procesado.", async (ctx) => {
    const r = await reintentarAnalisis(ctx, texto(formData, "id"));
    if (!r.ejecutada) return "La solicitud volvió a la cola (la ejecución está deshabilitada en este entorno).";
  });
}

export async function accionCancelarAnalisis(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:ejecutar", "Solicitud cancelada.", (ctx) => cancelarAnalisis(ctx, texto(formData, "id")));
}

export async function accionEnviarARevision(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:ejecutar", "Enviado a revisión.", (ctx) => enviarARevision(ctx, texto(formData, "resultadoId")));
}
