import "./setup.ts";
import { execFileSync } from "node:child_process";
import pg from "pg";

// Crea la base de pruebas si no existe y aplica las migraciones (no destructivo).
const url = new URL(process.env.TEST_DATABASE_URL!);
const nombre = url.pathname.slice(1);

const admin = new pg.Client({ connectionString: url.toString().replace(`/${nombre}`, "/postgres") });
await admin.connect();
const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
if (!rowCount) await admin.query(`CREATE DATABASE "${nombre}"`);
await admin.end();

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "ignore",
  shell: true,
  env: process.env,
});
