import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { verificarDocumentosOperacion } from "@/lib/documentos/servicio";
import { ErrorValidacion } from "@/lib/errores";
import { ETIQUETA_TIPO_DOCUMENTO } from "@/lib/etiquetas";
import { uuid } from "@/lib/validacion";

// Revisión de expediente: verificación por REGLAS del sistema (sin IA, sin proveedores externos) de lo
// que falta o requiere atención en una operación. Cada hallazgo remite a la pestaña donde se resuelve.

export type NivelHallazgo = "ok" | "atencion" | "pendiente";
export type Hallazgo = { id: string; titulo: string; nivel: NivelHallazgo; detalle: string; href: string };

export async function revisarExpediente(ctx: ContextoAcceso, operacionId: string) {
  const operacion = uuid("Operación").safeParse(operacionId).success
    ? await db.operacion.findFirst({
        where: { id: operacionId, empresaId: ctx.empresaId },
        select: { id: true, numero: true, tipo: true, estado: true, descripcion: true, tercero: { select: { razonSocial: true } } },
      })
    : null;
  if (!operacion) throw new ErrorValidacion("Operación no encontrada.");
  const base = `/operaciones/${operacion.id}`;

  const [lista, envio, novedades, costos] = await Promise.all([
    verificarDocumentosOperacion(ctx, operacion),
    db.envio.findFirst({ where: { empresaId: ctx.empresaId, operacionId: operacion.id } }),
    db.eventoLogistico.count({ where: { empresaId: ctx.empresaId, operacionId: operacion.id, tipo: "NOVEDAD", resuelta: false } }),
    db.costo.groupBy({ by: ["estado"], where: { empresaId: ctx.empresaId, operacionId: operacion.id }, _count: { _all: true } }),
  ]);
  const hallazgos: Hallazgo[] = [];

  // Documentos
  const faltantes = lista.filter((l) => l.faltante);
  const observados = lista.filter((l) => l.estado === "OBSERVADO");
  const sinAprobar = lista.filter((l) => !l.faltante && l.estado !== "APROBADO" && l.estado !== "OBSERVADO");
  hallazgos.push(
    faltantes.length > 0
      ? { id: "docs-faltantes", titulo: "Documentos requeridos faltantes", nivel: "pendiente", detalle: faltantes.map((f) => ETIQUETA_TIPO_DOCUMENTO[f.tipo]).join(", "), href: `${base}/documentos` }
      : { id: "docs-faltantes", titulo: "Documentos requeridos", nivel: "ok", detalle: "Todos los documentos requeridos tienen archivo cargado.", href: `${base}/documentos` },
  );
  if (observados.length > 0) {
    hallazgos.push({ id: "docs-observados", titulo: "Documentos observados", nivel: "atencion", detalle: observados.map((o) => ETIQUETA_TIPO_DOCUMENTO[o.tipo]).join(", "), href: `${base}/documentos` });
  }
  if (sinAprobar.length > 0) {
    hallazgos.push({ id: "docs-sin-aprobar", titulo: "Documentos pendientes de aprobación", nivel: "atencion", detalle: `${sinAprobar.length} documento(s) cargado(s) sin aprobar.`, href: `${base}/documentos` });
  }

  // Transporte
  if (!envio) {
    hallazgos.push({ id: "transporte", titulo: "Datos de transporte", nivel: "pendiente", detalle: "Aún no se han registrado los datos de transporte.", href: `${base}/logistica` });
  } else {
    const faltan = [
      !envio.numeroGuia && "número de guía o BL",
      !envio.fechaEstimadaLlegada && "fecha estimada de llegada",
      !envio.puertoDestino && "destino",
    ].filter(Boolean);
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const vencida = envio.fechaEstimadaLlegada && !envio.fechaRealLlegada && envio.fechaEstimadaLlegada < hoy;
    hallazgos.push(
      vencida
        ? { id: "transporte", titulo: "Llegada estimada vencida", nivel: "atencion", detalle: "La fecha estimada de llegada ya pasó y no hay llegada real registrada.", href: `${base}/logistica` }
        : faltan.length > 0
          ? { id: "transporte", titulo: "Datos de transporte incompletos", nivel: "pendiente", detalle: `Falta: ${faltan.join(", ")}.`, href: `${base}/logistica` }
          : { id: "transporte", titulo: "Datos de transporte", nivel: "ok", detalle: "Guía, destino y fecha estimada de llegada registrados.", href: `${base}/logistica` },
    );
  }

  // Novedades
  hallazgos.push(
    novedades > 0
      ? { id: "novedades", titulo: "Novedades abiertas", nivel: "atencion", detalle: `${novedades} novedad(es) logística(s) sin resolver.`, href: `${base}/logistica` }
      : { id: "novedades", titulo: "Novedades logísticas", nivel: "ok", detalle: "Sin novedades abiertas.", href: `${base}/logistica` },
  );

  // Costos
  const totalCostos = costos.reduce((s, c) => s + c._count._all, 0);
  const hayReales = costos.some((c) => c.estado === "REAL");
  hallazgos.push(
    totalCostos === 0
      ? { id: "costos", titulo: "Costos", nivel: "pendiente", detalle: "No hay costos registrados.", href: `${base}/costos` }
      : !hayReales && ["EN_ADUANA", "FINALIZADA"].includes(operacion.estado)
        ? { id: "costos", titulo: "Costos reales", nivel: "atencion", detalle: "La operación avanzó pero solo hay costos estimados.", href: `${base}/costos` }
        : { id: "costos", titulo: "Costos", nivel: "ok", detalle: `${totalCostos} costo(s) registrado(s).`, href: `${base}/costos` },
  );

  const resumen = {
    pendientes: hallazgos.filter((h) => h.nivel === "pendiente").length,
    atencion: hallazgos.filter((h) => h.nivel === "atencion").length,
    correctos: hallazgos.filter((h) => h.nivel === "ok").length,
  };
  return { operacion, hallazgos, resumen };
}
