import "dotenv/config";

// Datos ficticios de demostración (identificados como DEMO). OPCIONAL y NUNCA automático.
// Solo opera sobre una base cuyo nombre termine en _demo o _test (DEMO_DATABASE_URL o TEST_DATABASE_URL);
// jamás sobre la base de desarrollo/producción. Requiere que la empresa DEMO-0001 ya exista (seed de pruebas).
const url = process.env.DEMO_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!url || !/_(demo|test)$/.test(new URL(url).pathname)) {
  throw new Error("Defina DEMO_DATABASE_URL o TEST_DATABASE_URL apuntando a una base cuyo nombre termine en _demo o _test.");
}
process.env.DATABASE_URL = url;

const { db } = await import("../src/lib/db");
const costos = await import("../src/lib/costos/servicio");
const documentos = await import("../src/lib/documentos/servicio");
const logistica = await import("../src/lib/logistica/servicio");
const operaciones = await import("../src/lib/operaciones/servicio");
const terceros = await import("../src/lib/terceros/servicio");
const { CATALOGO_PERMISOS } = await import("../src/lib/permisos/catalogo");

const empresa = await db.empresa.findUnique({ where: { identificacionFiscal: "DEMO-0001" } });
if (!empresa) throw new Error("No existe la empresa DEMO-0001 en la base de demostración.");
const admin = await db.empresaUsuario.findFirst({
  where: { empresaId: empresa.id, activo: true, rol: { nombre: "Administrador" } },
  include: { rol: true },
});
if (!admin) throw new Error("No hay un administrador activo en DEMO-0001.");
const ctx = {
  usuarioId: admin.usuarioId, empresaId: empresa.id, rolId: admin.rolId, rolNombre: admin.rol.nombre,
  permisos: new Set(CATALOGO_PERMISOS.map((p) => p.codigo)),
};

const existente = await db.tercero.count({ where: { empresaId: empresa.id, identificacionFiscal: { startsWith: "DEMO-" } } });
if (existente > 0) {
  console.log("Los datos de demostración ya existen; no se crea nada nuevo.");
  await db.$disconnect();
  process.exit(0);
}

const crearTercero = (n: string, id: string, roles: string[], pais: string, ambito: string) =>
  terceros.crearTercero(ctx, { razonSocial: `${n} (DEMO)`, identificacionFiscal: `DEMO-${id}`, ambito, roles, pais, ciudad: "Ciudad Demo", correo: `contacto@${id.toLowerCase()}.demo.invalid` });
const prov1 = await crearTercero("Shanghai Machinery Co.", "CN-001", ["PROVEEDOR"], "China", "INTERNACIONAL");
const prov2 = await crearTercero("Hamburg Teile GmbH", "DE-001", ["PROVEEDOR"], "Alemania", "INTERNACIONAL");
const cli1 = await crearTercero("Importadora Andina", "CO-001", ["CLIENTE"], "Colombia", "NACIONAL");
const trans = await crearTercero("Naviera Atlántico", "NAV-001", ["TRANSPORTADOR"], "Panamá", "INTERNACIONAL");

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const base = { paisDestino: "Colombia", incoterm: "FOB", moneda: "USD", modalidad: "MARITIMO", responsableId: ctx.usuarioId };
const crear = (extra: Record<string, unknown>) =>
  operaciones.crearOperacion(ctx, { fechaApertura: dia(-20), ...base, ...extra });
const avanzar = async (id: string, estados: string[]) => { for (const e of estados) await operaciones.cambiarEstadoOperacion(ctx, id, e); };

const op1 = await crear({ tipo: "IMPORTACION", descripcion: "Centro de mecanizado CNC (DEMO)", terceroId: prov1.id, paisOrigen: "China", lugarIncoterm: "Shanghái", valorEstimado: "48500" });
const op2 = await crear({ tipo: "IMPORTACION", descripcion: "Repuestos industriales (DEMO)", terceroId: prov2.id, paisOrigen: "Alemania", lugarIncoterm: "Hamburgo", valorEstimado: "12800", modalidad: "AEREO", moneda: "EUR" });
const op3 = await crear({ tipo: "EXPORTACION", descripcion: "Café especial 20 t (DEMO)", terceroId: cli1.id, paisOrigen: "Colombia", paisDestino: "Estados Unidos", lugarIncoterm: "Cartagena", valorEstimado: "96000" });
const op4 = await crear({ tipo: "IMPORTACION", descripcion: "Insumos químicos (DEMO)", terceroId: prov1.id, paisOrigen: "China", lugarIncoterm: "Ningbó", valorEstimado: "7300", fechaApertura: dia(-60) });
await avanzar(op1.id, ["EN_PREPARACION", "EN_TRANSITO"]);
await avanzar(op2.id, ["EN_PREPARACION"]);
await avanzar(op3.id, ["EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA"]);
await avanzar(op4.id, ["EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA", "FINALIZADA"]);

await logistica.guardarEnvio(ctx, op1.id, { medioTransporte: "MARITIMO", numeroGuia: "BL-DEMO-001", transportadorId: trans.id, puertoOrigen: "Shanghái", puertoDestino: "Cartagena", fechaEstimadaSalida: dia(-12), fechaRealSalida: dia(-11), fechaEstimadaLlegada: dia(14), estadoEnvio: "EN_TRANSITO" });
await logistica.guardarEnvio(ctx, op3.id, { medioTransporte: "MARITIMO", numeroGuia: "BL-DEMO-003", puertoOrigen: "Cartagena", puertoDestino: "Nueva York", fechaEstimadaLlegada: dia(6), estadoEnvio: "EN_PUERTO" });
await logistica.registrarEvento(ctx, op1.id, { tipo: "HITO", titulo: "Zarpe confirmado", fechaEvento: dia(-11) });
await logistica.registrarEvento(ctx, op1.id, { tipo: "NOVEDAD", titulo: "Congestión en puerto de tránsito", fechaEvento: dia(-3), severidad: "MEDIA" });
await logistica.registrarEvento(ctx, op3.id, { tipo: "NOVEDAD", titulo: "Inspección física solicitada", fechaEvento: dia(-1), severidad: "ALTA" });

const costo = (op: { id: string }, categoria: string, concepto: string, valor: string, estado: string, moneda = "USD") =>
  costos.registrarCosto(ctx, op.id, { categoria, concepto, valor, moneda, fecha: dia(-5), estado });
await costo(op1, "VALOR_COMERCIAL", "Factura proveedor", "48500", "REAL");
await costo(op1, "FLETE_INTERNACIONAL", "Flete marítimo", "3200", "ESTIMADO");
await costo(op1, "AGENCIA_ADUANAS", "Honorarios agencia", "2500000", "ESTIMADO", "COP");
await costo(op4, "SEGURO", "Póliza de transporte", "180.50", "REAL");

const pdf = (texto: string) => new File([`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${texto}\ntrailer<</Root 1 0 R>>\n%%EOF\n`], `${texto}.pdf`, { type: "application/pdf" });
await documentos.subirDocumento(ctx, { operacionId: op1.id, tipo: "FACTURA_COMERCIAL" }, pdf("Factura DEMO 001"));
await documentos.subirDocumento(ctx, { operacionId: op1.id, tipo: "LISTA_EMPAQUE" }, pdf("Lista de empaque DEMO 001"));

console.log("Datos de demostración creados en la empresa DEMO-0001 (base de demostración/pruebas).");
await db.$disconnect();
