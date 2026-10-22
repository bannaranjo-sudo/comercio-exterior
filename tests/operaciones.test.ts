import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { autorizar, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
const datosTercero = (nit: string, roles: string[], extra = {}) => ({
  razonSocial: `Tercero ${nit}`, identificacionFiscal: nit, ambito: "INTERNACIONAL", roles, pais: "China", ...extra,
});

describe("Bloque B · Operaciones", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let adminAlfa: ContextoAcceso, adminBeta: ContextoAcceso;
  let proveedor: { id: string }, cliente: { id: string }, soloCliente: { id: string }, ajeno: { id: string };

  const datos = (extra: Record<string, unknown> = {}) => ({
    tipo: "IMPORTACION", fechaApertura: "2026-10-20", descripcion: "Maquinaria de prueba", terceroId: proveedor.id,
    paisOrigen: "China", paisDestino: "Colombia", incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "usd",
    valorEstimado: "12500,50", modalidad: "MARITIMO", responsableId: adminAlfa.usuarioId, ...extra,
  });

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    adminAlfa = e.ctx["admin-alfa"];
    adminBeta = e.ctx["admin-beta"];
    proveedor = await terceros.crearTercero(adminAlfa, datosTercero("OP-PROV", ["PROVEEDOR"]));
    cliente = await terceros.crearTercero(adminAlfa, datosTercero("OP-CLI", ["CLIENTE"]));
    soloCliente = await terceros.crearTercero(adminAlfa, datosTercero("OP-CLI2", ["CLIENTE"]));
    ajeno = await terceros.crearTercero(adminBeta, datosTercero("OP-BETA", ["PROVEEDOR"]));
  });
  after(() => e.limpiar());

  it("crea operaciones con consecutivo por empresa e historial", async () => {
    const imp = await operaciones.crearOperacion(adminAlfa, datos());
    const exp = await operaciones.crearOperacion(adminAlfa, datos({ tipo: "EXPORTACION", terceroId: cliente.id, fechaApertura: "2027-01-05" }));
    const beta = await operaciones.crearOperacion(adminBeta, datos({ terceroId: ajeno.id, responsableId: adminBeta.usuarioId }));
    assert.deepEqual([imp.numero, imp.consecutivo, imp.estado], ["IMP-2026-0001", 1, "BORRADOR"]);
    assert.deepEqual([exp.numero, exp.consecutivo], ["EXP-2027-0002", 2]);
    assert.equal(beta.consecutivo, 1); // contador independiente por empresa
    assert.equal(imp.moneda, "USD");
    assert.equal(imp.valorEstimado.toFixed(2), "12500.50");
    const hist = await operaciones.historialOperacion(adminAlfa, imp.id);
    assert.deepEqual(hist.map((h) => h.accion), ["CREACION"]);
  });

  it("asigna consecutivos únicos aun con creaciones simultáneas", async () => {
    const antes = await db.operacion.count({ where: { empresaId: e.alfaId } });
    const nuevas = await Promise.all(Array.from({ length: 8 }, () => operaciones.crearOperacion(adminAlfa, datos())));
    const consecutivos = nuevas.map((o) => o.consecutivo).sort((a, b) => a - b);
    assert.equal(new Set(consecutivos).size, 8);
    assert.deepEqual(consecutivos, Array.from({ length: 8 }, (_, i) => antes + i + 1)); // sin huecos
  });

  it("valida tercero, responsable y datos de entrada", async () => {
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ terceroId: cliente.id })), rechaza); // importación exige proveedor
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ tipo: "EXPORTACION", terceroId: proveedor.id })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ terceroId: ajeno.id })), rechaza); // otra empresa
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ responsableId: adminBeta.usuarioId })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ moneda: "DOLAR" })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ valorEstimado: "-5" })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ valorEstimado: "10.999" })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ descripcion: "" })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ fechaApertura: "2026-02-31" })), rechaza);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ incoterm: "XXX" })), rechaza);
    await terceros.cambiarEstadoTercero(adminAlfa, soloCliente.id, false);
    await assert.rejects(operaciones.crearOperacion(adminAlfa, datos({ tipo: "EXPORTACION", terceroId: soloCliente.id })), rechaza); // inactivo
  });

  it("registra en el historial las ediciones y no duplica si no hay cambios", async () => {
    const op = await operaciones.crearOperacion(adminAlfa, datos());
    await operaciones.actualizarOperacion(adminAlfa, op.id, { ...datos(), descripcion: "Descripción corregida", valorEstimado: "9000" });
    await operaciones.actualizarOperacion(adminAlfa, op.id, { ...datos(), descripcion: "Descripción corregida", valorEstimado: "9000" });
    const hist = await operaciones.historialOperacion(adminAlfa, op.id);
    assert.deepEqual(hist.map((h) => h.accion), ["EDICION", "CREACION"]);
    const cambios = (hist[0].detalle as { cambios: Record<string, string[]> }).cambios;
    assert.deepEqual(Object.keys(cambios).sort(), ["descripcion", "valorEstimado"]);
    assert.deepEqual(cambios.descripcion, ["Maquinaria de prueba", "Descripción corregida"]);
  });

  it("controla los cambios de estado y bloquea los estados finales", async () => {
    const op = await operaciones.crearOperacion(adminAlfa, datos());
    await assert.rejects(operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "FINALIZADA"), rechaza); // salto no permitido
    await assert.rejects(operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "NO_EXISTE"), rechaza);
    for (const estado of ["EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA", "FINALIZADA"]) {
      await operaciones.cambiarEstadoOperacion(adminAlfa, op.id, estado);
    }
    assert.equal((await db.operacion.findUniqueOrThrow({ where: { id: op.id } })).estado, "FINALIZADA");
    await assert.rejects(operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "CANCELADA", "motivo válido"), rechaza);
    await assert.rejects(operaciones.actualizarOperacion(adminAlfa, op.id, datos()), rechaza);
    const hist = await operaciones.historialOperacion(adminAlfa, op.id);
    assert.equal(hist.filter((h) => h.accion === "CAMBIO_ESTADO").length, 4);
  });

  it("la cancelación exige motivo y queda registrada", async () => {
    const op = await operaciones.crearOperacion(adminAlfa, datos());
    await assert.rejects(operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "CANCELADA"), rechaza);
    await assert.rejects(operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "CANCELADA", "no"), rechaza);
    await operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "CANCELADA", "Proveedor incumplió");
    const [ultimo] = await operaciones.historialOperacion(adminAlfa, op.id);
    assert.deepEqual(ultimo.detalle, { de: "BORRADOR", a: "CANCELADA", motivo: "Proveedor incumplió" });
  });

  it("dos cambios de estado simultáneos no se aplican ambos", async () => {
    const op = await operaciones.crearOperacion(adminAlfa, datos());
    const r = await Promise.allSettled([
      operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "EN_PREPARACION"),
      operaciones.cambiarEstadoOperacion(adminAlfa, op.id, "CANCELADA", "cancelación simultánea"),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    const hist = await operaciones.historialOperacion(adminAlfa, op.id);
    assert.equal(hist.filter((h) => h.accion === "CAMBIO_ESTADO").length, 1);
  });

  it("lista, busca y filtra solo dentro de la empresa activa", async () => {
    const todas = (await operaciones.listarOperaciones(adminAlfa)).filas;
    assert.ok(todas.length > 0 && todas.every((o) => o.empresaId === e.alfaId));
    assert.ok((await operaciones.listarOperaciones(adminAlfa, { q: "IMP-2026-0001" })).filas.length === 1);
    assert.ok((await operaciones.listarOperaciones(adminAlfa, { q: "tercero op-prov" })).filas.length > 0);
    assert.ok((await operaciones.listarOperaciones(adminAlfa, { tipo: "EXPORTACION" })).filas.every((o) => o.tipo === "EXPORTACION"));
    assert.ok((await operaciones.listarOperaciones(adminAlfa, { estado: "CANCELADA" })).filas.every((o) => o.estado === "CANCELADA"));
    assert.ok((await operaciones.listarOperaciones(adminAlfa, { estado: "activas" })).filas.every((o) => !operaciones.esEstadoFinal(o.estado)));
    assert.equal((await operaciones.listarOperaciones(adminBeta, { q: "Maquinaria" })).filas.length, 1); // solo la de Beta
  });

  it("aísla las operaciones entre empresas, también en la base de datos", async () => {
    const op = (await operaciones.listarOperaciones(adminAlfa)).filas[0];
    assert.equal(await operaciones.obtenerOperacion(adminBeta, op.id), null);
    await assert.rejects(operaciones.actualizarOperacion(adminBeta, op.id, datos({ terceroId: ajeno.id, responsableId: adminBeta.usuarioId })), rechaza);
    await assert.rejects(operaciones.cambiarEstadoOperacion(adminBeta, op.id, "EN_PREPARACION"), rechaza);
    assert.deepEqual(await operaciones.historialOperacion(adminBeta, op.id), []);
    // Aunque se salte el servicio, la clave compuesta impide vincular un tercero o responsable de otra empresa.
    const base = { empresaId: e.alfaId, consecutivo: 9999, numero: "X-1", tipo: "IMPORTACION", fechaApertura: new Date(), descripcion: "x", paisOrigen: "a", paisDestino: "b", incoterm: "FOB", lugarIncoterm: "x", moneda: "USD", valorEstimado: "1", modalidad: "MARITIMO", creadoPorId: adminAlfa.usuarioId } as const;
    await assert.rejects(db.operacion.create({ data: { ...base, terceroId: ajeno.id, responsableId: adminAlfa.usuarioId } }), (x: { code?: string }) => x.code === "P2003");
    await assert.rejects(db.operacion.create({ data: { ...base, terceroId: proveedor.id, responsableId: adminBeta.usuarioId } }), (x: { code?: string }) => x.code === "P2003");
  });

  it("respeta los permisos: Consulta solo puede consultar", async () => {
    await autorizar(e.headers["consulta-alfa"], e.alfaId, "operaciones:consultar");
    for (const permiso of ["operaciones:crear", "operaciones:editar"] as const) {
      await assert.rejects(autorizar(e.headers["consulta-alfa"], e.alfaId, permiso), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO");
    }
  });
});
