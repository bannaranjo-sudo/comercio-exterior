import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Prisma } from "../src/generated/prisma/client";
import { autorizar, ErrorAutorizacion, type ContextoAcceso } from "../src/lib/auth/autorizacion";
import { db } from "../src/lib/db";
import { ErrorValidacion } from "../src/lib/errores";
import * as bodegas from "../src/lib/inventarios/bodegas";
import { formatearCantidad, parsearCantidad } from "../src/lib/inventarios/cantidades";
import * as consultas from "../src/lib/inventarios/consultas";
import * as mov from "../src/lib/inventarios/movimientos";
import * as productos from "../src/lib/inventarios/productos";
import * as recepciones from "../src/lib/inventarios/recepciones";
import * as operaciones from "../src/lib/operaciones/servicio";
import * as terceros from "../src/lib/terceros/servicio";
import { escenario } from "./ayudas";

const rechaza = (e: unknown) => e instanceof ErrorValidacion;
const dec = (v: unknown) => new Prisma.Decimal(v as string);
const fk = (x: unknown) => typeof (x as { code?: unknown }).code === "string" || /misma empresa|violates|inmutables|check|pertenecer/i.test(String((x as Error).message));

describe("Inventarios", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  let alfa: ContextoAcceso, beta: ContextoAcceso;
  let prov: { id: string }, impA: { id: string; numero: string }, expA: { id: string }, impB: { id: string };

  const nuevaProducto = (ctx: ContextoAcceso, sku: string, extra: Record<string, unknown> = {}) =>
    productos.crearProducto(ctx, { sku, nombre: `Producto ${sku}`, unidad: "UNIDAD", stockMinimo: "0", ...extra });
  const nuevaBodega = (ctx: ContextoAcceso, codigo: string, extra: Record<string, unknown> = {}) =>
    bodegas.crearBodega(ctx, { codigo, nombre: `Bodega ${codigo}`, ...extra });
  const stock = async (productoId: string, bodegaId: string) =>
    (await db.existenciaInventario.findUnique({ where: { productoId_bodegaId: { productoId, bodegaId } } }))?.cantidad.toFixed(4) ?? "0.0000";
  const op = async (ctx: ContextoAcceso, tipo: "IMPORTACION" | "EXPORTACION", nit: string) => {
    const t = await terceros.crearTercero(ctx, { razonSocial: `T ${nit}`, identificacionFiscal: nit, ambito: "INTERNACIONAL", roles: [tipo === "IMPORTACION" ? "PROVEEDOR" : "CLIENTE"], pais: "China" });
    return operaciones.crearOperacion(ctx, {
      tipo, fechaApertura: "2026-10-20", descripcion: "Mercancía", terceroId: t.id, paisOrigen: "China", paisDestino: "Colombia",
      incoterm: "FOB", lugarIncoterm: "Shanghái", moneda: "USD", valorEstimado: "100", modalidad: "MARITIMO", responsableId: ctx.usuarioId,
    });
  };
  const recibir = (ctx: ContextoAcceso, operacionId: string, bodegaId: string, lineas: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
    recepciones.registrarRecepcion(ctx, { operacionId, bodegaId, fechaRecepcion: "2026-10-22", claveIdempotencia: randomUUID(), ...extra }, lineas);

  before(async () => {
    e = await escenario([
      { alias: "admin-alfa", empresa: "DEMO-0001", rol: "Administrador" },
      { alias: "operador-alfa", empresa: "DEMO-0001", rol: "Operador" },
      { alias: "consulta-alfa", empresa: "DEMO-0001", rol: "Consulta" },
      { alias: "admin-beta", empresa: "DEMO-0002", rol: "Administrador" },
    ]);
    [alfa, beta] = [e.ctx["admin-alfa"], e.ctx["admin-beta"]];
    prov = await terceros.crearTercero(alfa, { razonSocial: "Proveedor", identificacionFiscal: "INV-P", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
    impA = await op(alfa, "IMPORTACION", "INV-IMP");
    expA = await op(alfa, "EXPORTACION", "INV-EXP");
    impB = await op(beta, "IMPORTACION", "INV-IMPB");
  });
  after(() => e.limpiar());

  // ------------------------------------------------------------------ cantidades
  it("valida cantidades decimales exactas según la unidad", () => {
    assert.equal(parsearCantidad("12,5", "KILOGRAMO", "x"), "12.5000");
    assert.equal(parsearCantidad("0.0001", "KILOGRAMO", "x"), "0.0001");
    assert.equal(parsearCantidad("40", "UNIDAD", "x"), "40.0000");
    for (const malo of ["0", "-1", "abc", "", "1.23456", "1.5", "1e3", " "]) {
      assert.throws(() => parsearCantidad(malo, "UNIDAD", "x"), rechaza, malo);
    }
    assert.throws(() => parsearCantidad("2.5", "CAJA", "x"), rechaza);
    assert.equal(parsearCantidad("0", "UNIDAD", "x", true), "0.0000"); // umbral permitido
    assert.equal(formatearCantidad("12.5000", "KILOGRAMO"), "12,5 kg");
    assert.equal(dec("0.1").plus("0.2").toFixed(4), "0.3000"); // sin coma flotante
  });

  // ------------------------------------------------------------------ productos
  it("crea, consulta, edita y desactiva productos", async () => {
    const p = await nuevaProducto(alfa, "sku-001", { categoria: "Maquinaria", unidad: "KILOGRAMO", paisOrigen: "China", codigoArancelario: "8458.11", proveedorId: prov.id, stockMinimo: "5,5" });
    assert.deepEqual([p.sku, p.empresaId, p.activo, p.stockMinimo.toFixed(4), p.codigoArancelario], ["SKU-001", e.alfaId, true, "5.5000", "8458.11"]);
    await assert.rejects(nuevaProducto(alfa, "SKU-001"), rechaza); // duplicado por empresa
    await nuevaProducto(beta, "SKU-001"); // misma SKU en otra empresa: permitido
    for (const malo of [{ sku: "mal sku!" }, { sku: "" }, { nombre: "" }, { unidad: "TONELADA" }, { codigoArancelario: "abc" }, { stockMinimo: "-1" }, { stockMinimo: "1.5", unidad: "UNIDAD" }]) {
      await assert.rejects(nuevaProducto(alfa, `X-${randomUUID().slice(0, 6)}`, malo), rechaza, JSON.stringify(malo));
    }
    const ajeno = await terceros.crearTercero(beta, { razonSocial: "Prov B", identificacionFiscal: "INV-PB", ambito: "INTERNACIONAL", roles: ["PROVEEDOR"], pais: "China" });
    await assert.rejects(nuevaProducto(alfa, "SKU-002", { proveedorId: ajeno.id }), rechaza);
    await assert.rejects(db.producto.create({ data: { empresaId: e.alfaId, sku: "RAW-1", nombre: "x", proveedorId: ajeno.id, creadoPorId: alfa.usuarioId } }), fk); // trigger en la base

    const editado = await productos.actualizarProducto(alfa, p.id, { sku: "SKU-001", nombre: "Nombre nuevo", unidad: "KILOGRAMO", categoria: "", stockMinimo: "2" });
    assert.deepEqual([editado.nombre, editado.categoria, editado.codigoArancelario], ["Nombre nuevo", null, null]);
    assert.ok((await productos.listarProductos(alfa, { q: "nuevo" })).filas.some((x) => x.id === p.id));
    assert.equal((await productos.listarProductos(beta, { q: "nuevo" })).filas.length, 0);
    await productos.cambiarEstadoProducto(alfa, p.id, false);
    assert.ok(!(await productos.listarProductos(alfa)).filas.some((x) => x.id === p.id));
    assert.ok((await productos.listarProductos(alfa, { estado: "inactivos" })).filas.some((x) => x.id === p.id));
    await productos.cambiarEstadoProducto(alfa, p.id, true);
  });

  it("aísla productos entre empresas", async () => {
    const p = await nuevaProducto(alfa, "AIS-1");
    assert.equal(await productos.obtenerProducto(beta, p.id), null);
    await assert.rejects(productos.actualizarProducto(beta, p.id, { sku: "AIS-1", nombre: "x", unidad: "UNIDAD" }), rechaza);
    await assert.rejects(productos.cambiarEstadoProducto(beta, p.id, false), rechaza);
  });

  // ------------------------------------------------------------------ bodegas
  it("crea, edita y desactiva bodegas con validaciones y aislamiento", async () => {
    const b = await nuevaBodega(alfa, "bod-1", { ciudad: "Cartagena", direccion: "Zona franca", responsableId: e.ctx["operador-alfa"].usuarioId });
    assert.deepEqual([b.codigo, b.empresaId, b.activo], ["BOD-1", e.alfaId, true]);
    await assert.rejects(nuevaBodega(alfa, "BOD-1"), rechaza);
    await nuevaBodega(beta, "BOD-1");
    await assert.rejects(nuevaBodega(alfa, "BOD-2", { responsableId: beta.usuarioId }), rechaza); // no es miembro de la empresa
    await assert.rejects(db.bodega.create({ data: { empresaId: e.alfaId, codigo: "RAW", nombre: "x", responsableId: beta.usuarioId, creadoPorId: alfa.usuarioId } }), fk);
    await assert.rejects(nuevaBodega(alfa, "mal codigo"), rechaza);
    const editada = await bodegas.actualizarBodega(alfa, b.id, { codigo: "BOD-1", nombre: "Bodega principal", ciudad: "" });
    assert.deepEqual([editada.nombre, editada.ciudad, editada.responsableId], ["Bodega principal", null, null]);
    assert.equal(await bodegas.obtenerBodega(beta, b.id), null);
    await assert.rejects(bodegas.cambiarEstadoBodega(beta, b.id, false), rechaza);
    await bodegas.cambiarEstadoBodega(alfa, b.id, false);
    assert.ok(!(await bodegas.listarBodegas(alfa)).some((x) => x.id === b.id));
    await bodegas.cambiarEstadoBodega(alfa, b.id, true);
  });

  // ------------------------------------------------------------------ flujo principal
  it("no crea existencias por crear una importación; la recepción sí genera entradas transaccionales", async () => {
    const p = await nuevaProducto(alfa, "FLU-1", { unidad: "KILOGRAMO" });
    const q = await nuevaProducto(alfa, "FLU-2");
    const bod = await nuevaBodega(alfa, "FLU-B");
    assert.equal(await db.existenciaInventario.count({ where: { empresaId: e.alfaId, bodegaId: bod.id } }), 0); // la importación ya existe y no hay saldo

    await assert.rejects(recibir(alfa, impA.id, bod.id, [{ productoId: p.id, cantidadEsperada: "100", cantidadRecibida: "95" }]), rechaza); // diferencia sin observación
    assert.equal(await stock(p.id, bod.id), "0.0000"); // rechazo: nada se guardó

    const r = await recibir(alfa, impA.id, bod.id, [
      { productoId: p.id, cantidadEsperada: "100", cantidadRecibida: "95,5", observacion: "Faltante en contenedor" },
      { productoId: q.id, cantidadRecibida: "40" },
    ], { observaciones: "Recepción completa" });
    assert.equal(r.duplicada, false);
    assert.match(r.recepcion.numero, /^REC-2026-\d{4}$/);
    assert.equal(await stock(p.id, bod.id), "95.5000");
    assert.equal(await stock(q.id, bod.id), "40.0000");
    const movs = await db.movimientoInventario.findMany({ where: { recepcionId: r.recepcion.id }, orderBy: { cantidad: "desc" } });
    assert.deepEqual(movs.map((m) => [m.tipo, m.sentido, m.cantidad.toFixed(4), m.saldoPosterior.toFixed(4), m.operacionId === impA.id, m.usuarioId === alfa.usuarioId]), [
      ["RECEPCION", "ENTRADA", "95.5000", "95.5000", true, true],
      ["RECEPCION", "ENTRADA", "40.0000", "40.0000", true, true],
    ]);
    const detalle = await recepciones.obtenerRecepcion(alfa, r.recepcion.id);
    assert.equal(detalle?.lineas.length, 2);
    assert.equal(detalle?.lineas.find((l) => l.producto.sku === "FLU-1")?.cantidadEsperada?.toFixed(4), "100.0000");
    assert.equal((await operaciones.historialOperacion(alfa, impA.id))[0].accion, "RECEPCION");

    // Salida que consume parte del stock, y consulta de existencias.
    await mov.registrarSalida(alfa, { productoId: q.id, bodegaId: bod.id, cantidad: "15", motivo: "Despacho a cliente", referencia: "REM-1" });
    assert.equal(await stock(q.id, bod.id), "25.0000");
    const fila = (await consultas.listarExistencias(alfa)).find((x) => x.sku === "FLU-2")!;
    assert.deepEqual([fila.total.toFixed(4), fila.bodegas.length, fila.estado], ["25.0000", 1, "OK"]);
  });

  it("valida las recepciones: operación, bodega, productos y cantidades", async () => {
    const p = await nuevaProducto(alfa, "REC-V1");
    const bod = await nuevaBodega(alfa, "REC-VB");
    const ok = { productoId: p.id, cantidadRecibida: "5" };
    await assert.rejects(recibir(alfa, expA.id, bod.id, [ok]), rechaza); // exportación
    await assert.rejects(recibir(alfa, impB.id, bod.id, [ok]), rechaza); // operación de otra empresa
    await assert.rejects(recibir(alfa, impA.id, (await nuevaBodega(beta, "REC-BB")).id, [ok]), rechaza); // bodega de otra empresa
    await assert.rejects(recibir(alfa, impA.id, bod.id, [{ productoId: (await nuevaProducto(beta, "REC-PB")).id, cantidadRecibida: "5" }]), rechaza);
    for (const mala of ["0", "-3", "abc", "1.5", ""]) await assert.rejects(recibir(alfa, impA.id, bod.id, [{ productoId: p.id, cantidadRecibida: mala }]), rechaza, mala);
    await assert.rejects(recibir(alfa, impA.id, bod.id, []), rechaza);
    await assert.rejects(recibir(alfa, impA.id, bod.id, [ok, ok]), rechaza); // producto repetido
    await assert.rejects(recibir(alfa, impA.id, bod.id, [ok], { fechaRecepcion: "2026-02-31" }), rechaza);
    await assert.rejects(recibir(alfa, impA.id, bod.id, [ok], { claveIdempotencia: "x" }), rechaza);
    await assert.rejects(recibir(alfa, impA.id, bod.id, [{ ...ok, cantidadEsperada: "-4" }]), rechaza);
    const doc = await db.documento.create({ data: { empresaId: e.alfaId, operacionId: expA.id, tipo: "OTRO", nombreOriginal: "x.pdf", claveAlmacenamiento: `${e.alfaId}/${expA.id}/${randomUUID()}.pdf`, tamanoBytes: 1, tipoMime: "application/pdf", sha256: randomUUID(), subidoPorId: alfa.usuarioId } });
    await assert.rejects(recibir(alfa, impA.id, bod.id, [ok], { documentoId: doc.id }), rechaza); // documento de otra operación
    await bodegas.cambiarEstadoBodega(alfa, bod.id, false);
    await assert.rejects(recibir(alfa, impA.id, bod.id, [ok]), rechaza); // bodega inactiva
    await bodegas.cambiarEstadoBodega(alfa, bod.id, true);
    await productos.cambiarEstadoProducto(alfa, p.id, false);
    await assert.rejects(recibir(alfa, impA.id, bod.id, [ok]), rechaza); // producto inactivo
    assert.equal(await stock(p.id, bod.id), "0.0000");
    // La base también exige que la recepción sea de una importación.
    await assert.rejects(db.recepcion.create({ data: { empresaId: e.alfaId, numero: "RAW-1", operacionId: expA.id, bodegaId: bod.id, fechaRecepcion: new Date(), claveIdempotencia: randomUUID(), registradoPorId: alfa.usuarioId } }), fk);
  });

  it("las recepciones son idempotentes ante reenvíos y solicitudes simultáneas", async () => {
    const p = await nuevaProducto(alfa, "IDEM-1");
    const bod = await nuevaBodega(alfa, "IDEM-B");
    const clave = randomUUID();
    const a = await recibir(alfa, impA.id, bod.id, [{ productoId: p.id, cantidadRecibida: "10" }], { claveIdempotencia: clave });
    const b = await recibir(alfa, impA.id, bod.id, [{ productoId: p.id, cantidadRecibida: "10" }], { claveIdempotencia: clave });
    assert.deepEqual([a.duplicada, b.duplicada, a.recepcion.id === b.recepcion.id], [false, true, true]);
    assert.equal(await stock(p.id, bod.id), "10.0000");

    const clave2 = randomUUID();
    const r = await Promise.all(Array.from({ length: 6 }, () => recibir(alfa, impA.id, bod.id, [{ productoId: p.id, cantidadRecibida: "7" }], { claveIdempotencia: clave2 })));
    assert.equal(r.filter((x) => !x.duplicada).length, 1);
    assert.equal(new Set(r.map((x) => x.recepcion.id)).size, 1);
    assert.equal(await stock(p.id, bod.id), "17.0000"); // 10 + 7, una sola vez
    assert.equal(await db.movimientoInventario.count({ where: { empresaId: e.alfaId, productoId: p.id } }), 2);
  });

  // ------------------------------------------------------------------ salidas y concurrencia
  it("rechaza salidas sin existencias suficientes y nunca deja saldos negativos", async () => {
    const p = await nuevaProducto(alfa, "SAL-1");
    const bod = await nuevaBodega(alfa, "SAL-B");
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "10", motivo: "Saldo inicial" });
    const salida = (cantidad: string, extra = {}) => mov.registrarSalida(alfa, { productoId: p.id, bodegaId: bod.id, cantidad, motivo: "Venta", ...extra });
    await assert.rejects(salida("11").catch((x) => { assert.match(String(x.message), /insuficientes/); throw x; }), rechaza);
    for (const mala of ["0", "-1", "x", "1.5"]) await assert.rejects(salida(mala), rechaza, mala);
    await assert.rejects(salida("1", { motivo: "" }), rechaza);
    await assert.rejects(mov.registrarSalida(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "1" }), rechaza);
    assert.equal(await stock(p.id, bod.id), "10.0000");
    await salida("10");
    assert.equal(await stock(p.id, bod.id), "0.0000");
    await assert.rejects(salida("1"), rechaza);
    assert.equal(await db.movimientoInventario.count({ where: { empresaId: e.alfaId, productoId: p.id } }), 2); // los rechazos no dejan rastro
  });

  it("controla la concurrencia: salidas simultáneas no pueden superar el saldo", async () => {
    const p = await nuevaProducto(alfa, "CON-1", { unidad: "KILOGRAMO" });
    const bod = await nuevaBodega(alfa, "CON-B");
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "10", motivo: "Saldo inicial" });
    const r = await Promise.allSettled(Array.from({ length: 8 }, () => mov.registrarSalida(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "3", motivo: "Venta simultánea" })));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 3); // 3 × 3 = 9 ≤ 10; la cuarta no cabe
    assert.ok(r.filter((x) => x.status === "rejected").every((x) => (x as PromiseRejectedResult).reason instanceof ErrorValidacion));
    assert.equal(await stock(p.id, bod.id), "1.0000");
    // Dos salidas del total exacto al mismo tiempo: solo una prospera.
    const q = await nuevaProducto(alfa, "CON-2");
    await mov.registrarEntrada(alfa, { productoId: q.id, bodegaId: bod.id, cantidad: "5", motivo: "Saldo inicial" });
    const dos = await Promise.allSettled([1, 2].map(() => mov.registrarSalida(alfa, { productoId: q.id, bodegaId: bod.id, cantidad: "5", motivo: "Doble despacho" })));
    assert.deepEqual(dos.map((x) => x.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(await stock(q.id, bod.id), "0.0000");
  });

  it("las salidas repetidas con la misma clave no se duplican", async () => {
    const p = await nuevaProducto(alfa, "CLA-1");
    const bod = await nuevaBodega(alfa, "CLA-B");
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "20", motivo: "Saldo inicial" });
    const clave = randomUUID();
    const r = await Promise.all(Array.from({ length: 5 }, () => mov.registrarSalida(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "4", motivo: "Venta", claveIdempotencia: clave })));
    assert.equal(r.filter((x) => !x.duplicado).length, 1);
    assert.equal(await stock(p.id, bod.id), "16.0000");
  });

  // ------------------------------------------------------------------ transferencias
  it("las transferencias registran salida y entrada atómicamente", async () => {
    const p = await nuevaProducto(alfa, "TRA-1");
    const [a, b, c] = [await nuevaBodega(alfa, "TRA-A"), await nuevaBodega(alfa, "TRA-B"), await nuevaBodega(alfa, "TRA-C")];
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: a.id, cantidad: "10", motivo: "Saldo inicial" });
    const r = await mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: b.id, cantidad: "4", motivo: "Reubicación", referencia: "TR-1" });
    assert.equal(r.movimientos.length, 2);
    const [sal, ent] = [r.movimientos.find((m) => m.sentido === "SALIDA")!, r.movimientos.find((m) => m.sentido === "ENTRADA")!];
    assert.deepEqual([sal.bodegaId, ent.bodegaId, sal.grupoId === ent.grupoId && Boolean(sal.grupoId), sal.saldoPosterior.toFixed(4), ent.saldoPosterior.toFixed(4)], [a.id, b.id, true, "6.0000", "4.0000"]);
    assert.deepEqual([await stock(p.id, a.id), await stock(p.id, b.id)], ["6.0000", "4.0000"]);
    // Sin saldo suficiente: no se mueve nada (ni la entrada ni la salida).
    await assert.rejects(mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: c.id, cantidad: "7", motivo: "Reubicación" }), rechaza);
    assert.deepEqual([await stock(p.id, a.id), await stock(p.id, c.id)], ["6.0000", "0.0000"]);
    assert.equal(await db.movimientoInventario.count({ where: { empresaId: e.alfaId, productoId: p.id, tipo: "TRANSFERENCIA" } }), 2);
    await assert.rejects(mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: a.id, cantidad: "1", motivo: "Mismo lugar" }), rechaza);
    await assert.rejects(mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: c.id, cantidad: "1" }), rechaza); // sin motivo
    await bodegas.cambiarEstadoBodega(alfa, c.id, false);
    await assert.rejects(mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: c.id, cantidad: "1", motivo: "A inactiva" }), rechaza);
    const clave = randomUUID();
    const rep = await Promise.all([1, 2, 3].map(() => mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: b.id, cantidad: "1", motivo: "Reintento", claveIdempotencia: clave })));
    assert.equal(rep.filter((x) => !x.duplicado).length, 1);
    assert.deepEqual([await stock(p.id, a.id), await stock(p.id, b.id)], ["5.0000", "5.0000"]);
  });

  it("transferencias opuestas simultáneas no se bloquean entre sí y conservan el total", async () => {
    const p = await nuevaProducto(alfa, "DEAD-1");
    const [a, b] = [await nuevaBodega(alfa, "DEAD-A"), await nuevaBodega(alfa, "DEAD-B")];
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: a.id, cantidad: "50", motivo: "Saldo inicial" });
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: b.id, cantidad: "50", motivo: "Saldo inicial" });
    const tareas = Array.from({ length: 12 }, (_, i) =>
      mov.registrarTransferencia(alfa, { productoId: p.id, origenId: i % 2 ? a.id : b.id, destinoId: i % 2 ? b.id : a.id, cantidad: "2", motivo: "Vaivén" }),
    );
    const r = await Promise.allSettled(tareas);
    assert.equal(r.filter((x) => x.status === "rejected").length, 0, JSON.stringify(r.filter((x) => x.status === "rejected")));
    const total = dec(await stock(p.id, a.id)).plus(await stock(p.id, b.id));
    assert.equal(total.toFixed(4), "100.0000");
  });

  // ------------------------------------------------------------------ ajustes y compensaciones
  it("los ajustes exigen justificación y no pueden dejar saldo negativo", async () => {
    const p = await nuevaProducto(alfa, "AJU-1");
    const bod = await nuevaBodega(alfa, "AJU-B");
    const ajuste = (direccion: string, cantidad: string, motivo?: string) => mov.registrarAjuste(alfa, { productoId: p.id, bodegaId: bod.id, direccion, cantidad, motivo });
    await assert.rejects(ajuste("AUMENTAR", "5"), rechaza);
    await assert.rejects(ajuste("AUMENTAR", "5", "corto"), rechaza);
    await assert.rejects(ajuste("SUBIR", "5", "Conteo físico de inventario"), rechaza);
    await ajuste("AUMENTAR", "5", "Conteo físico: sobrante encontrado");
    assert.equal(await stock(p.id, bod.id), "5.0000");
    await assert.rejects(ajuste("DISMINUIR", "6", "Conteo físico: faltante encontrado"), rechaza);
    const r = await ajuste("DISMINUIR", "2", "Conteo físico: producto dañado");
    assert.deepEqual([r.movimientos[0].tipo, r.movimientos[0].sentido, await stock(p.id, bod.id)], ["AJUSTE", "SALIDA", "3.0000"]);
  });

  it("corrige mediante movimientos compensatorios y conserva la trazabilidad", async () => {
    const p = await nuevaProducto(alfa, "COM-1");
    const [a, b] = [await nuevaBodega(alfa, "COM-A"), await nuevaBodega(alfa, "COM-B")];
    const { movimientos: [entrada] } = await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: a.id, cantidad: "10", motivo: "Entrada por error" });
    await assert.rejects(mov.compensarMovimiento(alfa, entrada.id, "corto"), rechaza);
    const c = await mov.compensarMovimiento(alfa, entrada.id, "Entrada registrada por error de digitación");
    assert.deepEqual([c.movimientos[0].tipo, c.movimientos[0].sentido, c.movimientos[0].compensaDeId === entrada.id, await stock(p.id, a.id)], ["COMPENSACION", "SALIDA", true, "0.0000"]);
    const original = await db.movimientoInventario.findUniqueOrThrow({ where: { id: entrada.id } });
    assert.equal(original.cantidad.toFixed(4), "10.0000"); // el original no se modificó
    await assert.rejects(mov.compensarMovimiento(alfa, entrada.id, "Segundo intento de compensación"), rechaza); // ya compensado
    await assert.rejects(mov.compensarMovimiento(alfa, c.movimientos[0].id, "Compensar la compensación"), rechaza);
    const doble = await Promise.allSettled([mov.compensarMovimiento(alfa, (await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: a.id, cantidad: "3", motivo: "Otra entrada" })).movimientos[0].id, "Compensación simultánea uno"),
      Promise.resolve()]);
    assert.equal(doble[0].status, "fulfilled");

    // Transferencia: se compensa completa (ambas patas).
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: a.id, cantidad: "6", motivo: "Saldo" });
    const t = await mov.registrarTransferencia(alfa, { productoId: p.id, origenId: a.id, destinoId: b.id, cantidad: "4", motivo: "Traslado equivocado" });
    const ct = await mov.compensarMovimiento(alfa, t.movimientos[0].id, "Traslado equivocado: se revierte completo");
    assert.equal(ct.movimientos.length, 2);
    assert.deepEqual([await stock(p.id, a.id), await stock(p.id, b.id)], ["6.0000", "0.0000"]);
    await assert.rejects(mov.compensarMovimiento(alfa, t.movimientos[1].id, "Compensar la otra pata también"), rechaza);

    // Si el saldo ya se consumió, la compensación se rechaza sin cambios parciales.
    const { movimientos: [e2] } = await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: b.id, cantidad: "5", motivo: "Entrada" });
    await mov.registrarSalida(alfa, { productoId: p.id, bodegaId: b.id, cantidad: "4", motivo: "Venta" });
    await assert.rejects(mov.compensarMovimiento(alfa, e2.id, "Entrada que ya fue consumida"), rechaza);
    assert.equal(await stock(p.id, b.id), "1.0000");
  });

  it("los movimientos son inmutables y la base rechaza saldos o cantidades inválidas", async () => {
    const p = await nuevaProducto(alfa, "INM-1");
    const bod = await nuevaBodega(alfa, "INM-B");
    const { movimientos: [m] } = await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "8", motivo: "Saldo inicial" });
    await assert.rejects(db.movimientoInventario.update({ where: { id: m.id }, data: { cantidad: "9" } }), fk);
    await assert.rejects(db.movimientoInventario.delete({ where: { id: m.id } }), fk);
    await assert.rejects(db.$executeRaw`DELETE FROM movimientos_inventario WHERE id = ${m.id}::uuid`, fk);
    await assert.rejects(db.$executeRaw`UPDATE existencias SET cantidad = -1 WHERE producto_id = ${p.id}::uuid`, fk);
    const base = { empresaId: e.alfaId, productoId: p.id, bodegaId: bod.id, tipo: "ENTRADA", sentido: "ENTRADA", saldoPosterior: "1", usuarioId: alfa.usuarioId } as const;
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, cantidad: "0" } }), fk);
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, cantidad: "-2" } }), fk);
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, tipo: "AJUSTE", cantidad: "1", motivo: "corto" } }), fk);
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, tipo: "SALIDA", sentido: "SALIDA", cantidad: "1" } }), fk);
    assert.equal((await db.movimientoInventario.findUniqueOrThrow({ where: { id: m.id } })).cantidad.toFixed(4), "8.0000");
  });

  it("mantiene los saldos consistentes con el historial de movimientos", async () => {
    const pares = await db.existenciaInventario.findMany({ where: { empresaId: e.alfaId } });
    assert.ok(pares.length > 5);
    for (const par of pares) {
      const movs = await db.movimientoInventario.findMany({ where: { productoId: par.productoId, bodegaId: par.bodegaId }, orderBy: [{ creadoEn: "asc" }, { id: "asc" }] });
      const neto = movs.reduce((s, m) => (m.sentido === "ENTRADA" ? s.plus(m.cantidad) : s.minus(m.cantidad)), dec(0));
      assert.equal(par.cantidad.toFixed(4), neto.toFixed(4), `saldo ≠ historial en ${par.productoId}/${par.bodegaId}`);
      assert.ok(par.cantidad.gte(0));
    }
    // Cada movimiento refleja el saldo resultante en el momento en que se confirmó.
    const ult = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT DISTINCT ON (producto_id, bodega_id) producto_id, bodega_id, saldo_posterior FROM movimientos_inventario
        WHERE empresa_id = ${e.alfaId}::uuid ORDER BY producto_id, bodega_id, creado_en DESC, id DESC
      ) u JOIN existencias x USING (producto_id, bodega_id) WHERE u.saldo_posterior <> x.cantidad`;
    assert.equal(ult[0].n, 0);
  });

  // ------------------------------------------------------------------ consultas, alertas y aislamiento
  it("calcula existencias, alertas de stock mínimo y movimientos filtrables", async () => {
    const p = await nuevaProducto(alfa, "ALE-1", { stockMinimo: "10" });
    const sin = await nuevaProducto(alfa, "ALE-2");
    const bod = await nuevaBodega(alfa, "ALE-B");
    const bod2 = await nuevaBodega(alfa, "ALE-C");
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "8", motivo: "Saldo" });
    await mov.registrarEntrada(alfa, { productoId: p.id, bodegaId: bod2.id, cantidad: "4", motivo: "Saldo" });
    const todas = await consultas.listarExistencias(alfa);
    const fp = todas.find((x) => x.sku === "ALE-1")!;
    assert.deepEqual([fp.total.toFixed(4), fp.estado, fp.bodegas.length], ["12.0000", "OK", 2]);
    await mov.registrarSalida(alfa, { productoId: p.id, bodegaId: bod.id, cantidad: "3", motivo: "Venta" });
    assert.equal((await consultas.listarExistencias(alfa)).find((x) => x.sku === "ALE-1")!.estado, "BAJO_MINIMO"); // 9 ≤ 10
    assert.ok((await consultas.listarExistencias(alfa, { estado: "sin_stock" })).some((x) => x.sku === sin.sku));
    assert.ok((await consultas.listarExistencias(alfa, { estado: "bajo_minimo" })).every((x) => x.estado === "BAJO_MINIMO"));
    const soloBod2 = (await consultas.listarExistencias(alfa, { bodegaId: bod2.id })).find((x) => x.sku === "ALE-1")!;
    assert.equal(soloBod2.total.toFixed(4), "4.0000");
    const movs = await consultas.listarMovimientos(alfa, { productoId: p.id });
    assert.equal(movs.filas.length, 3);
    assert.deepEqual((await consultas.listarMovimientos(alfa, { tipo: "SALIDA", productoId: p.id })).filas.map((m) => m.cantidad.toFixed(4)), ["3.0000"]);
    assert.equal((await consultas.listarMovimientos(alfa, { productoId: p.id, desde: "2999-01-01" })).filas.length, 0);
    const r = await consultas.resumenInventario(alfa);
    assert.ok(r.bajoMinimo.some((x) => x.sku === "ALE-1") && r.sinStock.some((x) => x.sku === "ALE-2") && r.movimientos30 > 0);
  });

  it("aísla inventarios entre empresas en servicios y en la base de datos", async () => {
    const pA = await nuevaProducto(alfa, "ISO-A");
    const bA = await nuevaBodega(alfa, "ISO-A");
    const pB = await nuevaProducto(beta, "ISO-B");
    const bB = await nuevaBodega(beta, "ISO-B");
    await mov.registrarEntrada(alfa, { productoId: pA.id, bodegaId: bA.id, cantidad: "9", motivo: "Saldo" });
    // Beta no puede operar con productos ni bodegas de Alfa, ni al revés.
    await assert.rejects(mov.registrarEntrada(beta, { productoId: pA.id, bodegaId: bB.id, cantidad: "1", motivo: "Intruso" }), rechaza);
    await assert.rejects(mov.registrarEntrada(beta, { productoId: pB.id, bodegaId: bA.id, cantidad: "1", motivo: "Intruso" }), rechaza);
    await assert.rejects(mov.registrarSalida(beta, { productoId: pA.id, bodegaId: bA.id, cantidad: "1", motivo: "Intruso" }), rechaza);
    await assert.rejects(mov.registrarTransferencia(beta, { productoId: pB.id, origenId: bB.id, destinoId: bA.id, cantidad: "1", motivo: "Intruso" }), rechaza);
    const movA = (await consultas.listarMovimientos(alfa, { productoId: pA.id })).filas[0];
    await assert.rejects(mov.compensarMovimiento(beta, movA.id, "Intento de compensar ajeno"), rechaza);
    assert.equal((await consultas.listarMovimientos(beta, { productoId: pA.id })).filas.length, 0);
    assert.ok((await consultas.listarExistencias(beta)).every((x) => x.sku !== "ISO-A"));
    assert.equal(await stock(pA.id, bA.id), "9.0000");
    // En la base: claves compuestas impiden cruzar empresas aunque se omita el servicio.
    const base = { tipo: "ENTRADA", sentido: "ENTRADA", cantidad: "1", saldoPosterior: "1", usuarioId: beta.usuarioId } as const;
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, empresaId: e.betaId, productoId: pA.id, bodegaId: bB.id } }), fk);
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, empresaId: e.betaId, productoId: pB.id, bodegaId: bA.id } }), fk);
    await assert.rejects(db.existenciaInventario.create({ data: { empresaId: e.betaId, productoId: pA.id, bodegaId: bB.id, cantidad: "1" } }), fk);
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, empresaId: e.betaId, productoId: pB.id, bodegaId: bB.id, operacionId: impA.id } }), fk); // trigger
    const rB = await recibir(beta, impB.id, bB.id, [{ productoId: pB.id, cantidadRecibida: "2" }]);
    await assert.rejects(db.movimientoInventario.create({ data: { ...base, empresaId: e.alfaId, productoId: pA.id, bodegaId: bA.id, usuarioId: alfa.usuarioId, recepcionId: rB.recepcion.id } }), fk);
    assert.equal(await recepciones.obtenerRecepcion(alfa, rB.recepcion.id), null);
    assert.equal((await recepciones.listarRecepciones(alfa)).filas.every((r) => r.operacion.id !== impB.id), true);
  });

  it("aplica los permisos del catálogo: consulta, creación y correcciones restringidas", async () => {
    const permiso = (alias: string, p: "inventarios:consultar" | "inventarios:crear" | "inventarios:editar" | "inventarios:eliminar") => autorizar(e.headers[alias], e.alfaId, p);
    for (const p of ["inventarios:consultar", "inventarios:crear", "inventarios:editar", "inventarios:eliminar"] as const) await permiso("admin-alfa", p);
    await permiso("operador-alfa", "inventarios:crear");
    await permiso("operador-alfa", "inventarios:editar");
    await permiso("consulta-alfa", "inventarios:consultar");
    for (const [alias, p] of [["consulta-alfa", "inventarios:crear"], ["consulta-alfa", "inventarios:editar"], ["operador-alfa", "inventarios:eliminar"], ["consulta-alfa", "inventarios:eliminar"]] as const) {
      await assert.rejects(permiso(alias, p), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "PERMISO_DENEGADO", `${alias} ${p}`);
    }
    await assert.rejects(autorizar(e.headers["admin-beta"], e.alfaId, "inventarios:consultar"), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "SIN_MEMBRESIA");
    await assert.rejects(autorizar(new Headers(), e.alfaId, "inventarios:consultar"), (x: unknown) => x instanceof ErrorAutorizacion && x.codigo === "NO_AUTENTICADO");
  });
});
