import { createHash, randomBytes } from "node:crypto";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { listarMembresias } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { parsear, texto, uuid, z } from "@/lib/validacion";

// Administración de usuarios de UNA empresa. Todo se filtra por ctx.empresaId: un administrador
// nunca ve ni modifica usuarios, roles o membresías de otra empresa. No hay autorregistro y
// nunca se crean ni se tocan contraseñas aquí: el usuario define la suya con un enlace de un solo uso.

export const VIGENCIA_INVITACION_MS = 48 * 60 * 60 * 1000;
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export async function empresasAutorizadas(ctx: ContextoAcceso) {
  const membresias = await listarMembresias(ctx.usuarioId);
  return membresias.map((m) => ({ id: m.empresaId, nombre: m.empresa.razonSocial, rol: m.rol.nombre, activa: m.empresaId === ctx.empresaId }));
}

export async function listarMiembros(ctx: ContextoAcceso) {
  const miembros = await db.empresaUsuario.findMany({
    where: { empresaId: ctx.empresaId },
    include: {
      usuario: {
        select: {
          id: true, nombre: true, correo: true, activo: true,
          cuentas: { where: { providerId: "credential" }, select: { id: true } },
          invitacionesRecibidas: { where: { empresaId: ctx.empresaId, usadaEn: null, expiraEn: { gt: new Date() } }, select: { id: true } },
        },
      },
      rol: { select: { id: true, nombre: true, permisos: { select: { permiso: { select: { codigo: true } } } } } },
    },
    orderBy: { usuario: { nombre: "asc" } },
  });
  return miembros.map((m) => ({
    usuarioId: m.usuarioId,
    nombre: m.usuario.nombre,
    correo: m.usuario.correo,
    usuarioActivo: m.usuario.activo,
    membresiaActiva: m.activo,
    rolId: m.rol.id,
    rolNombre: m.rol.nombre,
    permisos: m.rol.permisos.map((p) => p.permiso.codigo).sort(),
    tieneCredenciales: m.usuario.cuentas.length > 0,
    invitacionVigente: m.usuario.invitacionesRecibidas.length > 0,
  }));
}

export function listarRolesEmpresa(ctx: ContextoAcceso) {
  return db.rol.findMany({
    where: { empresaId: ctx.empresaId },
    select: { id: true, nombre: true, descripcion: true, permisos: { select: { permiso: { select: { codigo: true } } } } },
    orderBy: { nombre: "asc" },
  });
}

async function rolDeEmpresa(ctx: ContextoAcceso, rolId: string) {
  const rol = uuid("El rol").safeParse(rolId).success ? await db.rol.findFirst({ where: { id: rolId, empresaId: ctx.empresaId } }) : null;
  if (!rol) throw new ErrorValidacion("El rol seleccionado no existe en esta empresa.");
  return rol;
}

async function miembroDeEmpresa(ctx: ContextoAcceso, usuarioId: string) {
  const miembro = uuid("El usuario").safeParse(usuarioId).success
    ? await db.empresaUsuario.findFirst({ where: { empresaId: ctx.empresaId, usuarioId }, include: { rol: { select: { nombre: true } } } })
    : null;
  if (!miembro) throw new ErrorValidacion("El usuario no pertenece a esta empresa.");
  return miembro;
}

/** Administradores activos de la empresa, excluyendo opcionalmente a un usuario. */
function administradoresActivos(ctx: ContextoAcceso, excluirUsuarioId?: string) {
  return db.empresaUsuario.count({
    where: {
      empresaId: ctx.empresaId, activo: true, rol: { nombre: "Administrador" }, usuario: { activo: true },
      ...(excluirUsuarioId ? { usuarioId: { not: excluirUsuarioId } } : {}),
    },
  });
}

const esquemaUsuario = z.object({
  correo: z.string({ error: "El correo es obligatorio." }).trim().toLowerCase().pipe(z.email("El correo electrónico no es válido.").max(200)),
  nombre: texto("El nombre", 120),
  rolId: uuid("El rol"),
});

export type ResultadoInvitacion =
  | { tipo: "invitado"; token: string; expiraEn: Date; correo: string }
  | { tipo: "asociado"; correo: string };

async function crearInvitacion(tx: Pick<typeof db, "invitacion">, empresaId: string, usuarioId: string, creadoPorId: string) {
  // Las invitaciones anteriores del usuario en esta empresa dejan de ser válidas.
  await tx.invitacion.updateMany({ where: { empresaId, usuarioId, usadaEn: null }, data: { usadaEn: new Date() } });
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + VIGENCIA_INVITACION_MS);
  await tx.invitacion.create({ data: { empresaId, usuarioId, tokenHash: hashToken(token), expiraEn, creadoPorId } });
  return { token, expiraEn };
}

/**
 * Agrega un usuario a la empresa. Si el correo es nuevo se crea sin credenciales y se genera un enlace de
 * activación de un solo uso (el token solo se devuelve aquí; en base solo queda su hash). Si el correo ya
 * existe en el sistema, solo se le asocia a esta empresa, sin tocar su cuenta ni su contraseña.
 */
export async function agregarUsuario(ctx: ContextoAcceso, datos: unknown): Promise<ResultadoInvitacion> {
  const d = parsear(esquemaUsuario, datos);
  const rol = await rolDeEmpresa(ctx, d.rolId);
  return db.$transaction(async (tx) => {
    const existente = await tx.usuario.findUnique({ where: { correo: d.correo } });
    if (existente) {
      const yaMiembro = await tx.empresaUsuario.findUnique({ where: { empresaId_usuarioId: { empresaId: ctx.empresaId, usuarioId: existente.id } } });
      if (yaMiembro) throw new ErrorValidacion("Ese usuario ya pertenece a esta empresa.");
      await tx.empresaUsuario.create({ data: { empresaId: ctx.empresaId, usuarioId: existente.id, rolId: rol.id } });
      return { tipo: "asociado" as const, correo: d.correo };
    }
    const usuario = await tx.usuario.create({ data: { correo: d.correo, nombre: d.nombre } });
    await tx.empresaUsuario.create({ data: { empresaId: ctx.empresaId, usuarioId: usuario.id, rolId: rol.id } });
    const { token, expiraEn } = await crearInvitacion(tx, ctx.empresaId, usuario.id, ctx.usuarioId);
    return { tipo: "invitado" as const, token, expiraEn, correo: d.correo };
  });
}

/** Nuevo enlace de activación para un miembro que aún no definió su contraseña. */
export async function reenviarInvitacion(ctx: ContextoAcceso, usuarioId: string) {
  const miembro = await miembroDeEmpresa(ctx, usuarioId);
  const credenciales = await db.account.count({ where: { userId: miembro.usuarioId, providerId: "credential" } });
  if (credenciales > 0) throw new ErrorValidacion("El usuario ya activó su cuenta; no requiere invitación.");
  const usuario = await db.usuario.findUniqueOrThrow({ where: { id: miembro.usuarioId }, select: { correo: true } });
  const { token, expiraEn } = await db.$transaction((tx) => crearInvitacion(tx, ctx.empresaId, miembro.usuarioId, ctx.usuarioId));
  return { tipo: "invitado" as const, token, expiraEn, correo: usuario.correo };
}

export async function cambiarEstadoMiembro(ctx: ContextoAcceso, usuarioId: string, activo: boolean) {
  const miembro = await miembroDeEmpresa(ctx, usuarioId);
  if (!activo) {
    if (miembro.usuarioId === ctx.usuarioId) throw new ErrorValidacion("No puede desactivar su propia membresía.");
    if (miembro.rol.nombre === "Administrador" && (await administradoresActivos(ctx, miembro.usuarioId)) === 0) {
      throw new ErrorValidacion("Debe quedar al menos un administrador activo en la empresa.");
    }
  }
  await db.empresaUsuario.update({ where: { id: miembro.id }, data: { activo } });
}

export async function cambiarRolMiembro(ctx: ContextoAcceso, usuarioId: string, rolId: string) {
  const miembro = await miembroDeEmpresa(ctx, usuarioId);
  const rol = await rolDeEmpresa(ctx, rolId);
  if (miembro.rol.nombre === "Administrador" && rol.nombre !== "Administrador" && (await administradoresActivos(ctx, miembro.usuarioId)) === 0) {
    throw new ErrorValidacion("Debe quedar al menos un administrador activo en la empresa.");
  }
  await db.empresaUsuario.update({ where: { id: miembro.id }, data: { rolId: rol.id } });
}
