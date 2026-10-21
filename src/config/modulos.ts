import {
  BarChart3,
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
}

export const modulos: Modulo[] = [
  {
    nombre: "Dashboard",
    href: "/",
    descripcion: "Indicadores generales, operaciones activas, alertas y estadísticas.",
    icono: LayoutDashboard,
  },
  {
    nombre: "Operaciones",
    href: "/operaciones",
    descripcion: "Registro y seguimiento de importaciones y exportaciones, estados y responsables.",
    icono: Ship,
  },
  {
    nombre: "Logística",
    href: "/logistica",
    descripcion: "Embarques, contenedores y transporte marítimo, aéreo y terrestre.",
    icono: Truck,
  },
  {
    nombre: "Inventarios",
    href: "/inventarios",
    descripcion: "Productos, bodegas, entradas, salidas y existencias.",
    icono: Boxes,
  },
  {
    nombre: "Costos",
    href: "/costos",
    descripcion: "Gastos estimados y reales, monedas y liquidación de operaciones.",
    icono: Calculator,
  },
  {
    nombre: "Documentos",
    href: "/documentos",
    descripcion: "Archivos asociados a las operaciones, versiones y trazabilidad.",
    icono: FileText,
  },
  {
    nombre: "Terceros",
    href: "/terceros",
    descripcion: "Proveedores, clientes, agentes de aduanas y transportadoras.",
    icono: Users,
  },
  {
    nombre: "Reportes",
    href: "/reportes",
    descripcion: "Informes operativos, financieros y gerenciales.",
    icono: BarChart3,
  },
  {
    nombre: "Administración",
    href: "/administracion",
    descripcion: "Empresas, usuarios, roles, permisos y configuración.",
    icono: Settings,
  },
]

export function moduloActivo(pathname: string): Modulo {
  return (
    modulos.find((m) =>
      m.href === "/" ? pathname === "/" : pathname.startsWith(m.href),
    ) ?? modulos[0]
  )
}
