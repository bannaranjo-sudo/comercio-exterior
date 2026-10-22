import type { ProveedorIA } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { PROVEEDORES_IMPLEMENTADOS } from "@/lib/inteligencia/proveedores";
import { estadoIntegracion, listarProveedores, ultimaPrueba } from "@/lib/inteligencia/servicio";
import { recuperarInterrumpidas } from "@/lib/inteligencia/documental/analisis";
import { estadoModo } from "@/lib/inteligencia/documental/modo";

// Consultas de las vistas operativas del Centro de Inteligencia: solicitudes, resultados por revisar,
// historial y estado real de capacidades. Todo filtra por la empresa del contexto autorizado.

export type FiltrosSolicitudes = { estado?: string; agente?: string; q?: string; vista?: "abiertas" | "todas"; pagina?: number };
export const TAMANO_PAGINA_IA = 20;
const ESTADOS = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "FALLIDA", "CANCELADA"] as const;
type EstadoEjecucionIA = (typeof ESTADOS)[number];

const operacionIdDeEntrada = (entrada: unknown): string | undefined => {
  const id = (entrada as { operacionId?: unknown } | null)?.operacionId;
  return typeof id === "string" ? id : undefined;
};

/** Solicitudes de la empresa activa con su operación asociada (si existe), solicitante y agente. */
export async function listarSolicitudes(ctx: ContextoAcceso, filtros: FiltrosSolicitudes = {}) {
  await recuperarInterrumpidas(ctx);
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const estado = ESTADOS.find((e) => e === filtros.estado);
  const filas = await db.ejecucion.findMany({
    where: {
      empresaId: ctx.empresaId,
      ...(estado ? { estado } : filtros.vista === "abiertas" ? { estado: { in: ["PENDIENTE", "EN_CURSO"] as EstadoEjecucionIA[] } } : {}),
      ...(filtros.agente ? { agente: { codigo: filtros.agente } } : {}),
    },
    include: {
      agente: { select: { nombre: true, codigo: true } },
      solicitadaPor: { select: { nombre: true } },
      resultados: { select: { id: true, aprobacion: { select: { estado: true } } } },
    },
    orderBy: { creadoEn: "desc" },
    skip: (pagina - 1) * TAMANO_PAGINA_IA,
    take: TAMANO_PAGINA_IA + 1,
  });
  const visibles = filas.slice(0, TAMANO_PAGINA_IA);
  const ids = [...new Set(visibles.map((f) => operacionIdDeEntrada(f.entrada)).filter((x): x is string => Boolean(x)))];
  const operaciones = ids.length
    ? await db.operacion.findMany({ where: { id: { in: ids }, empresaId: ctx.empresaId }, select: { id: true, numero: true } })
    : [];
  const porId = new Map(operaciones.map((o) => [o.id, o]));
  const q = filtros.q?.trim().toLowerCase();
  const conOperacion = visibles
    .map((f) => ({ ...f, operacion: porId.get(operacionIdDeEntrada(f.entrada) ?? "") ?? null }))
    .filter(
      (f) =>
        !q ||
        JSON.stringify(f.entrada).toLowerCase().includes(q) ||
        f.operacion?.numero.toLowerCase().includes(q) ||
        f.agente.nombre.toLowerCase().includes(q),
    );
  return { filas: conOperacion, hayMas: filas.length > TAMANO_PAGINA_IA, pagina };
}

export async function obtenerSolicitud(ctx: ContextoAcceso, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await recuperarInterrumpidas(ctx);
  const solicitud = await db.ejecucion.findFirst({
    where: { id, empresaId: ctx.empresaId },
    include: {
      agente: { select: { nombre: true, codigo: true, tipo: true } },
      solicitadaPor: { select: { nombre: true } },
      resultados: { include: { aprobacion: { include: { decididaPor: { select: { nombre: true } } } } }, orderBy: { creadoEn: "desc" } },
    },
  });
  if (!solicitud) return null;
  const operacionId = operacionIdDeEntrada(solicitud.entrada);
  const operacion = operacionId
    ? await db.operacion.findFirst({ where: { id: operacionId, empresaId: ctx.empresaId }, select: { id: true, numero: true } })
    : null;
  return { ...solicitud, operacion };
}

/** Resultados con aprobación humana pendiente. */
export function listarResultadosPorRevisar(ctx: ContextoAcceso) {
  return db.resultado.findMany({
    where: { empresaId: ctx.empresaId, aprobacion: { estado: "PENDIENTE" } },
    include: {
      aprobacion: true,
      ejecucion: { select: { id: true, agente: { select: { nombre: true } }, solicitadaPor: { select: { nombre: true } } } },
    },
    orderBy: { creadoEn: "desc" },
    take: 50,
  });
}

export const contarPorRevisar = (ctx: ContextoAcceso) =>
  db.aprobacion.count({ where: { empresaId: ctx.empresaId, estado: "PENDIENTE" } });

/** Consumo registrado (solo metadatos: proveedor, modelo, duración y tokens informados por el proveedor). */
export function listarConsumo(ctx: ContextoAcceso, limite = 20) {
  return db.registroUso.findMany({
    where: { empresaId: ctx.empresaId },
    select: {
      id: true, tipo: true, proveedor: true, modelo: true, estado: true, codigoError: true,
      duracionMs: true, tokensEntrada: true, tokensSalida: true, creadoEn: true,
    },
    orderBy: { creadoEn: "desc" },
    take: limite,
  });
}

export type CapacidadProveedor = {
  proveedor: ProveedorIA;
  /** El proveedor está habilitado para esta empresa (configuración). */
  habilitado: boolean;
  /** Existe código de adaptador para el proveedor. */
  adaptadorDisponible: boolean;
  /** La credencial está definida en el servidor (nunca se muestra su valor). */
  credencialConfigurada: boolean;
  /** Última prueba de conexión con texto generado; null si nunca se verificó. */
  conexionVerificada: { fecha: Date; modelo: string } | null;
  /** Última prueba registrada, sea cual sea su resultado. */
  ultimaPrueba: { estado: string; fecha: Date; modelo: string; codigoError: string | null } | null;
};

/**
 * Estado real, sin equivalencias entre niveles: habilitado ≠ adaptador ≠ credencial ≠ conexión verificada
 * ≠ agente configurado ≠ análisis ejecutable.
 */
export async function estadoCapacidades(ctx: ContextoAcceso) {
  const [proveedores, agentes, asignaciones] = await Promise.all([
    listarProveedores(ctx),
    db.agente.findMany({ where: { empresaId: ctx.empresaId }, select: { id: true, activo: true, codigo: true } }),
    db.asignacionModelo.findMany({ where: { empresaId: ctx.empresaId, activa: true }, select: { agenteId: true } }),
  ]);
  const integracion = estadoIntegracion();
  const porProveedor: CapacidadProveedor[] = [];
  for (const p of proveedores) {
    const [ultima, verificada] = await Promise.all([
      ultimaPrueba(ctx, p.proveedor),
      db.registroUso.findFirst({
        where: { empresaId: ctx.empresaId, tipo: "PRUEBA_CONEXION", proveedor: p.proveedor, estado: "EXITOSA" },
        select: { creadoEn: true, modelo: true },
        orderBy: { creadoEn: "desc" },
      }),
    ]);
    porProveedor.push({
      proveedor: p.proveedor,
      habilitado: p.habilitado,
      adaptadorDisponible: PROVEEDORES_IMPLEMENTADOS.includes(p.proveedor),
      credencialConfigurada: p.proveedor === "OPENAI" ? integracion.claveOpenAIConfigurada : false,
      conexionVerificada: verificada ? { fecha: verificada.creadoEn, modelo: verificada.modelo } : null,
      ultimaPrueba: ultima ? { estado: ultima.estado, fecha: ultima.creadoEn, modelo: ultima.modelo, codigoError: ultima.codigoError } : null,
    });
  }
  const activos = agentes.filter((a) => a.activo);
  const conModelo = activos.filter((a) => asignaciones.some((x) => x.agenteId === a.id));
  const modo = estadoModo();
  const cadenaLista = porProveedor.some((p) => p.habilitado && p.adaptadorDisponible && p.credencialConfigurada && p.conexionVerificada);
  return {
    proveedores: porProveedor,
    agentes: { total: agentes.length, activos: activos.length, conModelo: conModelo.length },
    agentePorCodigo: new Map(activos.map((a) => [a.codigo, a.id])),
    pruebaRealAutorizada: integracion.pruebaRealAutorizada,
    ejecutorImplementado: true,
    modo,
    /** Solo es true cuando existe un ejecutor real y toda la cadena (proveedor, credencial, conexión, agente) está lista. */
    analisisEjecutable:
      modo.efectivo === "simulado" ? activos.some((a) => a.codigo === "documental") : modo.efectivo === "real" ? cadenaLista && conModelo.length > 0 : false,
  };
}

/** Análisis documentales de una operación de la empresa (pestaña Inteligencia del expediente). */
export async function listarAnalisisDeOperacion(ctx: ContextoAcceso, operacionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(operacionId)) return [];
  await recuperarInterrumpidas(ctx);
  return db.ejecucion.findMany({
    where: { empresaId: ctx.empresaId, entrada: { path: ["operacionId"], equals: operacionId } },
    include: {
      agente: { select: { nombre: true } },
      solicitadaPor: { select: { nombre: true } },
      resultados: { select: { id: true, aprobacion: { select: { estado: true } } } },
    },
    orderBy: { creadoEn: "desc" },
    take: 20,
  });
}
