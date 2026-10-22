import { Ship } from "lucide-react"
import { Suspense } from "react"

import { Campo, Entrada } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { consultarInvitacion } from "@/lib/auth/activacion"
import { accionActivarCuenta } from "@/lib/auth/activacion-acciones"
import { LARGO_MINIMO_CLAVE } from "@/lib/auth/usuarios"

export const metadata = { title: "Activar cuenta · Comercio Exterior", robots: { index: false } }

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitacion = await consultarInvitacion(token)

  if (!invitacion) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enlace no válido</CardTitle>
          <CardDescription>El enlace de activación no existe, ya fue utilizado o venció. Solicite uno nuevo al administrador de su empresa.</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Defina su contraseña</CardTitle>
        <CardDescription>
          {invitacion.usuario.nombre} · {invitacion.usuario.correo} · {invitacion.empresa}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioAccion accion={accionActivarCuenta} etiqueta="Activar cuenta">
          <input type="hidden" name="token" value={token} />
          <Campo etiqueta={`Contraseña (mínimo ${LARGO_MINIMO_CLAVE} caracteres)`} nombre="clave">
            <Entrada name="clave" type="password" autoComplete="new-password" minLength={LARGO_MINIMO_CLAVE} maxLength={128} required />
          </Campo>
          <Campo etiqueta="Repita la contraseña" nombre="confirmacion">
            <Entrada name="confirmacion" type="password" autoComplete="new-password" minLength={LARGO_MINIMO_CLAVE} maxLength={128} required />
          </Campo>
        </FormularioAccion>
      </CardContent>
    </Card>
  )
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Ship className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Comercio Exterior</span>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Verificando enlace…</p>}>
          <Contenido params={params} />
        </Suspense>
      </div>
    </main>
  )
}
