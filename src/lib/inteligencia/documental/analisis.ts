import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { EstadoEjecucion, ProveedorIA } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { leerArchivoDocumento, verificarDocumentosOperacion } from "@/lib/documentos/servicio";
import { ErrorValidacion } from "@/lib/errores";
import { ETIQUETA_TIPO_DOCUMENTO } from "@/lib/etiquetas";
import { registrarAdaptadoresPredeterminados } from "@/lib/inteligencia/adaptadores";
import { traducirError } from "@/lib/inteligencia/errores";
import { obtenerAdaptador, type ReferenciaModelo } from "@/lib/inteligencia/proveedores";
import { uuid } from "@/lib/validacion";
import { ErrorExtraccion, extraerTextoPdf } from "./extraccion";
import { verificarSalida } from "./evidencia";
import { interpretarSalida } from "./esquema";
import { codigoAutorizacionReal, estadoModo, hashAutorizacion, LIMITES_ANALISIS } from "./modo";
import { construirSolicitud, type DocumentoAnalizado } from "./prompt";
import { adaptadorSimulado } from "./simulado";

// Análisis documental con IA. Separa tres capas: (1) extracción de texto del PDF, (2) razonamiento del modelo y
// (3) verificación de evidencia por el sistema. Nunca modifica operaciones, inventarios ni costos: solo produce un
// informe que una persona debe revisar y decidir. Los documentos se tratan como contenido no confiable y no se
// escriben en logs.

export const VERSION_ANALISIS = "documental-v1";
const TIPO = "documental";
const REFERENCIA_SIMULADA: ReferenciaModelo = { proveedor: "SIMULADO", modelo: "simulado-v1" };

const bloqueoEmpresa = (tx: Prisma.TransactionClient, empresaId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${empresaId}, 0))`;

type EntradaAnalisis = { tipo: typeof TIPO; operacionId: string; documentoIds: string[]; huella: string; version: string };
const entradaDe = (e: unknown): EntradaAnalisis | null => {
  const x = e as Partial<EntradaAnalisis> | null;
  return x && x.tipo === TIPO && typeof x.operacionId === "string" && Array.isArray(x.documentoIds) ? (x as EntradaAnalisis) : null;
};
export const esAnalisisDocumental = (entrada: unknown): boolean => entradaDe(entrada) !== null;

// ---------------------------------------------------------------------------------------------------------------
// Selección de documentos
// ---------------------------------------------------------------------------------------------------------------

export type DocumentoSeleccionable = { id: string; nombreOriginal: string; tipo: import("@/generated/prisma/enums").TipoDocumento; estado: import("@/generated/prisma/enums").EstadoDocumento; sha256: string; tamanoBytes: number; claveAlmacenamiento: string; creadoEn: Date };

/** Documentos PDF de una operación de la empresa que se pueden elegir para el análisis. */
export async function documentosSeleccionables(ctx: ContextoAcceso, operacionId: string): Promise<DocumentoSeleccionable[]> {
  if (!uuid("Operación").safeParse(operacionId).success) return [];
  return db.documento.findMany({
    where: { empresaId: ctx.empresaId, operacionId, tipoMime: "application/pdf" },
    select: { id: true, nombreOriginal: true, tipo: true, estado: true, sha256: true, tamanoBytes: true, claveAlmacenamiento: true, creadoEn: true },
    orderBy: [{ tipo: "asc" }, { creadoEn: "desc" }],
  });
}

async function validarSeleccion(ctx: ContextoAcceso, operacionId: unknown, documentoIds: unknown) {
  if (typeof operacionId !== "string" || !uuid("Operación").safeParse(operacionId).success) throw new ErrorValidacion("Seleccione una operación.");
  const operacion = await db.operacion.findFirst({ where: { id: operacionId, empresaId: ctx.empresaId }, select: { id: true, numero: true, tipo: true, estado: true } });
  if (!operacion) throw new ErrorValidacion("Operación no encontrada.");
  if (operacion.estado === "CANCELADA") throw new ErrorValidacion("La operación está cancelada y no admite análisis.");
  const ids = [...new Set(Array.isArray(documentoIds) ? documentoIds.filter((x): x is string => typeof x === "string") : [])];
  if (ids.length === 0) throw new ErrorValidacion("Seleccione al menos un documento PDF.");
  if (ids.length > LIMITES_ANALISIS.maxDocumentos) throw new ErrorValidacion(`Seleccione como máximo ${LIMITES_ANALISIS.maxDocumentos} documentos.`);
  if (!ids.every((id) => uuid("Documento").safeParse(id).success)) throw new ErrorValidacion("Documento no válido.");
  const documentos = await db.documento.findMany({
    where: { id: { in: ids }, empresaId: ctx.empresaId, operacionId: operacion.id, tipoMime: "application/pdf" },
    orderBy: { id: "asc" },
  });
  if (documentos.length !== ids.length) throw new ErrorValidacion("Algún documento no pertenece a la operación seleccionada o no es un PDF.");
  return { operacion, documentos };
}

export const calcularHuella = (operacionId: string, documentos: readonly { id: string; sha256: string }[]): string =>
  createHash("sha256")
    .update([VERSION_ANALISIS, operacionId, ...[...documentos].sort((a, b) => a.id.localeCompare(b.id)).map((d) => `${d.id}:${d.sha256}`)].join("|"))
    .digest("hex");

// ---------------------------------------------------------------------------------------------------------------
// Extracción (vista previa y ejecución)
// ---------------------------------------------------------------------------------------------------------------

async function leerYExtraer(d: { id: string; nombreOriginal: string; tipo: DocumentoAnalizado["tipo"]; sha256: string; claveAlmacenamiento: string }): Promise<DocumentoAnalizado> {
  const base = { id: d.id, nombre: d.nombreOriginal, tipo: d.tipo, sha256: d.sha256 };
  let contenido: Buffer;
  try {
    contenido = await leerArchivoDocumento(d);
  } catch {
    return { ...base, extraccion: null, problema: "No se pudo leer el archivo almacenado o falló la verificación de integridad." };
  }
  try {
    const extraccion = await extraerTextoPdf(contenido);
    return { ...base, extraccion, problema: extraccion.estado === "SIN_TEXTO" ? "Sin texto seleccionable (probablemente escaneado); no se aplica OCR." : undefined };
  } catch (error) {
    return { ...base, extraccion: null, problema: error instanceof ErrorExtraccion ? error.message : "No se pudo procesar el PDF." };
  }
}

export type VistaPreviaDocumento = { id: string; nombre: string; tipo: DocumentoAnalizado["tipo"]; estado: "CON_TEXTO" | "SIN_TEXTO" | "ERROR"; paginas: number; caracteres: number; truncado: boolean; problema: string | null };

/** Verifica los documentos elegidos (lectura y extracción) sin invocar ningún modelo. */
export async function verificarSeleccion(ctx: ContextoAcceso, operacionId: unknown, documentoIds: unknown) {
  const { operacion, documentos } = await validarSeleccion(ctx, operacionId, documentoIds);
  const analizados = await Promise.all(documentos.map(leerYExtraer));
  const filas: VistaPreviaDocumento[] = analizados.map((a) => ({
    id: a.id, nombre: a.nombre, tipo: a.tipo, estado: a.extraccion ? a.extraccion.estado : "ERROR",
    paginas: a.extraccion?.totalPaginas ?? 0, caracteres: a.extraccion?.caracteres ?? 0, truncado: a.extraccion?.truncado ?? false, problema: a.problema ?? null,
  }));
  const utiles = filas.filter((f) => f.estado === "CON_TEXTO");
  return { operacion, filas, analizable: utiles.length > 0, caracteresTotales: utiles.reduce((s, f) => s + f.caracteres, 0) };
}

// ---------------------------------------------------------------------------------------------------------------
// Solicitud
// ---------------------------------------------------------------------------------------------------------------

export type ResultadoSolicitud = { ejecucionId: string; estado: EstadoEjecucion; ejecutada: boolean };

export async function solicitarAnalisisDocumental(ctx: ContextoAcceso, datos: { operacionId: unknown; documentoIds: unknown }, opciones: { ejecutar?: boolean } = {}): Promise<ResultadoSolicitud> {
  const { operacion, documentos } = await validarSeleccion(ctx, datos.operacionId, datos.documentoIds);
  const agente = await db.agente.findFirst({ where: { empresaId: ctx.empresaId, codigo: "documental", activo: true }, select: { id: true } });
  if (!agente) throw new ErrorValidacion("No hay un agente documental activo. Un administrador debe configurarlo en Configuración → Inteligencia artificial.");
  await recuperarInterrumpidas(ctx);
  const huella = calcularHuella(operacion.id, documentos);
  const entrada: EntradaAnalisis = { tipo: TIPO, operacionId: operacion.id, documentoIds: documentos.map((d) => d.id), huella, version: VERSION_ANALISIS };

  const ejecucion = await db
    .$transaction(async (tx) => {
      await bloqueoEmpresa(tx, ctx.empresaId);
      // Duplicados: una misma selección no puede estar activa dos veces ni repetirse mientras su informe siga vigente.
      const previas = await tx.ejecucion.findMany({
        where: { empresaId: ctx.empresaId, huella, estado: { in: ["PENDIENTE", "EN_CURSO", "COMPLETADA"] } },
        select: { id: true, estado: true, resultados: { select: { aprobacion: { select: { estado: true } } } } },
      });
      for (const p of previas) {
        if (p.estado !== "COMPLETADA") throw new ErrorValidacion("Ya hay un análisis en cola o en ejecución para esta misma selección de documentos.");
        const decisiones = p.resultados.map((r) => r.aprobacion?.estado);
        if (decisiones.some((d) => d === undefined || d === "PENDIENTE" || d === "APROBADO")) {
          throw new ErrorValidacion("Ya existe un análisis vigente de esta selección (sin rechazar ni devolver). Consúltelo en Solicitudes.");
        }
      }
      const enCola = await tx.ejecucion.count({ where: { empresaId: ctx.empresaId, estado: "PENDIENTE" } });
      if (enCola >= LIMITES_ANALISIS.enColaPorEmpresa) throw new ErrorValidacion("Hay demasiadas solicitudes en cola. Cancele o ejecute las pendientes.");
      return tx.ejecucion.create({ data: { empresaId: ctx.empresaId, agenteId: agente.id, solicitadaPorId: ctx.usuarioId, huella, entrada: entrada as unknown as Prisma.InputJsonValue }, select: { id: true } });
    })
    .catch((error) => {
      // Respaldo del índice único parcial por si dos solicitudes idénticas coinciden.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ErrorValidacion("Ya hay un análisis en cola o en ejecución para esta misma selección de documentos.");
      throw error;
    });

  const modo = estadoModo();
  if (opciones.ejecutar === false || modo.efectivo === "deshabilitado") return { ejecucionId: ejecucion.id, estado: "PENDIENTE", ejecutada: false };
  await ejecutarAnalisis(ctx, ejecucion.id);
  const fin = await db.ejecucion.findUniqueOrThrow({ where: { id: ejecucion.id }, select: { estado: true } });
  return { ejecucionId: ejecucion.id, estado: fin.estado, ejecutada: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------------------------------------------

async function resolverReferencia(ctx: ContextoAcceso, agenteId: string, modo: "simulado" | "real"): Promise<ReferenciaModelo> {
  if (modo === "simulado") return REFERENCIA_SIMULADA;
  const asignacion = await db.asignacionModelo.findFirst({ where: { empresaId: ctx.empresaId, agenteId, activa: true }, orderBy: { prioridad: "asc" } });
  if (!asignacion) throw new ErrorValidacion("El agente documental no tiene un modelo asignado.");
  const proveedor = await db.configuracionProveedor.findUnique({ where: { empresaId_proveedor: { empresaId: ctx.empresaId, proveedor: asignacion.proveedor } } });
  if (!proveedor?.habilitado) throw new ErrorValidacion("El proveedor del agente documental no está habilitado.");
  return { proveedor: asignacion.proveedor, modelo: asignacion.modelo };
}

type Metricas = { tokensEntrada?: number; tokensSalida?: number; tokensRazonamiento?: number; caracteresSalida?: number; motivoFin?: string };

async function finalizarFallida(ejecucionId: string, usoId: string, inicio: number, codigo: string, mensaje: string, m: Metricas = {}): Promise<void> {
  const duracionMs = Date.now() - inicio;
  await db.$transaction([
    db.ejecucion.updateMany({ where: { id: ejecucionId, estado: "EN_CURSO" }, data: { estado: "FALLIDA", error: mensaje, finalizadaEn: new Date() } }),
    db.registroUso.update({
      where: { id: usoId },
      data: { estado: "FALLIDA", codigoError: codigo, duracionMs, tokensEntrada: m.tokensEntrada ?? null, tokensSalida: m.tokensSalida ?? null, tokensRazonamiento: m.tokensRazonamiento ?? null, caracteresSalida: m.caracteresSalida ?? null, motivoFin: m.motivoFin ?? null },
    }),
  ]);
}

/**
 * Ejecuta una solicitud en cola. Reserva el consumo y toma la solicitud en una sola transacción serializada por empresa
 * (límites, concurrencia y autorización de un solo uso); si algo falla después, deja la solicitud FALLIDA con el motivo.
 */
export async function ejecutarAnalisis(ctx: ContextoAcceso, ejecucionId: string): Promise<void> {
  if (!uuid("Solicitud").safeParse(ejecucionId).success) throw new ErrorValidacion("Solicitud no encontrada.");
  const ejecucion = await db.ejecucion.findFirst({ where: { id: ejecucionId, empresaId: ctx.empresaId } });
  const entrada = entradaDe(ejecucion?.entrada);
  if (!ejecucion || !entrada) throw new ErrorValidacion("Solicitud no encontrada.");
  if (ejecucion.estado !== "PENDIENTE") throw new ErrorValidacion("La solicitud ya fue ejecutada o está en ejecución.");

  const modo = estadoModo();
  if (modo.efectivo === "deshabilitado") throw new ErrorValidacion(`La ejecución de análisis está deshabilitada en este entorno. ${modo.motivo}`);
  const referencia = await resolverReferencia(ctx, ejecucion.agenteId, modo.efectivo);
  const codigoReal = modo.efectivo === "real" ? codigoAutorizacionReal() : null;
  const inicio = Date.now();

  let uso: { id: string };
  try {
    uso = await db.$transaction(async (tx) => {
      await bloqueoEmpresa(tx, ctx.empresaId);
      if ((await tx.ejecucion.count({ where: { empresaId: ctx.empresaId, estado: "EN_CURSO" } })) >= LIMITES_ANALISIS.simultaneasPorEmpresa) {
        throw new ErrorValidacion("Hay demasiados análisis en ejecución a la vez. Intente de nuevo en unos minutos.");
      }
      const ahora = Date.now();
      const [usuario, empresa] = await Promise.all([
        tx.registroUso.count({ where: { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, tipo: "EJECUCION", creadoEn: { gte: new Date(ahora - LIMITES_ANALISIS.porUsuario.ventanaMs) } } }),
        tx.registroUso.count({ where: { empresaId: ctx.empresaId, tipo: "EJECUCION", creadoEn: { gte: new Date(ahora - LIMITES_ANALISIS.porEmpresa.ventanaMs) } } }),
      ]);
      if (usuario >= LIMITES_ANALISIS.porUsuario.max) throw new ErrorValidacion("Alcanzó su límite de análisis por hora. Intente más tarde.");
      if (empresa >= LIMITES_ANALISIS.porEmpresa.max) throw new ErrorValidacion("La empresa alcanzó su límite de análisis por hora. Intente más tarde.");
      const tomada = await tx.ejecucion.updateMany({
        where: { id: ejecucion.id, empresaId: ctx.empresaId, estado: "PENDIENTE" },
        data: { estado: "EN_CURSO", iniciadaEn: new Date(), finalizadaEn: null, error: null, proveedor: referencia.proveedor, modelo: referencia.modelo },
      });
      if (tomada.count === 0) throw new ErrorValidacion("La solicitud ya fue ejecutada o está en ejecución.");
      return tx.registroUso.create({
        data: { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, tipo: "EJECUCION", proveedor: referencia.proveedor, modelo: referencia.modelo, ejecucionId: ejecucion.id, autorizacionHash: codigoReal ? hashAutorizacion(codigoReal) : null },
        select: { id: true },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ErrorValidacion("La autorización de ejecución real ya fue utilizada. Defina una nueva para otra ejecución.");
    }
    throw error;
  }

  try {
    const docsDb = await db.documento.findMany({ where: { id: { in: entrada.documentoIds }, empresaId: ctx.empresaId, operacionId: entrada.operacionId }, orderBy: { id: "asc" } });
    if (docsDb.length !== entrada.documentoIds.length) return await finalizarFallida(ejecucion.id, uso.id, inicio, "DOCUMENTOS_NO_DISPONIBLES", "Algún documento seleccionado ya no está disponible.");
    const docs = await Promise.all(docsDb.map(leerYExtraer));
    const conTexto = docs.filter((d) => d.extraccion?.estado === "CON_TEXTO");
    if (conTexto.length === 0) {
      return await finalizarFallida(ejecucion.id, uso.id, inicio, "SIN_TEXTO", "Ningún documento seleccionado tiene texto seleccionable (¿PDF escaneado, protegido o dañado?). No se aplica OCR y no se consultó al modelo.");
    }
    const total = conTexto.reduce((s, d) => s + d.extraccion!.caracteres, 0);
    if (total > LIMITES_ANALISIS.maxCaracteresTotal) {
      return await finalizarFallida(ejecucion.id, uso.id, inicio, "SELECCION_EXCESIVA", "La selección supera el tamaño analizable. Elija menos documentos.");
    }

    let respuesta;
    try {
      let adaptador;
      if (referencia.proveedor === "SIMULADO") adaptador = adaptadorSimulado;
      else {
        registrarAdaptadoresPredeterminados();
        adaptador = obtenerAdaptador(referencia.proveedor as ProveedorIA);
      }
      respuesta = await adaptador.generar(construirSolicitud(docs, referencia));
    } catch (error) {
      const e = traducirError(error);
      return await finalizarFallida(ejecucion.id, uso.id, inicio, e.codigo, e.message);
    }
    const metricas: Metricas = { ...respuesta.uso, caracteresSalida: respuesta.texto.length, motivoFin: respuesta.motivoFin };
    const interpretada = interpretarSalida(respuesta.texto);
    if (!interpretada.ok) {
      return await finalizarFallida(ejecucion.id, uso.id, inicio, "RESPUESTA_INVALIDA", "El modelo devolvió una respuesta que no cumple el formato esperado; no se guardó ningún resultado.", metricas);
    }

    const verificada = verificarSalida(interpretada.salida, docs);
    const operacion = await db.operacion.findFirstOrThrow({ where: { id: entrada.operacionId, empresaId: ctx.empresaId }, select: { id: true, numero: true, tipo: true } });
    const checklist = await verificarDocumentosOperacion(ctx, operacion);
    const contenido = {
      version: 1,
      tipo: TIPO,
      generado: { proveedor: referencia.proveedor, modelo: referencia.modelo, simulado: referencia.proveedor === "SIMULADO" },
      operacion: { id: operacion.id, numero: operacion.numero },
      resumen: interpretada.salida.resumen,
      documentos: docs.map((d) => ({
        id: d.id, nombre: d.nombre, tipo: d.tipo, tipoEtiqueta: ETIQUETA_TIPO_DOCUMENTO[d.tipo], sha256: d.sha256,
        estadoExtraccion: d.extraccion ? d.extraccion.estado : "ERROR", paginas: d.extraccion?.totalPaginas ?? 0, caracteres: d.extraccion?.caracteres ?? 0,
        truncado: d.extraccion?.truncado ?? false, problema: d.problema ?? null,
      })),
      datos: verificada.datos,
      inconsistencias: verificada.inconsistencias,
      faltantes: interpretada.salida.faltantes,
      noEncontrado: interpretada.salida.noEncontrado,
      documentosRequeridosFaltantes: checklist.filter((c) => c.faltante).map((c) => ({ tipo: c.tipo, etiqueta: ETIQUETA_TIPO_DOCUMENTO[c.tipo] })),
      verificacion: verificada.verificacion,
      advertencias: [
        ...docs.filter((d) => d.problema).map((d) => `${d.nombre}: ${d.problema}`),
        ...(verificada.verificacion.datosSinEvidencia > 0 ? [`${verificada.verificacion.datosSinEvidencia} dato(s) no tienen cita verificable en los documentos.`] : []),
        "Informe de apoyo: no es una clasificación arancelaria ni una decisión. Requiere revisión humana.",
      ],
    };
    const duracionMs = Date.now() - inicio;
    await db.$transaction(async (tx) => {
      const cerrada = await tx.ejecucion.updateMany({ where: { id: ejecucion.id, empresaId: ctx.empresaId, estado: "EN_CURSO" }, data: { estado: "COMPLETADA", finalizadaEn: new Date(), error: null } });
      if (cerrada.count === 0) throw new ErrorValidacion("La ejecución fue marcada como interrumpida; el resultado se descartó.");
      await tx.resultado.create({ data: { empresaId: ctx.empresaId, ejecucionId: ejecucion.id, titulo: `Análisis documental · ${operacion.numero}`, contenido: contenido as unknown as Prisma.InputJsonValue } });
      await tx.registroUso.update({
        where: { id: uso.id },
        data: { estado: "EXITOSA", duracionMs, tokensEntrada: metricas.tokensEntrada ?? null, tokensSalida: metricas.tokensSalida ?? null, tokensRazonamiento: metricas.tokensRazonamiento ?? null, caracteresSalida: metricas.caracteresSalida ?? null, motivoFin: metricas.motivoFin ?? null },
      });
    });
  } catch (error) {
    if (error instanceof ErrorValidacion) throw error;
    // Sin detalles ni contenido de documentos en el registro del servidor.
    console.error("[analisis-documental] fallo inesperado", { ejecucionId: ejecucion.id, tipo: (error as { name?: string }).name });
    await finalizarFallida(ejecucion.id, uso.id, inicio, "ERROR_INTERNO", "Error interno al procesar el análisis. Puede reintentarlo.").catch(() => {});
  }
}

/** Marca como FALLIDA toda ejecución EN_CURSO que no terminó a tiempo (proceso caído, tiempo agotado). */
export async function recuperarInterrumpidas(ctx: ContextoAcceso): Promise<number> {
  const limite = new Date(Date.now() - LIMITES_ANALISIS.huerfanaMs);
  const huerfanas = await db.ejecucion.findMany({ where: { empresaId: ctx.empresaId, estado: "EN_CURSO", iniciadaEn: { lt: limite } }, select: { id: true } });
  let recuperadas = 0;
  for (const h of huerfanas) {
    const r = await db.$transaction([
      db.ejecucion.updateMany({ where: { id: h.id, empresaId: ctx.empresaId, estado: "EN_CURSO" }, data: { estado: "FALLIDA", finalizadaEn: new Date(), error: "La ejecución se interrumpió o no terminó a tiempo. Puede reintentarla." } }),
      db.registroUso.updateMany({ where: { ejecucionId: h.id, estado: "EN_CURSO" }, data: { estado: "FALLIDA", codigoError: "INTERRUMPIDA" } }),
    ]);
    recuperadas += r[0].count;
  }
  return recuperadas;
}

/** Devuelve una solicitud FALLIDA a la cola (y la ejecuta si el modo lo permite). */
export async function reintentarAnalisis(ctx: ContextoAcceso, ejecucionId: string): Promise<{ ejecutada: boolean }> {
  if (!uuid("Solicitud").safeParse(ejecucionId).success) throw new ErrorValidacion("Solicitud no encontrada.");
  await recuperarInterrumpidas(ctx);
  const e = await db.ejecucion.findFirst({ where: { id: ejecucionId, empresaId: ctx.empresaId } });
  if (!e || !entradaDe(e.entrada)) throw new ErrorValidacion("Solicitud no encontrada.");
  if (e.estado !== "FALLIDA") throw new ErrorValidacion("Solo se pueden reintentar solicitudes fallidas.");
  await db.$transaction(async (tx) => {
    await bloqueoEmpresa(tx, ctx.empresaId);
    const otra = await tx.ejecucion.count({ where: { empresaId: ctx.empresaId, huella: e.huella, id: { not: e.id }, estado: { in: ["PENDIENTE", "EN_CURSO"] } } });
    if (otra > 0) throw new ErrorValidacion("Ya hay un análisis en cola o en ejecución para esta misma selección.");
    await tx.ejecucion.updateMany({ where: { id: e.id, estado: "FALLIDA" }, data: { estado: "PENDIENTE", error: null, finalizadaEn: null, iniciadaEn: null } });
  });
  if (estadoModo().efectivo === "deshabilitado") return { ejecutada: false };
  await ejecutarAnalisis(ctx, e.id);
  return { ejecutada: true };
}

/** Cancela una solicitud en cola (libera la selección para una nueva solicitud). */
export async function cancelarAnalisis(ctx: ContextoAcceso, ejecucionId: string): Promise<void> {
  if (!uuid("Solicitud").safeParse(ejecucionId).success) throw new ErrorValidacion("Solicitud no encontrada.");
  const { count } = await db.ejecucion.updateMany({ where: { id: ejecucionId, empresaId: ctx.empresaId, estado: "PENDIENTE" }, data: { estado: "CANCELADA", finalizadaEn: new Date() } });
  if (count === 0) throw new ErrorValidacion("Solo se pueden cancelar solicitudes en cola.");
}

// ---------------------------------------------------------------------------------------------------------------
// Revisión
// ---------------------------------------------------------------------------------------------------------------

/** El autor envía el informe a revisión: solo entonces aparece en "Por revisar". Un informe devuelto puede reenviarse. */
export async function enviarARevision(ctx: ContextoAcceso, resultadoId: unknown): Promise<void> {
  if (typeof resultadoId !== "string" || !uuid("Resultado").safeParse(resultadoId).success) throw new ErrorValidacion("Resultado no encontrado.");
  const resultado = await db.resultado.findFirst({ where: { id: resultadoId, empresaId: ctx.empresaId }, include: { aprobacion: true, ejecucion: { select: { estado: true } } } });
  if (!resultado || resultado.ejecucion.estado !== "COMPLETADA") throw new ErrorValidacion("Resultado no encontrado.");
  const actual = resultado.aprobacion;
  try {
    if (!actual) {
      await db.aprobacion.create({ data: { empresaId: ctx.empresaId, resultadoId: resultado.id } });
    } else if (actual.estado === "DEVUELTO") {
      const { count } = await db.aprobacion.updateMany({ where: { id: actual.id, empresaId: ctx.empresaId, estado: "DEVUELTO" }, data: { estado: "PENDIENTE", decididaPorId: null, decididaEn: null } });
      if (count === 0) throw new ErrorValidacion("El resultado ya fue reenviado.");
    } else if (actual.estado === "PENDIENTE") {
      throw new ErrorValidacion("El resultado ya está en revisión.");
    } else {
      throw new ErrorValidacion("El resultado ya tiene una decisión final.");
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ErrorValidacion("El resultado ya está en revisión.");
    throw error;
  }
}
