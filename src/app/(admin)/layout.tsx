import { Suspense } from "react"

import { AppShell } from "@/components/layout/app-shell"
import { obtenerContextoUsuario } from "@/lib/auth/sesion"

async function AdminProtegido({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerContextoUsuario()
  return <AppShell sesion={sesion}>{children}</AppShell>
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminProtegido>{children}</AdminProtegido>
    </Suspense>
  )
}
