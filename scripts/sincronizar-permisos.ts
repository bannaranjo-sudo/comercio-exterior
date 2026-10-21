import "dotenv/config";
import { db } from "../src/lib/db";
import { CATALOGO_PERMISOS, ROLES_INICIALES } from "../src/lib/permisos/catalogo";

// Sincronización ADITIVA del catálogo: crea únicamente los permisos que aún no existen y los
// vincula a los roles estándar de cada empresa. No modifica ni elimina empresas, usuarios,
// roles, permisos ni vínculos existentes, y no toca datos de demostración.
async function main(): Promise<void> {
  const existentes = new Set((await db.permiso.findMany({ select: { codigo: true } })).map((p) => p.codigo));
  const nuevos = CATALOGO_PERMISOS.filter((p) => !existentes.has(p.codigo));
  if (nuevos.length === 0) {
    console.log("Catálogo al día: no hay permisos nuevos.");
    return;
  }
  await db.permiso.createMany({ data: nuevos, skipDuplicates: true });
  const ids = new Map(
    (await db.permiso.findMany({ where: { codigo: { in: nuevos.map((p) => p.codigo) } } })).map((p) => [p.codigo, p.id]),
  );

  let vinculos = 0;
  for (const rol of await db.rol.findMany({ where: { nombre: { in: Object.keys(ROLES_INICIALES) } } })) {
    const definicion = ROLES_INICIALES[rol.nombre as keyof typeof ROLES_INICIALES];
    const data = nuevos
      .filter((p) => definicion.permisos.includes(p.codigo))
      .map((p) => ({ rolId: rol.id, permisoId: ids.get(p.codigo)! }));
    vinculos += (await db.rolPermiso.createMany({ data, skipDuplicates: true })).count;
  }
  console.log(`Permisos nuevos: ${nuevos.length}. Vínculos a roles agregados: ${vinculos}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
