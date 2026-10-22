import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { configuracionOrigen, validarSecreto } from "@/lib/despliegue/entorno";

// En despliegues remotos exige https, secreto fuerte y un único origen confiable (ver docs/DESPLIEGUE_QA.md).
validarSecreto(process.env);
const { baseURL, origenesConfiables, cookiesSeguras } = configuracionOrigen(process.env);

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: origenesConfiables,
  telemetry: { enabled: false },
  // Sin registro público: los usuarios se crean únicamente con el procedimiento administrativo.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  // Better Auth usa la tabla de usuarios del modelo multiempresa.
  user: {
    modelName: "usuario",
    fields: {
      email: "correo",
      name: "nombre",
      createdAt: "creadoEn",
      updatedAt: "actualizadoEn",
    },
  },
  session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30 },
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: cookiesSeguras,
  },
  rateLimit: { enabled: true },
  databaseHooks: {
    session: {
      create: {
        // Un usuario desactivado no puede abrir sesión.
        before: async (sesion) => {
          const usuario = await db.usuario.findUnique({
            where: { id: sesion.userId },
            select: { activo: true },
          });
          return usuario?.activo ? { data: sesion } : false;
        },
      },
    },
  },
  plugins: [nextCookies()],
});
