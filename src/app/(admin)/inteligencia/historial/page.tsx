import { AccesoDenegado } from "@/components/acceso-denegado"
import { claseCampo } from "@/components/inteligencia/estilos"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionDecidirAprobacion } from "@/lib/inteligencia/acciones"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { listarEjecuciones } from "@/lib/inteligencia/servicio"

export const metadata = { title: "Historial · Comercio Exterior" }

const estados = {
  PENDIENTE: "En cola",
  EN_CURSO: "En curso",
  COMPLETADA: "Completada",
  FALLIDA: "Fallida",
  CANCELADA: "Cancelada",
} as const

const fecha = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" })

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const puedeAprobar = ctx.permisos.has("inteligencia:aprobar")
  const ejecuciones = await listarEjecuciones(ctx)

  if (ejecuciones.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin actividad</CardTitle>
          <CardDescription>Aún no hay solicitudes ni resultados registrados para esta empresa.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ejecuciones.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{fecha.format(e.creadoEn)}</TableCell>
                  <TableCell>{e.agente.nombre}</TableCell>
                  <TableCell>{e.solicitadaPor.nombre}</TableCell>
                  <TableCell>{e.proveedor && e.modelo ? `${PROVEEDORES[e.proveedor].nombre} · ${e.modelo}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={e.estado === "FALLIDA" ? "destructive" : "secondary"}>{estados[e.estado]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {ejecuciones.flatMap((e) =>
        e.resultados.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{r.titulo}</CardTitle>
                <Badge variant="outline">{r.aprobacion?.estado ?? "PENDIENTE"}</Badge>
              </div>
              <CardDescription>
                {e.agente.nombre} · {fecha.format(r.creadoEn)}
              </CardDescription>
            </CardHeader>
            {puedeAprobar && r.aprobacion?.estado === "PENDIENTE" && (
              <CardContent className="space-y-3">
                {(["APROBADO", "RECHAZADO"] as const).map((decision) => (
                  <FormularioAccion
                    key={decision}
                    accion={accionDecidirAprobacion}
                    etiqueta={decision === "APROBADO" ? "Aprobar" : "Rechazar"}
                    variante={decision === "APROBADO" ? "default" : "outline"}
                  >
                    <input type="hidden" name="aprobacionId" value={r.aprobacion!.id} />
                    <input type="hidden" name="decision" value={decision} />
                    <input name="comentario" aria-label="Comentario" placeholder="Comentario (opcional)" maxLength={500} className={claseCampo} />
                  </FormularioAccion>
                ))}
              </CardContent>
            )}
          </Card>
        )),
      )}
    </div>
  )
}
