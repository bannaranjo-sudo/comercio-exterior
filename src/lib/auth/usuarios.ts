import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import type { NombreRol } from "@/lib/permisos/catalogo";

export const LARGO_MINIMO_CLAVE = 12;

type DatosUsuario = {
  correo: string;
  nombre: string;
  clave: string;
  membresias: readonly { identificacionFiscal: string; rol: NombreRol }[];
};

/**
 * Crea un usuario con credenciales (hash scrypt de Better Auth) y sus membresías.
 * Es el único camino de alta de cuentas: no existe registro público.
 */
export async function crearUsuarioConCredenciales(datos: DatosUsuario) {
  if (datos.clave.length < LARGO_MINIMO_CLAVE) {
    throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  }
  const correo = datos.correo.trim().toLowerCase();
  const contexto = await auth.$context;
  const hash = await contexto.password.hash(datos.clave);

  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: { correo, nombre: datos.nombre.trim(), emailVerified: true },
    });
    await tx.account.create({
      data: { userId: usuario.id, providerId: "credential", accountId: usuario.id, password: hash },
    });
    for (const m of datos.membresias) {
      const rol = await tx.rol.findFirstOrThrow({
        where: { nombre: m.rol, empresa: { identificacionFiscal: m.identificacionFiscal } },
      });
      await tx.empresaUsuario.create({
        data: { empresaId: rol.empresaId, usuarioId: usuario.id, rolId: rol.id },
      });
    }
    return usuario;
  });
}
