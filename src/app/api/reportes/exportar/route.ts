import { ErrorAutorizacion } from "@/lib/auth/autorizacion";
import { requirePermissionActiva } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/errores";
import { formatearFechaHora, hoyLocal } from "@/lib/formato";
import { filtrosDeReporte } from "@/lib/reportes/filtros";
import { construirEncabezado, esIdReporte, generarParaExportar } from "@/lib/reportes/indice";
import { generarCsv } from "@/lib/reportes/exportar/csv";
import { generarPdf } from "@/lib/reportes/exportar/pdf";
import { generarXlsx } from "@/lib/reportes/exportar/xlsx";

const respuesta = (estado: number, mensaje: string) =>
  Response.json({ error: mensaje }, { status: estado, headers: { "Cache-Control": "no-store" } });

const FORMATOS = {
  csv: { tipo: "text/csv; charset=utf-8", extension: "csv" },
  xlsx: { tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  pdf: { tipo: "application/pdf", extension: "pdf" },
} as const;

/**
 * Exportación de reportes. La empresa sale de la sesión (nunca de la URL); los filtros se validan igual que en
 * pantalla y el archivo contiene exactamente las filas que cumplen esos filtros, sin paginar.
 */
export async function GET(solicitud: Request) {
  let ctx;
  try {
    ctx = await requirePermissionActiva("reportes:crear");
  } catch (error) {
    if (error instanceof ErrorAutorizacion) {
      return error.codigo === "PERMISO_DENEGADO" ? respuesta(403, "Sin permiso para exportar reportes.") : respuesta(401, "Sesión requerida.");
    }
    throw error;
  }

  const parametros = Object.fromEntries(new URL(solicitud.url).searchParams.entries());
  const id = parametros.reporte ?? "";
  const formato = parametros.formato ?? "";
  if (!esIdReporte(id)) return respuesta(400, "Reporte no válido.");
  if (!(formato in FORMATOS)) return respuesta(400, "Formato no válido (csv, xlsx o pdf).");

  try {
    const filtros = filtrosDeReporte(id, parametros);
    const datos = await generarParaExportar(ctx, id, filtros);
    const generado = formatearFechaHora(new Date());
    const encabezado = await construirEncabezado(ctx, datos, filtros, generado);
    const f = FORMATOS[formato as keyof typeof FORMATOS];

    let contenido: Buffer;
    if (formato === "csv") {
      const tabla = datos.tablas.find((t) => t.id === parametros.tabla) ?? datos.tablas[0];
      contenido = generarCsv(encabezado, datos, tabla);
    } else if (formato === "xlsx") {
      contenido = generarXlsx(encabezado, datos);
    } else {
      contenido = generarPdf(encabezado, datos);
    }

    const slug = encabezado.empresa.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 30);
    const nombre = `reporte-${id}-${slug}-${hoyLocal()}.${f.extension}`;
    return new Response(new Uint8Array(contenido), {
      headers: {
        "Content-Type": f.tipo,
        "Content-Length": String(contenido.length),
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ErrorValidacion) return respuesta(400, error.message);
    throw error;
  }
}
