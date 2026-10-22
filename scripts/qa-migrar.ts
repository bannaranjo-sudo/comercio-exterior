import { spawnSync } from "node:child_process";
import { validarBaseRemota } from "../src/lib/despliegue/entorno";

// Aplica las migraciones pendientes (prisma migrate deploy) a la base GESTIONADA de QA y a ninguna otra.
// No lee .env: la cadena debe estar definida en el entorno de esta terminal. Rechaza hosts locales y exige
// confirmar el host (QA_CONFIRMAR_HOST) para que un error de pegado no migre otra base. Nunca ejecuta reset ni seeds.

const cadena = process.env.DIRECT_URL || process.env.DATABASE_URL;
const { host, base } = validarBaseRemota(cadena);
if (process.env.QA_CONFIRMAR_HOST !== host) {
  throw new Error(`Confirme la base destino definiendo QA_CONFIRMAR_HOST=${host} (base "${base}").`);
}
console.log(`Migrando base "${base}" en ${host} (solo migrate deploy)…`);

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  // Se fuerza la cadena validada: así .env (dotenv no sobrescribe variables ya definidas) no puede redirigir el comando.
  env: { ...process.env, DATABASE_URL: cadena, DIRECT_URL: cadena },
});
process.exit(r.status ?? 1);
