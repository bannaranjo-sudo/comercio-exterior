export type Accion = "consultar" | "crear" | "editar" | "eliminar" | "administrar";

export type NombreRol = "Administrador" | "Operador" | "Consulta";

const CRUD: readonly Accion[] = ["consultar", "crear", "editar", "eliminar"];

/** Acciones disponibles por módulo. */
export const MODULOS: Readonly<Record<string, readonly Accion[]>> = {
  administracion: [...CRUD, "administrar"],
  operaciones: CRUD,
  logistica: CRUD,
  inventarios: CRUD,
  costos: CRUD,
  documentos: CRUD,
  terceros: CRUD,
  reportes: ["consultar", "crear"],
};

export const codigoPermiso = (modulo: string, accion: Accion): string =>
  `${modulo}:${accion}`;

export const CATALOGO_PERMISOS: readonly { codigo: string; descripcion: string }[] =
  Object.entries(MODULOS).flatMap(([modulo, acciones]) =>
    acciones.map((accion) => ({
      codigo: codigoPermiso(modulo, accion),
      descripcion: `${accion} en ${modulo}`,
    })),
  );

const todos = CATALOGO_PERMISOS.map((p) => p.codigo);
const operativos = (acciones: readonly Accion[]) =>
  Object.entries(MODULOS)
    .filter(([modulo]) => modulo !== "administracion")
    .flatMap(([modulo, disponibles]) =>
      disponibles
        .filter((a) => acciones.includes(a))
        .map((a) => codigoPermiso(modulo, a)),
    );

/** Roles iniciales de cada empresa y los permisos que conceden. */
export const ROLES_INICIALES: Readonly<
  Record<NombreRol, { descripcion: string; permisos: readonly string[] }>
> = {
  Administrador: {
    descripcion: "Acceso total a todos los módulos.",
    permisos: todos,
  },
  Operador: {
    descripcion: "Consulta, creación y edición en módulos operativos.",
    permisos: operativos(["consultar", "crear", "editar"]),
  },
  Consulta: {
    descripcion: "Solo lectura en módulos operativos.",
    permisos: operativos(["consultar"]),
  },
};
