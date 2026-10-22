import { AlertTriangle, BrainCircuit, CheckCircle2, FileWarning, PackageCheck, Plus, Ship, Truck, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina, EnlaceBoton, InsigniaEstado, Seccion, TarjetaKpi, type Tono } from "@/components/comun/comunes"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { datosDashboard } from "@/lib/dashboard/servicio"
import { ETIQUETA_ESTADO_ENVIO, ETIQUETA_ESTADO_OPERACION, ETIQUETA_SEVERIDAD, ETIQUETA_TIPO_OPERACION } from "@/lib/etiquetas"
import { formatearFecha } from "@/lib/formato"
import { contarPorRevisar } from "@/lib/inteligencia/vistas"
import { cn } from "@/lib/utils"

export const metadata = { title: "Dashboard · Comercio Exterior" }

const ORDEN_ESTADOS = ["BORRADOR", "EN_PREPARACION", "EN_TRANSITO", "EN_ADUANA", "FINALIZADA", "CANCELADA"] as const
const COLOR_ESTADO: Record<(typeof ORDEN_ESTADOS)[number], string> = {
  BORRADOR: "bg-slate-400",
  EN_PREPARACION: "bg-sky-400",
  EN_TRANSITO: "bg-primary",
  EN_ADUANA: "bg-warning",
  FINALIZADA: "bg-success",
  CANCELADA: "bg-slate-600 dark:bg-slate-500",
}

type Atencion = { clave: string; icono: LucideIcon; tono: Tono; titulo: string; detalle: string; href: string }

export default async function DashboardPage() {
  const ctx = await exigirPermisoEmpresaActiva("terceros:consultar")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite ver el resumen general." />
  const [{ operaciones: op, documentos, logistica }, porRevisarIA] = await Promise.all([
    datosDashboard(ctx),
    ctx.permisos.has("inteligencia:consultar") ? contarPorRevisar(ctx) : Promise.resolve(0),
  ])

  const atencion: Atencion[] = []
  if (op && op.atrasadas > 0)
    atencion.push({ clave: "atrasadas", icono: Truck, tono: "danger", titulo: `${op.atrasadas} envío(s) con llegada vencida`, detalle: "La fecha estimada ya pasó y no hay llegada real.", href: "/logistica" })
  if (documentos && documentos.observados > 0)
    atencion.push({ clave: "observados", icono: FileWarning, tono: "warning", titulo: `${documentos.observados} documento(s) observado(s)`, detalle: "Requieren corrección del proveedor o del equipo.", href: "/documentos?estado=OBSERVADO" })
  if (documentos && documentos.pendientes > 0)
    atencion.push({ clave: "docs", icono: FileWarning, tono: "primary", titulo: `${documentos.pendientes} documento(s) sin aprobar`, detalle: "Cargados y pendientes de revisión.", href: "/documentos?estado=por_revisar" })
  if (logistica && logistica.abiertas > 0)
    atencion.push({ clave: "incidencias", icono: AlertTriangle, tono: "warning", titulo: `${logistica.abiertas} incidencia(s) logística(s) abierta(s)`, detalle: "Novedades sin resolver en operaciones activas.", href: "/logistica" })
  if (porRevisarIA > 0)
    atencion.push({ clave: "ia", icono: BrainCircuit, tono: "primary", titulo: `${porRevisarIA} resultado(s) de IA por revisar`, detalle: "Esperan la decisión de una persona.", href: "/inteligencia/por-revisar" })

  const activas = op ? op.importacionesActivas + op.exportacionesActivas : 0
  const total = op?.total ?? 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Dashboard"
        descripcion="Qué está pasando, qué está pendiente y qué requiere atención en la empresa activa."
        acciones={
          <>
            {ctx.permisos.has("terceros:crear") && <EnlaceBoton href="/terceros/nuevo" variante="outline">Nuevo tercero</EnlaceBoton>}
            {ctx.permisos.has("operaciones:crear") && (
              <EnlaceBoton href="/operaciones/nueva">
                <Plus className="size-4" aria-hidden /> Nueva operación
              </EnlaceBoton>
            )}
          </>
        }
      />

      {op && total === 0 && (
        <Card className="border-primary/30 bg-info-soft/40">
          <CardContent className="flex flex-wrap items-center gap-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Ship className="size-5" aria-hidden />
            </span>
            <div className="min-w-60 flex-1">
              <p className="font-semibold">Comience registrando su primera operación</p>
              <p className="text-sm text-muted-foreground">
                1) Registre un proveedor o cliente · 2) cree la importación o exportación · 3) complete documentos, logística y costos. Este tablero
                se actualizará con datos reales.
              </p>
            </div>
            <div className="flex gap-2">
              {ctx.permisos.has("terceros:crear") && <EnlaceBoton href="/terceros/nuevo" variante="outline">Registrar tercero</EnlaceBoton>}
              {ctx.permisos.has("operaciones:crear") && <EnlaceBoton href="/operaciones/nueva">Crear operación</EnlaceBoton>}
            </div>
          </CardContent>
        </Card>
      )}

      {op && (
        <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TarjetaKpi titulo="Operaciones activas" valor={activas} icono={Ship} tono="primary" detalle={`${total} en total`} href="/operaciones?estado=activas" />
          <TarjetaKpi titulo="Importaciones activas" valor={op.importacionesActivas} icono={Truck} tono="primary" href="/operaciones?tipo=IMPORTACION&estado=activas" />
          <TarjetaKpi titulo="Exportaciones activas" valor={op.exportacionesActivas} icono={PackageCheck} tono="success" href="/operaciones?tipo=EXPORTACION&estado=activas" />
          <TarjetaKpi titulo="Finalizadas" valor={op.finalizadas} icono={CheckCircle2} tono="neutral" href="/operaciones?estado=FINALIZADA" />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Seccion titulo="Requiere atención" descripcion={atencion.length === 0 ? undefined : "Ordenado por urgencia."} className="lg:col-span-1">
          {atencion.length === 0 ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-success-foreground">
                <CheckCircle2 className="size-5" aria-hidden />
              </span>
              <p>
                <span className="font-medium">Todo al día.</span>
                <span className="block text-muted-foreground">No hay pendientes que requieran acción inmediata.</span>
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {atencion.map(({ clave, icono: Icono, tono, titulo, detalle, href }) => (
                <li key={clave}>
                  <Link href={href} className="flex items-start gap-3 rounded-lg p-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                        tono === "danger" ? "bg-danger-soft text-danger-foreground" : tono === "warning" ? "bg-warning-soft text-warning-foreground" : "bg-info-soft text-info-foreground",
                      )}
                    >
                      <Icono className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium">{titulo}</span>
                      <span className="block text-xs text-muted-foreground">{detalle}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        {op && (
          <Seccion titulo="Operaciones por estado" descripcion={total === 0 ? "Sin operaciones registradas." : `${total} operación(es) en total.`}>
            {total > 0 && (
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Distribución de operaciones por estado">
                {ORDEN_ESTADOS.map((e) => {
                  const n = op.porEstado[e] ?? 0
                  return n > 0 ? <div key={e} className={COLOR_ESTADO[e]} style={{ width: `${(n / total) * 100}%` }} title={`${ETIQUETA_ESTADO_OPERACION[e]}: ${n}`} /> : null
                })}
              </div>
            )}
            <ul className="space-y-1.5 text-sm">
              {ORDEN_ESTADOS.map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", COLOR_ESTADO[e])} aria-hidden />
                  <span className="flex-1">{ETIQUETA_ESTADO_OPERACION[e]}</span>
                  <span className="tabular-nums text-muted-foreground">{op.porEstado[e] ?? 0}</span>
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        {op && (
          <Seccion titulo="Próximas llegadas" descripcion="Envíos con llegada estimada próxima." className="lg:col-span-2 xl:col-span-1">
            {op.proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin llegadas programadas. Registre las fechas en la pestaña Logística de cada operación.</p>
            ) : (
              <ul className="space-y-3">
                {op.proximas.map((e) => (
                  <li key={e.operacion.id} className="flex items-start gap-3 text-sm">
                    <span className="w-16 shrink-0 rounded-md bg-muted px-1.5 py-1 text-center text-xs font-semibold tabular-nums">{formatearFecha(e.fechaEstimadaLlegada)}</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/operaciones/${e.operacion.id}/logistica`} className="whitespace-nowrap font-medium hover:underline">{e.operacion.numero}</Link>
                      <span className="block truncate text-xs text-muted-foreground">{e.operacion.tercero.razonSocial}</span>
                    </span>
                    <InsigniaEstado valor={e.estadoEnvio} etiqueta={ETIQUETA_ESTADO_ENVIO[e.estadoEnvio]} />
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {op && (
          <Seccion titulo="Operaciones recientes" className="lg:col-span-2" accion={<Link href="/operaciones" className="text-sm text-primary hover:underline">Ver todas</Link>}>
            {op.recientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay operaciones.</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Número</TableHead><TableHead>Tipo</TableHead><TableHead>Tercero</TableHead><TableHead>Estado</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {op.recientes.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium"><Link href={`/operaciones/${o.id}`} className="hover:underline">{o.numero}</Link></TableCell>
                        <TableCell>{ETIQUETA_TIPO_OPERACION[o.tipo]}</TableCell>
                        <TableCell>{o.tercero.razonSocial}</TableCell>
                        <TableCell><InsigniaEstado valor={o.estado} etiqueta={ETIQUETA_ESTADO_OPERACION[o.estado]} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Seccion>
        )}

        {logistica && (
          <Seccion titulo="Incidencias logísticas" descripcion={logistica.abiertas === 0 ? "Sin novedades abiertas." : `${logistica.abiertas} abierta(s).`}>
            {logistica.lista.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay incidencias que atender.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {logistica.lista.map((n) => (
                  <li key={n.id} className="flex gap-2">
                    <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", n.severidad === "ALTA" ? "text-destructive" : "text-warning")} aria-hidden />
                    <span>
                      <Link href={`/operaciones/${n.operacion.id}/logistica`} className="font-medium hover:underline">{n.operacion.numero}</Link>: {n.titulo}
                      {n.severidad && <span className="block text-xs text-muted-foreground">Severidad {ETIQUETA_SEVERIDAD[n.severidad].toLowerCase()} · {formatearFecha(n.fechaEvento)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}
      </div>
    </div>
  )
}
