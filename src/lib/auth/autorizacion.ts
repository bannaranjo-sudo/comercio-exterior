import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import type { CodigoPermiso } from "@/lib/permisos/catalogo";

export type CodigoError = "NO_AUTENTICADO" | "SIN_MEMBRESIA" | "PERMISO_DENEGADO";

export class ErrorAutorizacion extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorAutorizacion";
  }
}

export type ContextoAcceso = {
  usuarioId: string;
  empresaId: string;
  rolId: string;
  rolNombre: string;
  permisos: ReadonlySet<string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const membresiaActivaDondeFiltro = (usuarioId: string, empresaId: string) => ({
  empresaId,
  usuarioId,
  activo: true,
  usuario: { activo: true },
  empresa: { activa: true },
});

/** Empresas a las que el usuario pertenece con membresía activa. */
export function listarMembresias(usuarioId: string) {
  return db.empresaUsuario.findMany({
    where: {
      usuarioId,
      activo: true,
      usuario: { activo: true },
      empresa: { activa: true },
    },
    include: { empresa: true, rol: true },
    orderBy: { empresa: { razonSocial: "asc" } },
  });
}

/** Identidad del usuario a partir de la sesión validada en el servidor (cookie), nunca de parámetros del cliente. */
export async function usuarioIdDeSesion(headers: Headers): Promise<string> {
  const sesion = await auth.api.getSession({ headers });
  if (!sesion) {
    throw new ErrorAutorizacion("NO_AUTENTICADO", "Se requiere iniciar sesión.");
  }
  return sesion.user.id;
}

/**
 * Valida sesión, membresía activa en la empresa y permiso, consultando PostgreSQL.
 * Lanza ErrorAutorizacion si algo falla.
 */
export async function autorizar(
  headers: Headers,
  empresaId: string,
  permiso: CodigoPermiso,
): Promise<ContextoAcceso> {
  const usuarioId = await usuarioIdDeSesion(headers);

  const membresia = UUID.test(empresaId)
    ? await db.empresaUsuario.findFirst({
        where: membresiaActivaDondeFiltro(usuarioId, empresaId),
        include: { rol: { include: { permisos: { include: { permiso: true } } } } },
      })
    : null;
  if (!membresia) {
    throw new ErrorAutorizacion("SIN_MEMBRESIA", "El usuario no pertenece a la empresa.");
  }

  const permisos = new Set(membresia.rol.permisos.map((rp) => rp.permiso.codigo));
  if (!permisos.has(permiso)) {
    throw new ErrorAutorizacion("PERMISO_DENEGADO", "Permiso insuficiente.");
  }

  return {
    usuarioId,
    empresaId,
    rolId: membresia.rolId,
    rolNombre: membresia.rol.nombre,
    permisos,
  };
}
