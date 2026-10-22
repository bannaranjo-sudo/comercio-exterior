// Debe fijarse antes del primer uso del almacenamiento: estas pruebas ejercitan el proveedor PostgreSQL de punta a punta.
process.env.STORAGE_DRIVER = "postgres";

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { almacenamiento, AlmacenamientoLocal, AlmacenamientoPostgres, crearAlmacenamiento } from "../src/lib/almacenamiento";
import { activarCuenta } from "../src/lib/auth/activacion";
import { auth } from "../src/lib/auth/auth";
import { autorizar, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { db } from "../src/lib/db";
import { configuracionOrigen, esHostLocal, iaRealPermitida, validarBaseRemota, validarSecreto } from "../src/lib/despliegue/entorno";
import { inicializarEntornoQa, NIT_QA } from "../src/lib/despliegue/qa";
import * as documentos from "../src/lib/documentos/servicio";
import { ErrorValidacion } from "../src/lib/errores";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
const pdf = (rel = randomBytes(8).toString("hex")) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${rel}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, "latin1");
const archivo = (b: Buffer, n = "soporte.pdf") => new File([new Uint8Array(b)], n, { type: "application/pdf" });

describe("Compatibilidad de despliegue", () => {
  describe("variables de entorno y Better Auth", () => {
    it("en desarrollo local usa http://localhost:3000 por defecto", () => {
      const c = configuracionOrigen({});
      assert.deepEqual([c.baseURL, c.origenesConfiables], ["http://localhost:3000", ["http://localhost:3000"]]);
    });
    it("en un despliegue remoto exige URL https, no local, y un único origen confiable", () => {
      assert.throws(() => configuracionOrigen({ VERCEL: "1" }), /obligatoria/);
      assert.throws(() => configuracionOrigen({ APP_ENV: "qa", BETTER_AUTH_URL: "http://qa.example.com" }), /https/);
      assert.throws(() => configuracionOrigen({ VERCEL: "1", BETTER_AUTH_URL: "https://localhost:3000" }), /local/);
      assert.throws(() => configuracionOrigen({ VERCEL: "1", BETTER_AUTH_URL: "no es url" }), /válida/);
      const c = configuracionOrigen({ APP_ENV: "qa", BETTER_AUTH_URL: "https://comext-qa.vercel.app/ruta/ignorada?x=1" });
      assert.deepEqual(c.origenesConfiables, ["https://comext-qa.vercel.app"]);
      assert.equal(c.baseURL, "https://comext-qa.vercel.app");
      assert.equal(c.cookiesSeguras, true);
    });
    it("el secreto es obligatorio y fuerte solo en remoto", () => {
      assert.doesNotThrow(() => validarSecreto({}));
      assert.throws(() => validarSecreto({ VERCEL: "1" }), /BETTER_AUTH_SECRET/);
      assert.throws(() => validarSecreto({ APP_ENV: "qa", BETTER_AUTH_SECRET: "corto" }), /32/);
      assert.doesNotThrow(() => validarSecreto({ APP_ENV: "qa", BETTER_AUTH_SECRET: "x".repeat(32) }));
    });
    it("el registro público está deshabilitado", async () => {
      await assert.rejects(auth.api.signUpEmail({ body: { email: `publico-${randomUUID()}@test.invalid`, password: "una-clave-larga-123", name: "Publico" } }));
    });
    it("OpenAI queda desactivado en QA salvo habilitación explícita", () => {
      assert.equal(iaRealPermitida({}), false);
      assert.equal(iaRealPermitida({ OPENAI_API_KEY: "x" }), true);
      assert.equal(iaRealPermitida({ OPENAI_API_KEY: "x", APP_ENV: "qa" }), false);
      assert.equal(iaRealPermitida({ OPENAI_API_KEY: "x", APP_ENV: "qa", IA_QA_HABILITADA: "true" }), true);
      assert.equal(iaRealPermitida({ APP_ENV: "qa", IA_QA_HABILITADA: "true" }), false);
    });
  });

  describe("aislamiento entre ambientes", () => {
    it("reconoce hosts locales y rechaza bases locales como destino de QA", () => {
      for (const h of ["localhost", "127.0.0.1", "::1", "db.localhost", "192.168.1.5", "10.0.0.2", "host.docker.internal"]) assert.ok(esHostLocal(h), h);
      for (const h of ["ep-cool-1234.us-east-2.aws.neon.tech", "db.abcd.supabase.co"]) assert.ok(!esHostLocal(h), h);
      assert.throws(() => validarBaseRemota("postgresql://u:p@localhost:5433/comercio_exterior"), /local/);
      assert.throws(() => validarBaseRemota("postgresql://u:p@127.0.0.1:5433/comercio_exterior_test"), /local/);
      assert.throws(() => validarBaseRemota(undefined), /Defina/);
      assert.throws(() => validarBaseRemota("mysql://u:p@host.example.com/x"), /PostgreSQL/);
      assert.throws(() => validarBaseRemota("postgresql://u:p@host.example.com"), /nombre/);
      assert.deepEqual(validarBaseRemota("postgresql://u:p@ep-x.neon.tech/comext_qa?sslmode=require"), { host: "ep-x.neon.tech", base: "comext_qa" });
    });
  });

  describe("almacenamiento privado", () => {
    it("elige el proveedor por STORAGE_DRIVER y rechaza el disco en Vercel", () => {
      assert.ok(crearAlmacenamiento({}) instanceof AlmacenamientoLocal);
      assert.ok(crearAlmacenamiento({ STORAGE_DRIVER: "local", STORAGE_DIR: "/tmp/x" }) instanceof AlmacenamientoLocal);
      assert.ok(crearAlmacenamiento({ STORAGE_DRIVER: "postgres" }) instanceof AlmacenamientoPostgres);
      assert.ok(crearAlmacenamiento({ STORAGE_DRIVER: "postgres", VERCEL: "1" }) instanceof AlmacenamientoPostgres);
      assert.throws(() => crearAlmacenamiento({ VERCEL: "1" }), /STORAGE_DRIVER=postgres/);
      assert.throws(() => crearAlmacenamiento({ STORAGE_DRIVER: "s3" }), /no válido/);
    });
    it("el límite de tamaño por PDF respeta el tope de solicitudes de Vercel", () => {
      assert.equal(documentos.maxMbDocumento({}), 10);
      assert.equal(documentos.maxMbDocumento({ VERCEL: "1" }), 4);
      assert.equal(documentos.maxMbDocumento({ VERCEL: "1", DOCUMENTOS_MAX_MB: "8" }), 8);
      assert.equal(documentos.maxMbDocumento({ DOCUMENTOS_MAX_MB: "99" }), 10);
      assert.equal(documentos.maxMbDocumento({ DOCUMENTOS_MAX_MB: "abc" }), 10);
    });

    describe("proveedor PostgreSQL", () => {
      let e: Awaited<ReturnType<typeof escenario>>;
      let alfa: ContextoAcceso, beta: ContextoAcceso;
      before(async () => {
        e = await escenario([{ alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" }, { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" }]);
        [alfa, beta] = [e.ctx["admin-alfa"], e.ctx["admin-beta"]];
      });
      after(() => e.limpiar());

      it("guarda, lee y elimina con la misma validación de claves que el local", async () => {
        const op = randomUUID();
        const clave = `${e.alfaId}/${op}/${randomUUID()}.pdf`;
        const contenido = pdf();
        await almacenamiento.guardar(clave, contenido);
        assert.deepEqual(await almacenamiento.leer(clave), contenido);
        await assert.rejects(almacenamiento.guardar(clave, contenido)); // no se sobrescribe
        await almacenamiento.eliminar(clave);
        await assert.rejects(almacenamiento.leer(clave), /no encontrado/);
        for (const mala of ["../etc/passwd", `${e.alfaId}/${op}/x.pdf`, `${e.alfaId}/${op}/../${randomUUID()}.pdf`, ""]) {
          await assert.rejects(almacenamiento.leer(mala), /no válida/);
          await assert.rejects(almacenamiento.guardar(mala, contenido), /no válida/);
        }
        await assert.rejects(almacenamiento.guardar(`${randomUUID()}/${op}/${randomUUID()}.pdf`, contenido)); // empresa inexistente
      });

      it("flujo documental completo: carga validada, descarga autorizada y aislamiento por empresa", async () => {
        const t = await terceros.crearTercero(alfa, { razonSocial: "Proveedor QA", identificacionFiscal: "DEP-1", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
        const o = await operaciones.crearOperacion(alfa, {
          tipo: "IMPORTACION", fechaApertura: "2026-10-20", descripcion: "Mercancía", terceroId: t.id, paisOrigen: "China", paisDestino: "Colombia",
          incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "USD", valorEstimado: "100", modalidad: "MARITIMO", responsableId: alfa.usuarioId,
        });
        const contenido = pdf();
        await documentos.subirDocumento(alfa, { operacionId: o.id, tipo: "FACTURA_COMERCIAL" }, archivo(contenido));
        const doc = await db.documento.findFirstOrThrow({ where: { operacionId: o.id } });
        const fila = await db.archivoAlmacenado.findUniqueOrThrow({ where: { clave: doc.claveAlmacenamiento } });
        assert.equal(fila.empresaId, e.alfaId);
        assert.equal(fila.tamanoBytes, contenido.length);
        assert.deepEqual(await documentos.leerArchivoDocumento(doc), contenido); // verifica el hash
        // Validación del archivo y autorización siguen vigentes con este proveedor.
        await assert.rejects(documentos.subirDocumento(alfa, { operacionId: o.id, tipo: "OTRO" }, archivo(Buffer.from("no soy pdf"))), rechaza);
        await assert.rejects(documentos.subirDocumento(beta, { operacionId: o.id, tipo: "OTRO" }, archivo(pdf())), rechaza); // operación de otra empresa
        assert.equal(await documentos.documentoParaDescarga(beta, doc.id), null); // otra empresa no obtiene el documento
        assert.ok(await documentos.documentoParaDescarga(alfa, doc.id));
        // Un archivo alterado en almacenamiento se detecta.
        await db.archivoAlmacenado.update({ where: { clave: doc.claveAlmacenamiento }, data: { contenido: new Uint8Array(pdf()) } });
        await assert.rejects(documentos.leerArchivoDocumento(doc), /Integridad/);
      });
    });
  });

  describe("inicialización de la base de QA", () => {
    let nombre: string;
    before(async () => {
      // Esta prueba vacía las empresas de demostración (solo base de pruebas); cada archivo de pruebas vuelve a sembrar lo suyo.
      nombre = randomBytes(4).toString("hex");
      await db.empresa.deleteMany({ where: { NOT: { identificacionFiscal: { startsWith: "QA-" } } } });
    });
    after(async () => {
      await db.empresa.deleteMany({ where: { identificacionFiscal: NIT_QA } }); // primero la empresa (invitaciones en cascada)
      await db.usuario.deleteMany({ where: { correo: { endsWith: `-${nombre}@test.invalid` } } });
      await db.$disconnect();
    });

    it("se niega si la base contiene empresas que no son de QA", async () => {
      const intrusa = await db.empresa.create({ data: { identificacionFiscal: "REAL-123", razonSocial: "Empresa real" } });
      await assert.rejects(inicializarEntornoQa({ adminCorreo: `admin-${nombre}@test.invalid`, baseURL: "https://qa.example.com" }), /no son de QA/);
      assert.equal(await db.empresa.count({ where: { identificacionFiscal: NIT_QA } }), 0);
      await db.empresa.delete({ where: { id: intrusa.id } });
    });

    it("crea una empresa ficticia, cuentas sin contraseña y activación de un solo uso con permisos acotados", async () => {
      const admin = `admin-${nombre}@test.invalid`;
      const luisa = `luisa-${nombre}@test.invalid`;
      const r = await inicializarEntornoQa({ adminCorreo: admin, luisaCorreo: luisa, baseURL: "https://qa.example.com" });
      const empresa = await db.empresa.findUniqueOrThrow({ where: { id: r.empresaId } });
      assert.equal(empresa.identificacionFiscal, "QA-0001");
      assert.match(empresa.razonSocial, /ficticios/);
      assert.equal(await db.empresa.count(), 1);
      // Sin contraseñas por defecto: ninguna cuenta de credenciales hasta activar.
      assert.equal(await db.account.count({ where: { user: { correo: { in: [admin, luisa] } } } }), 0);
      assert.equal(r.enlaces.length, 2);
      assert.ok(r.enlaces.every((l) => l.url.startsWith("https://qa.example.com/activar/")));
      // El token no se guarda: solo su hash.
      const tokenLuisa = r.enlaces.find((l) => l.etiqueta.startsWith("Luisa"))!.url.split("/").pop()!;
      assert.equal(await db.invitacion.count({ where: { tokenHash: tokenLuisa } }), 0);

      // Luisa: Operador, sin administración ni configuración sensible.
      const m = await db.empresaUsuario.findFirstOrThrow({ where: { usuario: { correo: luisa } }, include: { rol: { include: { permisos: { include: { permiso: true } } } } } });
      const permisos = new Set(m.rol.permisos.map((p) => p.permiso.codigo));
      assert.equal(m.rol.nombre, "Operador");
      assert.ok(permisos.has("operaciones:crear") && permisos.has("reportes:crear") && permisos.has("inventarios:crear"));
      for (const prohibido of ["administracion:administrar", "administracion:consultar", "inteligencia:configurar", "inteligencia:administrar_agentes", "operaciones:eliminar"]) {
        assert.ok(!permisos.has(prohibido), `Luisa no debe tener ${prohibido}`);
      }

      // Activación: define su propia contraseña y entra; el enlace no sirve dos veces.
      const clave = randomBytes(18).toString("base64url");
      await activarCuenta(tokenLuisa, clave, clave);
      const sesion = await auth.api.signInEmail({ body: { email: luisa, password: clave }, returnHeaders: true });
      const headers = new Headers({ cookie: sesion.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
      const ctx = await autorizar(headers, r.empresaId, "operaciones:consultar");
      assert.equal(ctx.rolNombre, "Operador");
      await assert.rejects(autorizar(headers, r.empresaId, "administracion:administrar"));
      await assert.rejects(activarCuenta(tokenLuisa, clave, clave), rechaza);
      await assert.rejects(auth.api.signInEmail({ body: { email: admin, password: "Clave-por-defecto-123" } })); // sin clave predeterminada
    });

    it("es idempotente: repetirla no duplica empresa, roles ni membresías", async () => {
      const admin = `admin-${nombre}@test.invalid`;
      const r2 = await inicializarEntornoQa({ adminCorreo: admin, luisaCorreo: `luisa-${nombre}@test.invalid`, baseURL: "https://qa.example.com" });
      assert.equal(await db.empresa.count(), 1);
      assert.equal(await db.rol.count({ where: { empresaId: r2.empresaId } }), 3);
      assert.equal(await db.empresaUsuario.count({ where: { empresaId: r2.empresaId } }), 2);
      assert.equal(r2.enlaces.length, 1); // solo el administrador sigue sin activar
    });
  });
});
