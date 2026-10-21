import { auth } from "../src/lib/auth/auth";

/** Inicia sesión y devuelve los encabezados con la cookie, como los enviaría un navegador. */
export async function iniciarSesion(correo: string, clave: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: correo, password: clave },
    returnHeaders: true,
  });
  return new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}
