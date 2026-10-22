import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import {
  autorizar,
  autorizarMembresia,
  ErrorAutorizacion,
  listarMembresias,
  type ContextoAcceso,
} from "@/lib/auth/autorizacion";
import type { CodigoPermiso } from "@/lib/permisos/catalogo";

export const EMPRESA_COOKIE = "empresa_activa";

/**
 * Control de acceso central para acciones y rutas del servidor.
 * La identidad sale de la sesión; empresaId se revalida contra las membresías en PostgreSQL.
 */
export async function requirePermission(
  empresaId: string,
  permiso: CodigoPermiso,
): Promise<ContextoAcceso> {
  return autorizar(await headers(), empresaId, permiso);
}

/** requirePermission sobre la empresa activa (cookie); la membresía y el permiso se revalidan en la base. */
export async function requirePermissionActiva(permiso: CodigoPermiso): Promise<ContextoAcceso> {
  const empresaId = (await cookies()).get(EMPRESA_COOKIE)?.value ?? "";
  return requirePermission(empresaId, permiso);
}

/** Exige sesión y empresa activa válida; redirige si falta alguna. */
export async function obtenerContextoUsuario() {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect("/acceso");

  const empresaId = (await cookies()).get(EMPRESA_COOKIE)?.value;
  const membresias = await listarMembresias(sesion.user.id);
  const activa = membresias.find((m) => m.empresaId === empresaId);
  if (!activa) redirect("/seleccionar-empresa");

  const permisosRol = await db.rolPermiso.findMany({
    where: { rolId: activa.rolId },
    select: { permiso: { select: { codigo: true } } },
  });

  return {
    permisos: permisosRol.map((p) => p.permiso.codigo),
    usuario: { id: sesion.user.id, nombre: sesion.user.name, correo: sesion.user.email },
    empresa: { id: activa.empresaId, nombre: activa.empresa.nombreComercial ?? activa.empresa.razonSocial },
    rol: activa.rol.nombre,
    multiempresa: membresias.length > 1,
  };
}

/**
 * Para secciones generales: exige sesión y membresía activa en la empresa activa, sin permiso específico.
 * Quien llama decide qué mostrar según ctx.permisos.
 */
export async function exigirMembresiaEmpresaActiva(): Promise<ContextoAcceso> {
  const empresaId = (await cookies()).get(EMPRESA_COOKIE)?.value ?? "";
  try {
    return await autorizarMembresia(await headers(), empresaId);
  } catch (error) {
    if (!(error instanceof ErrorAutorizacion)) throw error;
    redirect(error.codigo === "NO_AUTENTICADO" ? "/acceso" : "/seleccionar-empresa");
  }
}

/**
 * Para páginas: valida el permiso en la empresa activa.
 * Devuelve null si el usuario no tiene el permiso (la página muestra "acceso denegado").
 */
export async function exigirPermisoEmpresaActiva(
  permiso: CodigoPermiso,
): Promise<ContextoAcceso | null> {
  const empresaId = (await cookies()).get(EMPRESA_COOKIE)?.value ?? "";
  try {
    return await requirePermission(empresaId, permiso);
  } catch (error) {
    if (!(error instanceof ErrorAutorizacion)) throw error;
    if (error.codigo === "NO_AUTENTICADO") redirect("/acceso");
    if (error.codigo === "SIN_MEMBRESIA") redirect("/seleccionar-empresa");
    return null;
  }
}
