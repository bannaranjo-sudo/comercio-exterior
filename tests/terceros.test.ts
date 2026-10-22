import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { autorizar, ErrorAutorizacion } from "../src/lib/auth/autorizacion";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const valido = (extra: Record<string, unknown> = {}) => ({
  razonSocial: "Proveedor Demo S.A.", identificacionFiscal: "demo-900", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"],
  pais: "China", ciudad: "Shanghái", correo: "contacto@proveedor-demo.invalid", ...extra,
});
const rechaza = (e: unknown) => e instanceof ErrorValidacion;

describe("Bloque A · Terceros", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
  });
  after(() => e.limpiar());

  it("crea un tercero con varios roles y lo persiste normalizado", async () => {
    const t = await terceros.crearTercero(e.ctx["admin-alfa"], valido({ roles: ["PROVEEDOR", "TRANSPORTADOR"] }));
    const fila = await db.tercero.findUniqueOrThrow({ where: { id: t.id } });
    assert.deepEqual([fila.empresaId, fila.identificacionFiscal, fila.activo], [e.alfaId, "DEMO-900", true]);
    assert.deepEqual([...fila.roles].sort(), ["PROVEEDOR", "TRANSPORTADOR"]);
    assert.equal(fila.creadoPorId, e.ctx["admin-alfa"].usuarioId);
  });

  it("valida los datos de entrada", async () => {
    const ctx = e.ctx["admin-alfa"];
    await assert.rejects(terceros.crearTercero(ctx, valido({ roles: [] })), rechaza);
    await assert.rejects(terceros.crearTercero(ctx, valido({ razonSocial: "  " })), rechaza);
    await assert.rejects(terceros.crearTercero(ctx, valido({ correo: "no-es-correo" })), rechaza);
    await assert.rejects(terceros.crearTercero(ctx, valido({ ambito: "OTRO" })), rechaza);
    await assert.rejects(terceros.crearTercero(ctx, valido({ roles: ["HACKER"] })), rechaza);
    await assert.rejects(terceros.crearTercero(ctx, valido({ identificacionFiscal: "DEMO-900" })), rechaza); // duplicado
  });

  it("permite la misma identificación en otra empresa y aísla los datos", async () => {
    const ajeno = await terceros.crearTercero(e.ctx["admin-beta"], valido());
    const propio = (await terceros.listarTerceros(e.ctx["admin-alfa"])).filas;
    assert.ok(propio.length >= 1 && propio.every((t) => t.empresaId === e.alfaId));
    assert.equal(await terceros.obtenerTercero(e.ctx["admin-alfa"], ajeno.id), null);
    await assert.rejects(terceros.actualizarTercero(e.ctx["admin-alfa"], ajeno.id, valido()), rechaza);
    await assert.rejects(terceros.cambiarEstadoTercero(e.ctx["admin-alfa"], ajeno.id, false), rechaza);
    assert.equal((await db.tercero.findUniqueOrThrow({ where: { id: ajeno.id } })).activo, true);
  });

  it("busca y filtra por texto, rol, ámbito y estado", async () => {
    const ctx = e.ctx["admin-alfa"];
    await terceros.crearTercero(ctx, valido({ razonSocial: "Cliente Local Ltda", identificacionFiscal: "DEMO-901", ambito: "NACIONAL", roles: ["CLIENTE"], pais: "Colombia", ciudad: "Medellín" }));
    const ids = async (f: terceros.FiltrosTerceros) => (await terceros.listarTerceros(ctx, f)).filas.map((t) => t.razonSocial);
    assert.deepEqual(await ids({ q: "medell" }), ["Cliente Local Ltda"]);
    assert.deepEqual(await ids({ q: "demo-900" }), ["Proveedor Demo S.A."]);
    assert.deepEqual(await ids({ rol: "CLIENTE" }), ["Cliente Local Ltda"]);
    assert.deepEqual(await ids({ rol: "TRANSPORTADOR" }), ["Proveedor Demo S.A."]);
    assert.deepEqual(await ids({ ambito: "NACIONAL" }), ["Cliente Local Ltda"]);
    assert.equal((await ids({})).length, 2);
  });

  it("edita (limpiando opcionales) y desactiva sin eliminar", async () => {
    const ctx = e.ctx["admin-alfa"];
    const t = (await terceros.listarTerceros(ctx, { q: "Proveedor Demo" })).filas[0];
    await terceros.actualizarTercero(ctx, t.id, valido({ razonSocial: "Proveedor Demo Editado", ciudad: "", correo: "" }));
    const editado = await db.tercero.findUniqueOrThrow({ where: { id: t.id } });
    assert.deepEqual([editado.razonSocial, editado.ciudad, editado.correo], ["Proveedor Demo Editado", null, null]);

    await terceros.cambiarEstadoTercero(ctx, t.id, false);
    assert.equal((await db.tercero.findUniqueOrThrow({ where: { id: t.id } })).activo, false);
    assert.ok(!(await terceros.listarTerceros(ctx)).filas.some((x) => x.id === t.id));
    assert.ok((await terceros.listarTerceros(ctx, { estado: "inactivos" })).filas.some((x) => x.id === t.id));
    assert.ok(!(await terceros.opcionesTerceros(ctx)).some((x) => x.id === t.id));
  });

  it("el rol Consulta no puede crear ni editar", async () => {
    for (const permiso of ["terceros:crear", "terceros:editar"] as const) {
      await assert.rejects(
        autorizar(e.headers["consulta-alfa"], e.alfaId, permiso),
        (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO",
      );
    }
    await autorizar(e.headers["consulta-alfa"], e.alfaId, "terceros:consultar");
  });
});
