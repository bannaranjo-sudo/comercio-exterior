import { randomBytes } from "node:crypto";

// Generador de PDF de prueba (sin dependencias): páginas con texto seleccionable o sin texto (como un escaneo).

const esc = (s: string) => s.replace(/([\\()])/g, "\\$1");

/** Cada elemento de `paginas` es una lista de líneas de texto; `null` genera una página sin texto (solo un rectángulo). */
export function crearPdf(paginas: (string[] | null)[], opciones: { sal?: string } = {}): Buffer {
  const objetos: string[] = [];
  const nuevo = (contenido: string) => objetos.push(contenido);
  nuevo("<< /Type /Catalog /Pages 2 0 R >>");
  nuevo(""); // 2: Pages
  nuevo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
  const hijos: number[] = [];
  for (const lineas of paginas) {
    const flujo = lineas
      ? `BT /F1 11 Tf 50 750 Td 16 TL ${lineas.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`
      : "0.8 g 50 50 400 300 re f";
    const idContenido = objetos.length + 2;
    hijos.push(objetos.length + 1);
    nuevo(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${idContenido} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    nuevo(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
  }
  objetos[1] = `<< /Type /Pages /Kids [${hijos.map((h) => `${h} 0 R`).join(" ")}] /Count ${hijos.length} >>`;
  let salida = `%PDF-1.4\n% ${opciones.sal ?? randomBytes(6).toString("hex")}\n`;
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(salida.length);
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, "latin1");
}

/** Factura comercial de ejemplo (ficticia) con las etiquetas que reconoce el proveedor simulado. */
export const facturaEjemplo = (o: { cantidad?: string; total?: string; moneda?: string; incoterm?: string } = {}) => [
  "FACTURA COMERCIAL",
  "Proveedor: Shanghai Demo Co Ltd",
  "Comprador: Importadora Demo Alfa SA",
  "Factura No: FC-1001",
  "Fecha de factura: 2026-10-01",
  "Descripcion: Tornillos de acero inoxidable",
  `Cantidad: ${o.cantidad ?? "500"} UND`,
  "Valor unitario: 2.50 USD",
  `Valor total: ${o.total ?? "1250.00"}`,
  `Moneda: ${o.moneda ?? "USD"}`,
  `Incoterm: ${o.incoterm ?? "FOB"}`,
  "Pais de origen: China",
];

export const listaEmpaqueEjemplo = (o: { cantidad?: string } = {}) => [
  "LISTA DE EMPAQUE",
  "Proveedor: Shanghai Demo Co Ltd",
  "Factura No: FC-1001",
  `Cantidad: ${o.cantidad ?? "480"} UND`,
  "Material: acero inoxidable 304",
];
