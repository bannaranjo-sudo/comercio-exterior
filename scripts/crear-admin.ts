import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { db } from "../src/lib/db";
import { crearUsuarioConCredenciales, LARGO_MINIMO_CLAVE } from "../src/lib/auth/usuarios";

// Procedimiento para crear el primer administrador de una empresa existente.
// La contraseña se solicita de forma interactiva y oculta; no se acepta por argumentos ni variables.

function leerOculto(pregunta: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(pregunta);
    const { stdin } = process;
    let valor = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const alDato = (tecla: string) => {
      for (const c of tecla) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", alDato);
          process.stdout.write("\n");
          return resolve(valor);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") valor = valor.slice(0, -1);
        else valor += c;
      }
    };
    stdin.on("data", alDato);
  });
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Ejecute este comando en una terminal interactiva.");
  }
  const indice = process.argv.indexOf("--empresa");
  const identificacionFiscal = indice >= 0 ? process.argv[indice + 1] : undefined;
  if (!identificacionFiscal) {
    throw new Error("Uso: npm run auth:crear-admin -- --empresa <identificacion-fiscal>");
  }
  const empresa = await db.empresa.findUnique({ where: { identificacionFiscal } });
  if (!empresa) throw new Error("La empresa indicada no existe.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const correo = (await rl.question("Correo: ")).trim();
  const nombre = (await rl.question("Nombre completo: ")).trim();
  rl.close();
  if (!correo.includes("@") || !nombre) throw new Error("Correo o nombre inválido.");
  if (await db.usuario.findUnique({ where: { correo: correo.toLowerCase() } })) {
    throw new Error("Ya existe un usuario con ese correo.");
  }

  const clave = await leerOculto(`Contraseña (mínimo ${LARGO_MINIMO_CLAVE} caracteres): `);
  const confirmacion = await leerOculto("Repita la contraseña: ");
  if (clave !== confirmacion) throw new Error("Las contraseñas no coinciden.");

  await crearUsuarioConCredenciales({
    correo,
    nombre,
    clave,
    membresias: [{ identificacionFiscal, rol: "Administrador" }],
  });
  console.log(`Administrador creado para ${empresa.razonSocial}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
