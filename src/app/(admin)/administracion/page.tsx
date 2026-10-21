import { ModuloPendiente } from "@/components/modulo-pendiente"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { modulos } from "@/config/modulos"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"

const modulo = modulos.find((m) => m.href === "/administracion")!

export const metadata = { title: modulo.nombre + " · Comercio Exterior" }

export default async function Page() {
  const acceso = await exigirPermisoEmpresaActiva("administracion:consultar")
  if (!acceso) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Acceso denegado</CardTitle>
          <CardDescription>No tiene permiso para consultar la administración de esta empresa.</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <ModuloPendiente modulo={modulo} />
}
