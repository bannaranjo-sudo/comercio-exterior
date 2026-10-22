import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { autorizar, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import * as costos from "../src/lib/costos/servicio";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import * as logistica from "../src/lib/logistica/servicio";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
const fk = (x: { code?: string }) => x.code === "P2003" || x.code === "P2010" || /misma empresa|foreign key/i.test(String((x as Error).message));

describe("Bloques D y E · Logística y Costos", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let alfa: ContextoAcceso, beta: ContextoAcceso, operador: ContextoAcceso;
  let op: { id: string }, opBeta: { id: string }, transportador: { id: string }, transportadorBeta: { id: string };

  const nuevaOperacion = async (ctx: ContextoAcceso, terceroId: string) =>
    operaciones.crearOperacion(ctx, {
      tipo: "IMPORTACION", fechaApertura: "2026-10-20", descripcion: "Mercancía", terceroId, paisOrigen: "China", paisDestino: "Colombia",
      incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "USD", valorEstimado: "100", modalidad: "MARITIMO", responsableId: ctx.usuarioId,
    });
  const tercero = (ctx: ContextoAcceso, nit: string, roles: string[]) =>
    terceros.crearTercero(ctx, { razonSocial: `T ${nit}`, identificacionFiscal: nit, ambito: "INTERNACIONAL", roles, pais: "China" });

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "operador-alfa", empresa: "DEMO-0001", rol: "Operador" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    [alfa, beta, operador] = [e.ctx["admin-alfa"], e.ctx["admin-beta"], e.ctx["operador-alfa"]];
    const proveedor = await tercero(alfa, "LC-P", ["PROVEEDOR"]);
    op = await nuevaOperacion(alfa, proveedor.id);
    opBeta = await nuevaOperacion(beta, (await tercero(beta, "LC-PB", ["PROVEEDOR"])).id);
    transportador = await tercero(alfa, "LC-T", ["TRANSPORTADOR"]);
    transportadorBeta = await tercero(beta, "LC-TB", ["TRANSPORTADOR"]);
  });
  after(() => e.limpiar());

  // ---------------------------------------------------------------- Logística
  const envio = (extra: Record<string, unknown> = {}) => ({
    medioTransporte: "MARITIMO", numeroGuia: "BL-123", transportadorId: transportador.id, puertoOrigen: "Shanghái", puertoDestino: "Cartagena",
    fechaEstimadaSalida: "2026-10-25", fechaEstimadaLlegada: "2026-11-20", estadoEnvio: "PROGRAMADO", ...extra,
  });

  it("registra y actualiza el transporte de la operación (un envío por operación)", async () => {
    await logistica.guardarEnvio(alfa, op.id, envio());
    await logistica.guardarEnvio(alfa, op.id, envio({ fechaRealSalida: "2026-10-26", estadoEnvio: "EN_TRANSITO", puertoOrigen: "" }));
    assert.equal(await db.envio.count({ where: { operacionId: op.id } }), 1);
    const guardado = await logistica.obtenerEnvio(alfa, op.id);
    assert.deepEqual([guardado?.estadoEnvio, guardado?.numeroGuia, guardado?.puertoOrigen, guardado?.transportador?.razonSocial, guardado?.empresaId],
      ["EN_TRANSITO", "BL-123", null, "T LC-T", e.alfaId]);
    assert.equal(guardado?.fechaRealSalida?.toISOString().slice(0, 10), "2026-10-26");
  });

  it("valida fechas, transportador y estado de la operación", async () => {
    await assert.rejects(logistica.guardarEnvio(alfa, op.id, envio({ fechaEstimadaLlegada: "2026-10-01" })), rechaza);
    await assert.rejects(logistica.guardarEnvio(alfa, op.id, envio({ fechaRealSalida: "2026-11-02", fechaRealLlegada: "2026-11-01" })), rechaza);
    await assert.rejects(logistica.guardarEnvio(alfa, op.id, envio({ transportadorId: transportadorBeta.id })), rechaza); // otra empresa
    await assert.rejects(logistica.guardarEnvio(alfa, op.id, envio({ transportadorId: (await tercero(alfa, "LC-X", ["CLIENTE"])).id })), rechaza); // rol incorrecto
    await assert.rejects(logistica.guardarEnvio(alfa, op.id, envio({ estadoEnvio: "VOLANDO" })), rechaza);
    await assert.rejects(logistica.guardarEnvio(alfa, op.id, envio({ fechaEstimadaSalida: "ayer" })), rechaza);
    const cancelada = await nuevaOperacion(alfa, (await tercero(alfa, "LC-P2", ["PROVEEDOR"])).id);
    await operaciones.cambiarEstadoOperacion(alfa, cancelada.id, "CANCELADA", "prueba de cancelación");
    await assert.rejects(logistica.guardarEnvio(alfa, cancelada.id, envio()), rechaza);
    await assert.rejects(logistica.registrarEvento(alfa, cancelada.id, { tipo: "HITO", titulo: "x", fechaEvento: "2026-10-30" }), rechaza);
  });

  it("registra hitos y novedades en orden cronológico y resuelve novedades", async () => {
    const reg = (extra: Record<string, unknown>) => logistica.registrarEvento(alfa, op.id, { tipo: "HITO", titulo: "Evento", fechaEvento: "2026-10-26", ...extra });
    await reg({ titulo: "Llegada a puerto", fechaEvento: "2026-11-18" });
    await reg({ titulo: "Zarpe confirmado", fechaEvento: "2026-10-26", descripcion: "Buque X" });
    const novedad = await reg({ tipo: "NOVEDAD", titulo: "Retraso por clima", fechaEvento: "2026-11-02" });
    const alta = await reg({ tipo: "NOVEDAD", titulo: "Contenedor dañado", fechaEvento: "2026-11-03", severidad: "ALTA" });
    await assert.rejects(reg({ titulo: "" }), rechaza);
    await assert.rejects(reg({ tipo: "OTRO" }), rechaza);
    await assert.rejects(reg({ fechaEvento: "2026-13-45" }), rechaza);

    const linea = await logistica.listarEventos(alfa, op.id);
    assert.deepEqual(linea.map((x) => x.titulo), ["Zarpe confirmado", "Retraso por clima", "Contenedor dañado", "Llegada a puerto"]);
    assert.deepEqual(linea.map((x) => x.severidad), [null, "MEDIA", "ALTA", null]);
    assert.equal(linea[0].registradoPorId, alfa.usuarioId);

    assert.equal((await logistica.listarNovedadesAbiertas(alfa)).length, 2);
    await assert.rejects(logistica.resolverNovedad(beta, novedad.id), rechaza); // otra empresa
    await assert.rejects(logistica.resolverNovedad(alfa, linea[0].id), rechaza); // un hito no es novedad
    await logistica.resolverNovedad(alfa, novedad.id);
    await assert.rejects(logistica.resolverNovedad(alfa, novedad.id), rechaza);
    assert.deepEqual((await logistica.listarNovedadesAbiertas(alfa)).map((x) => x.id), [alta.id]);
  });

  it("aísla la logística entre empresas, también en la base de datos", async () => {
    assert.equal(await logistica.obtenerEnvio(beta, op.id), null);
    assert.deepEqual(await logistica.listarEventos(beta, op.id), []);
    assert.equal((await logistica.listarNovedadesAbiertas(beta)).length, 0);
    assert.equal((await logistica.listarEnvios(beta)).length, 0);
    await assert.rejects(logistica.guardarEnvio(beta, op.id, envio({ transportadorId: transportadorBeta.id })), rechaza);
    await assert.rejects(logistica.registrarEvento(beta, op.id, { tipo: "HITO", titulo: "intruso", fechaEvento: "2026-10-30" }), rechaza);
    await assert.rejects(db.envio.create({ data: { empresaId: e.betaId, operacionId: opBeta.id, transportadorId: transportador.id } }), fk); // trigger
    await assert.rejects(db.eventoLogistico.create({ data: { empresaId: e.betaId, operacionId: op.id, tipo: "HITO", titulo: "x", fechaEvento: new Date(), registradoPorId: beta.usuarioId } }), fk);
  });

  // ------------------------------------------------------------------ Costos
  const costo = (extra: Record<string, unknown> = {}) => ({
    categoria: "FLETE_INTERNACIONAL", concepto: "Flete marítimo", valor: "100.10", moneda: "usd", fecha: "2026-10-27", estado: "ESTIMADO", ...extra,
  });

  it("calcula subtotales y totales por moneda con aritmética decimal exacta", async () => {
    await costos.registrarCosto(alfa, op.id, costo({ valor: "0.10" }));
    await costos.registrarCosto(alfa, op.id, costo({ valor: "0,20", concepto: "Segundo" })); // coma decimal
    await costos.registrarCosto(alfa, op.id, costo({ categoria: "SEGURO", concepto: "Prima", valor: "50.00", estado: "REAL" }));
    await costos.registrarCosto(alfa, op.id, costo({ categoria: "VALOR_COMERCIAL", concepto: "Mercancía", valor: "1234567890123.45", estado: "REAL" }));
    await costos.registrarCosto(alfa, op.id, costo({ categoria: "VALOR_COMERCIAL", concepto: "Ajuste", valor: "0.01", estado: "REAL" }));
    await costos.registrarCosto(alfa, op.id, costo({ categoria: "AGENCIA_ADUANAS", concepto: "Honorarios", valor: "3000000", moneda: "cop", estado: "REAL" }));

    const totales = await costos.totalesPorMoneda(alfa, op.id);
    assert.deepEqual(totales.map((t) => t.moneda), ["COP", "USD"]); // separados: sin consolidar monedas
    const usd = totales.find((t) => t.moneda === "USD")!;
    assert.equal(usd.estimado, "0.30"); // 0.10 + 0.20 exactamente
    assert.equal(usd.real, "1234567890173.46");
    assert.equal(usd.diferencia, "1234567890173.16");
    assert.deepEqual(usd.categorias.find((c) => c.categoria === "VALOR_COMERCIAL"), { categoria: "VALOR_COMERCIAL", estimado: "0.00", real: "1234567890123.46" });
    const cop = totales.find((t) => t.moneda === "COP")!;
    assert.deepEqual([cop.estimado, cop.real], ["0.00", "3000000.00"]);
    assert.deepEqual(await costos.totalesPorMoneda(beta), []);
  });

  it("valida los costos y los edita con historial", async () => {
    for (const malo of [{ valor: "-1" }, { valor: "1.234" }, { valor: "abc" }, { moneda: "PESOS" }, { categoria: "OTRA" }, { estado: "TAL" }, { concepto: "" }, { fecha: "2026-02-30" }]) {
      await assert.rejects(costos.registrarCosto(alfa, op.id, costo(malo)), rechaza);
    }
    const c = (await costos.listarCostos(alfa, op.id)).find((x) => x.concepto === "Segundo")!;
    await costos.actualizarCosto(alfa, c.id, costo({ concepto: "Segundo corregido", valor: "0.25", estado: "REAL" }));
    const editado = await db.costo.findUniqueOrThrow({ where: { id: c.id } });
    assert.deepEqual([editado.concepto, editado.valor.toFixed(2), editado.estado], ["Segundo corregido", "0.25", "REAL"]);
    const hist = (await operaciones.historialOperacion(alfa, op.id)).map((h) => h.accion);
    assert.ok(hist.includes("COSTO"));
  });

  it("elimina costos solo con el permiso correspondiente y deja registro", async () => {
    await assert.rejects(autorizar(e.headers["operador-alfa"], e.alfaId, "costos:eliminar"), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO");
    await autorizar(e.headers["operador-alfa"], e.alfaId, "costos:crear");
    void operador;
    const c = (await costos.listarCostos(alfa, op.id)).find((x) => x.concepto === "Ajuste")!;
    await assert.rejects(costos.eliminarCosto(beta, c.id), rechaza);
    await costos.eliminarCosto(alfa, c.id);
    assert.equal(await db.costo.count({ where: { id: c.id } }), 0);
    assert.equal((await operaciones.historialOperacion(alfa, op.id))[0].accion, "COSTO_ELIMINADO");
  });

  it("aísla los costos entre empresas", async () => {
    assert.deepEqual(await costos.listarCostos(beta, op.id), []);
    await assert.rejects(costos.registrarCosto(beta, op.id, costo()), rechaza);
    const c = (await costos.listarCostos(alfa, op.id))[0];
    await assert.rejects(costos.actualizarCosto(beta, c.id, costo()), rechaza);
    await costos.registrarCosto(beta, opBeta.id, costo({ valor: "7.00" }));
    assert.equal((await costos.totalesPorMoneda(beta))[0].estimado, "7.00");
    await assert.rejects(db.costo.create({ data: { empresaId: e.betaId, operacionId: op.id, categoria: "OTROS", concepto: "x", valor: "1", moneda: "USD", fecha: new Date(), estado: "REAL", registradoPorId: beta.usuarioId } }), fk);
    await assert.rejects(db.costo.create({ data: { empresaId: e.alfaId, operacionId: op.id, categoria: "OTROS", concepto: "x", valor: "-1", moneda: "USD", fecha: new Date(), estado: "REAL", registradoPorId: alfa.usuarioId } })); // CHECK en la base
  });
});
