import { Plus } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { BarraFiltros, EnlaceBoton, Entrada, EncabezadoPagina, EstadoVacio, InsigniaEstado, Paginacion, Selector } from "@/components/comun/comunes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { ETIQUETA_AMBITO, ETIQUETA_ROL_TERCERO, opciones } from "@/lib/etiquetas"
import { listarTerceros } from "@/lib/terceros/servicio"

export const metadata = { title: "Terceros · Comercio Exterior" }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("terceros:consultar")
  if (!ctx) return <AccesoDenegado />
  const sp = await searchParams
  const valor = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const { filas, hayMas, pagina } = await listarTerceros(ctx, {
    q: valor("q"),
    rol: valor("rol"),
    ambito: valor("ambito"),
    estado: valor("estado") || "activos",
    pagina: Number(valor("pagina")) || 1,
  })
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "pagina" ? [[k, v]] : [])))
  const hayFiltros = Boolean(valor("q") || valor("rol") || valor("ambito") || valor("estado"))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Terceros"
        descripcion="Proveedores, clientes, agentes de aduana, transportadores y demás intervinientes."
        acciones={
          ctx.permisos.has("terceros:crear") && (
            <EnlaceBoton href="/terceros/nuevo">
              <Plus className="size-4" aria-hidden /> Nuevo tercero
            </EnlaceBoton>
          )
        }
      />

      <BarraFiltros>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
            <Entrada name="q" type="search" placeholder="Buscar por nombre, NIT o ciudad…" defaultValue={valor("q")} aria-label="Buscar" />
            <Selector name="rol" aria-label="Rol" defaultValue={valor("rol")} vacio="Todos los roles" opciones={opciones(ETIQUETA_ROL_TERCERO)} />
            <Selector name="ambito" aria-label="Ámbito" defaultValue={valor("ambito")} vacio="Nacional e internacional" opciones={opciones(ETIQUETA_AMBITO)} />
            <Selector
              name="estado"
              aria-label="Estado"
              defaultValue={valor("estado") || "activos"}
              opciones={[["activos", "Activos"], ["inactivos", "Inactivos"], ["todos", "Todos"]]}
            />
            <div className="flex gap-2">
              <Button type="submit">Filtrar</Button>
              {hayFiltros && (
                <EnlaceBoton href="/terceros" variante="ghost">
                  Limpiar
                </EnlaceBoton>
              )}
            </div>
          </form>
      </BarraFiltros>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo={hayFiltros ? "Sin resultados" : "Aún no hay terceros registrados"}
          descripcion={hayFiltros ? "Ajuste los filtros de búsqueda." : "Registre su primer proveedor o cliente para poder crear operaciones."}
          accion={
            !hayFiltros && ctx.permisos.has("terceros:crear") ? (
              <EnlaceBoton href="/terceros/nuevo">Registrar tercero</EnlaceBoton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razón social</TableHead>
                  <TableHead>Identificación</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden md:table-cell">País / ciudad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/terceros/${t.id}`} className="hover:underline">
                        {t.razonSocial}
                      </Link>
                      {t.nombreComercial && <span className="block text-xs text-muted-foreground">{t.nombreComercial}</span>}
                    </TableCell>
                    <TableCell>{t.identificacionFiscal}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.roles.map((r) => (
                          <Badge key={r} variant="outline">
                            {ETIQUETA_ROL_TERCERO[r]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{[t.pais, t.ciudad].filter(Boolean).join(" · ")}</TableCell>
                    <TableCell>
                      <InsigniaEstado valor={t.activo ? "ACTIVO" : "INACTIVO"} etiqueta={t.activo ? "Activo" : "Inactivo"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4">
              <Paginacion pagina={pagina} hayMas={hayMas} base={base} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
