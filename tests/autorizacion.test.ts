import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { auth } from "../src/lib/auth/auth";
import { autorizar, ErrorAutorizacion, type CodigoError } from "../src/lib/auth/autorizacion";
import { crearUsuarioConCredenciales } from "../src/lib/auth/usuarios";
import { db } from "../src/lib/db";
import { sembrar } from "../prisma/seed";

const ALFA = "DEMO-0001";
const BETA = "DEMO-0002";
const sufijo = randomBytes(4).toString("hex");
const clave = randomBytes(18).toString("base64url"); // aleatoria por ejecución
const correo = (alias: string) => `${alias}-${sufijo}@test.invalid`;

const rechazaCon = (codigo: CodigoError) => (error: unknown) =>
  error instanceof ErrorAutorizacion && error.codigo === codigo;

async function iniciar(alias: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: correo(alias), password: clave },
    returnHeaders: true,
  });
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return new Headers({ cookie });
}

describe("autenticación y autorización multiempresa", () => {
  let alfaId: string;
  let betaId: string;

  before(async () => {
    await sembrar();
    alfaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: ALFA } })).id;
    betaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: BETA } })).id;
    const usuarios = [
      ["operador-alfa", [{ identificacionFiscal: ALFA, rol: "Operador" }]],
      ["consulta-alfa", [{ identificacionFiscal: ALFA, rol: "Consulta" }]],
      ["solo-beta", [{ identificacionFiscal: BETA, rol: "Administrador" }]],
      ["multi", [
        { identificacionFiscal: ALFA, rol: "Operador" },
        { identificacionFiscal: BETA, rol: "Consulta" },
      ]],
    ] as const;
    for (const [alias, membresias] of usuarios) {
      await crearUsuarioConCredenciales({ correo: correo(alias), nombre: `Prueba ${alias}`, clave, membresias });
    }
  });

  after(async () => {
    await db.usuario.deleteMany({ where: { correo: { endsWith: `-${sufijo}@test.invalid` } } });
    await db.$disconnect();
  });

  it("rechaza solicitudes sin sesión", async () => {
    await assert.rejects(autorizar(new Headers(), alfaId, "operaciones:consultar"), rechazaCon("NO_AUTENTICADO"));
    await assert.rejects(
      autorizar(new Headers({ cookie: "better-auth.session_token=falsa.firma" }), alfaId, "operaciones:consultar"),
      rechazaCon("NO_AUTENTICADO"),
    );
  });

  it("inicia sesión, rechaza claves erróneas y cierra sesión", async () => {
    await assert.rejects(
      auth.api.signInEmail({ body: { email: correo("operador-alfa"), password: "clave-incorrecta-123" } }),
    );
    const headers = await iniciar("operador-alfa");
    const sesion = await auth.api.getSession({ headers });
    assert.equal(sesion?.user.email, correo("operador-alfa"));

    await auth.api.signOut({ headers });
    assert.equal(await auth.api.getSession({ headers }), null);
    await assert.rejects(autorizar(headers, alfaId, "operaciones:consultar"), rechazaCon("NO_AUTENTICADO"));
  });

  it("no permite registro público ni sesión a usuarios del seed sin credenciales", async () => {
    await assert.rejects(
      auth.api.signUpEmail({ body: { email: correo("intruso"), password: clave, name: "Intruso" } }),
    );
    assert.equal(await db.usuario.count({ where: { correo: correo("intruso") } }), 0);
    await assert.rejects(
      auth.api.signInEmail({ body: { email: "admin.alfa@demo.invalid", password: clave } }),
    );
  });

  it("permite el acceso del usuario autorizado a su empresa", async () => {
    const headers = await iniciar("operador-alfa");
    const ctx = await autorizar(headers, alfaId, "operaciones:crear");
    assert.equal(ctx.rolNombre, "Operador");
    assert.equal(ctx.empresaId, alfaId);
  });

  it("rechaza a un usuario sin membresía en la empresa", async () => {
    const headers = await iniciar("operador-alfa");
    await assert.rejects(autorizar(headers, betaId, "operaciones:consultar"), rechazaCon("SIN_MEMBRESIA"));
  });

  it("el rol Consulta no puede escribir", async () => {
    const headers = await iniciar("consulta-alfa");
    await autorizar(headers, alfaId, "operaciones:consultar");
    for (const permiso of ["operaciones:crear", "operaciones:editar", "operaciones:eliminar", "administracion:consultar"] as const) {
      await assert.rejects(autorizar(headers, alfaId, permiso), rechazaCon("PERMISO_DENEGADO"));
    }
  });

  it("un usuario multiempresa tiene permisos distintos según la empresa", async () => {
    const headers = await iniciar("multi");
    await autorizar(headers, alfaId, "operaciones:crear");
    await autorizar(headers, betaId, "operaciones:consultar");
    await assert.rejects(autorizar(headers, betaId, "operaciones:crear"), rechazaCon("PERMISO_DENEGADO"));
  });

  it("no se puede suplantar otra empresa cambiando el empresaId", async () => {
    const headers = await iniciar("solo-beta"); // administrador solo de Beta
    await autorizar(headers, betaId, "administracion:administrar");
    await assert.rejects(autorizar(headers, alfaId, "administracion:administrar"), rechazaCon("SIN_MEMBRESIA"));
    for (const falso of ["", "no-es-uuid", randomUUID(), "' OR 1=1 --"]) {
      await assert.rejects(autorizar(headers, falso, "operaciones:consultar"), rechazaCon("SIN_MEMBRESIA"));
    }
  });

  it("rechaza membresías, usuarios y empresas desactivados", async () => {
    const headers = await iniciar("consulta-alfa");
    const usuario = await db.usuario.findUniqueOrThrow({ where: { correo: correo("consulta-alfa") } });
    const where = { empresaId_usuarioId: { empresaId: alfaId, usuarioId: usuario.id } };

    await db.empresaUsuario.update({ where, data: { activo: false } });
    await assert.rejects(autorizar(headers, alfaId, "operaciones:consultar"), rechazaCon("SIN_MEMBRESIA"));
    await db.empresaUsuario.update({ where, data: { activo: true } });

    await db.usuario.update({ where: { id: usuario.id }, data: { activo: false } });
    await assert.rejects(autorizar(headers, alfaId, "operaciones:consultar"), rechazaCon("SIN_MEMBRESIA"));
    await assert.rejects(auth.api.signInEmail({ body: { email: correo("consulta-alfa"), password: clave } }));
    await db.usuario.update({ where: { id: usuario.id }, data: { activo: true } });

    await autorizar(headers, alfaId, "operaciones:consultar");
  });
});
