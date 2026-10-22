import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { almacenamiento } from "../src/lib/almacenamiento";
import { autorizar, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { db } from "../src/lib/db";
import * as documentos from "../src/lib/documentos/servicio";
import { ErrorValidacion } from "../src/lib/errores";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
/** PDF mínimo pero estructuralmente válido (firma y marca final); el relleno aleatorio cambia el hash. */
const pdf = (relleno = randomBytes(8).toString("hex")) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${relleno}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, "latin1");
const archivo = (contenido: Buffer, nombre = "factura.pdf") => new File([new Uint8Array(contenido)], nombre, { type: "application/pdf" });

describe("Bloque C · Documentos", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let alfa: ContextoAcceso, beta: ContextoAcceso;
  let op: { id: string; tipo: "IMPORTACION" }, opBeta: { id: string };
  const carga = (extra: Record<string, unknown> = {}) => ({ operacionId: op.id, tipo: "FACTURA_COMERCIAL", ...extra });

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    alfa = e.ctx["admin-alfa"];
    beta = e.ctx["admin-beta"];
    const crear = async (ctx: ContextoAcceso, nit: string) => {
      const t = await terceros.crearTercero(ctx, { razonSocial: `T ${nit}`, identificacionFiscal: nit, ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
      return operaciones.crearOperacion(ctx, {
        tipo: "IMPORTACION", fechaApertura: "2026-10-20", descripcion: "Mercancía", terceroId: t.id, paisOrigen: "China", paisDestino: "Colombia",
        incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "USD", valorEstimado: "100", modalidad: "MARITIMO", responsableId: ctx.usuarioId,
      });
    };
    op = (await crear(alfa, "DOC-A")) as typeof op;
    opBeta = await crear(beta, "DOC-B");
  });
  after(() => e.limpiar());

  it("carga un PDF válido en almacenamiento privado y lo registra", async () => {
    const contenido = pdf();
    const d = await documentos.subirDocumento(alfa, carga({ observaciones: "Original" }), archivo(contenido, "Factura 001.pdf"));
    assert.deepEqual([d.empresaId, d.operacionId, d.estado, d.tipo, d.nombreOriginal, d.tamanoBytes, d.subidoPorId, d.observaciones],
      [e.alfaId, op.id, "RECIBIDO", "FACTURA_COMERCIAL", "Factura 001.pdf", contenido.length, alfa.usuarioId, "Original"]);
    assert.ok(d.claveAlmacenamiento.startsWith(`${e.alfaId}/${op.id}/`) && !d.claveAlmacenamiento.includes("Factura"));
    assert.deepEqual(await almacenamiento.leer(d.claveAlmacenamiento), contenido);
    assert.ok(path.resolve(os.tmpdir(), "comext-test-storage").length > 0);
    const hist = await operaciones.historialOperacion(alfa, op.id);
    assert.equal(hist[0].accion, "DOCUMENTO");
  });

  it("rechaza archivos que no son PDF reales, vacíos, excesivos o repetidos", async () => {
    const subir = (f: unknown, extra = {}) => documentos.subirDocumento(alfa, carga(extra), f);
    await assert.rejects(subir(undefined), rechaza);
    await assert.rejects(subir("texto"), rechaza);
    await assert.rejects(subir(archivo(Buffer.alloc(0))), rechaza);
    await assert.rejects(subir(archivo(pdf(), "factura.exe")), rechaza); // extensión
    await assert.rejects(subir(archivo(Buffer.from("MZ\x90\x00 programa ejecutable %%EOF"), "factura.pdf")), rechaza); // firma falsa
    await assert.rejects(subir(archivo(Buffer.from("%PDF-1.4 truncado sin cierre"), "factura.pdf")), rechaza); // incompleto
    const grande = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(documentos.MAX_BYTES_DOCUMENTO), Buffer.from("\n%%EOF")]);
    await assert.rejects(subir(archivo(grande)), rechaza);
    await assert.rejects(subir(archivo(pdf()), { tipo: "VIRUS" }), rechaza);
    await assert.rejects(subir(archivo(pdf()), { operacionId: "no-uuid" }), rechaza);
    const repetido = pdf("igual");
    await subir(archivo(repetido, "uno.pdf"));
    await assert.rejects(subir(archivo(repetido, "otro-nombre.pdf")), rechaza); // mismo contenido
  });

  it("neutraliza nombres con rutas y no permite recorrer directorios", async () => {
    assert.equal(documentos.nombreSeguro("../../etc/passwd.pdf"), "passwd.pdf");
    assert.equal(documentos.nombreSeguro("C:\\Users\\x\\a<b>.pdf"), "a" + "b.pdf");
    const d = await documentos.subirDocumento(alfa, carga({ tipo: "OTRO" }), archivo(pdf(), "../../../fuera.pdf"));
    assert.equal(d.nombreOriginal, "fuera.pdf");
    await assert.rejects(almacenamiento.leer("../../secreto.pdf"));
    await assert.rejects(almacenamiento.leer(`${e.alfaId}/${op.id}/../../../x.pdf`));
    await assert.rejects(almacenamiento.guardar("cualquier-cosa.txt", Buffer.from("x")));
  });

  it("aísla documentos entre empresas (listado, descarga, estado y carga)", async () => {
    const d = (await documentos.listarDocumentosOperacion(alfa, op.id))[0];
    assert.equal(await documentos.documentoParaDescarga(beta, d.id), null);
    assert.equal(await documentos.documentoParaDescarga(alfa, "no-uuid"), null);
    assert.deepEqual(await documentos.listarDocumentosOperacion(beta, op.id), []);
    assert.equal((await documentos.listarDocumentos(beta)).filas.length, 0);
    await assert.rejects(documentos.cambiarEstadoDocumento(beta, d.id, "APROBADO", ""), rechaza);
    await assert.rejects(documentos.subirDocumento(beta, carga(), archivo(pdf())), rechaza); // operación de otra empresa
    await documentos.subirDocumento(beta, { operacionId: opBeta.id, tipo: "FACTURA_COMERCIAL" }, archivo(pdf()));
    assert.ok((await documentos.listarDocumentos(alfa)).filas.every((x) => x.empresaId === e.alfaId));
    // La base impide asociar un documento a una operación de otra empresa.
    await assert.rejects(
      db.documento.create({ data: { empresaId: e.betaId, operacionId: op.id, tipo: "OTRO", nombreOriginal: "x.pdf", claveAlmacenamiento: `${e.betaId}/${op.id}/${crypto.randomUUID()}.pdf`, tamanoBytes: 1, tipoMime: "application/pdf", sha256: "x", subidoPorId: beta.usuarioId } }),
      (x: { code?: string }) => x.code === "P2003",
    );
  });

  it("verifica la integridad del archivo al entregarlo", async () => {
    const d = (await documentos.listarDocumentosOperacion(alfa, op.id))[0];
    assert.ok((await documentos.leerArchivoDocumento(d)).length > 0);
    await almacenamiento.eliminar(d.claveAlmacenamiento);
    await writeFile(path.join(os.tmpdir(), "comext-test-storage", d.claveAlmacenamiento), Buffer.from("%PDF-1.4 alterado\n%%EOF"));
    await assert.rejects(documentos.leerArchivoDocumento(d), /Integridad/);
  });

  it("gestiona los estados del documento y exige observación al observarlo", async () => {
    const d = (await documentos.listarDocumentosOperacion(alfa, op.id))[0];
    await assert.rejects(documentos.cambiarEstadoDocumento(alfa, d.id, "OBSERVADO", ""), rechaza);
    await assert.rejects(documentos.cambiarEstadoDocumento(alfa, d.id, "RARO", ""), rechaza);
    await documentos.cambiarEstadoDocumento(alfa, d.id, "OBSERVADO", "Falta sello");
    assert.deepEqual((({ estado, observaciones }) => [estado, observaciones])(await db.documento.findUniqueOrThrow({ where: { id: d.id } })), ["OBSERVADO", "Falta sello"]);
    await documentos.cambiarEstadoDocumento(alfa, d.id, "APROBADO", "");
    assert.equal((await db.documento.findUniqueOrThrow({ where: { id: d.id } })).estado, "APROBADO");
    assert.equal((await documentos.listarDocumentos(alfa, { estado: "APROBADO" })).filas.length, 1);
    assert.ok((await documentos.listarDocumentos(alfa, { estado: "por_revisar" })).filas.every((x) => x.estado !== "APROBADO"));
  });

  it("identifica documentos faltantes con la lista predeterminada y la configurable", async () => {
    const tipos = async () => (await documentos.verificarDocumentosOperacion(alfa, { id: op.id, tipo: "IMPORTACION" })).filter((r) => r.faltante).map((r) => r.tipo).sort();
    assert.deepEqual(await tipos(), ["CERTIFICADO_ORIGEN", "DECLARACION_ADUANERA", "DOCUMENTO_TRANSPORTE", "LISTA_EMPAQUE"]); // la factura ya está cargada
    await documentos.guardarRequisitos(alfa, "IMPORTACION", ["FACTURA_COMERCIAL", "POLIZA_SEGURO"]);
    assert.deepEqual(await tipos(), ["POLIZA_SEGURO"]);
    assert.deepEqual(await documentos.requisitosDocumentales(beta, "IMPORTACION"), [...documentos.REQUISITOS_PREDETERMINADOS.IMPORTACION]); // la configuración de Alfa no afecta a Beta
    assert.deepEqual((await documentos.requisitosDocumentales(alfa, "EXPORTACION")).sort(), [...documentos.REQUISITOS_PREDETERMINADOS.EXPORTACION].sort());
    await documentos.guardarRequisitos(alfa, "IMPORTACION", []);
    assert.deepEqual(await tipos(), []);
  });

  it("el rol Consulta puede consultar pero no cargar ni cambiar estados", async () => {
    await autorizar(e.headers["consulta-alfa"], e.alfaId, "documentos:consultar");
    for (const permiso of ["documentos:crear", "documentos:editar"] as const) {
      await assert.rejects(autorizar(e.headers["consulta-alfa"], e.alfaId, permiso), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO");
    }
  });
});
