import { Suspense } from "react"

import { AppShell } from "@/components/layout/app-shell"
import { obtenerContextoUsuario } from "@/lib/auth/sesion"
import { esEntornoQa } from "@/lib/despliegue/entorno"

async function AdminProtegido({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerContextoUsuario()
  return (
    <>
      <AppShell sesion={sesion}>{children}</AppShell>
      {esEntornoQa(process.env) && (
        <div role="status" className="pointer-events-none fixed bottom-3 right-3 z-50 rounded-md border border-warning-foreground/25 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground shadow-sm">
          Entorno de pruebas · datos ficticios
        </div>
      )}
    </>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminProtegido>{children}</AdminProtegido>
    </Suspense>
  )
}
