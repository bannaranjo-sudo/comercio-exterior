import { db } from "@/lib/db";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { ErrorProveedorIA, traducirError, type CodigoErrorProveedor } from "@/lib/inteligencia/errores";
import { LIMITES } from "@/lib/inteligencia/limites";
import { modelosPermitidos } from "@/lib/inteligencia/modelos";
import { esProveedor, LISTA_PROVEEDORES, obtenerAdaptador } from "@/lib/inteligencia/proveedores";
import type { ProveedorIA } from "@/generated/prisma/enums";

// Lógica de negocio del Centro de Inteligencia.
// Cada función recibe un ContextoAcceso ya autorizado (requirePermission/autorizar) y
// filtra SIEMPRE por ctx.empresaId; nunca se acepta una empresa como parámetro.

export class ErrorValidacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorValidacion";
  }
}

const SLUG = /^[a-z][a-z0-9-]{1,39}$/;
const MODELO = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

function texto(valor: unknown, campo: string, min: number, max: number): string {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (limpio.length < min || limpio.length > max) {
    throw new ErrorValidacion(`${campo}: debe tener entre ${min} y ${max} caracteres.`);
  }
  return limpio;
}

function validarModeloPermitido(proveedor: ProveedorIA, modelo: string): void {
  const permitidos = modelosPermitidos(proveedor);
  if (permitidos && !permitidos.includes(modelo)) {
    throw new ErrorValidacion("Modelo no autorizado para este proveedor.");
  }
}

const AGENTES_PREDETERMINADOS = [
  { codigo: "orquestador", nombre: "Orquestador", tipo: "ORQUESTADOR", descripcion: "Coordina a los agentes especialistas." },
  { codigo: "documental", nombre: "Análisis documental", tipo: "ESPECIALISTA", descripcion: "Revisión de documentos de comercio exterior." },
  { codigo: "arancelario", nombre: "Análisis arancelario", tipo: "ESPECIALISTA", descripcion: "Clasificación y gravámenes arancelarios." },
  { codigo: "financiero", nombre: "Análisis financiero", tipo: "ESPECIALISTA", descripcion: "Costos y liquidación de operaciones." },
] as const;

export async function resumenPanel(ctx: ContextoAcceso) {
  const donde = { empresaId: ctx.empresaId };
  const [agentesActivos, proveedoresHabilitados, ejecucionesPendientes, ejecucionesTotal, porAprobar] =
    await Promise.all([
      db.agente.count({ where: { ...donde, activo: true } }),
      db.configuracionProveedor.count({ where: { ...donde, habilitado: true } }),
      db.ejecucion.count({ where: { ...donde, estado: "PENDIENTE" } }),
      db.ejecucion.count({ where: donde }),
      db.aprobacion.count({ where: { ...donde, estado: "PENDIENTE" } }),
    ]);
  return { agentesActivos, proveedoresHabilitados, ejecucionesPendientes, ejecucionesTotal, porAprobar };
}

export async function listarProveedores(ctx: ContextoAcceso) {
  const filas = await db.configuracionProveedor.findMany({ where: { empresaId: ctx.empresaId } });
  return LISTA_PROVEEDORES.map((proveedor) => {
    const fila = filas.find((f) => f.proveedor === proveedor);
    return { proveedor, habilitado: fila?.habilitado ?? false, notas: fila?.notas ?? "" };
  });
}

export async function guardarProveedor(
  ctx: ContextoAcceso,
  datos: { proveedor: unknown; habilitado: boolean; notas: unknown },
) {
  if (!esProveedor(datos.proveedor)) throw new ErrorValidacion("Proveedor no válido.");
  const notas = typeof datos.notas === "string" ? datos.notas.trim().slice(0, 500) : "";
  const { proveedor } = datos;
  if (!datos.habilitado) {
    // No se puede deshabilitar un proveedor mientras haya asignaciones activas que lo usen.
    const enUso = await db.asignacionModelo.count({
      where: { empresaId: ctx.empresaId, proveedor, activa: true },
    });
    if (enUso > 0) throw new ErrorValidacion("El proveedor tiene modelos asignados a agentes.");
  }
  await db.configuracionProveedor.upsert({
    where: { empresaId_proveedor: { empresaId: ctx.empresaId, proveedor } },
    update: { habilitado: datos.habilitado, notas },
    create: { empresaId: ctx.empresaId, proveedor, habilitado: datos.habilitado, notas },
  });
}

export function listarAgentes(ctx: ContextoAcceso) {
  return db.agente.findMany({
    where: { empresaId: ctx.empresaId },
    include: { asignaciones: { orderBy: { prioridad: "asc" } }, orquestador: { select: { nombre: true } } },
    orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
  });
}

export async function inicializarAgentesPredeterminados(ctx: ContextoAcceso) {
  const orquestador = AGENTES_PREDETERMINADOS[0];
  const raiz = await db.agente.upsert({
    where: { empresaId_codigo: { empresaId: ctx.empresaId, codigo: orquestador.codigo } },
    update: {},
    create: { empresaId: ctx.empresaId, ...orquestador },
  });
  for (const agente of AGENTES_PREDETERMINADOS.slice(1)) {
    await db.agente.upsert({
      where: { empresaId_codigo: { empresaId: ctx.empresaId, codigo: agente.codigo } },
      update: {},
      create: { empresaId: ctx.empresaId, ...agente, orquestadorId: raiz.id },
    });
  }
}

export async function crearAgente(
  ctx: ContextoAcceso,
  datos: { codigo: unknown; nombre: unknown; descripcion: unknown; instrucciones: unknown },
) {
  const codigo = texto(datos.codigo, "Código", 2, 40).toLowerCase();
  if (!SLUG.test(codigo)) {
    throw new ErrorValidacion("Código: use minúsculas, números y guiones (empiece con una letra).");
  }
  const existe = await db.agente.findUnique({
    where: { empresaId_codigo: { empresaId: ctx.empresaId, codigo } },
  });
  if (existe) throw new ErrorValidacion("Ya existe un agente con ese código.");
  const orquestador = await db.agente.findFirst({
    where: { empresaId: ctx.empresaId, tipo: "ORQUESTADOR" },
    select: { id: true },
  });
  await db.agente.create({
    data: {
      empresaId: ctx.empresaId,
      codigo,
      nombre: texto(datos.nombre, "Nombre", 3, 80),
      descripcion: typeof datos.descripcion === "string" ? datos.descripcion.trim().slice(0, 500) || null : null,
      instrucciones: typeof datos.instrucciones === "string" ? datos.instrucciones.trim().slice(0, 4000) || null : null,
      orquestadorId: orquestador?.id ?? null,
    },
  });
}

async function agenteDeEmpresa(ctx: ContextoAcceso, agenteId: unknown) {
  const id = typeof agenteId === "string" ? agenteId : "";
  const agente = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.agente.findFirst({ where: { id, empresaId: ctx.empresaId } })
    : null;
  if (!agente) throw new ErrorValidacion("Agente no encontrado.");
  return agente;
}

export async function cambiarEstadoAgente(ctx: ContextoAcceso, agenteId: unknown, activo: boolean) {
  const agente = await agenteDeEmpresa(ctx, agenteId);
  await db.agente.update({ where: { id: agente.id }, data: { activo } });
}

/** Asigna proveedor y modelo a un agente (por prioridad). Es configuración: se cambia sin tocar código. */
export async function asignarModelo(
  ctx: ContextoAcceso,
  datos: { agenteId: unknown; proveedor: unknown; modelo: unknown; prioridad: unknown },
) {
  const agente = await agenteDeEmpresa(ctx, datos.agenteId);
  if (!esProveedor(datos.proveedor)) throw new ErrorValidacion("Proveedor no válido.");
  const modelo = texto(datos.modelo, "Modelo", 1, 100);
  if (!MODELO.test(modelo)) throw new ErrorValidacion("Modelo: contiene caracteres no permitidos.");
  validarModeloPermitido(datos.proveedor, modelo);
  const prioridad = Number(datos.prioridad ?? 1);
  if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 5) {
    throw new ErrorValidacion("Prioridad: debe ser un entero entre 1 y 5.");
  }
  const proveedor: ProveedorIA = datos.proveedor;
  const config = await db.configuracionProveedor.findUnique({
    where: { empresaId_proveedor: { empresaId: ctx.empresaId, proveedor } },
  });
  if (!config?.habilitado) throw new ErrorValidacion("Habilite el proveedor en Configuración primero.");

  await db.asignacionModelo.upsert({
    where: { agenteId_prioridad: { agenteId: agente.id, prioridad } },
    update: { proveedor, modelo, activa: true },
    create: { empresaId: ctx.empresaId, agenteId: agente.id, proveedor, modelo, prioridad },
  });
}

export function listarEjecuciones(ctx: ContextoAcceso) {
  return db.ejecucion.findMany({
    where: { empresaId: ctx.empresaId },
    include: {
      agente: { select: { nombre: true } },
      solicitadaPor: { select: { nombre: true } },
      resultados: { include: { aprobacion: true } },
    },
    orderBy: { creadoEn: "desc" },
    take: 50,
  });
}

/** Registra una solicitud en cola. No invoca ningún modelo. */
export async function solicitarEjecucion(ctx: ContextoAcceso, datos: { agenteId: unknown; descripcion: unknown }) {
  const agente = await agenteDeEmpresa(ctx, datos.agenteId);
  if (!agente.activo) throw new ErrorValidacion("El agente está desactivado.");
  await db.ejecucion.create({
    data: {
      empresaId: ctx.empresaId,
      agenteId: agente.id,
      solicitadaPorId: ctx.usuarioId,
      entrada: { descripcion: texto(datos.descripcion, "Descripción", 5, 2000) },
    },
  });
}

/** La decisión siempre la toma una persona: se registra el usuario autorizado de la sesión. */
export async function decidirAprobacion(
  ctx: ContextoAcceso,
  datos: { aprobacionId: unknown; decision: unknown; comentario: unknown },
) {
  if (datos.decision !== "APROBADO" && datos.decision !== "RECHAZADO") {
    throw new ErrorValidacion("Decisión no válida.");
  }
  const id = typeof datos.aprobacionId === "string" ? datos.aprobacionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorValidacion("Aprobación no encontrada.");
  const comentario = typeof datos.comentario === "string" ? datos.comentario.trim().slice(0, 500) || null : null;
  const { count } = await db.aprobacion.updateMany({
    where: { id, empresaId: ctx.empresaId, estado: "PENDIENTE" },
    data: { estado: datos.decision, decididaPorId: ctx.usuarioId, decididaEn: new Date(), comentario },
  });
  if (count === 0) throw new ErrorValidacion("La aprobación no existe o ya fue resuelta.");
}

// ---------------------------------------------------------------------------
// Prueba de conexión con proveedores. No devuelve ni almacena texto de mensajes o respuestas.
// ---------------------------------------------------------------------------

export type ResultadoPrueba =
  | { estado: "EXITOSA"; proveedor: ProveedorIA; modelo: string; duracionMs: number; tokensEntrada: number | null; tokensSalida: number | null }
  | { estado: "FALLIDA"; proveedor: ProveedorIA; modelo: string; duracionMs: number; codigo: CodigoErrorProveedor; mensaje: string };

/** Las llamadas reales solo se permiten con IA_PRUEBA_REAL_AUTORIZADA=true en el servidor. */
export const pruebaRealAutorizada = (): boolean => process.env.IA_PRUEBA_REAL_AUTORIZADA === "true";

export function estadoIntegracion() {
  return {
    claveOpenAIConfigurada: Boolean(process.env.OPENAI_API_KEY),
    pruebaRealAutorizada: pruebaRealAutorizada(),
    modelosOpenAI: modelosPermitidos("OPENAI") ?? [],
  };
}

/**
 * Verifica los límites y reserva el registro de uso en una sola transacción, serializada por empresa
 * con un bloqueo asesor de PostgreSQL: solicitudes simultáneas no pueden superar el límite.
 */
async function reservarUso(
  ctx: ContextoAcceso,
  datos: { proveedor: ProveedorIA; modelo: string },
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.empresaId}, 0))`;
    const ahora = Date.now();
    const [pruebas, solicitudes] = await Promise.all([
      tx.registroUso.count({
        where: {
          empresaId: ctx.empresaId,
          tipo: "PRUEBA_CONEXION",
          creadoEn: { gte: new Date(ahora - LIMITES.pruebas.ventanaMs) },
        },
      }),
      tx.registroUso.count({
        where: { empresaId: ctx.empresaId, creadoEn: { gte: new Date(ahora - LIMITES.solicitudes.ventanaMs) } },
      }),
    ]);
    if (pruebas >= LIMITES.pruebas.max || solicitudes >= LIMITES.solicitudes.max) {
      throw new ErrorProveedorIA("LIMITE_SOLICITUDES");
    }
    return tx.registroUso.create({
      data: { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, tipo: "PRUEBA_CONEXION", ...datos },
      select: { id: true },
    });
  });
}

export async function probarConexion(
  ctx: ContextoAcceso,
  datos: { proveedor: unknown; modelo: unknown },
): Promise<ResultadoPrueba> {
  if (!esProveedor(datos.proveedor)) throw new ErrorValidacion("Proveedor no válido.");
  const proveedor: ProveedorIA = datos.proveedor;
  const modelo = texto(datos.modelo, "Modelo", 1, 100);
  if (!MODELO.test(modelo)) throw new ErrorValidacion("Modelo: contiene caracteres no permitidos.");
  validarModeloPermitido(proveedor, modelo);
  if (!pruebaRealAutorizada()) {
    throw new ErrorValidacion("Las pruebas reales de conexión no están autorizadas en el servidor.");
  }
  const config = await db.configuracionProveedor.findUnique({
    where: { empresaId_proveedor: { empresaId: ctx.empresaId, proveedor } },
  });
  if (!config?.habilitado) throw new ErrorValidacion("Habilite el proveedor en Configuración primero.");

  const registro = async (estado: "EXITOSA" | "FALLIDA", cambios: object, id: string) =>
    db.registroUso.update({ where: { id }, data: { estado, ...cambios } });

  const inicio = Date.now();
  let uso: { id: string };
  try {
    uso = await reservarUso(ctx, { proveedor, modelo });
  } catch (error) {
    const e = traducirError(error);
    return { estado: "FALLIDA", proveedor, modelo, duracionMs: 0, codigo: e.codigo, mensaje: e.message };
  }

  try {
    const respuesta = await obtenerAdaptador(proveedor).generar({
      referencia: { proveedor, modelo },
      mensajes: [{ rol: "user", contenido: "Responde únicamente: OK" }],
      maximoTokens: LIMITES.tokensSalidaPrueba,
    });
    const duracionMs = Date.now() - inicio;
    const tokensEntrada = respuesta.uso?.tokensEntrada ?? null;
    const tokensSalida = respuesta.uso?.tokensSalida ?? null;
    await registro("EXITOSA", { duracionMs, tokensEntrada, tokensSalida }, uso.id);
    return { estado: "EXITOSA", proveedor, modelo, duracionMs, tokensEntrada, tokensSalida };
  } catch (error) {
    const e = traducirError(error);
    const duracionMs = Date.now() - inicio;
    await registro("FALLIDA", { duracionMs, codigoError: e.codigo }, uso.id);
    return { estado: "FALLIDA", proveedor, modelo, duracionMs, codigo: e.codigo, mensaje: e.message };
  }
}

export function listarUso(ctx: ContextoAcceso) {
  return db.registroUso.findMany({
    where: { empresaId: ctx.empresaId },
    select: {
      id: true, tipo: true, proveedor: true, modelo: true, estado: true, codigoError: true,
      duracionMs: true, tokensEntrada: true, tokensSalida: true, creadoEn: true,
    },
    orderBy: { creadoEn: "desc" },
    take: 10,
  });
}
