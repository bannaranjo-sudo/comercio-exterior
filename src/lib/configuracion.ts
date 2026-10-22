// Secciones de Configuración y permisos que las habilitan. El menú solo oculta; cada página vuelve a
// validar en el servidor con exigirPermisoEmpresaActiva (nunca se confía en lo que muestra el menú).

export type SeccionConfiguracion = {
  id: "empresa" | "usuarios" | "inteligencia" | "seguridad";
  nombre: string;
  href: string;
  descripcion: string;
  /** Basta con tener UNO de estos permisos; vacío = cualquier miembro de la empresa. */
  requiereAlguno: readonly string[];
};

export const SECCIONES_CONFIGURACION: readonly SeccionConfiguracion[] = [
  {
    id: "empresa",
    nombre: "Empresa",
    href: "/configuracion/empresa",
    descripcion: "Datos de la empresa activa y empresas a las que pertenece.",
    requiereAlguno: [],
  },
  {
    id: "usuarios",
    nombre: "Usuarios y accesos",
    href: "/configuracion/usuarios",
    descripcion: "Usuarios, roles, permisos, invitaciones y membresías.",
    requiereAlguno: ["administracion:consultar"],
  },
  {
    id: "inteligencia",
    nombre: "Inteligencia artificial",
    href: "/configuracion/inteligencia",
    descripcion: "Proveedores, conexión, agentes, modelos asignados y límites.",
    requiereAlguno: ["inteligencia:configurar", "inteligencia:administrar_agentes"],
  },
  {
    id: "seguridad",
    nombre: "Seguridad y preferencias",
    href: "/configuracion/seguridad",
    descripcion: "Su sesión, permisos efectivos y apariencia.",
    requiereAlguno: [],
  },
];

export function puedeVerSeccion(seccion: SeccionConfiguracion, permisos: ReadonlySet<string> | readonly string[]): boolean {
  if (seccion.requiereAlguno.length === 0) return true;
  const conjunto = permisos instanceof Set ? permisos : new Set(permisos);
  return seccion.requiereAlguno.some((p) => conjunto.has(p));
}

export const seccionesVisibles = (permisos: ReadonlySet<string> | readonly string[]) =>
  SECCIONES_CONFIGURACION.filter((s) => puedeVerSeccion(s, permisos));
