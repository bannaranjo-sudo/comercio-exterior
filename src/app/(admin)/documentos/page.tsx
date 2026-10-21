import { ModuloPendiente } from "@/components/modulo-pendiente"
import { modulos } from "@/config/modulos"

const modulo = modulos.find((m) => m.href === "/documentos")!

export const metadata = { title: modulo.nombre + " · Comercio Exterior" }

export default function Page() {
  return <ModuloPendiente modulo={modulo} />
}
