import { hashToken } from "@/lib/administracion/servicio";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { LARGO_MINIMO_CLAVE } from "@/lib/auth/usuarios";

/** Invitación vigente (no usada ni vencida) para un token; null si no es válida. */
export async function consultarInvitacion(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const invitacion = await db.invitacion.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { select: { nombre: true, correo: true, activo: true } }, empresa: { select: { razonSocial: true } } },
  });
  if (!invitacion || invitacion.usadaEn || invitacion.expiraEn <= new Date() || !invitacion.usuario.activo) return null;
  return { usuario: invitacion.usuario, empresa: invitacion.empresa.razonSocial, expiraEn: invitacion.expiraEn };
}

/**
 * Define la contraseña propia del usuario invitado. El token es de un solo uso; nunca reemplaza una
 * contraseña existente: si el usuario ya tiene credenciales, la activación se rechaza.
 */
export async function activarCuenta(token: string, clave: string, confirmacion: string): Promise<void> {
  if (clave.length < LARGO_MINIMO_CLAVE) throw new ErrorValidacion(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  if (clave.length > 128) throw new ErrorValidacion("La contraseña admite hasta 128 caracteres.");
  if (clave !== confirmacion) throw new ErrorValidacion("Las contraseñas no coinciden.");
  const hash = await (await auth.$context).password.hash(clave);

  await db.$transaction(async (tx) => {
    const invitacion = await tx.invitacion.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitacion) throw new ErrorValidacion("El enlace de activación no es válido o ya venció.");
    // Marca la invitación como usada solo si sigue vigente: dos usos simultáneos no pueden prosperar ambos.
    const { count } = await tx.invitacion.updateMany({
      where: { id: invitacion.id, usadaEn: null, expiraEn: { gt: new Date() } },
      data: { usadaEn: new Date() },
    });
    if (count === 0) throw new ErrorValidacion("El enlace de activación no es válido o ya venció.");
    if ((await tx.account.count({ where: { userId: invitacion.usuarioId, providerId: "credential" } })) > 0) {
      throw new ErrorValidacion("Esta cuenta ya tiene una contraseña definida.");
    }
    await tx.account.create({ data: { userId: invitacion.usuarioId, providerId: "credential", accountId: invitacion.usuarioId, password: hash } });
    await tx.usuario.update({ where: { id: invitacion.usuarioId }, data: { emailVerified: true } });
  });
}
