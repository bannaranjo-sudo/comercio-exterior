"use server";

import { APIError } from "better-auth/api";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { listarMembresias } from "@/lib/auth/autorizacion";
import { EMPRESA_COOKIE } from "@/lib/auth/sesion";

export type EstadoFormulario = { error?: string };

async function fijarEmpresaActiva(empresaId: string): Promise<void> {
  (await cookies()).set(EMPRESA_COOKIE, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function iniciarSesion(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const correo = String(formData.get("correo") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");
  if (!correo || !clave) return { error: "Ingrese su correo y contraseña." };

  let usuarioId: string;
  try {
    const { user } = await auth.api.signInEmail({
      body: { email: correo, password: clave },
      headers: await headers(),
    });
    usuarioId = user.id;
  } catch (error) {
    if (error instanceof APIError) {
      return { error: "Correo o contraseña incorrectos." };
    }
    throw error;
  }

  const membresias = await listarMembresias(usuarioId);
  if (membresias.length === 1) {
    await fijarEmpresaActiva(membresias[0].empresaId);
    redirect("/");
  }
  redirect("/seleccionar-empresa");
}

export async function cerrarSesion(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete(EMPRESA_COOKIE);
  redirect("/acceso");
}

export async function seleccionarEmpresa(formData: FormData): Promise<void> {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect("/acceso");

  const empresaId = String(formData.get("empresaId") ?? "");
  const membresias = await listarMembresias(sesion.user.id);
  if (!membresias.some((m) => m.empresaId === empresaId)) {
    redirect("/seleccionar-empresa");
  }
  await fijarEmpresaActiva(empresaId);
  redirect("/");
}
