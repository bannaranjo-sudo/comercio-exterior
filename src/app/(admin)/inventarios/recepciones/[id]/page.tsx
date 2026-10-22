import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, Seccion } from "@/components/comun/comunes"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_TIPO_DOCUMENTO } from "@/lib/etiquetas"
import { formatearFecha, formatearFechaHora } from "@/lib/formato"
import { formatearCantidad } from "@/lib/inventarios/cantidades"
import { obtenerRecepcion } from "@/lib/inventarios/recepciones"

export const metadata = { title: "Recepción · Inventarios" }

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ params, searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  const r = await obtenerRecepcion(ctx, (await params).id)
  if (!r) notFound()
  const sp = await searchParams

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/inventarios/recepciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Recepciones
      </Link>
      {sp.creada === "1" && <Alerta tono="success">Recepción registrada: las existencias ya fueron actualizadas.</Alerta>}
      {sp.duplicada === "1" && <Alerta tono="info">Esta recepción ya estaba registrada; no se duplicaron movimientos.</Alerta>}

      <Seccion titulo={r.numero} descripcion={`Importación ${r.operacion.numero} · ${r.operacion.tercero.razonSocial}`}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Operación</dt><dd><Link href={`/operaciones/${r.operacion.id}`} className="text-primary hover:underline">{r.operacion.numero}</Link></dd></div>
          <div><dt className="text-muted-foreground">Bodega de destino</dt><dd>{r.bodega.codigo} · {r.bodega.nombre}</dd></div>
          <div><dt className="text-muted-foreground">Fecha de recepción</dt><dd>{formatearFecha(r.fechaRecepcion)}</dd></div>
          <div><dt className="text-muted-foreground">Registrada por</dt><dd>{r.registradoPor.nombre}</dd></div>
          <div><dt className="text-muted-foreground">Registrada el</dt><dd>{formatearFechaHora(r.creadoEn)}</dd></div>
          <div><dt className="text-muted-foreground">Documento de soporte</dt><dd>{r.documento ? <Link href={`/documentos/${r.documento.id}`} className="text-primary hover:underline">{ETIQUETA_TIPO_DOCUMENTO[r.documento.tipo]} · {r.documento.nombreOriginal}</Link> : "—"}</dd></div>
        </dl>
        {r.observaciones && <p className="mt-4 text-sm"><span className="text-muted-foreground">Observaciones: </span>{r.observaciones}</p>}
      </Seccion>

      <Seccion titulo="Mercancía recibida">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Esperada</TableHead><TableHead className="text-right">Recibida</TableHead><TableHead className="text-right">Diferencia</TableHead><TableHead>Observación</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.lineas.map((l) => {
                const dif = l.cantidadEsperada ? l.cantidadRecibida.minus(l.cantidadEsperada) : null
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.producto.sku} · {l.producto.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.cantidadEsperada ? formatearCantidad(l.cantidadEsperada, l.producto.unidad) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearCantidad(l.cantidadRecibida, l.producto.unidad)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${dif && !dif.isZero() ? "font-medium text-amber-600 dark:text-amber-400" : ""}`}>{dif ? formatearCantidad(dif, l.producto.unidad) : "—"}</TableCell>
                    <TableCell>{l.observacion ?? "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <Link href={`/inventarios/movimientos?q=${encodeURIComponent(r.numero)}`} className="mt-3 inline-block text-sm text-primary hover:underline">Ver movimientos generados</Link>
      </Seccion>
    </div>
  )
}
