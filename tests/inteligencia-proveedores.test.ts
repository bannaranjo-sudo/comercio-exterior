import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { APICallError } from "ai";
import { autorizar, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { crearUsuarioConCredenciales } from "../src/lib/auth/usuarios";
import { db } from "../src/lib/db";
import { adaptadorOpenAI } from "../src/lib/inteligencia/adaptadores/openai";
import { ErrorProveedorIA, traducirError } from "../src/lib/inteligencia/errores";
import { LIMITES, limitarTokensSalida } from "../src/lib/inteligencia/limites";
import { registrarAdaptador, type AdaptadorProveedor, type SolicitudGeneracion } from "../src/lib/inteligencia/proveedores";
import * as servicio from "../src/lib/inteligencia/servicio";
import { sembrar } from "../prisma/seed";
import { iniciarSesion } from "./ayudas";

const CLAVE_FALSA = "sk-test-NO-ES-REAL-" + randomBytes(6).toString("hex");
const TEXTO_PROVEEDOR = "respuesta-confidencial-del-proveedor";
const sufijo = randomBytes(4).toString("hex");
const clave = randomBytes(18).toString("base64url");
const correo = (alias: string) => `${alias}-${sufijo}@test.invalid`;
const rechazaValidacion = (e: unknown) => e instanceof servicio.ErrorValidacion;

let llamadas: SolicitudGeneracion[] = [];
let comportamiento: () => Promise<{ texto: string; uso?: { tokensEntrada: number; tokensSalida: number } }>;

const simulado = (proveedor: "OPENAI" | "ANTHROPIC" | "GOOGLE"): AdaptadorProveedor => ({
  proveedor,
  async generar(solicitud) {
    llamadas.push(solicitud);
    return comportamiento();
  },
});

describe("integración de proveedores (adaptadores simulados)", () => {
  let alfaId: string, betaId: string;
  let adminAlfa: ContextoAcceso, adminBeta: ContextoAcceso;
  const h: Record<string, Headers> = {};
  const ok = async () => ({ texto: TEXTO_PROVEEDOR, uso: { tokensEntrada: 9, tokensSalida: 2 } });

  const limpiar = async () => {
    await db.registroUso.deleteMany();
    await db.aprobacion.deleteMany();
    await db.resultado.deleteMany();
    await db.ejecucion.deleteMany();
    await db.asignacionModelo.deleteMany();
    await db.agente.deleteMany();
    await db.configuracionProveedor.deleteMany();
  };

  before(async () => {
    process.env.OPENAI_API_KEY = CLAVE_FALSA;
    process.env.IA_PRUEBA_REAL_AUTORIZADA = "true";
    await sembrar();
    await limpiar();
    alfaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: "DEMO-0001" } })).id;
    betaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: "DEMO-0002" } })).id;
    for (const [alias, empresa, rol] of [
      ["admin-alfa", "DEMO-0001", "Administrador"],
      ["operador-alfa", "DEMO-0001", "Operador"],
      ["admin-beta", "DEMO-0002", "Administrador"],
    ] as const) {
      await crearUsuarioConCredenciales({ correo: correo(alias), nombre: alias, clave, membresias: [{ identificacionFiscal: empresa, rol }] });
      h[alias] = await iniciarSesion(correo(alias), clave);
    }
    adminAlfa = await autorizar(h["admin-alfa"], alfaId, "inteligencia:configurar");
    adminBeta = await autorizar(h["admin-beta"], betaId, "inteligencia:configurar");
    for (const ctx of [adminAlfa, adminBeta]) {
      await servicio.guardarProveedor(ctx, { proveedor: "OPENAI", habilitado: true, notas: "" });
    }
    await servicio.guardarProveedor(adminAlfa, { proveedor: "ANTHROPIC", habilitado: true, notas: "" });
    registrarAdaptador(simulado("OPENAI"));
    registrarAdaptador(simulado("ANTHROPIC"));
  });

  beforeEach(async () => {
    llamadas = [];
    comportamiento = ok;
    process.env.IA_PRUEBA_REAL_AUTORIZADA = "true";
    await db.registroUso.deleteMany();
  });

  after(async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.IA_PRUEBA_REAL_AUTORIZADA;
    await limpiar();
    await db.usuario.deleteMany({ where: { correo: { endsWith: `-${sufijo}@test.invalid` } } });
    await db.$disconnect();
  });

  it("no llama a ningún proveedor si el servidor no autoriza la prueba real", async () => {
    delete process.env.IA_PRUEBA_REAL_AUTORIZADA;
    await assert.rejects(servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-5-mini" }), rechazaValidacion);
    assert.equal(llamadas.length, 0);
    assert.equal(await db.registroUso.count(), 0);
  });

  it("registra proveedor, modelo, duración y tokens, y devuelve solo métricas", async () => {
    const r = await servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-5-mini" });
    assert.equal(r.estado, "EXITOSA");
    assert.deepEqual(Object.keys(r).sort(), ["duracionMs", "estado", "modelo", "proveedor", "tokensEntrada", "tokensSalida"]);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].maximoTokens, LIMITES.tokensSalidaPrueba);

    const [fila] = await db.registroUso.findMany();
    assert.deepEqual(
      [fila.empresaId, fila.usuarioId, fila.proveedor, fila.modelo, fila.estado, fila.tokensEntrada, fila.tokensSalida],
      [alfaId, adminAlfa.usuarioId, "OPENAI", "gpt-5-mini", "EXITOSA", 9, 2],
    );
    assert.ok(fila.duracionMs !== null && fila.duracionMs >= 0);

    // Nada sensible en lo que llega al navegador ni en la base.
    const visible = JSON.stringify([r, servicio.estadoIntegracion(), await servicio.listarUso(adminAlfa)]);
    const guardado = JSON.stringify(await db.registroUso.findMany());
    for (const secreto of [CLAVE_FALSA, TEXTO_PROVEEDOR, "Responde"]) {
      assert.ok(!visible.includes(secreto) && !guardado.includes(secreto), `filtra: ${secreto}`);
    }
    assert.equal(servicio.estadoIntegracion().claveOpenAIConfigurada, true);
  });

  it("traduce errores de autenticación, cuota, modelo y conexión sin filtrar detalles", async () => {
    const api = (statusCode?: number) =>
      new APICallError({ message: `detalle interno ${CLAVE_FALSA}`, url: "https://api.invalid", requestBodyValues: {}, statusCode });
    const casos: [unknown, string][] = [
      [api(401), "AUTENTICACION"], [api(403), "AUTENTICACION"], [api(429), "LIMITE_USO"],
      [api(404), "MODELO_NO_DISPONIBLE"], [api(503), "CONEXION"], [api(undefined), "CONEXION"],
      [Object.assign(new Error("x"), { code: "ECONNREFUSED" }), "CONEXION"],
      [Object.assign(new Error("x"), { name: "TimeoutError" }), "CONEXION"],
      [new Error(`fallo con ${CLAVE_FALSA}`), "DESCONOCIDO"],
    ];
    for (const [error, codigo] of casos) {
      comportamiento = () => Promise.reject(error);
      await db.registroUso.deleteMany();
      const r = await servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-5" });
      assert.equal(r.estado, "FALLIDA");
      assert.equal(r.estado === "FALLIDA" && r.codigo, codigo);
      assert.ok(!JSON.stringify(r).includes(CLAVE_FALSA));
      const fila = await db.registroUso.findFirstOrThrow();
      assert.equal(fila.estado, "FALLIDA");
      assert.equal(fila.codigoError, codigo);
    }
    assert.equal(traducirError(new ErrorProveedorIA("LIMITE_USO")).codigo, "LIMITE_USO");
  });

  it("el adaptador real exige OPENAI_API_KEY del servidor y limita los tokens, sin red", async () => {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(
      adaptadorOpenAI.generar({ referencia: { proveedor: "OPENAI", modelo: "gpt-5-mini" }, mensajes: [{ rol: "user", contenido: "hola" }] }),
      (e: unknown) => e instanceof ErrorProveedorIA && e.codigo === "NO_CONFIGURADO",
    );
    process.env.OPENAI_API_KEY = CLAVE_FALSA;
    assert.equal(limitarTokensSalida(1_000_000), LIMITES.tokensSalidaMax);
    assert.equal(limitarTokensSalida(), LIMITES.tokensSalidaMax);
    assert.equal(limitarTokensSalida(0), 1);
  });

  it("valida modelo autorizado, proveedor habilitado y proveedor sin adaptador", async () => {
    await assert.rejects(servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-9000" }), rechazaValidacion);
    await assert.rejects(servicio.probarConexion(adminAlfa, { proveedor: "GOOGLE", modelo: "m" }), rechazaValidacion); // no habilitado
    await servicio.guardarProveedor(adminAlfa, { proveedor: "GOOGLE", habilitado: true, notas: "" });
    const r = await servicio.probarConexion(adminAlfa, { proveedor: "GOOGLE", modelo: "cualquier-modelo" });
    assert.equal(r.estado === "FALLIDA" && r.codigo, "PROVEEDOR_NO_DISPONIBLE");
    await servicio.guardarProveedor(adminAlfa, { proveedor: "GOOGLE", habilitado: false, notas: "" });
  });

  it("limita las pruebas por empresa en la ventana de tiempo", async () => {
    for (let i = 0; i < LIMITES.pruebas.max; i++) {
      const r = await servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-5-mini" });
      assert.equal(r.estado, "EXITOSA");
    }
    const bloqueada = await servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-5-mini" });
    assert.equal(bloqueada.estado === "FALLIDA" && bloqueada.codigo, "LIMITE_SOLICITUDES");
    assert.equal(llamadas.length, LIMITES.pruebas.max);
    // El límite es por empresa: Beta no se ve afectada.
    assert.equal((await servicio.probarConexion(adminBeta, { proveedor: "OPENAI", modelo: "gpt-5-mini" })).estado, "EXITOSA");
  });

  it("es compatible con varios proveedores y aísla el uso por empresa", async () => {
    comportamiento = ok;
    assert.equal((await servicio.probarConexion(adminAlfa, { proveedor: "ANTHROPIC", modelo: "modelo-libre" })).estado, "EXITOSA");
    assert.equal((await servicio.probarConexion(adminAlfa, { proveedor: "OPENAI", modelo: "gpt-5" })).estado, "EXITOSA");
    assert.equal((await servicio.listarUso(adminAlfa)).length, 2);
    assert.equal((await servicio.listarUso(adminBeta)).length, 0);
    // Anthropic no está habilitado en Beta.
    await assert.rejects(servicio.probarConexion(adminBeta, { proveedor: "ANTHROPIC", modelo: "m" }), rechazaValidacion);
  });

  it("solo quien configura puede probar, y se exige sesión", async () => {
    await autorizar(h["admin-alfa"], alfaId, "inteligencia:configurar");
    await assert.rejects(
      autorizar(h["operador-alfa"], alfaId, "inteligencia:configurar"),
      (e: unknown) => e instanceof ErrorAutorizacion && e.codigo === "PERMISO_DENEGADO",
    );
    await assert.rejects(
      autorizar(new Headers(), alfaId, "inteligencia:configurar"),
      (e: unknown) => e instanceof ErrorAutorizacion && e.codigo === "NO_AUTENTICADO",
    );
  });

  it("los análisis siguen deshabilitados: solo se encolan, sin llamar a proveedores", async () => {
    await servicio.inicializarAgentesPredeterminados(adminAlfa);
    const agente = (await servicio.listarAgentes(adminAlfa))[0];
    await servicio.solicitarEjecucion(adminAlfa, { agenteId: agente.id, descripcion: "análisis de prueba" });
    assert.equal(llamadas.length, 0);
    assert.equal(await db.registroUso.count(), 0);
    assert.deepEqual((await servicio.listarEjecuciones(adminAlfa)).map((e) => e.estado), ["PENDIENTE"]);
  });

  it("la base impide referencias de orquestador y ejecución padre entre empresas", async () => {
    await servicio.inicializarAgentesPredeterminados(adminBeta);
    const orqAlfa = await db.agente.findFirstOrThrow({ where: { empresaId: alfaId, tipo: "ORQUESTADOR" } });
    const orqBeta = await db.agente.findFirstOrThrow({ where: { empresaId: betaId, tipo: "ORQUESTADOR" } });
    const datos = { empresaId: betaId, codigo: "x-ajeno", nombre: "Agente ajeno" };

    await assert.rejects(db.agente.create({ data: { ...datos, orquestadorId: orqAlfa.id } }));
    await assert.rejects(db.agente.update({ where: { id: orqBeta.id }, data: { orquestadorId: orqAlfa.id } }));
    await db.agente.create({ data: { ...datos, orquestadorId: orqBeta.id } }); // misma empresa: permitido

    const padreAlfa = await db.ejecucion.findFirstOrThrow({ where: { empresaId: alfaId } });
    const base = { empresaId: betaId, agenteId: orqBeta.id, solicitadaPorId: adminBeta.usuarioId };
    await assert.rejects(db.ejecucion.create({ data: { ...base, ejecucionPadreId: padreAlfa.id } }));
    const padreBeta = await db.ejecucion.create({ data: base });
    await db.ejecucion.create({ data: { ...base, ejecucionPadreId: padreBeta.id } }); // misma empresa: permitido
  });
});
