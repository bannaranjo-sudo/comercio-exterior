"use server";

import { revalidatePath } from "next/cache";
import type { EstadoAccion } from "@/lib/acciones";
import { ErrorAutorizacion, type ContextoAcceso } from "@/lib/auth/autorizacion";
import { requirePermissionActiva } from "@/lib/auth/sesion";
import type { CodigoPermiso } from "@/lib/permisos/catalogo";
import { registrarAdaptadoresPredeterminados } from "@/lib/inteligencia/adaptadores";
import { PROVEEDORES } from "@/lib/inteligencia/proveedores";
import * as servicio from "@/lib/inteligencia/servicio";

export type { EstadoAccion };

// Toda acción exige sesión y permiso en la empresa activa (validada en servidor).
// Ninguna recibe empresaId del cliente. Solo la prueba de conexión llama a un proveedor, y únicamente
// si el servidor la autoriza (IA_PRUEBA_REAL_AUTORIZADA); los análisis permanecen deshabilitados.
async function proteger(
  permiso: CodigoPermiso,
  mensajeOk: string,
  operacion: (ctx: ContextoAcceso) => Promise<string | void>,
): Promise<EstadoAccion> {
  try {
    const detalle = await operacion(await requirePermissionActiva(permiso));
    revalidatePath("/inteligencia", "layout");
    return { ok: detalle || mensajeOk };
  } catch (error) {
    if (error instanceof servicio.ErrorValidacion) return { error: error.message };
    if (error instanceof ErrorAutorizacion) return { error: "No tiene permiso para realizar esta acción." };
    throw error;
  }
}

const campo = (formData: FormData, nombre: string): FormDataEntryValue | null => formData.get(nombre);

export async function accionGuardarProveedor(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:configurar", "Configuración guardada.", (ctx) =>
    servicio.guardarProveedor(ctx, {
      proveedor: campo(formData, "proveedor"),
      habilitado: campo(formData, "habilitado") === "on",
      notas: campo(formData, "notas"),
    }),
  );
}

export async function accionInicializarAgentes(): Promise<EstadoAccion> {
  return proteger("inteligencia:administrar_agentes", "Agentes predeterminados creados.", (ctx) =>
    servicio.inicializarAgentesPredeterminados(ctx),
  );
}

export async function accionCrearAgente(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:administrar_agentes", "Agente creado.", (ctx) =>
    servicio.crearAgente(ctx, {
      codigo: campo(formData, "codigo"),
      nombre: campo(formData, "nombre"),
      descripcion: campo(formData, "descripcion"),
      instrucciones: campo(formData, "instrucciones"),
    }),
  );
}

export async function accionCambiarEstadoAgente(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:administrar_agentes", "Estado actualizado.", (ctx) =>
    servicio.cambiarEstadoAgente(ctx, campo(formData, "agenteId"), campo(formData, "activo") === "true"),
  );
}

export async function accionAsignarModelo(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:administrar_agentes", "Modelo asignado.", (ctx) =>
    servicio.asignarModelo(ctx, {
      agenteId: campo(formData, "agenteId"),
      proveedor: campo(formData, "proveedor"),
      modelo: campo(formData, "modelo"),
      prioridad: campo(formData, "prioridad"),
    }),
  );
}

export async function accionSolicitarEjecucion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:ejecutar", "Solicitud registrada en cola.", (ctx) =>
    servicio.solicitarEjecucion(ctx, {
      agenteId: campo(formData, "agenteId"),
      descripcion: campo(formData, "descripcion"),
    }),
  );
}

export async function accionDecidirAprobacion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:aprobar", "Decisión registrada.", (ctx) =>
    servicio.decidirAprobacion(ctx, {
      aprobacionId: campo(formData, "aprobacionId"),
      decision: campo(formData, "decision"),
      comentario: campo(formData, "comentario"),
    }),
  );
}

/** Prueba de conexión: solo devuelve estado, modelo y métricas; nunca texto del proveedor ni detalles internos. */
export async function accionProbarConexion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inteligencia:configurar", "Prueba finalizada.", async (ctx) => {
    registrarAdaptadoresPredeterminados();
    const r = await servicio.probarConexion(ctx, {
      proveedor: campo(formData, "proveedor"),
      modelo: campo(formData, "modelo"),
    });
    if (r.estado === "FALLIDA") throw new servicio.ErrorValidacion(r.mensaje);
    const tokens = `${r.tokensEntrada ?? "n/d"} entrada / ${r.tokensSalida ?? "n/d"} salida`;
    if (r.estado === "SIN_CONTENIDO") {
      // La API respondió, pero no se generó texto: no se presenta como éxito.
      throw new servicio.ErrorValidacion(
        `API accesible, pero sin texto generado (motivo: ${r.motivoFin ?? "n/d"}; tokens: ${tokens}). La generación no está verificada.`,
      );
    }
    return `Generación correcta · ${PROVEEDORES[r.proveedor].nombre} · ${r.modelo} · ${r.duracionMs} ms · tokens: ${tokens}`;
  });
}
