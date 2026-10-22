import { AccesoDenegado } from "@/components/acceso-denegado"
import { ModuloPendiente } from "@/components/modulo-pendiente"
import { modulos } from "@/config/modulos"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"

const modulo = modulos.find((m) => m.href === "/inventarios")!

export const metadata = { title: modulo.nombre + " · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  return <ModuloPendiente modulo={modulo} />
}
