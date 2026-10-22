/** Detecta un error conocido de Prisma por su código (p. ej. P2002 = violación de unicidad). */
export const esErrorPrisma = (error: unknown, codigo: string): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === codigo;
