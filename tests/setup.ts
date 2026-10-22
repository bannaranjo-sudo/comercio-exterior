import os from "node:os";
import path from "node:path";
import "dotenv/config";

// Las pruebas usan una base exclusiva (…_test); nunca la de desarrollo.
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test.");
}
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET ??= "secreto-solo-para-pruebas-0123456789abcdef";

// Aislamiento de las pruebas: nunca usan la clave real de OpenAI ni la configuración de modelos del entorno.
delete process.env.OPENAI_API_KEY;
delete process.env.IA_PRUEBA_REAL_AUTORIZADA;
process.env.OPENAI_MODELOS_PERMITIDOS = "gpt-5-mini,gpt-5,gpt-4.1-mini,gpt-4.1";

// Los documentos de prueba se guardan fuera del proyecto.
process.env.STORAGE_DIR = path.join(os.tmpdir(), "comext-test-storage");
