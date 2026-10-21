import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { autorizar, ErrorAutorizacion, type CodigoError, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { crearUsuarioConCredenciales } from "../src/lib/auth/usuarios";
import { db } from "../src/lib/db";
import { esProveedor, idModeloAISDK, obtenerAdaptador, ErrorProveedorNoDisponible } from "../src/lib/inteligencia/proveedores";
import * as servicio from "../src/lib/inteligencia/servicio";
import type { CodigoPermiso } from "../src/lib/permisos/catalogo";
import { sembrar } from "../prisma/seed";
import { iniciarSesion } from "./ayudas";

const ALFA = "DEMO-0001";
const BETA = "DEMO-0002";
const sufijo = randomBytes(4).toString("hex");
const clave = randomBytes(18).toString("base64url");
const correo = (alias: string) => `${alias}-${sufijo}@test.invalid`;
const rechazaCon = (codigo: CodigoError) => (e: unknown) => e instanceof ErrorAutorizacion && e.codigo === codigo;
const rechazaValidacion = (e: unknown) => e instanceof servicio.ErrorValidacion;

const PERMISOS_IA: CodigoPermiso[] = [
  "inteligencia:consultar",
  "inteligencia:configurar",
  "inteligencia:administrar_agentes",
  "inteligencia:ejecutar",
  "inteligencia:aprobar",
];

describe("Centro de Inteligencia", () => {
  let alfaId: string, betaId: string;
  const h: Record<string, Headers> = {};
  const ctx: Record<string, ContextoAcceso> = {};

  const limpiar = async () => {
    await db.aprobacion.deleteMany();
    await db.resultado.deleteMany();
    await db.ejecucion.deleteMany();
    await db.asignacionModelo.deleteMany();
    await db.agente.deleteMany();
    await db.configuracionProveedor.deleteMany();
  };

  before(async () => {
    await sembrar();
    await limpiar();
    alfaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: ALFA } })).id;
    betaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: BETA } })).id;
    const usuarios = [
      ["admin-alfa", ALFA, "Administrador"],
      ["operador-alfa", ALFA, "Operador"],
      ["consulta-alfa", ALFA, "Consulta"],
      ["admin-beta", BETA, "Administrador"],
    ] as const;
    for (const [alias, empresa, rol] of usuarios) {
      await crearUsuarioConCredenciales({
        correo: correo(alias), nombre: alias, clave, membresias: [{ identificacionFiscal: empresa, rol }],
      });
      h[alias] = await iniciarSesion(correo(alias), clave);
    }
    ctx.adminAlfa = await autorizar(h["admin-alfa"], alfaId, "inteligencia:consultar");
    ctx.adminBeta = await autorizar(h["admin-beta"], betaId, "inteligencia:consultar");
  });

  after(async () => {
    await limpiar();
    await db.usuario.deleteMany({ where: { correo: { endsWith: `-${sufijo}@test.invalid` } } });
    await db.$disconnect();
  });

  it("los roles conceden solo los permisos de inteligencia definidos", async () => {
    const esperado = {
      "admin-alfa": PERMISOS_IA,
      "operador-alfa": ["inteligencia:consultar", "inteligencia:ejecutar"],
      "consulta-alfa": ["inteligencia:consultar"],
    } as const;
    for (const [alias, permitidos] of Object.entries(esperado)) {
      for (const permiso of PERMISOS_IA) {
        const prueba = autorizar(h[alias], alfaId, permiso);
        if ((permitidos as readonly string[]).includes(permiso)) await prueba;
        else await assert.rejects(prueba, rechazaCon("PERMISO_DENEGADO"));
      }
    }
  });

  it("rechaza sin sesión y a usuarios de otra empresa", async () => {
    await assert.rejects(autorizar(new Headers(), alfaId, "inteligencia:consultar"), rechazaCon("NO_AUTENTICADO"));
    await assert.rejects(autorizar(h["admin-beta"], alfaId, "inteligencia:consultar"), rechazaCon("SIN_MEMBRESIA"));
    await assert.rejects(autorizar(h["admin-alfa"], betaId, "inteligencia:aprobar"), rechazaCon("SIN_MEMBRESIA"));
  });

  it("configura proveedores y asigna modelos por agente sin cambiar código", async () => {
    await servicio.inicializarAgentesPredeterminados(ctx.adminAlfa);
    await servicio.inicializarAgentesPredeterminados(ctx.adminAlfa); // idempotente
    const agentes = await servicio.listarAgentes(ctx.adminAlfa);
    assert.equal(agentes.length, 4);
    const doc = agentes.find((a) => a.codigo === "documental")!;
    assert.equal(doc.orquestador?.nombre, "Orquestador");

    const asignar = (modelo: string, proveedor = "OPENAI", prioridad = 1) =>
      servicio.asignarModelo(ctx.adminAlfa, { agenteId: doc.id, proveedor, modelo, prioridad });
    await assert.rejects(asignar("modelo-a"), rechazaValidacion); // proveedor sin habilitar
    await servicio.guardarProveedor(ctx.adminAlfa, { proveedor: "OPENAI", habilitado: true, notas: "" });
    await servicio.guardarProveedor(ctx.adminAlfa, { proveedor: "ANTHROPIC", habilitado: true, notas: "" });
    await asignar("modelo-a");
    await asignar("modelo-b"); // misma prioridad: reemplaza
    await asignar("modelo-c", "ANTHROPIC", 2);
    const asignaciones = (await servicio.listarAgentes(ctx.adminAlfa)).find((a) => a.id === doc.id)!.asignaciones;
    assert.deepEqual(asignaciones.map((a) => [a.proveedor, a.modelo, a.prioridad]), [["OPENAI", "modelo-b", 1], ["ANTHROPIC", "modelo-c", 2]]);

    await assert.rejects(asignar("modelo con espacios"), rechazaValidacion);
    await assert.rejects(asignar("x", "PROVEEDOR_FALSO"), rechazaValidacion);
    await assert.rejects(
      servicio.guardarProveedor(ctx.adminAlfa, { proveedor: "OPENAI", habilitado: false, notas: "" }),
      rechazaValidacion, // en uso
    );
  });

  it("aísla agentes, configuración y ejecuciones entre empresas", async () => {
    const alfa = await servicio.listarAgentes(ctx.adminAlfa);
    assert.equal((await servicio.listarAgentes(ctx.adminBeta)).length, 0);
    assert.equal((await servicio.listarProveedores(ctx.adminBeta)).every((p) => !p.habilitado), true);
    const agenteAlfa = alfa[0].id;

    // Beta no puede operar sobre agentes de Alfa aunque conozca su ID.
    await assert.rejects(servicio.cambiarEstadoAgente(ctx.adminBeta, agenteAlfa, false), rechazaValidacion);
    await assert.rejects(servicio.solicitarEjecucion(ctx.adminBeta, { agenteId: agenteAlfa, descripcion: "intento ajeno" }), rechazaValidacion);
    await servicio.guardarProveedor(ctx.adminBeta, { proveedor: "GOOGLE", habilitado: true, notas: "" });
    await assert.rejects(
      servicio.asignarModelo(ctx.adminBeta, { agenteId: agenteAlfa, proveedor: "GOOGLE", modelo: "m", prioridad: 1 }),
      rechazaValidacion,
    );

    // La base impide vínculos entre empresas aunque se salte el servicio.
    await assert.rejects(
      db.asignacionModelo.create({ data: { empresaId: betaId, agenteId: agenteAlfa, proveedor: "GOOGLE", modelo: "m" } }),
      (e: { code?: string }) => e.code === "P2003",
    );
    await assert.rejects(
      db.ejecucion.create({ data: { empresaId: betaId, agenteId: agenteAlfa, solicitadaPorId: ctx.adminBeta.usuarioId } }),
      (e: { code?: string }) => e.code === "P2003",
    );
  });

  it("registra solicitudes con empresa y solicitante, sin invocar modelos", async () => {
    const agente = (await servicio.listarAgentes(ctx.adminAlfa)).find((a) => a.codigo === "arancelario")!;
    const operador = await autorizar(h["operador-alfa"], alfaId, "inteligencia:ejecutar");
    await servicio.solicitarEjecucion(operador, { agenteId: agente.id, descripcion: "Solicitud de prueba" });
    await assert.rejects(servicio.solicitarEjecucion(operador, { agenteId: agente.id, descripcion: "x" }), rechazaValidacion);

    const [ejecucion] = await servicio.listarEjecuciones(ctx.adminAlfa);
    assert.equal(ejecucion.estado, "PENDIENTE");
    assert.equal(ejecucion.proveedor, null);
    assert.equal(ejecucion.solicitadaPorId, operador.usuarioId);
    assert.equal((await servicio.listarEjecuciones(ctx.adminBeta)).length, 0);
    assert.equal((await servicio.resumenPanel(ctx.adminBeta)).ejecucionesTotal, 0);
    assert.ok(esProveedor("OPENAI") && !esProveedor("__proto__"));
    assert.equal(idModeloAISDK({ proveedor: "ANTHROPIC", modelo: "m" }), "anthropic/m");
    assert.throws(() => obtenerAdaptador("OPENAI"), ErrorProveedorNoDisponible);
  });

  it("no existe aprobación automática y solo decide quien tiene el permiso en su empresa", async () => {
    const [ejecucion] = await servicio.listarEjecuciones(ctx.adminAlfa);
    const resultado = await db.resultado.create({
      data: { empresaId: alfaId, ejecucionId: ejecucion.id, titulo: "Resultado de prueba", contenido: { texto: "demo" } },
    });
    const aprobacion = await db.aprobacion.create({ data: { empresaId: alfaId, resultadoId: resultado.id } });
    assert.equal(aprobacion.estado, "PENDIENTE");

    // La base rechaza una decisión sin usuario ni fecha.
    await assert.rejects(db.aprobacion.update({ where: { id: aprobacion.id }, data: { estado: "APROBADO" } }));
    // Otra empresa no puede decidir.
    await assert.rejects(
      servicio.decidirAprobacion(ctx.adminBeta, { aprobacionId: aprobacion.id, decision: "APROBADO", comentario: "" }),
      rechazaValidacion,
    );
    await assert.rejects(autorizar(h["operador-alfa"], alfaId, "inteligencia:aprobar"), rechazaCon("PERMISO_DENEGADO"));
    await assert.rejects(servicio.decidirAprobacion(ctx.adminAlfa, { aprobacionId: aprobacion.id, decision: "AUTO", comentario: "" }), rechazaValidacion);

    const aprobador = await autorizar(h["admin-alfa"], alfaId, "inteligencia:aprobar");
    await servicio.decidirAprobacion(aprobador, { aprobacionId: aprobacion.id, decision: "APROBADO", comentario: "ok" });
    const final = await db.aprobacion.findUniqueOrThrow({ where: { id: aprobacion.id } });
    assert.equal(final.estado, "APROBADO");
    assert.equal(final.decididaPorId, aprobador.usuarioId);
    assert.ok(final.decididaEn);
    await assert.rejects(servicio.decidirAprobacion(aprobador, { aprobacionId: aprobacion.id, decision: "RECHAZADO", comentario: "" }), rechazaValidacion);
  });
});
