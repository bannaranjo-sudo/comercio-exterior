import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "../src/lib/db";
import { CATALOGO_PERMISOS, ROLES_INICIALES } from "../src/lib/permisos/catalogo";
import { EMPRESAS_DEMO, USUARIOS_DEMO, sembrar } from "../prisma/seed";

describe("modelo multiempresa", () => {
  before(sembrar);
  after(() => db.$disconnect());

  it("el seed es idempotente", async () => {
    const contar = async () => [
      await db.empresa.count(),
      await db.usuario.count(),
      await db.rol.count(),
      await db.permiso.count(),
      await db.rolPermiso.count(),
      await db.empresaUsuario.count(),
    ];
    const antes = await contar();
    await sembrar();
    assert.deepEqual(await contar(), antes);
  });

  it("un usuario puede pertenecer a varias empresas", async () => {
    const multi = USUARIOS_DEMO.find((u) => u.membresias.length > 1)!;
    const usuario = await db.usuario.findUniqueOrThrow({
      where: { correo: multi.correo },
      include: { empresas: { include: { empresa: true, rol: true } } },
    });
    assert.equal(usuario.empresas.length, multi.membresias.length);
    assert.equal(new Set(usuario.empresas.map((m) => m.empresaId)).size, usuario.empresas.length);
    for (const m of usuario.empresas) assert.equal(m.rol.empresaId, m.empresaId);
  });

  it("la base rechaza un rol de otra empresa", async () => {
    const [alfa, beta] = await Promise.all(
      EMPRESAS_DEMO.map((e) => db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: e.identificacionFiscal } })),
    );
    const usuario = await db.usuario.findUniqueOrThrow({ where: { correo: "admin.alfa@demo.invalid" } });
    const rolDeBeta = await db.rol.findUniqueOrThrow({
      where: { empresaId_nombre: { empresaId: beta.id, nombre: "Administrador" } },
    });
    // Usuario sin membresía en Beta: intento de asignarle un rol de Beta registrado bajo Alfa.
    await assert.rejects(
      db.empresaUsuario.update({
        where: { empresaId_usuarioId: { empresaId: alfa.id, usuarioId: usuario.id } },
        data: { rolId: rolDeBeta.id },
      }),
      (error: { code?: string }) => error.code === "P2003",
    );
  });

  it("cada rol concede únicamente sus permisos definidos", async () => {
    assert.equal(await db.permiso.count({ where: { codigo: { notIn: CATALOGO_PERMISOS.map((p) => p.codigo) } } }), 0);
    const roles = await db.rol.findMany({ include: { permisos: { include: { permiso: true } } } });
    assert.equal(roles.length, EMPRESAS_DEMO.length * Object.keys(ROLES_INICIALES).length);
    for (const rol of roles) {
      const esperado = [...ROLES_INICIALES[rol.nombre as keyof typeof ROLES_INICIALES].permisos].sort();
      assert.deepEqual(rol.permisos.map((p) => p.permiso.codigo).sort(), esperado);
    }
    const consulta = roles.find((r) => r.nombre === "Consulta")!;
    assert.ok(consulta.permisos.every((p) => p.permiso.codigo.endsWith(":consultar")));
    const operador = roles.find((r) => r.nombre === "Operador")!;
    assert.ok(operador.permisos.every((p) => !p.permiso.codigo.startsWith("administracion:") && !p.permiso.codigo.endsWith(":eliminar")));
  });
});
