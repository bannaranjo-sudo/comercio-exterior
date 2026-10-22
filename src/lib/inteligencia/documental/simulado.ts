import type { AdaptadorProveedor, RespuestaGeneracion, SolicitudGeneracion } from "@/lib/inteligencia/proveedores";
import type { Campo, SalidaModelo } from "./esquema";

// Proveedor SIMULADO: no llama a ningún servicio externo ni genera costo. Analiza con reglas simples el texto que recibe
// (etiquetas "Campo: valor") para poder probar de punta a punta el flujo, la evidencia y la revisión. Sus resultados son
// de demostración y la interfaz los identifica como tales.

const SIN_TILDES = (s: string): string => s.replace(/[áàä]/gi, "a").replace(/[éèë]/gi, "e").replace(/[íìï]/gi, "i").replace(/[óòö]/gi, "o").replace(/[úùü]/gi, "u").replace(/ñ/gi, "n");

const ETIQUETAS: { campo: Campo; patron: string }[] = [
  { campo: "proveedor", patron: "proveedor|vendedor|exportador|supplier|seller" },
  { campo: "comprador", patron: "comprador|importador|cliente|buyer|consignatario" },
  { campo: "numero_factura", patron: "factura no\\.?|factura n°|numero de factura|invoice no\\.?" },
  { campo: "fecha_factura", patron: "fecha de factura|fecha" },
  { campo: "mercancia", patron: "descripcion de la mercancia|descripcion|mercancia|producto" },
  { campo: "cantidad", patron: "cantidad|cant\\." },
  { campo: "unidad", patron: "unidad" },
  { campo: "valor_unitario", patron: "valor unitario|precio unitario" },
  { campo: "valor_total", patron: "valor total|total factura|total" },
  { campo: "moneda", patron: "moneda|currency" },
  { campo: "incoterm", patron: "incoterm" },
  { campo: "pais_origen", patron: "pais de origen|origen" },
  { campo: "caracteristica_tecnica", patron: "material|voltaje|potencia|capacidad|caracteristicas?" },
];
const TODAS = new RegExp(`\\b(${ETIQUETAS.map((e) => `(?:${e.patron})`).join("|")})\\s*:`, "gi");
const CLAVES_COMPARABLES: Campo[] = ["proveedor", "comprador", "numero_factura", "cantidad", "valor_total", "moneda", "incoterm", "pais_origen"];
const NIVEL_ALTO: Campo[] = ["cantidad", "valor_total", "moneda"];

type Hallazgo = { campo: Campo; valor: string; cita: string; documentoId: string; pagina: number };

function campoDe(etiqueta: string): Campo | undefined {
  const e = SIN_TILDES(etiqueta).toLowerCase();
  return ETIQUETAS.find((x) => new RegExp(`^(?:${x.patron})$`, "i").test(e))?.campo;
}

function leerDocumentos(contenido: string): { id: string; nombre: string; paginas: { numero: number; texto: string }[] }[] {
  const docs = [];
  for (const m of contenido.matchAll(/<<<DOC-([0-9a-f]+) id=(\S+) tipo=(\S+) nombre="([^"]*)">>>\n([\s\S]*?)\n<<<FIN-\1>>>/g)) {
    const paginas = [...m[5].matchAll(/\[\[PÁGINA (\d+)\]\]\n([\s\S]*?)(?=\n\[\[PÁGINA \d+\]\]\n|$)/g)].map((p) => ({ numero: Number(p[1]), texto: p[2] }));
    docs.push({ id: m[2], nombre: m[4], paginas });
  }
  return docs;
}

function hallazgosDe(texto: string, documentoId: string, pagina: number): Hallazgo[] {
  const plano = SIN_TILDES(texto);
  const marcas = [...plano.matchAll(TODAS)];
  return marcas.flatMap((m, i) => {
    const campo = campoDe(m[1]);
    if (!campo) return [];
    const inicio = m.index!;
    const finValor = m.index! + m[0].length;
    const fin = i + 1 < marcas.length ? marcas[i + 1].index! : texto.length;
    const valor = texto.slice(finValor, fin).trim().slice(0, 120);
    if (!valor) return [];
    return [{ campo, valor, cita: texto.slice(inicio, fin).trim().slice(0, 250), documentoId, pagina }];
  });
}

export function analizarSimulado(contenido: string): SalidaModelo {
  const docs = leerDocumentos(contenido);
  const todos = docs.flatMap((d) => d.paginas.flatMap((p) => hallazgosDe(p.texto, d.id, p.numero)));
  const nombre = (id: string) => docs.find((d) => d.id === id)?.nombre ?? id;
  const datos: SalidaModelo["datos"] = todos.map((h) => ({
    campo: h.campo, valor: h.valor, tipo: "extraido" as const, evidencia: [{ documentoId: h.documentoId, pagina: h.pagina, cita: h.cita }],
  }));
  const inconsistencias: SalidaModelo["inconsistencias"] = [];
  for (const campo of CLAVES_COMPARABLES) {
    const de = todos.filter((h) => h.campo === campo);
    const distintos = new Set(de.map((h) => SIN_TILDES(h.valor).toLowerCase().replace(/[\s.,]+/g, " ").trim()));
    if (de.length > 1 && distintos.size > 1) {
      inconsistencias.push({
        titulo: `Valores distintos de «${campo}» entre documentos`,
        detalle: de.map((h) => `${nombre(h.documentoId)}: ${h.valor}`).join(" · ").slice(0, 590),
        nivel: NIVEL_ALTO.includes(campo) ? "alto" : "medio",
        evidencia: de.slice(0, 6).map((h) => ({ documentoId: h.documentoId, pagina: h.pagina, cita: h.cita })),
      });
    }
  }
  const presentes = new Set(todos.map((h) => h.campo));
  const noEncontrado = (["proveedor", "comprador", "numero_factura", "valor_total", "moneda", "incoterm", "pais_origen", "cantidad"] as Campo[]).filter((c) => !presentes.has(c));
  return {
    resumen: `Análisis simulado de ${docs.length} documento(s): ${datos.length} dato(s) extraído(s), ${inconsistencias.length} inconsistencia(s) y ${noEncontrado.length} dato(s) no encontrado(s). Resultado de demostración, sin modelo de IA.`,
    datos: datos.slice(0, 60),
    inconsistencias,
    faltantes: noEncontrado.map((c) => ({ elemento: c, detalle: "No consta en los documentos analizados." })),
    noEncontrado,
  };
}

type Manejador = (solicitud: SolicitudGeneracion) => Promise<RespuestaGeneracion> | RespuestaGeneracion;
let personalizado: Manejador | null = null;

/** Solo para pruebas: reemplaza la respuesta del proveedor simulado (p. ej. para probar respuestas inválidas). */
export const definirRespuestaSimulada = (m: Manejador | null): void => {
  personalizado = m;
};

export const adaptadorSimulado: AdaptadorProveedor = {
  proveedor: "SIMULADO",
  async generar(solicitud) {
    if (personalizado) return personalizado(solicitud);
    const texto = JSON.stringify(analizarSimulado(solicitud.mensajes.map((m) => m.contenido).join("\n")));
    return { texto, motivoFin: "stop" };
  },
};
