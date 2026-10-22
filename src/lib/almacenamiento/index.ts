import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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

/** Directorio privado fuera de /public (STORAGE_DIR; por defecto ./storage, ignorado por Git). */
export const almacenamiento: AlmacenamientoArchivos = new AlmacenamientoLocal(
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage"),
);
