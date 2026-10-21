import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { ErrorProveedorIA, traducirError } from "@/lib/inteligencia/errores";
import { LIMITES, limitarTokensSalida } from "@/lib/inteligencia/limites";
import type { AdaptadorProveedor, RespuestaGeneracion, SolicitudGeneracion } from "@/lib/inteligencia/proveedores";

/**
 * Adaptador OpenAI sobre Vercel AI SDK.
 * La clave se lee solo de OPENAI_API_KEY (servidor) en cada llamada; nunca se guarda ni se registra.
 */
export const adaptadorOpenAI: AdaptadorProveedor = {
  proveedor: "OPENAI",

  async generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ErrorProveedorIA("NO_CONFIGURADO");

    try {
      const resultado = await generateText({
        model: createOpenAI({ apiKey })(solicitud.referencia.modelo),
        system: solicitud.sistema,
        messages: solicitud.mensajes.map((m) => ({ role: m.rol, content: m.contenido })),
        ...(solicitud.temperatura === undefined ? {} : { temperature: solicitud.temperatura }),
        maxOutputTokens: limitarTokensSalida(solicitud.maximoTokens),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(LIMITES.tiempoMaxMs),
      });
      const { inputTokens, outputTokens } = resultado.usage;
      return {
        texto: resultado.text,
        uso:
          inputTokens === undefined && outputTokens === undefined
            ? undefined
            : { tokensEntrada: inputTokens ?? 0, tokensSalida: outputTokens ?? 0 },
      };
    } catch (error) {
      throw traducirError(error);
    }
  },
};
