// Reglas de entorno compartidas por la aplicación y los scripts de despliegue. Son funciones puras sobre un objeto
// de variables para poder probarlas sin tocar process.env.

export type Entorno = Record<string, string | undefined>;

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);

export const esHostLocal = (host: string): boolean => {
  const h = host.toLowerCase();
  return HOSTS_LOCALES.has(h) || h.endsWith(".localhost") || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
};

/** Despliegue remoto: Vercel o entorno marcado explícitamente como QA. */
export const esEntornoRemoto = (env: Entorno): boolean => Boolean(env.VERCEL) || env.APP_ENV === "qa";
export const esEntornoQa = (env: Entorno): boolean => env.APP_ENV === "qa";

export type ConfiguracionOrigen = { baseURL: string; origenesConfiables: string[]; cookiesSeguras: boolean };

/**
 * URL base y orígenes confiables de Better Auth. En un despliegue remoto la URL es obligatoria, debe ser https y no puede
 * apuntar a un host local; el único origen confiable es esa URL (sin comodines ni URLs de vista previa).
 */
export function configuracionOrigen(env: Entorno): ConfiguracionOrigen {
  const remoto = esEntornoRemoto(env);
  const bruta = env.BETTER_AUTH_URL?.trim() || (remoto ? "" : "http://localhost:3000");
  if (!bruta) throw new Error("BETTER_AUTH_URL es obligatoria en un despliegue remoto (https://…).");
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new Error("BETTER_AUTH_URL no es una URL válida.");
  }
  if (remoto) {
    if (url.protocol !== "https:") throw new Error("BETTER_AUTH_URL debe usar https en un despliegue remoto.");
    if (esHostLocal(url.hostname)) throw new Error("BETTER_AUTH_URL no puede apuntar a un host local en un despliegue remoto.");
  } else if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("BETTER_AUTH_URL debe ser http(s).");
  }
  return {
    baseURL: url.origin,
    origenesConfiables: [url.origin],
    cookiesSeguras: env.NODE_ENV === "production" || url.protocol === "https:",
  };
}

/** En un despliegue remoto el secreto de sesiones es obligatorio y debe tener al menos 32 caracteres. */
export function validarSecreto(env: Entorno): void {
  if (!esEntornoRemoto(env)) return;
  const s = env.BETTER_AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("BETTER_AUTH_SECRET es obligatorio (mínimo 32 caracteres) en un despliegue remoto.");
}

export type BaseRemota = { host: string; base: string };

/** Valida que una cadena de conexión apunte a una base remota (nunca local) y devuelve host y nombre para confirmarlos. */
export function validarBaseRemota(cadena: string | undefined): BaseRemota {
  if (!cadena) throw new Error("Defina la cadena de conexión de la base de QA en el entorno de esta terminal.");
  let url: URL;
  try {
    url = new URL(cadena);
  } catch {
    throw new Error("La cadena de conexión no es válida.");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("La cadena de conexión debe ser de PostgreSQL.");
  if (esHostLocal(url.hostname)) throw new Error("Rechazado: la base apunta a un host local (podría ser la base de desarrollo).");
  const base = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!base) throw new Error("La cadena de conexión no indica el nombre de la base.");
  return { host: url.hostname, base };
}

/** Las llamadas reales a OpenAI solo se permiten en QA si se habilitan de forma explícita (clave y autorización). */
export function iaRealPermitida(env: Entorno): boolean {
  if (!env.OPENAI_API_KEY) return false;
  if (esEntornoQa(env) && env.IA_QA_HABILITADA !== "true") return false;
  return true;
}
