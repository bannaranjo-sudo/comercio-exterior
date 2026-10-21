import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Modulo } from "@/config/modulos"

export function ModuloPendiente({ modulo }: { modulo: Modulo }) {
  const Icono = modulo.icono
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{modulo.nombre}</h1>
        <p className="mt-1 text-muted-foreground">{modulo.descripcion}</p>
      </div>
      <Card>
        <CardHeader>
          <Icono className="mb-2 size-6 text-primary" aria-hidden />
          <div className="flex items-center gap-2">
            <CardTitle>Módulo en desarrollo</CardTitle>
            <Badge variant="secondary">Próximamente</Badge>
          </div>
          <CardDescription>
            Esta sección aún no tiene funcionalidades. Se implementará en una etapa posterior.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
