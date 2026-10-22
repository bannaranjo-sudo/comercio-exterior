import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function crearCliente(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida.");
  }
  // En serverless cada instancia abre pocas conexiones (DB_POOL_MAX); use la URL con pooler del proveedor.
  const max = Number(process.env.DB_POOL_MAX);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(Number.isInteger(max) && max > 0 ? { max } : {}) }) });
}

export const db: PrismaClient = globalForPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
