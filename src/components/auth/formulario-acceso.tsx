"use client"

import { useActionState } from "react"

import { iniciarSesion, type EstadoFormulario } from "@/lib/auth/acciones"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const estadoInicial: EstadoFormulario = {}

export function FormularioAcceso() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, estadoInicial)

  return (
    <form action={accion} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="correo" className="text-sm font-medium">
          Correo electrónico
        </label>
        <Input id="correo" name="correo" type="email" autoComplete="username" required />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="clave" className="text-sm font-medium">
          Contraseña
        </label>
        <Input id="clave" name="clave" type="password" autoComplete="current-password" required />
      </div>
      {estado.error && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Ingresando…" : "Iniciar sesión"}
      </Button>
    </form>
  )
}
