import { History } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, EnlaceBoton, Entrada, EstadoVacio, InsigniaEstado, Paginacion, Selector, Seccion } from "@/components/comun/comunes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { formatearFechaHora } from "@/lib/formato"
import { ETIQUETA_ESTADO_SOLICITUD, ETIQUETA_REVISION, estadoRevision } from "@/lib/inteligencia/etiquetas"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { listarConsumo, listarSolicitudes } from "@/lib/inteligencia/vistas"

export const metadata = { title: "Historial · Centro de Inteligencia" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const ESTADO_USO = { EXITOSA: "Exitosa", FALLIDA: "Fallida", SIN_CONTENIDO: "Sin texto", EN_CURSO: "En curso" } as const
const TIPO_USO = { PRUEBA_CONEXION: "Prueba de conexión", EJECUCION: "Ejecución" } as const

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const [{ filas, hayMas, pagina }, consumo] = await Promise.all([
    listarSolicitudes(ctx, { q: valor("q"), agente: valor("tipo"), estado: valor("estado"), vista: "todas", pagina: Number(valor("pagina")) || 1 }),
    listarConsumo(ctx),
  ])
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("tipo") || valor("estado"))

  return (
    <div className="space-y-6">
      <section className="space-y-4" aria-labelledby="titulo-historial">
        <h2 id="titulo-historial" className="text-base font-semibold">Registro de solicitudes y análisis</h2>
        <BarraFiltros>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" role="search">
            <Entrada name="q" type="search" placeholder="Buscar por descripción, operación o agente…" defaultValue={valor("q")} aria-label="Buscar" />
            <Selector name="tipo" aria-label="Tipo de análisis" defaultValue={valor("tipo")} vacio="Todos los tipos" opciones={[["documental", "Documental"], ["arancelario", "Arancelario"], ["financiero", "Financiero"], ["orquestador", "Orquestador"]]} />
            <Selector name="estado" aria-label="Estado" defaultValue={valor("estado")} vacio="Todos los estados" opciones={Object.entries(ETIQUETA_ESTADO_SOLICITUD)} />
            <div className="flex gap-2">
              <Button type="submit">Filtrar</Button>
              {hayFiltros && <EnlaceBoton href="/inteligencia/historial" variante="ghost">Limpiar</EnlaceBoton>}
            </div>
          </form>
        </BarraFiltros>

        {filas.length === 0 ? (
          <EstadoVacio icono={History} titulo={hayFiltros ? "Sin registros con esos filtros" : "Aún no hay actividad registrada"} descripcion="El historial conserva cada solicitud con su estado, proveedor, modelo y responsable." />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Operación</TableHead>
                    <TableHead className="hidden lg:table-cell">Proveedor · modelo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Revisión</TableHead>
                    <TableHead className="hidden md:table-cell">Responsable</TableHead>
                    <TableHead className="text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{formatearFechaHora(s.creadoEn)}</TableCell>
                      <TableCell className="font-medium">{s.agente.nombre}</TableCell>
                      <TableCell>{s.operacion ? <Link href={`/operaciones/${s.operacion.id}`} className="text-primary hover:underline">{s.operacion.numero}</Link> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="hidden lg:table-cell">{s.proveedor && s.modelo ? `${PROVEEDORES[s.proveedor].nombre} · ${s.modelo}` : <span className="text-muted-foreground">Sin ejecutar</span>}</TableCell>
                      <TableCell><InsigniaEstado valor={s.estado} etiqueta={ETIQUETA_ESTADO_SOLICITUD[s.estado]} /></TableCell>
                      <TableCell className="text-xs">{(() => { const r = estadoRevision(s); return r ? ETIQUETA_REVISION[r] : <span className="text-muted-foreground">—</span> })()}</TableCell>
                      <TableCell className="hidden md:table-cell">{s.solicitadaPor.nombre}</TableCell>
                      <TableCell className="text-right"><Link href={`/inteligencia/solicitudes/${s.id}`} className="text-sm text-primary hover:underline">Ver</Link></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4"><Paginacion pagina={pagina} hayMas={hayMas} base={base} /></div>
            </CardContent>
          </Card>
        )}
      </section>

      <Seccion titulo="Consumo de proveedores" descripcion="Últimos registros de uso informados por los proveedores (solo metadatos; sin contenido de mensajes).">
        {consumo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin consumo registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Proveedor · modelo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead className="text-right">Tokens ent. / sal.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumo.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs">{formatearFechaHora(u.creadoEn)}</TableCell>
                    <TableCell>{TIPO_USO[u.tipo]}</TableCell>
                    <TableCell>{PROVEEDORES[u.proveedor].nombre} · {u.modelo}</TableCell>
                    <TableCell><InsigniaEstado valor={u.estado} etiqueta={ESTADO_USO[u.estado]} /></TableCell>
                    <TableCell className="text-right tabular-nums">{u.duracionMs === null ? "—" : `${u.duracionMs} ms`}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.tokensEntrada ?? "—"} / {u.tokensSalida ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </div>
  )
}
