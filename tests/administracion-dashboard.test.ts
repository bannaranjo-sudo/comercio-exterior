import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import * as administracion from "../src/lib/administracion/servicio";
import { activarCuenta, consultarInvitacion } from "../src/lib/auth/activacion";
import { auth } from "../src/lib/auth/auth";
import { autorizar, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { datosDashboard } from "../src/lib/dashboard/servicio";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import * as logistica from "../src/lib/logistica/servicio";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
const claveNueva = () => randomBytes(15).toString("base64url");

describe("Bloque G · Administración", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let adminAlfa: ContextoAcceso, adminBeta: ContextoAcceso;
  let rolOperadorAlfa: string, rolAdminAlfa: string, rolOperadorBeta: string;
  const correosCreados: string[] = [];
  const correo = (a: string) => { const c = `${a}-${e.sufijo}@test.invalid`; correosCreados.push(c); return c; };

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "operador-alfa", empresa: "DEMO-0001", rol: "Operador" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    adminAlfa = e.ctx["admin-alfa"];
    adminBeta = e.ctx["admin-beta"];
    const rol = async (empresaId: string, nombre: string) => (await db.rol.findFirstOrThrow({ where: { empresaId, nombre } })).id;
    rolOperadorAlfa = await rol(e.alfaId, "Operador");
    rolAdminAlfa = await rol(e.alfaId, "Administrador");
    rolOperadorBeta = await rol(e.betaId, "Operador");
  });
  after(async () => {
    await db.invitacion.deleteMany();
    await db.usuario.deleteMany({ where: { correo: { in: correosCreados } } });
    await e.limpiar();
  });

  it("crea un usuario sin credenciales y una invitación de un solo uso (solo se guarda el hash)", async () => {
    const r = await administracion.agregarUsuario(adminAlfa, { correo: correo("nuevo"), nombre: "Usuario Nuevo", rolId: rolOperadorAlfa });
    assert.equal(r.tipo, "invitado");
    if (r.tipo !== "invitado") return;
    const usuario = await db.usuario.findUniqueOrThrow({ where: { correo: correo("nuevo") }, include: { cuentas: true, empresas: true } });
    assert.equal(usuario.cuentas.length, 0); // sin contraseña ni credenciales predeterminadas
    assert.deepEqual(usuario.empresas.map((m) => m.empresaId), [e.alfaId]);
    const guardadas = await db.invitacion.findMany({ where: { usuarioId: usuario.id } });
    assert.equal(guardadas.length, 1);
    assert.notEqual(guardadas[0].tokenHash, r.token);
    assert.ok(!JSON.stringify(guardadas).includes(r.token));
    assert.equal(guardadas[0].tokenHash, administracion.hashToken(r.token));
    await assert.rejects(auth.api.signInEmail({ body: { email: correo("nuevo"), password: "cualquier-clave-123" } })); // aún no puede entrar
  });

  it("la activación define la contraseña propia, es de un solo uso y valida la clave", async () => {
    const r = await administracion.agregarUsuario(adminAlfa, { correo: correo("activa"), nombre: "Activa", rolId: rolOperadorAlfa });
    if (r.tipo !== "invitado") throw new Error("se esperaba invitación");
    assert.equal((await consultarInvitacion(r.token))?.usuario.correo, correo("activa"));
    assert.equal(await consultarInvitacion("token-invalido"), null);
    assert.equal(await consultarInvitacion("a".repeat(43)), null);

    const clave = claveNueva();
    await assert.rejects(activarCuenta(r.token, "corta", "corta"), rechaza);
    await assert.rejects(activarCuenta(r.token, clave, clave + "x"), rechaza);
    await activarCuenta(r.token, clave, clave);
    const sesion = await auth.api.signInEmail({ body: { email: correo("activa"), password: clave } });
    assert.equal(sesion.user.email, correo("activa"));
    await assert.rejects(activarCuenta(r.token, claveNueva(), claveNueva()), rechaza); // token ya usado
    assert.equal(await consultarInvitacion(r.token), null);
  });

  it("rechaza invitaciones vencidas, sustituidas y no pisa contraseñas existentes", async () => {
    const r = await administracion.agregarUsuario(adminAlfa, { correo: correo("vence"), nombre: "Vence", rolId: rolOperadorAlfa });
    if (r.tipo !== "invitado") throw new Error("se esperaba invitación");
    await db.invitacion.updateMany({ where: { tokenHash: administracion.hashToken(r.token) }, data: { expiraEn: new Date(Date.now() - 1000) } });
    assert.equal(await consultarInvitacion(r.token), null);
    const clave = claveNueva();
    await assert.rejects(activarCuenta(r.token, clave, clave), rechaza);

    const u = await db.usuario.findUniqueOrThrow({ where: { correo: correo("vence") } });
    const nueva = await administracion.reenviarInvitacion(adminAlfa, u.id);
    assert.notEqual(nueva.token, r.token);
    const otra = await administracion.reenviarInvitacion(adminAlfa, u.id); // la anterior queda sin efecto
    assert.equal(await consultarInvitacion(nueva.token), null);
    assert.ok(await consultarInvitacion(otra.token));

    // Un usuario que ya tiene contraseña no puede reemplazarla con una invitación.
    const hashAntes = (await db.account.findFirstOrThrow({ where: { userId: adminAlfa.usuarioId } })).password;
    await db.invitacion.create({ data: { empresaId: e.alfaId, usuarioId: adminAlfa.usuarioId, tokenHash: administracion.hashToken("t".repeat(43)), expiraEn: new Date(Date.now() + 60000), creadoPorId: adminAlfa.usuarioId } });
    await assert.rejects(activarCuenta("t".repeat(43), claveNueva(), "x"), rechaza);
    const nuevaClave = claveNueva();
    await assert.rejects(activarCuenta("t".repeat(43), nuevaClave, nuevaClave), rechaza);
    assert.equal((await db.account.findFirstOrThrow({ where: { userId: adminAlfa.usuarioId } })).password, hashAntes);
    await assert.rejects(administracion.reenviarInvitacion(adminAlfa, adminAlfa.usuarioId), rechaza); // ya activo
  });

  it("asocia usuarios existentes sin tocar su cuenta y valida duplicados y roles", async () => {
    const hashAntes = (await db.account.findFirstOrThrow({ where: { userId: adminBeta.usuarioId } })).password;
    const r = await administracion.agregarUsuario(adminAlfa, { correo: e.correos["admin-beta"], nombre: "Ignorado", rolId: rolOperadorAlfa });
    assert.equal(r.tipo, "asociado");
    assert.equal((await db.account.findFirstOrThrow({ where: { userId: adminBeta.usuarioId } })).password, hashAntes);
    assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: adminBeta.usuarioId } })).nombre, "admin-beta"); // nombre intacto
    await assert.rejects(administracion.agregarUsuario(adminAlfa, { correo: e.correos["admin-beta"], nombre: "x", rolId: rolOperadorAlfa }), rechaza); // ya es miembro
    await assert.rejects(administracion.agregarUsuario(adminAlfa, { correo: correo("rolajeno"), nombre: "Rol ajeno", rolId: rolOperadorBeta }), rechaza); // rol de otra empresa
    await assert.rejects(administracion.agregarUsuario(adminAlfa, { correo: "no-es-correo", nombre: "x", rolId: rolOperadorAlfa }), rechaza);
    await assert.rejects(administracion.agregarUsuario(adminAlfa, { correo: correo("sinnombre"), nombre: "", rolId: rolOperadorAlfa }), rechaza);
  });

  it("aísla la administración: un administrador solo gestiona su empresa", async () => {
    const miembrosBeta = await administracion.listarMiembros(adminBeta);
    assert.ok(miembrosBeta.every((m) => !m.correo.startsWith("operador-alfa")));
    const operadorAlfa = e.ctx["operador-alfa"].usuarioId;
    await assert.rejects(administracion.cambiarEstadoMiembro(adminBeta, operadorAlfa, false), rechaza);
    await assert.rejects(administracion.cambiarRolMiembro(adminBeta, operadorAlfa, rolOperadorBeta), rechaza);
    await assert.rejects(administracion.reenviarInvitacion(adminBeta, operadorAlfa), rechaza);
    await assert.rejects(administracion.cambiarRolMiembro(adminAlfa, operadorAlfa, rolOperadorBeta), rechaza); // rol de otra empresa
    assert.deepEqual((await administracion.listarRolesEmpresa(adminBeta)).map((r) => r.id).includes(rolOperadorAlfa), false);
    const empresas = await administracion.empresasAutorizadas(adminBeta);
    assert.deepEqual(empresas.map((x) => x.id).sort(), [e.alfaId, e.betaId].sort()); // Beta ya fue asociado a Alfa antes
    assert.equal((await db.empresaUsuario.findFirstOrThrow({ where: { empresaId: e.alfaId, usuarioId: operadorAlfa } })).activo, true);
  });

  it("gestiona estados y roles de miembros protegiendo al último administrador", async () => {
    // Solo para la prueba: admin-alfa queda como único administrador activo (el seed demo trae otro).
    await db.empresaUsuario.updateMany({
      where: { empresaId: e.alfaId, rol: { nombre: "Administrador" }, usuarioId: { not: adminAlfa.usuarioId } },
      data: { activo: false },
    });
    const operador = e.ctx["operador-alfa"].usuarioId;

    await administracion.cambiarEstadoMiembro(adminAlfa, operador, false);
    await assert.rejects(autorizar(e.headers["operador-alfa"], e.alfaId, "operaciones:consultar"), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "SIN_MEMBRESIA");
    await administracion.cambiarEstadoMiembro(adminAlfa, operador, true);
    await autorizar(e.headers["operador-alfa"], e.alfaId, "operaciones:consultar");

    // admin-alfa es el único administrador: no puede desactivarse ni quitarse el rol.
    await assert.rejects(administracion.cambiarEstadoMiembro(adminAlfa, adminAlfa.usuarioId, false), rechaza);
    await assert.rejects(administracion.cambiarRolMiembro(adminAlfa, adminAlfa.usuarioId, rolOperadorAlfa), rechaza);

    // Con un segundo administrador, el cambio de rol del primero sí se permite.
    await administracion.cambiarRolMiembro(adminAlfa, operador, rolAdminAlfa);
    await administracion.cambiarRolMiembro(adminAlfa, adminAlfa.usuarioId, rolOperadorAlfa);
    assert.equal((await db.empresaUsuario.findFirstOrThrow({ where: { empresaId: e.alfaId, usuarioId: adminAlfa.usuarioId }, include: { rol: true } })).rol.nombre, "Operador");
    // Restablece el escenario para las pruebas siguientes.
    await db.empresaUsuario.updateMany({ where: { empresaId: e.alfaId, usuarioId: adminAlfa.usuarioId }, data: { rolId: rolAdminAlfa } });
    await db.empresaUsuario.updateMany({ where: { empresaId: e.alfaId, usuarioId: operador }, data: { rolId: rolOperadorAlfa } });
  });

  it("solo quien administra puede gestionar usuarios; el Operador no accede a la administración", async () => {
    for (const permiso of ["administracion:administrar", "administracion:consultar"] as const) {
      await assert.rejects(autorizar(e.headers["operador-alfa"], e.alfaId, permiso), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO");
    }
  });
});

describe("Bloque F · Dashboard", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let alfa: ContextoAcceso, beta: ContextoAcceso;

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    alfa = e.ctx["admin-alfa"];
    beta = e.ctx["admin-beta"];
  });
  after(() => e.limpiar());

  it("muestra ceros reales (no cifras inventadas) cuando no hay registros", async () => {
    const d = await datosDashboard(alfa);
    assert.deepEqual([d.operaciones?.total, d.operaciones?.proximas.length, d.documentos?.pendientes, d.logistica?.abiertas], [0, 0, 0, 0]);
  });

  it("refleja los registros reales de la empresa activa y nada de otras empresas", async () => {
    const prov = await terceros.crearTercero(alfa, { razonSocial: "P", identificacionFiscal: "DB-P", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
    const cli = await terceros.crearTercero(alfa, { razonSocial: "C", identificacionFiscal: "DB-C", ambito: "NACIONAL", roles: ["CLIENTE"], pais: "Colombia" });
    const base = { fechaApertura: "2026-10-20", descripcion: "x", paisOrigen: "A", paisDestino: "B", incoterm: "FOB", lugarIncoterm: "X", moneda: "USD", valorEstimado: "1", modalidad: "MARITIMO", responsableId: alfa.usuarioId };
    const imp1 = await operaciones.crearOperacion(alfa, { ...base, tipo: "IMPORTACION", terceroId: prov.id });
    const imp2 = await operaciones.crearOperacion(alfa, { ...base, tipo: "IMPORTACION", terceroId: prov.id });
    const exp = await operaciones.crearOperacion(alfa, { ...base, tipo: "EXPORTACION", terceroId: cli.id });
    for (const id of [imp1.id, exp.id]) await operaciones.cambiarEstadoOperacion(alfa, id, "EN_PREPARACION");
    for (const est of ["EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA", "FINALIZADA"]) await operaciones.cambiarEstadoOperacion(alfa, imp2.id, est);
    const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await logistica.guardarEnvio(alfa, imp1.id, { estadoEnvio: "EN_TRANSITO", fechaEstimadaLlegada: manana });
    await logistica.registrarEvento(alfa, imp1.id, { tipo: "NOVEDAD", titulo: "Retraso", fechaEvento: "2026-10-21", severidad: "ALTA" });
    await db.documento.create({ data: { empresaId: e.alfaId, operacionId: imp1.id, tipo: "OTRO", nombreOriginal: "a.pdf", claveAlmacenamiento: `${e.alfaId}/${imp1.id}/${crypto.randomUUID()}.pdf`, tamanoBytes: 1, tipoMime: "application/pdf", sha256: "h", subidoPorId: alfa.usuarioId } });

    const d = await datosDashboard(alfa);
    assert.deepEqual([d.operaciones?.total, d.operaciones?.importacionesActivas, d.operaciones?.exportacionesActivas, d.operaciones?.finalizadas], [3, 1, 1, 1]);
    assert.deepEqual(d.operaciones?.porEstado, { EN_PREPARACION: 2, FINALIZADA: 1 });
    assert.deepEqual(d.operaciones?.proximas.map((p) => p.operacion.numero), [imp1.numero]);
    assert.equal(d.operaciones?.recientes.length, 3);
    assert.equal(d.documentos?.pendientes, 1);
    assert.equal(d.logistica?.abiertas, 1);

    const otra = await datosDashboard(beta);
    assert.deepEqual([otra.operaciones?.total, otra.documentos?.pendientes, otra.logistica?.abiertas, otra.operaciones?.proximas.length], [0, 0, 0, 0]);
  });

  it("oculta las secciones para las que el usuario no tiene permiso", async () => {
    const sinPermisos = { ...e.ctx["consulta-alfa"], permisos: new Set(["terceros:consultar"]) };
    const d = await datosDashboard(sinPermisos);
    assert.deepEqual([d.operaciones, d.documentos, d.logistica], [null, null, null]);
  });
});
