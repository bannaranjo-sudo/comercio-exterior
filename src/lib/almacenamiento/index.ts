import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

/**
 * Contrato de almacenamiento privado de archivos. La implementación local sirve para el MVP;
 * se sustituye por almacenamiento externo (S3, Azure Blob…) implementando esta misma interfaz.
 */
export interface AlmacenamientoArchivos {
  guardar(clave: string, contenido: Buffer): Promise<void>;
  leer(clave: string): Promise<Buffer>;
  /** Solo para compensar una carga cuyo registro en base de datos falló. */
  eliminar(clave: string): Promise<void>;
}

// Solo claves generadas por el sistema: <empresa>/<operacion>/<archivo>.pdf (UUID); impide recorrer rutas.
const CLAVE_VALIDA = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

export class AlmacenamientoLocal implements AlmacenamientoArchivos {
  constructor(private readonly raiz: string) {}

  private ruta(clave: string): string {
    if (!CLAVE_VALIDA.test(clave)) throw new Error("Clave de almacenamiento no válida.");
    const ruta = path.resolve(this.raiz, clave);
    if (!ruta.startsWith(path.resolve(this.raiz) + path.sep)) throw new Error("Clave de almacenamiento no válida.");
    return ruta;
  }

  async guardar(clave: string, contenido: Buffer): Promise<void> {
    const ruta = this.ruta(clave);
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido, { flag: "wx" });
  }

  async leer(clave: string): Promise<Buffer> {
    return readFile(this.ruta(clave));
  }

  async eliminar(clave: string): Promise<void> {
    return rm(this.ruta(clave), { force: true });
  }
}

/**
 * Almacenamiento privado en PostgreSQL (tabla archivos_almacenados) para despliegues sin disco persistente (Vercel).
 * Misma clave y mismas validaciones que el almacenamiento local; el archivo solo se entrega por la ruta autenticada.
 */
export class AlmacenamientoPostgres implements AlmacenamientoArchivos {
  private validar(clave: string): string {
    if (!CLAVE_VALIDA.test(clave)) throw new Error("Clave de almacenamiento no válida.");
    return clave.split("/")[0];
  }

  async guardar(clave: string, contenido: Buffer): Promise<void> {
    const empresaId = this.validar(clave);
    await db.archivoAlmacenado.create({ data: { clave, empresaId, contenido: new Uint8Array(contenido), tamanoBytes: contenido.length } });
  }

  async leer(clave: string): Promise<Buffer> {
    this.validar(clave);
    const fila = await db.archivoAlmacenado.findUnique({ where: { clave } });
    if (!fila) throw new Error("Archivo no encontrado.");
    return Buffer.from(fila.contenido);
  }

  async eliminar(clave: string): Promise<void> {
    this.validar(clave);
    await db.archivoAlmacenado.deleteMany({ where: { clave } });
  }
}

export type EntornoAlmacenamiento = Record<string, string | undefined>;

/** Elige el proveedor: local (desarrollo, por defecto) o postgres. En Vercel el disco es efímero: el modo local se rechaza. */
export function crearAlmacenamiento(env: EntornoAlmacenamiento, cwd: string = process.cwd()): AlmacenamientoArchivos {
  const driver = (env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver === "postgres") return new AlmacenamientoPostgres();
  if (driver !== "local") throw new Error("STORAGE_DRIVER no válido (use 'local' o 'postgres').");
  if (env.VERCEL) throw new Error("En Vercel el disco no es persistente: defina STORAGE_DRIVER=postgres.");
  return new AlmacenamientoLocal(env.STORAGE_DIR ?? path.join(cwd, "storage"));
}

let instancia: AlmacenamientoArchivos | undefined;
const actual = (): AlmacenamientoArchivos => (instancia ??= crearAlmacenamiento(process.env));

/** Proveedor activo (se resuelve en el primer uso, no al compilar). Directorio local: STORAGE_DIR, por defecto ./storage (ignorado por Git). */
export const almacenamiento: AlmacenamientoArchivos = {
  guardar: (clave, contenido) => actual().guardar(clave, contenido),
  leer: (clave) => actual().leer(clave),
  eliminar: (clave) => actual().eliminar(clave),
};
