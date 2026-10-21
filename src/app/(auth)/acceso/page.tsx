import { Ship } from "lucide-react"

import { FormularioAcceso } from "@/components/auth/formulario-acceso"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Acceso · Comercio Exterior" }

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Ship className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Comercio Exterior</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Ingrese con las credenciales asignadas por su administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcceso />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
