import type { EstadoOperacion } from "@/generated/prisma/enums";
import type { ContextoAcceso } from "@/lib/auth/autorizacion";
import { db } from "@/lib/db";
import { ESTADOS_ACTIVOS } from "@/lib/operaciones/servicio";

// Datos del dashboard: todo sale de PostgreSQL, filtrado por la empresa activa y por los permisos
// del usuario (una sección sin permiso devuelve null y no se muestra).

const ACTIVAS = [...ESTADOS_ACTIVOS];

export async function datosDashboard(ctx: ContextoAcceso) {
  const donde = { empresaId: ctx.empresaId };
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  const puede = (permiso: string) => ctx.permisos.has(permiso);

  const operaciones = puede("operaciones:consultar")
    ? await (async () => {
        const [total, importacionesActivas, exportacionesActivas, finalizadas, grupos, recientes, proximas, atrasadas] = await Promise.all([
          db.operacion.count({ where: donde }),
          db.operacion.count({ where: { ...donde, tipo: "IMPORTACION", estado: { in: ACTIVAS } } }),
          db.operacion.count({ where: { ...donde, tipo: "EXPORTACION", estado: { in: ACTIVAS } } }),
          db.operacion.count({ where: { ...donde, estado: "FINALIZADA" } }),
          db.operacion.groupBy({ by: ["estado"], where: donde, _count: { _all: true } }),
          db.operacion.findMany({
            where: donde, orderBy: { creadoEn: "desc" }, take: 5,
            select: { id: true, numero: true, tipo: true, estado: true, descripcion: true, tercero: { select: { razonSocial: true } } },
          }),
          db.envio.findMany({
            where: { ...donde, fechaRealLlegada: null, fechaEstimadaLlegada: { gte: hoy }, operacion: { estado: { in: ACTIVAS } } },
            orderBy: { fechaEstimadaLlegada: "asc" }, take: 5,
            select: { fechaEstimadaLlegada: true, estadoEnvio: true, operacion: { select: { id: true, numero: true, tercero: { select: { razonSocial: true } } } } },
          }),
          db.envio.count({ where: { ...donde, fechaRealLlegada: null, fechaEstimadaLlegada: { lt: hoy }, operacion: { estado: { in: ACTIVAS } } } }),
        ]);
        const porEstado = Object.fromEntries(grupos.map((g) => [g.estado, g._count._all])) as Partial<Record<EstadoOperacion, number>>;
        return { total, importacionesActivas, exportacionesActivas, finalizadas, porEstado, recientes, proximas, atrasadas };
      })()
    : null;

  const documentos = puede("documentos:consultar")
    ? {
        pendientes: await db.documento.count({ where: { ...donde, estado: { not: "APROBADO" }, operacion: { estado: { not: "CANCELADA" } } } }),
        observados: await db.documento.count({ where: { ...donde, estado: "OBSERVADO", operacion: { estado: { not: "CANCELADA" } } } }),
      }
    : null;

  const logistica = puede("logistica:consultar")
    ? await (async () => {
        const where = { ...donde, tipo: "NOVEDAD" as const, resuelta: false, operacion: { estado: { not: "CANCELADA" as const } } };
        const [abiertas, lista] = await Promise.all([
          db.eventoLogistico.count({ where }),
          db.eventoLogistico.findMany({
            where, orderBy: [{ severidad: "desc" }, { fechaEvento: "desc" }], take: 5,
            select: { id: true, titulo: true, severidad: true, fechaEvento: true, operacion: { select: { id: true, numero: true } } },
          }),
        ]);
        return { abiertas, lista };
      })()
    : null;

  return { operaciones, documentos, logistica };
}
