import { db } from "@/lib/db";
import { reenviarInvitacion, agregarUsuario } from "@/lib/administracion/servicio";
import { CATALOGO_PERMISOS, ROLES_INICIALES } from "@/lib/permisos/catalogo";

export const NIT_QA = "QA-0001";

export type OpcionesQa = { adminCorreo: string; adminNombre?: string; luisaCorreo?: string; luisaNombre?: string; baseURL: string };
export type ResultadoQa = { empresaId: string; enlaces: { etiqueta: string; url: string; expiraEn: Date }[] };

/**
 * Prepara una base de QA: permisos, empresa FICTICIA QA-0001, roles y cuentas sin contraseña con enlace de activación de
 * un solo uso. Idempotente. Se niega si la base contiene empresas que no sean de QA (evita mezclar datos reales).
 */
export async function inicializarEntornoQa(o: OpcionesQa): Promise<ResultadoQa> {
  const ajenas = await db.empresa.count({ where: { NOT: { identificacionFiscal: { startsWith: "QA-" } } } });
  if (ajenas > 0) throw new Error("La base contiene empresas que no son de QA: se rechaza para no mezclar datos reales.");

  const permisoIds = new Map<string, string>();
  for (const p of CATALOGO_PERMISOS) {
    permisoIds.set(p.codigo, (await db.permiso.upsert({ where: { codigo: p.codigo }, update: { descripcion: p.descripcion }, create: p })).id);
  }
  const empresa = await db.empresa.upsert({
    where: { identificacionFiscal: NIT_QA },
    update: {},
    create: { identificacionFiscal: NIT_QA, razonSocial: "Empresa Demostrativa QA (datos ficticios)", nombreComercial: "QA ficticia" },
  });
  const roles = new Map<string, string>();
  for (const [nombre, def] of Object.entries(ROLES_INICIALES)) {
    const rol = await db.rol.upsert({
      where: { empresaId_nombre: { empresaId: empresa.id, nombre } },
      update: { descripcion: def.descripcion },
      create: { empresaId: empresa.id, nombre, descripcion: def.descripcion },
    });
    roles.set(nombre, rol.id);
    const ids = def.permisos.map((c) => permisoIds.get(c)!);
    await db.rolPermiso.deleteMany({ where: { rolId: rol.id, permisoId: { notIn: ids } } });
    await db.rolPermiso.createMany({ data: ids.map((permisoId) => ({ rolId: rol.id, permisoId })), skipDuplicates: true });
  }

  const correoAdmin = o.adminCorreo.trim().toLowerCase();
  const admin =
    (await db.usuario.findUnique({ where: { correo: correoAdmin } })) ??
    (await db.usuario.create({ data: { correo: correoAdmin, nombre: o.adminNombre?.trim() || "Administrador QA" } }));
  await db.empresaUsuario.upsert({
    where: { empresaId_usuarioId: { empresaId: empresa.id, usuarioId: admin.id } },
    update: {},
    create: { empresaId: empresa.id, usuarioId: admin.id, rolId: roles.get("Administrador")! },
  });
  const ctxAdmin = {
    usuarioId: admin.id, empresaId: empresa.id, rolId: roles.get("Administrador")!, rolNombre: "Administrador",
    permisos: new Set(CATALOGO_PERMISOS.map((p) => p.codigo)),
  };

  const enlaces: ResultadoQa["enlaces"] = [];
  const activarSiHaceFalta = async (usuarioId: string, etiqueta: string) => {
    if ((await db.account.count({ where: { userId: usuarioId, providerId: "credential" } })) > 0) return;
    const inv = await reenviarInvitacion(ctxAdmin, usuarioId);
    enlaces.push({ etiqueta, url: `${o.baseURL}/activar/${inv.token}`, expiraEn: inv.expiraEn });
  };
  await activarSiHaceFalta(admin.id, `Administrador (${correoAdmin})`);

  // Luisa: rol Operador = revisión operativa (consulta, crea y edita en módulos operativos), sin Administración.
  if (o.luisaCorreo) {
    const correo = o.luisaCorreo.trim().toLowerCase();
    if (!(await db.usuario.findUnique({ where: { correo } }))) {
      await agregarUsuario(ctxAdmin, { correo, nombre: o.luisaNombre?.trim() || "Luisa (QA)", rolId: roles.get("Operador")! });
    }
    const luisa = await db.usuario.findUniqueOrThrow({ where: { correo } });
    await db.empresaUsuario.upsert({
      where: { empresaId_usuarioId: { empresaId: empresa.id, usuarioId: luisa.id } },
      update: {},
      create: { empresaId: empresa.id, usuarioId: luisa.id, rolId: roles.get("Operador")! },
    });
    await activarSiHaceFalta(luisa.id, `Luisa (${correo})`);
  }
  return { empresaId: empresa.id, enlaces };
}
