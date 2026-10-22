import { ErrorAutorizacion } from "@/lib/auth/autorizacion";
import { requirePermissionActiva } from "@/lib/auth/sesion";
import { documentoParaDescarga, leerArchivoDocumento } from "@/lib/documentos/servicio";

const respuesta = (estado: number, mensaje: string) =>
  Response.json({ error: mensaje }, { status: estado, headers: { "Cache-Control": "no-store" } });

/**
 * Descarga autenticada de un documento. La empresa sale de la sesión (nunca del cliente) y el
 * archivo se busca filtrando por esa empresa: un ID de otra empresa responde 404.
 */
export async function GET(_solicitud: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requirePermissionActiva("documentos:consultar");
  } catch (error) {
    if (error instanceof ErrorAutorizacion) {
      return error.codigo === "PERMISO_DENEGADO" ? respuesta(403, "Sin permiso.") : respuesta(401, "Sesión requerida.");
    }
    throw error;
  }

  const { id } = await params;
  const documento = await documentoParaDescarga(ctx, id);
  if (!documento) return respuesta(404, "Documento no encontrado.");

  let contenido: Buffer;
  try {
    contenido = await leerArchivoDocumento(documento);
  } catch {
    return respuesta(500, "No fue posible entregar el archivo.");
  }

  const nombre = encodeURIComponent(documento.nombreOriginal);
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(contenido.length),
      "Content-Disposition": `attachment; filename="documento.pdf"; filename*=UTF-8''${nombre}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
