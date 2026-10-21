import "dotenv/config";
import { db } from "../src/lib/db";
import {
  CATALOGO_PERMISOS,
  ROLES_INICIALES,
  type NombreRol,
} from "../src/lib/permisos/catalogo";

// Datos completamente ficticios. Los usuarios no tienen contraseña ni método de acceso.
export const EMPRESAS_DEMO = [
  { identificacionFiscal: "DEMO-0001", razonSocial: "Importadora Demo Alfa S.A.", nombreComercial: "Demo Alfa" },
  { identificacionFiscal: "DEMO-0002", razonSocial: "Exportadora Demo Beta S.A.", nombreComercial: "Demo Beta" },
] as const;

export const USUARIOS_DEMO: readonly {
  correo: string;
  nombre: string;
  membresias: readonly { empresa: string; rol: NombreRol }[];
}[] = [
  { correo: "admin.alfa@demo.invalid", nombre: "Admin Alfa (demo)", membresias: [{ empresa: "DEMO-0001", rol: "Administrador" }] },
  { correo: "operador.beta@demo.invalid", nombre: "Operador Beta (demo)", membresias: [{ empresa: "DEMO-0002", rol: "Operador" }] },
  {
    correo: "multiempresa@demo.invalid",
    nombre: "Usuario Multiempresa (demo)",
    membresias: [
      { empresa: "DEMO-0001", rol: "Operador" },
      { empresa: "DEMO-0002", rol: "Consulta" },
    ],
  },
];

export async function sembrar(): Promise<void> {
  const permisos = new Map<string, string>();
  for (const p of CATALOGO_PERMISOS) {
    const fila = await db.permiso.upsert({
      where: { codigo: p.codigo },
      update: { descripcion: p.descripcion },
      create: p,
    });
    permisos.set(p.codigo, fila.id);
  }

  const roles = new Map<string, string>(); // `${nit}|${rol}` -> rolId
  const empresas = new Map<string, string>();
  for (const e of EMPRESAS_DEMO) {
    const empresa = await db.empresa.upsert({
      where: { identificacionFiscal: e.identificacionFiscal },
      update: { razonSocial: e.razonSocial, nombreComercial: e.nombreComercial },
      create: e,
    });
    empresas.set(e.identificacionFiscal, empresa.id);

    for (const [nombre, def] of Object.entries(ROLES_INICIALES)) {
      const rol = await db.rol.upsert({
        where: { empresaId_nombre: { empresaId: empresa.id, nombre } },
        update: { descripcion: def.descripcion },
        create: { empresaId: empresa.id, nombre, descripcion: def.descripcion },
      });
      roles.set(`${e.identificacionFiscal}|${nombre}`, rol.id);

      const permisoIds = def.permisos.map((c) => permisos.get(c)!);
      await db.rolPermiso.deleteMany({
        where: { rolId: rol.id, permisoId: { notIn: permisoIds } },
      });
      await db.rolPermiso.createMany({
        data: permisoIds.map((permisoId) => ({ rolId: rol.id, permisoId })),
        skipDuplicates: true,
      });
    }
  }

  for (const u of USUARIOS_DEMO) {
    const usuario = await db.usuario.upsert({
      where: { correo: u.correo },
      update: { nombre: u.nombre },
      create: { correo: u.correo, nombre: u.nombre },
    });
    for (const m of u.membresias) {
      const empresaId = empresas.get(m.empresa)!;
      const rolId = roles.get(`${m.empresa}|${m.rol}`)!;
      await db.empresaUsuario.upsert({
        where: { empresaId_usuarioId: { empresaId, usuarioId: usuario.id } },
        update: { rolId },
        create: { empresaId, usuarioId: usuario.id, rolId },
      });
    }
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  sembrar()
    .then(() => console.log("Seed completado."))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
