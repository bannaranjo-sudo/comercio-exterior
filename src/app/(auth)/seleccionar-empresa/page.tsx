import { Building2 } from "lucide-react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { cerrarSesion, seleccionarEmpresa } from "@/lib/auth/acciones"
import { listarMembresias, usuarioIdDeSesion } from "@/lib/auth/autorizacion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Seleccionar empresa · Comercio Exterior" }

async function ListaEmpresas() {
  const usuarioId = await usuarioIdDeSesion(await headers()).catch(() => null)
  if (!usuarioId) redirect("/acceso")
  const membresias = await listarMembresias(usuarioId)

  if (membresias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Su usuario no tiene empresas asignadas. Contacte al administrador.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {membresias.map(({ empresaId, empresa, rol }) => (
        <li key={empresaId}>
          <form action={seleccionarEmpresa}>
            <input type="hidden" name="empresaId" value={empresaId} />
            <Button type="submit" variant="outline" size="lg" className="h-auto w-full justify-start gap-3 py-2.5 text-left">
              <Building2 className="size-4 text-primary" aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">{empresa.razonSocial}</span>
                <span className="text-xs text-muted-foreground">{rol.nombre}</span>
              </span>
            </Button>
          </form>
        </li>
      ))}
    </ul>
  )
}

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Seleccione una empresa</CardTitle>
          <CardDescription>Solo se muestran las empresas a las que pertenece.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
            <ListaEmpresas />
          </Suspense>
          <form action={cerrarSesion}>
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
