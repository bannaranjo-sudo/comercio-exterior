import { AlertTriangle, CheckCircle2, FileWarning, PackageCheck, Ship, Truck } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EnlaceBoton, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { datosDashboard } from "@/lib/dashboard/servicio"
import { ETIQUETA_ESTADO_ENVIO, ETIQUETA_ESTADO_OPERACION, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas"
import { formatearFecha } from "@/lib/formato"

export const metadata = { title: "Dashboard · Comercio Exterior" }

const ORDEN_ESTADOS = ["BORRADOR", "EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA", "FINALIZADA", "CANCELADA"] as const

export default async function DashboardPage() {
  const ctx = await exigirPermisoEmpresaActiva("terceros:consultar")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite ver el resumen general." />
  const { operaciones: op, documentos, logistica } = await datosDashboard(ctx)

  const indicadores = op
    ? [
        { titulo: "Total de operaciones", valor: op.total, icono: Ship },
        { titulo: "Importaciones activas", valor: op.importacionesActivas, icono: Truck },
        { titulo: "Exportaciones activas", valor: op.exportacionesActivas, icono: PackageCheck },
        { titulo: "Operaciones finalizadas", valor: op.finalizadas, icono: CheckCircle2 },
      ]
    : []
  const maximo = op ? Math.max(1, ...ORDEN_ESTADOS.map((e) => op.porEstado[e] ?? 0)) : 1

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Dashboard"
        descripcion="Resumen en tiempo real de la empresa activa."
        acciones={
          ctx.permisos.has("operaciones:crear") && <EnlaceBoton href="/operaciones/nueva">Nueva operación</EnlaceBoton>
        }
      />

      {op && op.total === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comience registrando su primera operación</CardTitle>
            <CardDescription>
              Aún no hay operaciones en esta empresa. Registre un proveedor o cliente, cree la importación o exportación y complete su expediente
              con documentos, logística y costos: el dashboard se actualizará con los datos reales.
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {ctx.permisos.has("terceros:crear") && <EnlaceBoton href="/terceros/nuevo" variante="outline">1. Registrar tercero</EnlaceBoton>}
              {ctx.permisos.has("operaciones:crear") && <EnlaceBoton href="/operaciones/nueva">2. Crear operación</EnlaceBoton>}
            </div>
          </CardHeader>
        </Card>
      )}

      {op && (
        <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {indicadores.map(({ titulo, valor, icono: Icono }) => (
            <Card key={titulo}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{titulo}</CardDescription>
                  <Icono className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <CardTitle className="text-3xl tabular-nums">{valor}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {op && (
          <Seccion titulo="Operaciones por estado" descripcion={op.total === 0 ? "Sin operaciones registradas." : `${op.total} operación(es) en total.`}>
            <ul className="space-y-3" aria-label="Operaciones por estado">
              {ORDEN_ESTADOS.map((estado) => {
                const n = op.porEstado[estado] ?? 0
                return (
                  <li key={estado} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{ETIQUETA_ESTADO_OPERACION[estado]}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div className={`h-full rounded-full ${estado === "CANCELADA" ? "bg-destructive" : estado === "FINALIZADA" ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${(n / maximo) * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Seccion>
        )}

        {op && (
          <Seccion
            titulo="Próximas llegadas"
            descripcion={op.atrasadas > 0 ? `${op.atrasadas} envío(s) con llegada estimada vencida.` : "Envíos con llegada estimada próxima."}
            className="lg:col-span-2"
          >
            {op.proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay llegadas programadas. Registre las fechas en la pestaña Logística de cada operación.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Operación</TableHead><TableHead>Tercero</TableHead><TableHead>Llegada estimada</TableHead><TableHead>Envío</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {op.proximas.map((e) => (
                    <TableRow key={e.operacion.id}>
                      <TableCell className="font-medium"><Link href={`/operaciones/${e.operacion.id}/logistica`} className="hover:underline">{e.operacion.numero}</Link></TableCell>
                      <TableCell>{e.operacion.tercero.razonSocial}</TableCell>
                      <TableCell>{formatearFecha(e.fechaEstimadaLlegada)}</TableCell>
                      <TableCell><InsigniaEstado valor={e.estadoEnvio} etiqueta={ETIQUETA_ESTADO_ENVIO[e.estadoEnvio]} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Seccion>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {op && (
          <Seccion titulo="Operaciones recientes" className="lg:col-span-2">
            {op.recientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay operaciones.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Número</TableHead><TableHead>Tipo</TableHead><TableHead>Tercero</TableHead><TableHead>Estado</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {op.recientes.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium"><Link href={`/operaciones/${o.id}`} className="hover:underline">{o.numero}</Link></TableCell>
                      <TableCell><Badge variant="outline">{ETIQUETA_TIPO_OPERACION[o.tipo]}</Badge></TableCell>
                      <TableCell>{o.tercero.razonSocial}</TableCell>
                      <TableCell><InsigniaEstado valor={o.estado} etiqueta={ETIQUETA_ESTADO_OPERACION[o.estado]} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Seccion>
        )}

        <div className="space-y-4">
          {documentos && (
            <Seccion titulo="Documentos pendientes" descripcion="Cargados y aún sin aprobar (operaciones no canceladas).">
              <div className="flex items-center gap-3">
                <FileWarning className="size-5 text-muted-foreground" aria-hidden />
                <span className="text-3xl font-semibold tabular-nums">{documentos.pendientes}</span>
                {documentos.observados > 0 && <Badge variant="destructive">{documentos.observados} observado(s)</Badge>}
              </div>
              <Link href="/documentos?estado=por_revisar" className="mt-3 inline-block text-sm text-primary hover:underline">Ver documentos por revisar</Link>
            </Seccion>
          )}
          {logistica && (
            <Seccion titulo="Incidencias logísticas" descripcion={logistica.abiertas === 0 ? "Sin novedades abiertas." : `${logistica.abiertas} novedad(es) abierta(s).`}>
              {logistica.lista.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {logistica.lista.map((n) => (
                    <li key={n.id} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      <span>
                        <Link href={`/operaciones/${n.operacion.id}/logistica`} className="font-medium hover:underline">{n.operacion.numero}</Link>: {n.titulo}
                        {n.severidad && <span className="text-xs text-muted-foreground"> · {ETIQUETA_SEVERIDAD[n.severidad]}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
          )}
        </div>
      </div>
    </div>
  )
}
