import "dotenv/config";

// Las pruebas usan una base exclusiva (…_test); nunca la de desarrollo.
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test.");
}
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET ??= "secreto-solo-para-pruebas-0123456789abcdef";
