"use server";

import { redirect } from "next/navigation";
import { proteger, type EstadoAccion } from "@/lib/acciones";
import * as bodegas from "@/lib/inventarios/bodegas";
import * as movimientos from "@/lib/inventarios/movimientos";
import * as productos from "@/lib/inventarios/productos";
import { MAX_LINEAS_RECEPCION, registrarRecepcion } from "@/lib/inventarios/recepciones";
import { datosFormulario } from "@/lib/validacion";

// Toda acción exige sesión y permiso del catálogo en la empresa activa (nunca se recibe la empresa del cliente).
// Productos/bodegas/entradas/salidas/transferencias/recepciones: inventarios:crear o :editar.
// Ajustes y compensaciones (correcciones): inventarios:eliminar (solo administradores).

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function accionCrearProducto(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:crear", "Producto creado.", async (ctx) => {
    const p = await productos.crearProducto(ctx, datosFormulario(formData));
    redirect(`/inventarios/productos/${p.id}?creado=1`);
  });
}

export async function accionActualizarProducto(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:editar", "Cambios guardados.", async (ctx) => {
    await productos.actualizarProducto(ctx, texto(formData, "id"), datosFormulario(formData));
  });
}

export async function accionCambiarEstadoProducto(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const activo = formData.get("activo") === "true";
  return proteger("inventarios:editar", activo ? "Producto activado." : "Producto desactivado.", (ctx) =>
    productos.cambiarEstadoProducto(ctx, texto(formData, "id"), activo),
  );
}

export async function accionCrearBodega(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:crear", "Bodega creada.", async (ctx) => {
    await bodegas.crearBodega(ctx, datosFormulario(formData));
  });
}

export async function accionActualizarBodega(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:editar", "Bodega actualizada.", async (ctx) => {
    await bodegas.actualizarBodega(ctx, texto(formData, "id"), datosFormulario(formData));
  });
}

export async function accionCambiarEstadoBodega(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const activo = formData.get("activo") === "true";
  return proteger("inventarios:editar", activo ? "Bodega activada." : "Bodega desactivada.", (ctx) =>
    bodegas.cambiarEstadoBodega(ctx, texto(formData, "id"), activo),
  );
}

export async function accionRegistrarRecepcion(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:crear", "Recepción registrada.", async (ctx) => {
    const lineas = [];
    for (let i = 0; i < MAX_LINEAS_RECEPCION; i++) {
      const productoId = texto(formData, `productoId_${i}`).trim();
      const cantidadRecibida = texto(formData, `cantidadRecibida_${i}`).trim();
      if (!productoId && !cantidadRecibida) continue; // fila vacía
      lineas.push({
        productoId, cantidadRecibida, cantidadEsperada: texto(formData, `cantidadEsperada_${i}`), observacion: texto(formData, `observacion_${i}`),
      });
    }
    const r = await registrarRecepcion(ctx, datosFormulario(formData), lineas);
    redirect(`/inventarios/recepciones/${r.recepcion.id}?${r.duplicada ? "duplicada=1" : "creada=1"}`);
  });
}

const mensaje = (r: movimientos.ResultadoMovimiento, ok: string) =>
  r.duplicado ? "Esta solicitud ya estaba registrada; no se duplicó el movimiento." : ok;

export async function accionRegistrarEntrada(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:crear", "Entrada registrada.", async (ctx) =>
    mensaje(await movimientos.registrarEntrada(ctx, datosFormulario(formData)), "Entrada registrada."),
  );
}

export async function accionRegistrarSalida(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:crear", "Salida registrada.", async (ctx) =>
    mensaje(await movimientos.registrarSalida(ctx, datosFormulario(formData)), "Salida registrada."),
  );
}

export async function accionRegistrarTransferencia(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:crear", "Transferencia registrada.", async (ctx) =>
    mensaje(await movimientos.registrarTransferencia(ctx, datosFormulario(formData)), "Transferencia registrada: salida de origen y entrada en destino."),
  );
}

export async function accionRegistrarAjuste(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:eliminar", "Ajuste registrado.", async (ctx) =>
    mensaje(await movimientos.registrarAjuste(ctx, datosFormulario(formData)), "Ajuste registrado."),
  );
}

export async function accionCompensarMovimiento(_: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return proteger("inventarios:eliminar", "Movimiento compensado.", async (ctx) => {
    const r = await movimientos.compensarMovimiento(ctx, texto(formData, "id"), formData.get("motivo"));
    return `Compensación registrada (${r.movimientos.length} movimiento(s)). El original se conserva.`;
  });
}
