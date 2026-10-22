import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { iaRealPermitida } from "@/lib/despliegue/entorno";
import { ErrorProveedorIA, traducirError } from "@/lib/inteligencia/errores";
import { limitarTiempo, limitarTokensSalida } from "@/lib/inteligencia/limites";
import type { AdaptadorProveedor, RespuestaGeneracion, SolicitudGeneracion } from "@/lib/inteligencia/proveedores";

type ResultadoSDK = {
  text: string;
  finishReason: string;
  usage: { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number } };
};

/** Convierte el resultado del AI SDK sin inventar métricas: lo que el proveedor no informa queda indefinido. */
export function normalizarRespuesta({ text, finishReason, usage }: ResultadoSDK): RespuestaGeneracion {
  const tokensRazonamiento = usage.outputTokenDetails?.reasoningTokens;
  const hayUso = usage.inputTokens !== undefined || usage.outputTokens !== undefined;
  return {
    texto: text,
    motivoFin: finishReason,
    uso: hayUso
      ? { tokensEntrada: usage.inputTokens, tokensSalida: usage.outputTokens, tokensRazonamiento }
      : undefined,
  };
}

/**
 * Adaptador OpenAI sobre Vercel AI SDK.
 * La clave se lee solo de OPENAI_API_KEY (servidor) en cada llamada; nunca se guarda ni se registra.
 */
export const adaptadorOpenAI: AdaptadorProveedor = {
  proveedor: "OPENAI",

  async generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    const apiKey = process.env.OPENAI_API_KEY;
    // En QA solo se llama a OpenAI con IA_QA_HABILITADA=true además de la clave (ver docs/DESPLIEGUE_QA.md).
    if (!apiKey || !iaRealPermitida(process.env)) throw new ErrorProveedorIA("NO_CONFIGURADO");

    try {
      const resultado = await generateText({
        model: createOpenAI({ apiKey })(solicitud.referencia.modelo),
        system: solicitud.sistema,
        messages: solicitud.mensajes.map((m) => ({ role: m.rol, content: m.contenido })),
        ...(solicitud.temperatura === undefined ? {} : { temperature: solicitud.temperatura }),
        maxOutputTokens: limitarTokensSalida(solicitud.maximoTokens, solicitud.topeTokens),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(limitarTiempo(solicitud.tiempoMaxMs)),
      });
      return normalizarRespuesta(resultado);
    } catch (error) {
      throw traducirError(error);
    }
  },
};
