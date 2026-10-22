import { ArrowRight, BrainCircuit, Building2, ShieldCheck, Users, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { exigirMembresiaEmpresaActiva } from "@/lib/auth/sesion"
import { seccionesVisibles, type SeccionConfiguracion } from "@/lib/configuracion"

export const metadata = { title: "Configuración · Comercio Exterior" }

const ICONO: Record<SeccionConfiguracion["id"], { icono: LucideIcon; clase: string }> = {
  empresa: { icono: Building2, clase: "bg-info-soft text-info-foreground" },
  usuarios: { icono: Users, clase: "bg-success-soft text-success-foreground" },
  inteligencia: { icono: BrainCircuit, clase: "bg-warning-soft text-warning-foreground" },
  seguridad: { icono: ShieldCheck, clase: "bg-neutral-soft text-neutral-foreground" },
}

export default async function Page() {
  const ctx = await exigirMembresiaEmpresaActiva()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {seccionesVisibles(ctx.permisos).map((s) => {
        const { icono: Icono, clase } = ICONO[s.id]
        return (
          <Link key={s.id} href={s.href} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-start gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${clase}`}>
                  <Icono className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{s.nombre}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.descripcion}</p>
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
