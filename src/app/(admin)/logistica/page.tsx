import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EstadoVacio, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_ESTADO_ENVIO, ETIQUETA_MODALIDAD, ETIQUETA_SEVERIDAD } from "@/lib/etiquetas"
import { formatearFecha } from "@/lib/formato"
import { listarEnvios, listarNovedadesAbiertas } from "@/lib/logistica/servicio"

export const metadata = { title: "Logística · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("logistica:consultar")
  if (!ctx) return <AccesoDenegado />
  const [envios, novedades] = await Promise.all([listarEnvios(ctx), listarNovedadesAbiertas(ctx)])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina titulo="Logística" descripcion="Envíos en curso y novedades abiertas de todas las operaciones. El detalle se registra en cada operación." />

      <Seccion titulo="Novedades abiertas" descripcion={novedades.length === 0 ? "No hay incidencias logísticas abiertas." : `${novedades.length} novedad(es) pendiente(s) de resolver.`}>
        {novedades.length > 0 && (
          <ul className="space-y-2 text-sm">
            {novedades.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2">
                {n.severidad && <InsigniaEstado valor={n.severidad} etiqueta={ETIQUETA_SEVERIDAD[n.severidad]} />}
                <Link href={`/operaciones/${n.operacion.id}/logistica`} className="font-medium hover:underline">{n.operacion.numero}</Link>
                <span>{n.titulo}</span>
                <span className="text-xs text-muted-foreground">{formatearFecha(n.fechaEvento)}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {envios.length === 0 ? (
        <EstadoVacio titulo="Sin envíos en seguimiento" descripcion="Registre los datos de transporte en la pestaña Logística de una operación activa." />
      ) : (
        <Seccion titulo="Envíos en curso">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operación</TableHead>
                  <TableHead className="hidden md:table-cell">Medio / guía</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Llegada estimada</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {envios.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link href={`/operaciones/${e.operacion.id}/logistica`} className="hover:underline">{e.operacion.numero}</Link>
                      <span className="block text-xs text-muted-foreground">{e.operacion.tercero.razonSocial}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {e.medioTransporte ? <Badge variant="outline">{ETIQUETA_MODALIDAD[e.medioTransporte]}</Badge> : "—"} {e.numeroGuia}
                    </TableCell>
                    <TableCell>{[e.puertoOrigen, e.puertoDestino].filter(Boolean).join(" → ") || "—"}</TableCell>
                    <TableCell>{formatearFecha(e.fechaEstimadaLlegada)}</TableCell>
                    <TableCell><InsigniaEstado valor={e.estadoEnvio} etiqueta={ETIQUETA_ESTADO_ENVIO[e.estadoEnvio]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Seccion>
      )}
    </div>
  )
}
