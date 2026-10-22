// Inicializa la base GESTIONADA de QA (una sola vez; es idempotente): permisos, empresa FICTICIA "QA-0001", roles y
// cuentas de prueba SIN contraseña (cada persona la define con su enlace de activación de un solo uso).
// No lee .env ni acepta contraseñas. Se rechaza si la base es local, si no se confirma el host o si contiene otras empresas.
import { esEntornoQa, validarBaseRemota } from "../src/lib/despliegue/entorno";

const cadena = process.env.DATABASE_URL;
const { host, base } = validarBaseRemota(cadena);
if (!esEntornoQa(process.env)) throw new Error("Defina APP_ENV=qa para inicializar la base de QA.");
if (process.env.QA_CONFIRMAR_HOST !== host) throw new Error(`Confirme la base destino definiendo QA_CONFIRMAR_HOST=${host} (base "${base}").`);
const adminCorreo = process.env.QA_ADMIN_CORREO?.trim().toLowerCase();
if (!adminCorreo) throw new Error("Defina QA_ADMIN_CORREO (correo del administrador de QA).");
const luisaCorreo = process.env.QA_LUISA_CORREO?.trim().toLowerCase();
process.env.STORAGE_DRIVER = "postgres"; // los PDF de demostración van a la base de QA, nunca a disco local

const { db } = await import("../src/lib/db");
const { inicializarEntornoQa, NIT_QA } = await import("../src/lib/despliegue/qa");
const { configuracionOrigen } = await import("../src/lib/despliegue/entorno");

const { enlaces } = await inicializarEntornoQa({
  adminCorreo, luisaCorreo, adminNombre: process.env.QA_ADMIN_NOMBRE, luisaNombre: process.env.QA_LUISA_NOMBRE,
  baseURL: configuracionOrigen(process.env).baseURL,
});
const NIT = NIT_QA;

console.log(`Empresa ficticia ${NIT} lista en la base "${base}".`);
if (enlaces.length) {
  console.log("\nEnlaces de activación (cópielos ahora y entréguelos por un canal privado; no se vuelven a mostrar):");
  for (const e of enlaces) console.log(` - ${e.etiqueta}: ${e.url}  (un solo uso; vence ${e.expiraEn.toISOString()})`);
} else console.log("Las cuentas indicadas ya estaban activadas; no se generaron enlaces nuevos.");

if (process.env.QA_DATOS_DEMO === "si") {
  process.env.DEMO_EMPRESA_NIT = NIT;
  process.env.QA_DATOS_DEMO_AUTORIZADOS = "si";
  const ruta = "./datos-demo.mts";
  await import(ruta); // termina el proceso al finalizar
} else {
  console.log("Datos de demostración no creados (defina QA_DATOS_DEMO=si para crearlos).");
  await db.$disconnect();
}
