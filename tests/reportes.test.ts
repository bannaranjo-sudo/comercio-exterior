import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { after, before, describe, it } from "node:test";
import { type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import { hoyLocal } from "../src/lib/formato";
import * as costos from "../src/lib/costos/servicio";
import * as bodegas from "../src/lib/inventarios/bodegas";
import * as mov from "../src/lib/inventarios/movimientos";
import * as productos from "../src/lib/inventarios/productos";
import * as recepciones from "../src/lib/inventarios/recepciones";
import * as logistica from "../src/lib/logistica/servicio";
import * as operaciones from "../src/lib/operaciones/servicio";
import { ROLES_INICIALES } from "../src/lib/permisos/catalogo";
import { generarCsv } from "../src/lib/reportes/exportar/csv";
import { generarPdf } from "../src/lib/reportes/exportar/pdf";
import { generarXlsx } from "../src/lib/reportes/exportar/xlsx";
import { parsearFiltros } from "../src/lib/reportes/filtros";
import { construirEncabezado, generarParaExportar, generarParaPantalla, generarReporte, reportesDisponibles } from "../src/lib/reportes/indice";
import { MAX_FILAS_EXPORTACION } from "../src/lib/reportes/tipos";
import { paginaPantalla } from "../src/lib/reportes/util";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
const f = (o: Record<string, string> = {}) => parsearFiltros(o);
const kpi = (r: { kpis: { etiqueta: string; valor: string }[] }, etiqueta: string) => r.kpis.find((k) => k.etiqueta === etiqueta)?.valor;
const sumarDias = (dias: number) => new Date(Date.parse(`${hoyLocal()}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/** Lector ZIP mínimo para verificar el .xlsx generado (entradas deflate con CRC). */
function leerZip(b: Buffer): Map<string, Buffer> {
  const fin = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fin >= 0, "sin registro final del ZIP");
  const n = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const salida = new Map<string, Buffer>();
  for (let i = 0; i < n; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50);
    const csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const nombre = b.subarray(p + 46, p + 46 + nl).toString("utf8");
    const dl = b.readUInt16LE(off + 26), de = b.readUInt16LE(off + 28);
    const datos = inflateRawSync(b.subarray(off + 30 + dl + de, off + 30 + dl + de + csize));
    assert.equal(datos.length, usize);
    salida.set(nombre, datos);
    p += 46 + nl + el + cl;
  }
  return salida;
}

describe("Centro de reportes", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let alfa: ContextoAcceso, consulta: ContextoAcceso, operador: ContextoAcceso, beta: ContextoAcceso;
  let prov: { id: string }, cli: { id: string }, provBeta: { id: string };
  let imp1: { id: string; numero: string }, imp2: { id: string; numero: string }, exp1: { id: string; numero: string }, impBeta: { id: string; numero: string };
  let producto: { id: string }, bodega: { id: string };

  const op = (ctx: ContextoAcceso, t: { id: string }, extra: Record<string, unknown>) =>
    operaciones.crearOperacion(ctx, {
      tipo: "IMPORTACION", fechaApertura: "2026-01-10", descripcion: "Mercancía", terceroId: t.id, paisOrigen: "China", paisDestino: "Colombia",
      incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "USD", valorEstimado: "1000.10", modalidad: "MARITIMO", responsableId: ctx.usuarioId, ...extra,
    });
  const costo = (ctx: ContextoAcceso, opId: string, extra: Record<string, unknown>) =>
    costos.registrarCosto(ctx, opId, { categoria: "FLETE_INTERNACIONAL", concepto: "Flete", valor: "100.00", moneda: "USD", fecha: "2026-01-15", estado: "ESTIMADO", ...extra });

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "operador-alfa", empresa: "DEMO-0001", rol: "Operador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    [alfa, operador, consulta, beta] = [e.ctx["admin-alfa"], e.ctx["operador-alfa"], e.ctx["consulta-alfa"], e.ctx["admin-beta"]];

    prov = await terceros.crearTercero(alfa, { razonSocial: "=1+1 Proveedor SA", identificacionFiscal: "REP-P", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
    cli = await terceros.crearTercero(alfa, { razonSocial: "Cliente Uno", identificacionFiscal: "REP-C", ambito: "INTERNACIONAL", roles: ["CLIENTE"], pais: "Estados Unidos" });
    provBeta = await terceros.crearTercero(beta, { razonSocial: "Proveedor Beta", identificacionFiscal: "REP-PB", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "India" });

    imp1 = await op(alfa, prov, {});
    imp2 = await op(alfa, prov, { fechaApertura: "2026-02-15", paisOrigen: "Alemania", moneda: "EUR", valorEstimado: "500.00", modalidad: "AEREO" });
    exp1 = await op(alfa, cli, { tipo: "EXPORTACION", fechaApertura: "2026-02-20", paisOrigen: "Colombia", paisDestino: "Estados Unidos", valorEstimado: "300.00", modalidad: "TERRESTRE" });
    impBeta = await op(beta, provBeta, { descripcion: "Solo Beta", valorEstimado: "999.00" });

    // Costos: USD y EUR separados.
    await costo(alfa, imp1.id, { valor: "100.10" });
    await costo(alfa, imp1.id, { valor: "50.20", categoria: "SEGURO", concepto: "Seguro" });
    await costo(alfa, imp1.id, { valor: "120.30", estado: "REAL" });
    await costo(alfa, imp2.id, { valor: "200.05", moneda: "EUR", fecha: "2026-03-01" });
    await costo(alfa, imp2.id, { valor: "210.00", moneda: "EUR", estado: "REAL", fecha: "2026-03-02" });
    await costo(beta, impBeta.id, { valor: "7777.77" });

    // Logística: imp1 retrasada; imp2 llega en 10 días; exp1 con llegada real.
    await logistica.guardarEnvio(alfa, imp1.id, { medioTransporte: "MARITIMO", numeroGuia: "BL-1", estadoEnvio: "EN_TRANSITO", fechaEstimadaSalida: "2026-01-12", fechaEstimadaLlegada: "2026-01-20" });
    await logistica.guardarEnvio(alfa, imp2.id, { medioTransporte: "AEREO", estadoEnvio: "PROGRAMADO", fechaEstimadaLlegada: sumarDias(10) });
    await logistica.guardarEnvio(alfa, exp1.id, { medioTransporte: "TERRESTRE", estadoEnvio: "ENTREGADO", fechaEstimadaLlegada: "2026-03-01", fechaRealLlegada: "2026-03-03" });
    await logistica.registrarEvento(alfa, imp1.id, { tipo: "HITO", titulo: "Zarpe", fechaEvento: "2026-01-12" });
    await logistica.registrarEvento(alfa, imp1.id, { tipo: "NOVEDAD", titulo: "Demora en puerto", fechaEvento: "2026-01-18", severidad: "ALTA" });
    const resuelta = await logistica.registrarEvento(alfa, exp1.id, { tipo: "NOVEDAD", titulo: "Daño menor", fechaEvento: "2026-02-25", severidad: "BAJA" });
    await logistica.resolverNovedad(alfa, resuelta.id);

    // Documentos de imp1: factura aprobada, lista de empaque observada.
    const doc = (operacionId: string, tipo: "FACTURA_COMERCIAL" | "LISTA_EMPAQUE", estado: "APROBADO" | "OBSERVADO") =>
      db.documento.create({ data: { empresaId: e.alfaId, operacionId, tipo, estado, nombreOriginal: `${tipo}.pdf`, claveAlmacenamiento: `${e.alfaId}/${operacionId}/${randomUUID()}.pdf`, tamanoBytes: 1, tipoMime: "application/pdf", sha256: randomUUID(), subidoPorId: alfa.usuarioId } });
    await doc(imp1.id, "FACTURA_COMERCIAL", "APROBADO");
    await doc(imp1.id, "LISTA_EMPAQUE", "OBSERVADO");

    // Inventario: recepción de 100 y salida de 30.
    producto = await productos.crearProducto(alfa, { sku: "REP-1", nombre: "Producto reporte", unidad: "UNIDAD", stockMinimo: "100" });
    bodega = await bodegas.crearBodega(alfa, { codigo: "REP-B", nombre: "Bodega reporte" });
    await recepciones.registrarRecepcion(alfa, { operacionId: imp1.id, bodegaId: bodega.id, fechaRecepcion: "2026-01-25", claveIdempotencia: randomUUID() }, [{ productoId: producto.id, cantidadRecibida: "100" }]);
    await mov.registrarSalida(alfa, { productoId: producto.id, bodegaId: bodega.id, cantidad: "30", motivo: "Despacho de prueba" });
  });
  after(() => e.limpiar());

  describe("filtros", () => {
    it("validan fechas, enumerados e identificadores en el servidor", () => {
      assert.throws(() => f({ desde: "2026-13-01" }), rechaza);
      assert.throws(() => f({ desde: "2026-03-01", hasta: "2026-02-01" }), rechaza);
      assert.throws(() => f({ tipo: "OTRO" }), rechaza);
      assert.throws(() => f({ terceroId: "no-es-uuid" }), rechaza);
      assert.throws(() => f({ moneda: "DOLAR" }), rechaza);
      assert.throws(() => f({ pagina: "0" }), rechaza);
      assert.deepEqual(f({ tipo: "IMPORTACION", moneda: "usd", desde: "2026-01-01" }).moneda, "USD");
    });
    it("una empresa enviada en la URL se ignora (la empresa sale del contexto)", async () => {
      const r = await generarParaPantalla(alfa, "operaciones", f({ empresaId: e.betaId } as Record<string, string>));
      assert.equal(kpi(r, "Operaciones"), "3");
    });
  });

  describe("resumen ejecutivo", () => {
    it("calcula indicadores coherentes con los módulos", async () => {
      const r = await generarParaPantalla(alfa, "resumen", f());
      assert.equal(kpi(r, "Operaciones"), "3");
      assert.equal(kpi(r, "Activas"), "3");
      assert.equal(kpi(r, "Retrasadas"), "1");
      assert.equal(kpi(r, "Llegan en 30 días"), "1");
      assert.equal(kpi(r, "Documentos sin aprobar"), "1");
      assert.equal(kpi(r, "Incidencias abiertas"), "1");
      const estados = r.tablas.find((t) => t.id === "estados")!;
      assert.equal(estados.filas.find((x) => x.celdas.estado === "Borrador")!.celdas.importaciones, 2);
      assert.equal(r.tablas.find((t) => t.id === "retrasadas")!.filas[0].celdas.numero, imp1.numero);
      const meses = r.graficos.find((g) => g.id === "por-mes");
      assert.ok(meses && meses.tipo === "columnas" && meses.categorias.join() === "2026-01,2026-02");
    });
    it("respeta el período y el tipo", async () => {
      assert.equal(kpi(await generarParaPantalla(alfa, "resumen", f({ desde: "2026-02-01" })), "Operaciones"), "2");
      assert.equal(kpi(await generarParaPantalla(alfa, "resumen", f({ tipo: "EXPORTACION" })), "Operaciones"), "1");
    });
    it("estado vacío sin errores", async () => {
      const r = await generarParaPantalla(alfa, "resumen", f({ desde: "2030-01-01" }));
      assert.equal(kpi(r, "Operaciones"), "0");
      assert.equal(r.tablas.find((t) => t.id === "retrasadas")!.filas.length, 0);
    });
  });

  describe("operaciones", () => {
    it("combina filtros (país sin distinguir mayúsculas, tercero, responsable, modalidad)", async () => {
      assert.equal((await generarParaPantalla(alfa, "operaciones", f({ pais: "china" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "operaciones", f({ pais: "ESTADOS UNIDOS" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "operaciones", f({ terceroId: prov.id }))).tablas[0].total, 2);
      assert.equal((await generarParaPantalla(alfa, "operaciones", f({ terceroId: prov.id, modalidad: "AEREO" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "operaciones", f({ responsableId: alfa.usuarioId, tipo: "IMPORTACION", desde: "2026-02-01", hasta: "2026-02-28" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "operaciones", f({ operacionId: exp1.id }))).tablas[0].filas[0].celdas.numero, exp1.numero);
    });
    it("cada fila enlaza al expediente y muestra el valor exacto con su moneda", async () => {
      const t = (await generarParaPantalla(alfa, "operaciones", f({ operacionId: imp1.id }))).tablas[0];
      assert.equal(t.filas[0].href, `/operaciones/${imp1.id}`);
      assert.equal(t.filas[0].celdas.valorEstimado, "1000.10");
      assert.equal(t.filas[0].celdas.moneda, "USD");
    });
    it("pagina de verdad y la exportación trae todas las filas", async () => {
      for (let i = 0; i < 22; i++) await op(alfa, prov, { fechaApertura: "2026-04-01" });
      const p1 = (await generarParaPantalla(alfa, "operaciones", f())).tablas[0];
      const p2 = (await generarParaPantalla(alfa, "operaciones", f({ pagina: "2" }))).tablas[0];
      assert.equal(p1.total, 25);
      assert.equal(p1.filas.length, 20);
      assert.equal(p2.filas.length, 5);
      assert.equal(new Set([...p1.filas, ...p2.filas].map((x) => x.href)).size, 25);
      const todo = (await generarParaExportar(alfa, "operaciones", f())).tablas[0];
      assert.equal(todo.filas.length, 25);
      const filtrado = (await generarParaExportar(alfa, "operaciones", f({ desde: "2026-04-01" }))).tablas[0];
      assert.equal(filtrado.filas.length, 22);
      assert.equal(filtrado.total, 22);
      assert.ok(MAX_FILAS_EXPORTACION > 25);
      await db.operacion.deleteMany({ where: { empresaId: e.alfaId, fechaApertura: new Date("2026-04-01T00:00:00Z") } });
    });
  });

  describe("costos", () => {
    it("totaliza por moneda sin consolidar y calcula variaciones exactas", async () => {
      const r = await generarParaPantalla(alfa, "costos", f());
      assert.equal(kpi(r, "Estimado USD"), "150.30");
      assert.equal(kpi(r, "Real USD"), "120.30");
      assert.equal(kpi(r, "Variación USD (real − estimado)"), "-30.00");
      assert.equal(kpi(r, "Estimado EUR"), "200.05");
      assert.equal(kpi(r, "Real EUR"), "210.00");
      assert.equal(kpi(r, "Variación EUR (real − estimado)"), "9.95");
      assert.ok(!r.kpis.some((k) => /total|consolidado/i.test(k.etiqueta)), "no debe haber un total mezclado");
      assert.ok(r.avisos.some((a) => /sin conversión|no se aplican tasas/i.test(a) || /tasas de cambio/.test(a)));
      const porOp = r.tablas.find((t) => t.id === "por-operacion")!;
      const fila = porOp.filas.find((x) => x.celdas.numero === imp1.numero)!;
      assert.deepEqual([fila.celdas.estimado, fila.celdas.real, fila.celdas.variacion, fila.celdas.variacionPct], ["150.30", "120.30", "-30.00", "-20.0"]);
      assert.equal(porOp.filas.find((x) => x.celdas.numero === imp2.numero)!.celdas.moneda, "EUR");
      const porCat = r.tablas.find((t) => t.id === "por-categoria")!;
      assert.equal(porCat.filas.find((x) => x.celdas.moneda === "USD" && x.celdas.categoria === "Seguro")!.celdas.estimado, "50.20");
      // Sin costos reales no hay variación que informar (no se inventa un -100 %).
      const seguro = porCat.filas.find((x) => x.celdas.moneda === "USD" && x.celdas.categoria === "Seguro")!.celdas;
      assert.deepEqual([seguro.real, seguro.variacion, seguro.variacionPct], ["0.00", null, null]);
    });
    it("filtra por moneda, categoría, estado y fecha del costo", async () => {
      assert.equal(kpi(await generarParaPantalla(alfa, "costos", f({ moneda: "EUR" })), "Estimado USD"), undefined);
      assert.equal(kpi(await generarParaPantalla(alfa, "costos", f({ categoria: "SEGURO" })), "Estimado USD"), "50.20");
      assert.equal(kpi(await generarParaPantalla(alfa, "costos", f({ estadoCosto: "REAL", moneda: "USD" })), "Real USD"), "120.30");
      const marzo = await generarParaPantalla(alfa, "costos", f({ desde: "2026-03-01", hasta: "2026-03-31" }));
      assert.equal(kpi(marzo, "Estimado USD"), undefined);
      assert.equal(kpi(marzo, "Real EUR"), "210.00");
    });
    it("es coherente con el módulo de costos", async () => {
      const modulo = await costos.totalesPorMoneda(alfa);
      const r = await generarParaPantalla(alfa, "costos", f());
      for (const t of modulo) {
        assert.equal(kpi(r, `Estimado ${t.moneda}`), t.estimado);
        assert.equal(kpi(r, `Real ${t.moneda}`), t.real);
      }
    });
  });

  describe("logística", () => {
    it("calcula retrasos, hitos e incidencias por operación", async () => {
      const r = await generarParaPantalla(alfa, "logistica", f());
      const t = r.tablas[0];
      const fila1 = t.filas.find((x) => x.celdas.numero === imp1.numero)!.celdas;
      assert.equal(fila1.hitos, 1);
      assert.equal(fila1.incidenciasAbiertas, 1);
      assert.ok(Number(fila1.retraso) > 0);
      assert.equal(fila1.guia, "BL-1");
      assert.equal(t.filas.find((x) => x.celdas.numero === exp1.numero)!.celdas.retraso, 2);
      assert.equal(t.filas.find((x) => x.celdas.numero === imp2.numero)!.celdas.retraso, 0);
      assert.equal(kpi(r, "Retrasadas"), "1");
      assert.equal(kpi(r, "Incidencias resueltas"), "1");
      assert.equal(r.tablas.find((x) => x.id === "incidencias")!.filas.length, 1);
    });
    it("filtra por estado del envío, modalidad y solo retrasadas", async () => {
      assert.equal((await generarParaPantalla(alfa, "logistica", f({ retrasadas: "1" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "logistica", f({ estadoEnvio: "ENTREGADO" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "logistica", f({ modalidad: "AEREO" }))).tablas[0].total, 1);
    });
  });

  describe("inventarios", () => {
    it("reproduce las existencias del motor y concilia saldo con historial", async () => {
      const r = await generarParaPantalla(alfa, "inventarios", f());
      const fila = r.tablas.find((t) => t.id === "existencias")!.filas.find((x) => x.celdas.sku === "REP-1")!;
      assert.equal(fila.celdas.total, "70.0000");
      assert.equal(fila.celdas.estado, "Bajo mínimo");
      assert.equal(kpi(r, "Conciliación saldo vs historial"), "Conciliado");
      assert.equal(kpi(r, "Bajo el mínimo"), "1");
      assert.equal(kpi(r, "Recepciones del período"), "1");
      assert.equal(kpi(r, "Movimientos del período"), "2");
      assert.equal(r.tablas.find((t) => t.id === "movimientos")!.filas.length, 2);
    });
    it("detecta una diferencia entre saldo e historial", async () => {
      await db.existenciaInventario.update({ where: { productoId_bodegaId: { productoId: producto.id, bodegaId: bodega.id } }, data: { cantidad: 71 } });
      const r = await generarParaPantalla(alfa, "inventarios", f());
      assert.match(kpi(r, "Conciliación saldo vs historial")!, /1 diferencia/);
      await db.existenciaInventario.update({ where: { productoId_bodegaId: { productoId: producto.id, bodegaId: bodega.id } }, data: { cantidad: 70 } });
      assert.equal(kpi(await generarParaPantalla(alfa, "inventarios", f()), "Conciliación saldo vs historial"), "Conciliado");
    });
    it("filtra por bodega, producto y período", async () => {
      assert.equal(kpi(await generarParaPantalla(alfa, "inventarios", f({ desde: "2030-01-01" })), "Recepciones del período"), "0");
      assert.equal(kpi(await generarParaPantalla(alfa, "inventarios", f({ productoId: producto.id })), "Productos activos"), "1");
      assert.equal(kpi(await generarParaPantalla(alfa, "inventarios", f({ estadoStock: "sin_stock" })), "Productos activos"), "0");
    });
  });

  describe("documentos", () => {
    it("evalúa el checklist: solo APROBADO cumple", async () => {
      const r = await generarParaPantalla(alfa, "documentos", f());
      const t = r.tablas[0];
      const a = t.filas.find((x) => x.celdas.numero === imp1.numero)!.celdas;
      assert.deepEqual([a.requeridos, a.aprobados, a.observados, a.faltantes], [5, 1, 1, 3]);
      assert.equal(a.cumplimiento, "20.0");
      assert.equal(t.filas.find((x) => x.celdas.numero === imp2.numero)!.celdas.faltantes, 5);
      assert.equal(t.filas.find((x) => x.celdas.numero === exp1.numero)!.celdas.requeridos, 4);
      assert.equal(kpi(r, "Expedientes completos"), "0");
      assert.equal(kpi(r, "Observados"), "1");
      assert.equal((await generarParaPantalla(alfa, "documentos", f({ incompletos: "1", tipo: "EXPORTACION" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "documentos", f({ estadoDocumento: "OBSERVADO" }))).tablas[0].total, 1);
    });
  });

  describe("terceros", () => {
    it("resume la actividad por tercero sin mezclar monedas", async () => {
      const r = await generarParaPantalla(alfa, "terceros", f());
      const t = r.tablas[0];
      const p = t.filas.find((x) => x.celdas.identificacion === "REP-P")!.celdas;
      assert.equal(p.operaciones, 2);
      assert.equal(p.importaciones, 2);
      assert.equal(p.valores, "EUR 500.00 · USD 1000.10");
      assert.equal(t.filas.find((x) => x.celdas.identificacion === "REP-C")!.celdas.exportaciones, 1);
      assert.equal((await generarParaPantalla(alfa, "terceros", f({ rol: "CLIENTE" }))).tablas[0].total, 1);
      assert.equal((await generarParaPantalla(alfa, "terceros", f({ pais: "china" }))).tablas[0].total, 1);
    });
  });

  describe("seguridad", () => {
    it("aísla los datos por empresa", async () => {
      for (const id of ["resumen", "operaciones", "logistica", "costos", "inventarios", "documentos", "terceros"] as const) {
        const r = await generarParaExportar(beta, id, f());
        const json = JSON.stringify(r);
        for (const ajeno of [imp1.id, imp2.id, exp1.id, "REP-1", "150.30", "Cliente Uno", "Proveedor SA"]) assert.ok(!json.includes(ajeno), `${id} filtra ${ajeno} a otra empresa`);
      }
      assert.equal(kpi(await generarParaPantalla(beta, "costos", f()), "Estimado USD"), "7777.77");
      // Filtrar por IDs de otra empresa no revela nada.
      assert.equal((await generarParaPantalla(beta, "operaciones", f({ terceroId: prov.id }))).tablas[0].total, 0);
      assert.equal((await generarParaPantalla(beta, "operaciones", f({ operacionId: imp1.id }))).tablas[0].total, 0);
      assert.equal(kpi(await generarParaPantalla(beta, "inventarios", f({ productoId: producto.id })), "Productos activos"), "0");
    });
    it("exige reportes:consultar y el permiso del módulo de origen", async () => {
      const sinReportes = { ...alfa, permisos: new Set(["operaciones:consultar"]) } as ContextoAcceso;
      await assert.rejects(async () => generarReporte(sinReportes, "resumen", f(), paginaPantalla()), rechaza);
      const sinCostos = { ...alfa, permisos: new Set(["reportes:consultar", "operaciones:consultar"]) } as ContextoAcceso;
      await assert.rejects(async () => generarReporte(sinCostos, "costos", f(), paginaPantalla()), rechaza);
      assert.deepEqual(reportesDisponibles(sinCostos).map((r) => r.id), ["resumen", "operaciones"]);
      assert.equal(reportesDisponibles(consulta).length, 7);
    });
    it("exportar requiere reportes:crear (Consulta no lo tiene; Operador y Administrador sí)", () => {
      assert.ok(!ROLES_INICIALES.Consulta.permisos.includes("reportes:crear"));
      assert.ok(ROLES_INICIALES.Operador.permisos.includes("reportes:crear"));
      assert.ok(ROLES_INICIALES.Administrador.permisos.includes("reportes:crear"));
      assert.ok(operador.permisos.has("reportes:crear") && !consulta.permisos.has("reportes:crear"));
    });
  });

  describe("exportaciones", () => {
    const generar = async (ctx: ContextoAcceso, id: Parameters<typeof generarParaExportar>[1], filtros = f()) => {
      const datos = await generarParaExportar(ctx, id, filtros);
      const enc = await construirEncabezado(ctx, datos, filtros, "22 oct 2026, 8:00 a. m.");
      return { datos, enc };
    };
    it("CSV: identificación, filtros, filas exactas y protección contra fórmulas", async () => {
      const filtros = f({ tipo: "IMPORTACION", desde: "2026-01-01", hasta: "2026-01-31" });
      const { datos, enc } = await generar(alfa, "operaciones", filtros);
      const csv = generarCsv(enc, datos, datos.tablas[0]);
      assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const texto = csv.toString("utf8");
      assert.match(texto, /Empresa,.*Alfa/);
      assert.match(texto, /DEMO-0001/);
      assert.match(texto, /2026-01-01 a 2026-01-31/);
      assert.match(texto, /Tipo: IMPORTACION/);
      assert.match(texto, /Generado,"22 oct 2026/);
      assert.match(texto, /sin conversión entre monedas/);
      assert.match(texto, /,USD,1000\.10\r\n/);
      assert.ok(texto.includes("'=1+1 Proveedor SA"), "los textos que empiezan con = deben neutralizarse");
      assert.ok(!texto.includes(imp2.numero) && !texto.includes(exp1.numero), "solo las filas filtradas");
      assert.equal(texto.split("\r\n").filter((l) => l.startsWith(imp1.numero)).length, 1);
    });
    it("CSV: negativos y decimales exactos en costos", async () => {
      const { datos, enc } = await generar(alfa, "costos");
      const texto = generarCsv(enc, datos, datos.tablas[0]).toString("utf8");
      assert.match(texto, new RegExp(`${imp1.numero},.*,USD,150\\.30,120\\.30,-30\\.00,-20\\.0`));
    });
    it("XLSX: paquete válido, hojas, valores exactos y fechas con formato", async () => {
      const { datos, enc } = await generar(alfa, "costos");
      const zip = leerZip(generarXlsx(enc, datos));
      for (const n of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]) assert.ok(zip.has(n), `falta ${n}`);
      const resumen = zip.get("xl/worksheets/sheet1.xml")!.toString("utf8");
      assert.match(resumen, /Alfa/);
      assert.match(resumen, /DEMO-0001/);
      assert.match(resumen, /Todo el hist/);
      assert.match(resumen, /150\.30/);
      const hoja = zip.get("xl/worksheets/sheet2.xml")!.toString("utf8");
      assert.match(hoja, /<v>150\.30<\/v>/);
      assert.match(hoja, /<v>-30\.00<\/v>/);
      assert.match(hoja, /<autoFilter ref="A1:G/);
      for (const x of zip.values()) assert.ok(!x.toString("utf8").includes("\u0000"));
      const op = await generar(alfa, "operaciones", f({ operacionId: imp1.id }));
      const hojaOp = leerZip(generarXlsx(op.enc, op.datos)).get("xl/worksheets/sheet2.xml")!.toString("utf8");
      assert.match(hojaOp, /<c r="D2" s="3"><v>\d+<\/v><\/c>/); // fecha como serial con formato
      assert.match(hojaOp, /<v>1000\.10<\/v>/);
      assert.ok(hojaOp.includes("=1+1 Proveedor SA") && hojaOp.includes('t="inlineStr"'), "el texto con = va como cadena, no como fórmula");
    });
    it("XLSX: escapa caracteres especiales de XML", async () => {
      const t = await terceros.crearTercero(alfa, { razonSocial: "A&B <Ltda> \"X\"", identificacionFiscal: "REP-X", ambito: "NACIONAL", roles: ["PROVEEDOR"], pais: "Colombia" });
      const o = await op(alfa, t, { fechaApertura: "2026-05-01" });
      const { datos, enc } = await generar(alfa, "operaciones", f({ terceroId: t.id }));
      const hoja = leerZip(generarXlsx(enc, datos)).get("xl/worksheets/sheet2.xml")!.toString("utf8");
      assert.ok(hoja.includes("A&amp;B &lt;Ltda&gt; &quot;X&quot;"));
      await db.operacion.delete({ where: { id: o.id } });
      await db.tercero.delete({ where: { id: t.id } });
    });
    it("PDF: estructura válida con tabla de referencias coherente", async () => {
      const { datos, enc } = await generar(alfa, "resumen");
      const pdf = generarPdf(enc, datos);
      const texto = pdf.toString("latin1");
      assert.ok(texto.startsWith("%PDF-1.4"));
      assert.ok(texto.trimEnd().endsWith("%%EOF"));
      const inicio = Number(/startxref\n(\d+)/.exec(texto)![1]);
      assert.ok(texto.slice(inicio).startsWith("xref"));
      const entradas = [...texto.slice(inicio).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
      entradas.forEach((off, i) => assert.ok(texto.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1} mal ubicado`));
      assert.match(texto, /\/Type \/Pages/);
      assert.match(texto, /\/Count \d+/);
    });
    it("rechaza exportar por encima del tope de filas", async () => {
      const { validarTope } = await import("../src/lib/reportes/util");
      assert.throws(() => validarTope(MAX_FILAS_EXPORTACION + 1), rechaza);
      assert.doesNotThrow(() => validarTope(MAX_FILAS_EXPORTACION));
    });
    it("las exportaciones de otra empresa no contienen datos ajenos", async () => {
      const { datos, enc } = await generar(beta, "operaciones");
      const texto = generarCsv(enc, datos, datos.tablas[0]).toString("utf8") + leerZip(generarXlsx(enc, datos)).get("xl/worksheets/sheet2.xml")!.toString("utf8");
      assert.ok(texto.includes(impBeta.numero) && texto.includes("Beta"));
      assert.ok(!texto.includes("Cliente Uno") && !texto.includes("Proveedor SA") && !texto.includes("Alfa"));
    });
  });
});
