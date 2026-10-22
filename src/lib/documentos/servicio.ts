import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { EstadoDocumento, TipoDocumento, TipoOperacion } from "@/generated/prisma/enums";
import { almacenamiento } from "@/lib/almacenamiento";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ErrorValidacion } from "@/lib/errores";
import { listaFormulario, parsear, textoOpcional, uuid, z } from "@/lib/validacion";

// Gestión documental. Los archivos se guardan en almacenamiento privado (nunca en /public) con claves
// generadas por el sistema; solo se entregan mediante una ruta autenticada y autorizada.

export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024;
export const TAMANO_PAGINA = 20;

/** Documentos exigidos por defecto cuando la empresa no ha configurado su lista. */
export const REQUISITOS_PREDETERMINADOS: Record<TipoOperacion, readonly TipoDocumento[]> = {
  IMPORTACION: ["FACTURA_COMERCIAL", "LISTA_EMPAQUE", "DOCUMENTO_TRANSPORTE", "CERTIFICADO_ORIGEN", "DECLARACION_ADUANERA"],
  EXPORTACION: ["FACTURA_COMERCIAL", "LISTA_EMPAQUE", "DOCUMENTO_TRANSPORTE", "DECLARACION_ADUANERA"],
};

/** Validación real del archivo: extensión, tamaño, firma %PDF- y marca %%EOF. */
export function validarPdf(nombre: string, contenido: Buffer): void {
  if (contenido.length === 0) throw new ErrorValidacion("El archivo está vacío.");
  if (contenido.length > MAX_BYTES_DOCUMENTO) throw new ErrorValidacion("El archivo supera el máximo de 10 MB.");
  if (!/\.pdf$/i.test(nombre)) throw new ErrorValidacion("Solo se admiten archivos PDF (extensión .pdf).");
  if (contenido.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErrorValidacion("El archivo no es un PDF válido.");
  if (!contenido.subarray(-2048).toString("latin1").includes("%%EOF")) {
    throw new ErrorValidacion("El PDF está incompleto o dañado.");
  }
}

export const nombreSeguro = (nombre: string): string =>
  nombre.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f"<>|:*?]/g, "").trim().slice(0, 150) || "documento.pdf";

const esquemaCarga = z.object({
  operacionId: uuid("La operación"),
  tipo: z.enum(TipoDocumento, { error: "Seleccione el tipo de documento." }),
  observaciones: textoOpcional("Las observaciones", 500),
});

async function operacionDeEmpresa(tx: Prisma.TransactionClient | typeof db, ctx: ContextoAcceso, id: string) {
  const op = await tx.operacion.findFirst({ where: { id, empresaId: ctx.empresaId }, select: { id: true, estado: true } });
  if (!op) throw new ErrorValidacion("Operación no encontrada.");
  return op;
}

export async function subirDocumento(ctx: ContextoAcceso, datos: unknown, archivo: unknown) {
  const d = parsear(esquemaCarga, datos);
  if (!(archivo instanceof File) || archivo.size === 0) throw new ErrorValidacion("Seleccione un archivo PDF.");
  if (archivo.size > MAX_BYTES_DOCUMENTO) throw new ErrorValidacion("El archivo supera el máximo de 10 MB.");
  const nombre = nombreSeguro(archivo.name);
  const contenido = Buffer.from(await archivo.arrayBuffer());
  validarPdf(nombre, contenido);

  const operacion = await operacionDeEmpresa(db, ctx, d.operacionId);
  if (operacion.estado === "CANCELADA") throw new ErrorValidacion("No se pueden cargar documentos en una operación cancelada.");

  const sha256 = createHash("sha256").update(contenido).digest("hex");
  const repetido = await db.documento.findFirst({ where: { empresaId: ctx.empresaId, operacionId: operacion.id, sha256 } });
  if (repetido) throw new ErrorValidacion("Este archivo ya fue cargado en la operación.");

  const clave = `${ctx.empresaId}/${operacion.id}/${randomUUID()}.pdf`;
  await almacenamiento.guardar(clave, contenido);
  try {
    return await db.$transaction(async (tx) => {
      const documento = await tx.documento.create({
        data: {
          empresaId: ctx.empresaId, operacionId: operacion.id, tipo: d.tipo, nombreOriginal: nombre,
          claveAlmacenamiento: clave, tamanoBytes: contenido.length, tipoMime: "application/pdf", sha256,
          observaciones: d.observaciones, subidoPorId: ctx.usuarioId,
        },
      });
      await tx.operacionHistorial.create({
        data: { empresaId: ctx.empresaId, operacionId: operacion.id, usuarioId: ctx.usuarioId, accion: "DOCUMENTO", detalle: { tipo: d.tipo, nombre } },
      });
      return documento;
    });
  } catch (error) {
    await almacenamiento.eliminar(clave); // no dejar archivos huérfanos si falla el registro
    throw error;
  }
}

const incluirDocumento = {
  subidoPor: { select: { nombre: true } },
  operacion: { select: { id: true, numero: true, tipo: true } },
} satisfies Prisma.DocumentoInclude;

export function listarDocumentosOperacion(ctx: ContextoAcceso, operacionId: string) {
  return db.documento.findMany({
    where: { empresaId: ctx.empresaId, operacionId },
    include: incluirDocumento,
    orderBy: { creadoEn: "desc" },
  });
}

export type FiltrosDocumentos = { q?: string; estado?: string; tipo?: string; pagina?: number };

export async function listarDocumentos(ctx: ContextoAcceso, filtros: FiltrosDocumentos = {}) {
  const q = filtros.q?.trim();
  const pagina = Math.max(1, filtros.pagina ?? 1);
  const filas = await db.documento.findMany({
    where: {
      empresaId: ctx.empresaId,
      ...(filtros.estado === "por_revisar"
        ? { estado: { in: ["PENDIENTE", "RECIBIDO", "OBSERVADO"] as EstadoDocumento[] } }
        : filtros.estado && filtros.estado in EstadoDocumento ? { estado: filtros.estado as EstadoDocumento } : {}),
      ...(filtros.tipo && filtros.tipo in TipoDocumento ? { tipo: filtros.tipo as TipoDocumento } : {}),
      ...(q ? { OR: [{ nombreOriginal: { contains: q, mode: "insensitive" } }, { operacion: { numero: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: incluirDocumento,
    orderBy: { creadoEn: "desc" },
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA + 1,
  });
  return { filas: filas.slice(0, TAMANO_PAGINA), hayMas: filas.length > TAMANO_PAGINA, pagina };
}

export async function cambiarEstadoDocumento(ctx: ContextoAcceso, id: string, estado: unknown, observaciones: unknown) {
  const nuevo = parsear(z.enum(EstadoDocumento, { error: "Estado no válido." }), estado);
  const nota = parsear(textoOpcional("Las observaciones", 500), observaciones);
  if (nuevo === "OBSERVADO" && !nota) throw new ErrorValidacion("Indique la observación del documento.");
  const documento = await db.documento.findFirst({ where: { id: uuid("Documento").safeParse(id).success ? id : "", empresaId: ctx.empresaId } });
  if (!documento) throw new ErrorValidacion("Documento no encontrado.");
  await db.$transaction([
    db.documento.update({ where: { id: documento.id }, data: { estado: nuevo, ...(nota !== undefined ? { observaciones: nota } : {}) } }),
    db.operacionHistorial.create({
      data: {
        empresaId: ctx.empresaId, operacionId: documento.operacionId, usuarioId: ctx.usuarioId, accion: "DOCUMENTO_ESTADO",
        detalle: { tipo: documento.tipo, nombre: documento.nombreOriginal, de: documento.estado, a: nuevo },
      },
    }),
  ]);
}

/** Documento de la empresa activa para entregarlo; null si no existe o pertenece a otra empresa. */
export function documentoParaDescarga(ctx: ContextoAcceso, id: string) {
  if (!uuid("Documento").safeParse(id).success) return Promise.resolve(null);
  return db.documento.findFirst({ where: { id, empresaId: ctx.empresaId } });
}

/** Lee el archivo verificando su integridad contra el hash registrado al cargarlo. */
export async function leerArchivoDocumento(documento: { claveAlmacenamiento: string; sha256: string }): Promise<Buffer> {
  const contenido = await almacenamiento.leer(documento.claveAlmacenamiento);
  if (createHash("sha256").update(contenido).digest("hex") !== documento.sha256) {
    throw new Error("Integridad del archivo no verificada.");
  }
  return contenido;
}

// --- Documentos requeridos ---------------------------------------------------------------------

/** Tipos de documento obligatorios para un tipo de operación (configuración de la empresa o predeterminados). */
export async function requisitosDocumentales(ctx: ContextoAcceso, tipoOperacion: TipoOperacion): Promise<TipoDocumento[]> {
  const filas = await db.requisitoDocumento.findMany({ where: { empresaId: ctx.empresaId, tipoOperacion } });
  if (filas.length === 0) return [...REQUISITOS_PREDETERMINADOS[tipoOperacion]];
  return filas.filter((f) => f.obligatorio).map((f) => f.tipoDocumento);
}

export async function guardarRequisitos(ctx: ContextoAcceso, tipoOperacion: unknown, tipos: unknown) {
  const datos = parsear(
    z.object({ tipoOperacion: z.enum(TipoOperacion), tipos: listaFormulario(z.enum(TipoDocumento)) }),
    { tipoOperacion, tipos },
  );
  const seleccion = new Set(datos.tipos);
  await db.$transaction(
    Object.values(TipoDocumento).map((tipoDocumento) =>
      db.requisitoDocumento.upsert({
        where: { empresaId_tipoOperacion_tipoDocumento: { empresaId: ctx.empresaId, tipoOperacion: datos.tipoOperacion, tipoDocumento } },
        update: { obligatorio: seleccion.has(tipoDocumento) },
        create: { empresaId: ctx.empresaId, tipoOperacion: datos.tipoOperacion, tipoDocumento, obligatorio: seleccion.has(tipoDocumento) },
      }),
    ),
  );
}

/** Lista de verificación: cada documento requerido y el estado del mejor documento cargado (si existe). */
export async function verificarDocumentosOperacion(ctx: ContextoAcceso, operacion: { id: string; tipo: TipoOperacion }) {
  const [requeridos, cargados] = await Promise.all([
    requisitosDocumentales(ctx, operacion.tipo),
    db.documento.findMany({ where: { empresaId: ctx.empresaId, operacionId: operacion.id }, select: { tipo: true, estado: true } }),
  ]);
  const orden: EstadoDocumento[] = ["APROBADO", "RECIBIDO", "OBSERVADO", "PENDIENTE"];
  return requeridos.map((tipo) => {
    const estados = cargados.filter((c) => c.tipo === tipo).map((c) => c.estado);
    const estado = orden.find((o) => estados.includes(o)) ?? null;
    return { tipo, estado, faltante: estados.length === 0 };
  });
}
