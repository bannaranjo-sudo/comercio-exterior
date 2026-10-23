import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { autorizar, autorizarMembresia, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { grupos, modulos, moduloActivo } from "../src/config/modulos";
import { puedeVerSeccion, SECCIONES_CONFIGURACION, seccionesVisibles } from "../src/lib/configuracion";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import { revisarExpediente } from "../src/lib/inteligencia/expediente";
import * as servicio from "../src/lib/inteligencia/servicio";
import { TIPOS_ANALISIS, tipoAnalisis } from "../src/lib/inteligencia/tipos-analisis";
import * as vistas from "../src/lib/inteligencia/vistas";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;

describe("Centro de Inteligencia · vistas operativas", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let alfa: ContextoAcceso, beta: ContextoAcceso, operador: ContextoAcceso;
  let op: { id: string; numero: string };
  let opBeta: { id: string };

  const nuevaOp = async (ctx: ContextoAcceso, nit: string) => {
    const t = await terceros.crearTercero(ctx, { razonSocial: `T ${nit}`, identificacionFiscal: nit, ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
    return operaciones.crearOperacion(ctx, {
      tipo: "IMPORTACION", fechaApertura: "2026-10-20", descripcion: "Mercancía", terceroId: t.id, paisOrigen: "China", paisDestino: "Colombia",
      incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "USD", valorEstimado: "100", modalidad: "MARITIMO", responsableId: ctx.usuarioId,
    });
  };

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "operador-alfa", empresa: "DEMO-0001", rol: "Operador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    [alfa, beta, operador] = [e.ctx["admin-alfa"], e.ctx["admin-beta"], e.ctx["operador-alfa"]];
    await db.registroUso.deleteMany();
    await db.aprobacion.deleteMany();
    await db.resultado.deleteMany();
    await db.ejecucion.deleteMany();
    await db.asignacionModelo.deleteMany();
    await db.agente.deleteMany();
    await db.configuracionProveedor.deleteMany();
    op = await nuevaOp(alfa, "CI-A");
    opBeta = await nuevaOp(beta, "CI-B");
    await servicio.inicializarAgentesPredeterminados(alfa);
  });
  after(async () => {
    await db.registroUso.deleteMany();
    await db.aprobacion.deleteMany();
    await db.resultado.deleteMany();
    await db.ejecucion.deleteMany();
    await db.asignacionModelo.deleteMany();
    await db.agente.deleteMany();
    await db.configuracionProveedor.deleteMany();
    await e.limpiar();
  });

  it("registra solicitudes vinculadas a una operación sin confundirlas con análisis ejecutados", async () => {
    const [doc] = (await servicio.listarAgentes(alfa)).filter((a) => a.codigo === "documental");
    const s = await servicio.solicitarEjecucion(operador, { agenteId: doc.id, descripcion: "Revisar la factura", operacionId: op.id });
    assert.equal(s.estado, "PENDIENTE"); // "En cola": no se ejecutó nada
    assert.equal(s.proveedor, null);
    assert.equal(s.iniciadaEn, null);
    await assert.rejects(servicio.solicitarEjecucion(operador, { agenteId: doc.id, descripcion: "Otra", operacionId: opBeta.id }), rechaza); // operación ajena
    await assert.rejects(servicio.solicitarEjecucion(operador, { agenteId: doc.id, descripcion: "Otra", operacionId: "no-uuid" }), rechaza);
    await servicio.solicitarEjecucion(operador, { agenteId: doc.id, descripcion: "Sin operación" });

    const { filas } = await vistas.listarSolicitudes(alfa, { vista: "abiertas" });
    assert.equal(filas.length, 2);
    const vinculada = filas.find((f) => f.operacion);
    assert.equal(vinculada?.operacion?.numero, op.numero);
    assert.equal(vinculada?.solicitadaPor.nombre, "operador-alfa");
    assert.equal(vinculada?.agente.codigo, "documental");
  });

  it("filtra solicitudes y las aísla por empresa", async () => {
    const [fin] = (await servicio.listarAgentes(alfa)).filter((a) => a.codigo === "financiero");
    await servicio.solicitarEjecucion(alfa, { agenteId: fin.id, descripcion: "Costos de la operación", operacionId: op.id });
    assert.equal((await vistas.listarSolicitudes(alfa, { agente: "financiero" })).filas.length, 1);
    assert.equal((await vistas.listarSolicitudes(alfa, { q: op.numero })).filas.length, 2);
    assert.equal((await vistas.listarSolicitudes(alfa, { q: "costos de la" })).filas.length, 1);
    assert.equal((await vistas.listarSolicitudes(alfa, { estado: "COMPLETADA" })).filas.length, 0);
    assert.equal((await vistas.listarSolicitudes(alfa, { vista: "todas" })).filas.length, 3);
    assert.equal((await vistas.listarSolicitudes(beta)).filas.length, 0);
    const id = (await vistas.listarSolicitudes(alfa)).filas[0].id;
    assert.ok(await vistas.obtenerSolicitud(alfa, id));
    assert.equal(await vistas.obtenerSolicitud(beta, id), null);
    assert.equal(await vistas.obtenerSolicitud(alfa, "no-uuid"), null);
  });

  it("lista solo los resultados pendientes de revisión de la empresa y respeta la aprobación humana", async () => {
    const ejecucion = await db.ejecucion.findFirstOrThrow({ where: { empresaId: e.alfaId, solicitadaPorId: operador.usuarioId } });
    const resultado = await db.resultado.create({ data: { empresaId: e.alfaId, ejecucionId: ejecucion.id, titulo: "Hallazgos", contenido: { texto: "demo" } } });
    const aprobacion = await db.aprobacion.create({ data: { empresaId: e.alfaId, resultadoId: resultado.id } });
    assert.equal(await vistas.contarPorRevisar(alfa), 1);
    assert.equal(await vistas.contarPorRevisar(beta), 0);
    assert.deepEqual((await vistas.listarResultadosPorRevisar(alfa)).map((r) => r.titulo), ["Hallazgos"]);
    assert.deepEqual(await vistas.listarResultadosPorRevisar(beta), []);
    await assert.rejects(autorizar(e.headers["operador-alfa"], e.alfaId, "inteligencia:aprobar"), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO");
    await servicio.decidirAprobacion(alfa, { aprobacionId: aprobacion.id, decision: "APROBADO", comentario: "ok" });
    assert.equal(await vistas.contarPorRevisar(alfa), 0);
    assert.deepEqual(await vistas.listarResultadosPorRevisar(alfa), []);
  });

  it("distingue los niveles de disponibilidad sin tratarlos como equivalentes", async () => {
    const previo = process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      let c = await vistas.estadoCapacidades(alfa);
      let o = c.proveedores.find((p) => p.proveedor === "OPENAI")!;
      assert.deepEqual([o.habilitado, o.adaptadorDisponible, o.credencialConfigurada, o.conexionVerificada], [false, true, false, null]);
      assert.equal(c.analisisEjecutable, false);

      await servicio.guardarProveedor(alfa, { proveedor: "OPENAI", habilitado: true, notas: "" });
      process.env.OPENAI_API_KEY = "sk-clave-falsa-de-prueba";
      c = await vistas.estadoCapacidades(alfa);
      o = c.proveedores.find((p) => p.proveedor === "OPENAI")!;
      assert.deepEqual([o.habilitado, o.credencialConfigurada, o.conexionVerificada], [true, true, null]); // habilitado y con credencial, pero SIN conexión verificada
      assert.ok(!JSON.stringify(c).includes("sk-clave-falsa"));

      // Una prueba "API accesible sin texto" no verifica la conexión.
      const base = { empresaId: e.alfaId, usuarioId: alfa.usuarioId, tipo: "PRUEBA_CONEXION" as const, proveedor: "OPENAI" as const, modelo: "gpt-5-mini" };
      await db.registroUso.create({ data: { ...base, estado: "SIN_CONTENIDO" } });
      assert.equal((await vistas.estadoCapacidades(alfa)).proveedores.find((p) => p.proveedor === "OPENAI")!.conexionVerificada, null);
      await db.registroUso.create({ data: { ...base, estado: "EXITOSA" } });
      c = await vistas.estadoCapacidades(alfa);
      assert.equal(c.proveedores.find((p) => p.proveedor === "OPENAI")!.conexionVerificada?.modelo, "gpt-5-mini");

      // Con toda la cadena lista, el análisis sigue sin ser ejecutable mientras el servidor mantenga la ejecución deshabilitada.
      const [doc] = (await servicio.listarAgentes(alfa)).filter((a) => a.codigo === "documental");
      await servicio.asignarModelo(alfa, { agenteId: doc.id, proveedor: "OPENAI", modelo: "gpt-5-mini", prioridad: 1 });
      c = await vistas.estadoCapacidades(alfa);
      assert.deepEqual([c.agentes.activos, c.agentes.conModelo, c.agentePorCodigo.has("documental")], [4, 1, true]);
      assert.equal(c.ejecutorImplementado, true);
      assert.equal(c.modo.efectivo, "deshabilitado"); // por defecto la ejecución está apagada
      assert.equal(c.analisisEjecutable, false);

      // Otra empresa no hereda nada.
      const cb = await vistas.estadoCapacidades(beta);
      assert.deepEqual([cb.proveedores.every((p) => !p.habilitado), cb.agentes.total], [true, 0]);
    } finally {
      if (previo === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previo;
    }
  });

  it("declara honestamente qué análisis están disponibles", () => {
    assert.deepEqual(TIPOS_ANALISIS.filter((t) => t.disponibilidad === "disponible").map((t) => t.id).sort(), ["documental", "expediente"]);
    assert.deepEqual(TIPOS_ANALISIS.filter((t) => t.disponibilidad === "proximamente").map((t) => t.id).sort(), ["arancelario", "financiero"]);
    assert.equal(tipoAnalisis("inventado"), undefined);
  });

  it("la revisión de expediente aplica reglas del sistema y respeta la empresa", async () => {
    const nueva = await nuevaOp(alfa, "CI-REV");
    let r = await revisarExpediente(alfa, nueva.id);
    const nivel = (id: string) => r.hallazgos.find((h) => h.id === id)?.nivel;
    assert.deepEqual([nivel("docs-faltantes"), nivel("transporte"), nivel("novedades"), nivel("costos")], ["pendiente", "pendiente", "ok", "pendiente"]);
    assert.ok(r.hallazgos.find((h) => h.id === "docs-faltantes")!.detalle.includes("Factura comercial"));

    // Con datos completos y una novedad abierta cambia el resultado.
    await db.envio.create({ data: { empresaId: e.alfaId, operacionId: nueva.id, numeroGuia: "BL-1", puertoDestino: "Cartagena", fechaEstimadaLlegada: new Date("2099-01-01") } });
    await db.costo.create({ data: { empresaId: e.alfaId, operacionId: nueva.id, categoria: "SEGURO", concepto: "Prima", valor: "10", moneda: "USD", fecha: new Date(), estado: "REAL", registradoPorId: alfa.usuarioId } });
    await db.eventoLogistico.create({ data: { empresaId: e.alfaId, operacionId: nueva.id, tipo: "NOVEDAD", titulo: "Retraso", fechaEvento: new Date(), severidad: "MEDIA", registradoPorId: alfa.usuarioId } });
    r = await revisarExpediente(alfa, nueva.id);
    assert.deepEqual([nivel("transporte"), nivel("novedades"), nivel("costos")], ["ok", "atencion", "ok"]);
    assert.equal(r.resumen.atencion, 1);

    await assert.rejects(revisarExpediente(beta, nueva.id), rechaza); // otra empresa
    await assert.rejects(revisarExpediente(alfa, "no-uuid"), rechaza);
    await assert.rejects(revisarExpediente(alfa, opBeta.id), rechaza);
  });
});

describe("Configuración y navegación", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "operador-alfa", empresa: "DEMO-0001", rol: "Operador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
    ]);
  });
  after(() => e.limpiar());

  it("muestra las secciones de configuración según los permisos reales de cada rol", async () => {
    const ids = async (alias: string) => seccionesVisibles((await autorizarMembresia(e.headers[alias], e.alfaId)).permisos).map((s) => s.id);
    assert.deepEqual(await ids("admin-alfa"), ["empresa", "usuarios", "inteligencia", "seguridad"]);
    assert.deepEqual(await ids("operador-alfa"), ["empresa", "seguridad"]); // sin acceso técnico
    assert.deepEqual(await ids("consulta-alfa"), ["empresa", "seguridad"]);
    const ia = SECCIONES_CONFIGURACION.find((s) => s.id === "inteligencia")!;
    assert.equal(puedeVerSeccion(ia, ["inteligencia:administrar_agentes"]), true);
    assert.equal(puedeVerSeccion(ia, ["inteligencia:consultar", "inteligencia:ejecutar"]), false);
  });

  it("autorizarMembresia valida sesión y pertenencia sin exigir un permiso concreto", async () => {
    const ctx = await autorizarMembresia(e.headers["consulta-alfa"], e.alfaId);
    assert.equal(ctx.rolNombre, "Consulta");
    assert.ok(ctx.permisos.has("terceros:consultar") && !ctx.permisos.has("terceros:crear"));
    await assert.rejects(autorizarMembresia(new Headers(), e.alfaId), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "NO_AUTENTICADO");
    await assert.rejects(autorizarMembresia(e.headers["consulta-alfa"], e.betaId), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "SIN_MEMBRESIA");
    await assert.rejects(autorizarMembresia(e.headers["consulta-alfa"], "no-uuid"), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "SIN_MEMBRESIA");
  });

  it("el menú sigue la organización definida y Centro de Inteligencia queda bajo Dashboard", () => {
    assert.deepEqual(grupos.map((g) => g.titulo), ["Principal", "Operaciones", "Gestión y control", "Sistema"]);
    assert.deepEqual(grupos.map((g) => g.items.map((i) => i.nombre)), [
      ["Dashboard", "Centro de Inteligencia"],
      ["Operaciones", "Logística", "Documentos", "Costos", "Inventarios"],
      ["Terceros", "Reportes"],
      ["Configuración"],
    ]);
    assert.ok(!modulos.some((m) => m.href === "/administracion"));
    assert.equal(moduloActivo("/inteligencia/nuevo/expediente").nombre, "Centro de Inteligencia");
    assert.equal(moduloActivo("/configuracion/usuarios").nombre, "Configuración");
    assert.equal(moduloActivo("/").nombre, "Dashboard");
    // Todo módulo con permiso en el menú corresponde a un permiso real del catálogo.
    for (const m of modulos) if (m.permiso) assert.match(m.permiso, /^[a-z]+:[a-z_]+$/);
  });
});
