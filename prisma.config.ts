import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Las migraciones usan DIRECT_URL (conexión directa, sin pooler) cuando está definida.
  // `prisma generate` (postinstall) no se conecta: si no hay URL (p. ej. instalación sin variables) usa un marcador inofensivo.
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://sin-configurar:sin-configurar@localhost:5432/sin_configurar" },
});
