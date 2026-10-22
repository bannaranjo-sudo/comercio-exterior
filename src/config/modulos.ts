import {
  BarChart3,
  BrainCircuit,
  Boxes,
  Calculator,
  FileText,
  LayoutDashboard,
  Settings,
  Ship,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react"

export type Modulo = {
  nombre: string
  href: string
  descripcion: string
  icono: LucideIcon
  /** Permiso que habilita ver la entrada en el menú (solo comodidad visual: el servidor siempre valida). */
  permiso?: string
}

export type GrupoNavegacion = { titulo: string; items: Modulo[] }

export const grupos: GrupoNavegacion[] = [
  {
    titulo: "Principal",
    items: [
      {
        nombre: "Dashboard",
        href: "/",
        descripcion: "Indicadores generales, operaciones activas, alertas y estadísticas.",
        icono: LayoutDashboard,
      },
      {
        nombre: "Centro de Inteligencia",
        href: "/inteligencia",
        descripcion: "Análisis asistidos, solicitudes, resultados por revisar e historial.",
        icono: BrainCircuit,
        permiso: "inteligencia:consultar",
      },
    ],
  },
  {
    titulo: "Operaciones",
    items: [
      {
        nombre: "Operaciones",
        href: "/operaciones",
        descripcion: "Registro y seguimiento de importaciones y exportaciones, estados y responsables.",
        icono: Ship,
        permiso: "operaciones:consultar",
      },
      {
        nombre: "Logística",
        href: "/logistica",
        descripcion: "Embarques, contenedores y transporte marítimo, aéreo y terrestre.",
        icono: Truck,
        permiso: "logistica:consultar",
      },
      {
        nombre: "Documentos",
        href: "/documentos",
        descripcion: "Archivos asociados a las operaciones, versiones y trazabilidad.",
        icono: FileText,
        permiso: "documentos:consultar",
      },
      {
        nombre: "Costos",
        href: "/costos",
        descripcion: "Gastos estimados y reales, monedas y liquidación de operaciones.",
        icono: Calculator,
        permiso: "costos:consultar",
      },
      {
        nombre: "Inventarios",
        href: "/inventarios",
        descripcion: "Productos, bodegas, entradas, salidas y existencias.",
        icono: Boxes,
        permiso: "inventarios:consultar",
      },
    ],
  },
  {
    titulo: "Gestión y control",
    items: [
      {
        nombre: "Terceros",
        href: "/terceros",
        descripcion: "Proveedores, clientes, agentes de aduanas y transportadoras.",
        icono: Users,
        permiso: "terceros:consultar",
      },
      {
        nombre: "Reportes",
        href: "/reportes",
        descripcion: "Informes operativos, financieros y gerenciales.",
        icono: BarChart3,
        permiso: "reportes:consultar",
      },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      {
        nombre: "Configuración",
        href: "/configuracion",
        descripcion: "Empresa, usuarios y accesos, inteligencia artificial, seguridad y preferencias.",
        icono: Settings,
      },
    ],
  },
]

export const modulos: Modulo[] = grupos.flatMap((g) => g.items)

export function moduloActivo(pathname: string): Modulo {
  return (
    modulos.find((m) => (m.href === "/" ? pathname === "/" : pathname.startsWith(m.href))) ?? modulos[0]
  )
}
