"use server";

import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as servicio from "@/lib/administracion/servicio";
import { datosFormulario } from "@/lib/validacion";

const urlActivacion = (token: string) => `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/activar/${token}`;

const mensajeInvitacion = (r: servicio.ResultadoInvitacion) =>
  r.tipo === "asociado"
    ? `${r.correo} ya tenía cuenta: se asoció a esta empresa. Su contraseña no se modificó.`
    : `Usuario ${r.correo} creado. Entregue este enlace de activación (un solo uso, vence en 48 h; no se volverá a mostrar): ${urlActivacion(r.token)}`;

export async function accionAgregarUsuario(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("administracion:administrar", "Usuario agregado.", async (ctx) => mensajeInvitacion(await servicio.agregarUsuario(ctx, datosFormulario(formData))));
}

export async function accionReenviarInvitacion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("administracion:administrar", "Invitación generada.", async (ctx) => mensajeInvitacion(await servicio.reenviarInvitacion(ctx, String(formData.get("usuarioId") ?? ""))));
}

export async function accionCambiarEstadoMiembro(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const activo = formData.get("activo") === "true";
  return proteger("administracion:administrar", activo ? "Membresía activada." : "Membresía desactivada.", (ctx) =>
    servicio.cambiarEstadoMiembro(ctx, String(formData.get("usuarioId") ?? ""), activo),
  );
}

export async function accionCambiarRolMiembro(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("administracion:administrar", "Rol actualizado.", (ctx) =>
    servicio.cambiarRolMiembro(ctx, String(formData.get("usuarioId") ?? ""), String(formData.get("rolId") ?? "")),
  );
}
