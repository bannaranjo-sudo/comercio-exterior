import { revalidatePath } from "next/cache";
import { ErrorAutorizacion, type ContextoAcceso } from "@/lib/auth/autorizacion";
import { requirePermissionActiva } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/errores";
import type { CodigoPermiso } from "@/lib/permisos/catalogo";

export type EstadoAccion = { ok?: string; error?: string };

/**
 * Envoltorio común de las Server Actions: exige sesión y permiso en la empresa activa (validada en el
 * servidor), traduce errores a mensajes seguros y refresca los datos. Los redirect() se propagan.
 */
export async function proteger(
  permiso: CodigoPermiso,
  mensajeOk: string,
  operacion: (ctx: ContextoAcceso) => Promise<string | void>,
): Promise<EstadoAccion> {
  try {
    const detalle = await operacion(await requirePermissionActiva(permiso));
    revalidatePath("/", "layout");
    return { ok: detalle || mensajeOk };
  } catch (error) {
    if (error instanceof ErrorValidacion) return { error: error.message };
    if (error instanceof ErrorAutorizacion) return { error: "No tiene permiso para realizar esta acción." };
    throw error;
  }
}
