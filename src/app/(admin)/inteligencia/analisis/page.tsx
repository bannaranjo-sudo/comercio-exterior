import { AccesoDenegado } from "@/components/acceso-denegado"
import { claseCampo } from "@/components/inteligencia/estilos"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionSolicitarEjecucion } from "@/lib/inteligencia/acciones"
import { listarAgentes } from "@/lib/inteligencia/servicio"

export const metadata = { title: "Análisis · Comercio Exterior" }

const tipos = [
  { nombre: "Análisis documental", detalle: "Revisión de facturas, certificados y documentos de embarque." },
  { nombre: "Análisis arancelario", detalle: "Clasificación arancelaria y gravámenes." },
  { nombre: "Análisis financiero", detalle: "Costos, márgenes y liquidación de operaciones." },
]

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const puedeEjecutar = ctx.permisos.has("inteligencia:ejecutar")
  const agentes = (await listarAgentes(ctx)).filter((a) => a.activo)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {tipos.map(({ nombre, detalle }) => (
          <Card key={nombre}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{nombre}</CardTitle>
                <Badge variant="secondary">Próximamente</Badge>
              </div>
              <CardDescription>{detalle}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registrar solicitud</CardTitle>
          <CardDescription>
            Las solicitudes quedan en cola con su trazabilidad. Aún no se procesan: no hay proveedores conectados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!puedeEjecutar ? (
            <p className="text-sm text-muted-foreground">Su rol no permite solicitar análisis.</p>
          ) : agentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay agentes activos. Configúrelos en la sección Agentes.</p>
          ) : (
            <FormularioAccion accion={accionSolicitarEjecucion} etiqueta="Registrar solicitud">
              <select name="agenteId" aria-label="Agente" className={claseCampo} required>
                {agentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <textarea
                name="descripcion"
                aria-label="Descripción de la solicitud"
                placeholder="Describa el análisis requerido (sin datos sensibles)"
                maxLength={2000}
                rows={3}
                className={`${claseCampo} h-auto py-1.5`}
                required
              />
            </FormularioAccion>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
