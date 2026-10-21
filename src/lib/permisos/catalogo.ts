export type Accion = "consultar" | "crear" | "editar" | "eliminar" | "administrar";

export type NombreRol = "Administrador" | "Operador" | "Consulta";

const CRUD = ["consultar", "crear", "editar", "eliminar"] as const;

/** Acciones disponibles por módulo. */
export const MODULOS = {
  administracion: [...CRUD, "administrar"],
  operaciones: CRUD,
  logistica: CRUD,
  inventarios: CRUD,
  costos: CRUD,
  documentos: CRUD,
  terceros: CRUD,
  reportes: ["consultar", "crear"],
} as const satisfies Record<string, readonly Accion[]>;

export type ModuloId = keyof typeof MODULOS;

/** Código de permiso válido, p. ej. "operaciones:crear". */
export type CodigoPermiso = {
  [M in ModuloId]: `${M}:${(typeof MODULOS)[M][number]}`;
}[ModuloId];

const ENTRADAS = Object.entries(MODULOS) as [string, readonly Accion[]][];

export const codigoPermiso = (modulo: string, accion: Accion): string =>
  `${modulo}:${accion}`;

export const CATALOGO_PERMISOS: readonly { codigo: string; descripcion: string }[] =
  ENTRADAS.flatMap(([modulo, acciones]) =>
    acciones.map((accion) => ({
      codigo: codigoPermiso(modulo, accion),
      descripcion: `${accion} en ${modulo}`,
    })),
  );

const todos = CATALOGO_PERMISOS.map((p) => p.codigo);
const operativos = (acciones: readonly Accion[]) =>
  ENTRADAS.filter(([modulo]) => modulo !== "administracion")
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
