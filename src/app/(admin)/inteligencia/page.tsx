import { AccesoDenegado } from "@/components/acceso-denegado"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { resumenPanel } from "@/lib/inteligencia/servicio"

export const metadata = { title: "Centro de Inteligencia · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const r = await resumenPanel(ctx)

  const indicadores = [
    { titulo: "Agentes activos", valor: r.agentesActivos },
    { titulo: "Proveedores habilitados", valor: r.proveedoresHabilitados },
    { titulo: "Solicitudes en cola", valor: r.ejecucionesPendientes },
    { titulo: "Resultados por aprobar", valor: r.porAprobar },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {indicadores.map(({ titulo, valor }) => (
          <Card key={titulo}>
            <CardHeader>
              <CardDescription>{titulo}</CardDescription>
              <CardTitle className="text-3xl">{valor}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Estado de la integración</CardTitle>
            <Badge variant="secondary">Sin proveedores conectados</Badge>
          </div>
          <CardDescription>
            Esta etapa solo incluye la estructura: agentes, asignación de modelos y trazabilidad.
            No se realizan llamadas a servicios de IA ni se almacenan claves de API.
            {r.ejecucionesTotal > 0 && ` Solicitudes registradas: ${r.ejecucionesTotal}.`}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
