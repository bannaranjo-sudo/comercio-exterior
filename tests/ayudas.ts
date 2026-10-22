import { randomBytes } from "node:crypto";
import { auth } from "../src/lib/auth/auth";
import { autorizar, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { crearUsuarioConCredenciales } from "../src/lib/auth/usuarios";
import { db } from "../src/lib/db";
import type { NombreRol } from "../src/lib/permisos/catalogo";
import { sembrar } from "../prisma/seed";

/** Inicia sesión y devuelve los encabezados con la cookie, como los enviaría un navegador. */
export async function iniciarSesion(correo: string, clave: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: correo, password: clave },
    returnHeaders: true,
  });
  return new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

type DefinicionUsuario = { alias: string; empresa: "DEMO-0001" | "DEMO-0002"; rol: NombreRol };

/** Borra los datos del MVP (solo base de pruebas), respetando el orden de dependencias. */
export async function limpiarDatosMvp(): Promise<void> {
  await db.invitacion.deleteMany();
  await db.costo.deleteMany();
  await db.eventoLogistico.deleteMany();
  await db.envio.deleteMany();
  await db.documento.deleteMany();
  await db.operacionHistorial.deleteMany();
  await db.operacion.deleteMany();
  await db.tercero.deleteMany();
  await db.requisitoDocumento.deleteMany();
  await db.contadorConsecutivo.deleteMany();
}

/**
 * Siembra empresas demo en la base de pruebas, crea usuarios con credenciales aleatorias y devuelve
 * un contexto autorizado por usuario (equivalente al que produce requirePermission).
 */
export async function escenario(definiciones: readonly DefinicionUsuario[]) {
  await sembrar();
  await limpiarDatosMvp();
  const sufijo = randomBytes(4).toString("hex");
  const clave = randomBytes(18).toString("base64url");
  const alfaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: "DEMO-0001" } })).id;
  const betaId = (await db.empresa.findUniqueOrThrow({ where: { identificacionFiscal: "DEMO-0002" } })).id;
  const ctx: Record<string, ContextoAcceso> = {};
  const headers: Record<string, Headers> = {};
  const correos: Record<string, string> = {};
  for (const d of definiciones) {
    const correo = `${d.alias}-${sufijo}@test.invalid`;
    correos[d.alias] = correo;
    await crearUsuarioConCredenciales({
      correo, nombre: d.alias, clave, membresias: [{ identificacionFiscal: d.empresa, rol: d.rol }],
    });
    headers[d.alias] = await iniciarSesion(correo, clave);
    ctx[d.alias] = await autorizar(headers[d.alias], d.empresa === "DEMO-0001" ? alfaId : betaId, "terceros:consultar");
  }
  return {
    alfaId, betaId, ctx, headers, correos, clave, sufijo,
    async limpiar() {
      await limpiarDatosMvp();
      await db.usuario.deleteMany({ where: { correo: { endsWith: `-${sufijo}@test.invalid` } } });
      await db.$disconnect();
    },
  };
}
