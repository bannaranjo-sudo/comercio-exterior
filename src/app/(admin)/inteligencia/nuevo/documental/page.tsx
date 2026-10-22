import { ArrowLeft, FileSearch } from "lucide-react"
import Link from "next/link"

import { AccesoDenegado } from "@/components/acceso-denegado"
import { Alerta, Campo, EnlaceBoton, EstadoVacio, InsigniaEstado, Seccion, Selector } from "@/components/comun/comunes"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { PasosAnalisis, type Paso } from "@/components/inteligencia/pasos-analisis"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { db } from "@/lib/db"
import { ErrorValidacion } from "@/lib/errores"
import { ETIQUETA_ESTADO_DOCUMENTO, ETIQUETA_TIPO_DOCUMENTO } from "@/lib/etiquetas"
import { formatearFecha, formatearTamano } from "@/lib/formato"
import { accionSolicitarAnalisisDocumental } from "@/lib/inteligencia/acciones-analisis"
import { documentosSeleccionables, verificarSeleccion } from "@/lib/inteligencia/documental/analisis"
import { LIMITES_ANALISIS } from "@/lib/inteligencia/documental/modo"
import { estadoCapacidades } from "@/lib/inteligencia/vistas"
import { opcionesOperaciones } from "@/lib/operaciones/servicio"
import { uuid } from "@/lib/validacion"

export const metadata = { title: "Análisis documental · Centro de Inteligencia" }
// La ejecución del análisis se realiza dentro de la acción del servidor.
export const maxDuration = 120

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const ESTADO_TEXTO = { CON_TEXTO: ["Con texto", "success"], SIN_TEXTO: ["Sin texto (escaneado)", "warning"], ERROR: ["No legible", "danger"] } as const

export default async function Page({ searchParams }: Props) {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:ejecutar")
  if (!ctx) return <AccesoDenegado detalle="Su rol no permite iniciar análisis ni registrar solicitudes." />
  const sp = await searchParams
  const operacionId = typeof sp.operacion === "string" && uuid("Operación").safeParse(sp.operacion).success ? sp.operacion : ""
  const seleccionados = (Array.isArray(sp.doc) ? sp.doc : typeof sp.doc === "string" ? [sp.doc] : []).filter((d) => uuid("Documento").safeParse(d).success)

  const [operaciones, capacidades] = await Promise.all([opcionesOperaciones(ctx), estadoCapacidades(ctx)])
  const operacion = operacionId ? await db.operacion.findFirst({ where: { id: operacionId, empresaId: ctx.empresaId }, select: { id: true, numero: true, tercero: { select: { razonSocial: true } } } }) : null
  const documentos = operacion ? await documentosSeleccionables(ctx, operacion.id) : []
  let verificacion: Awaited<ReturnType<typeof verificarSeleccion>> | null = null
  let error: string | null = operacionId && !operacion ? "La operación seleccionada no existe en esta empresa." : null
  if (operacion && seleccionados.length > 0) {
    try {
      verificacion = await verificarSeleccion(ctx, operacion.id, seleccionados)
    } catch (e) {
      if (!(e instanceof ErrorValidacion)) throw e
      error = e.message
    }
  }
  const agenteActivo = capacidades.agentePorCodigo.has("documental")
  const ejecuta = capacidades.modo.efectivo !== "deshabilitado"

  const pasos: Paso[] = [
    { titulo: "Operación", detalle: "Elija la operación autorizada.", estado: operacion ? "completado" : "actual" },
    { titulo: "Documentos", detalle: "Marque los PDF a analizar.", estado: verificacion ? "completado" : operacion ? "actual" : "disponible" },
    { titulo: "Verificar", detalle: "Revise la lectura de cada archivo.", estado: verificacion ? "actual" : "disponible" },
    { titulo: ejecuta ? "Ejecutar" : "Registrar en cola", detalle: ejecuta ? "El agente genera el informe." : "La ejecución está deshabilitada.", estado: "disponible" },
    { titulo: "Revisión humana", detalle: "Enviar, aprobar, rechazar o devolver.", estado: "disponible" },
  ]

  return (
    <div className="space-y-6">
      <Link href="/inteligencia" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Volver a Nuevo análisis
      </Link>
      <Seccion titulo="Análisis documental" descripcion="Extrae y contrasta los datos de facturas, listas de empaque, fichas técnicas y otros soportes PDF. El resultado siempre requiere revisión humana.">
        <div className="space-y-5">
          <PasosAnalisis pasos={pasos} />
          {!ejecuta ? (
            <Alerta tono="warning" titulo="La ejecución de análisis está deshabilitada en este entorno">
              Puede preparar y registrar la solicitud: quedará <strong>en cola</strong> y no se ejecutará ni consumirá ningún proveedor hasta que el servidor habilite la ejecución. {capacidades.modo.motivo}
            </Alerta>
          ) : capacidades.modo.efectivo === "simulado" ? (
            <Alerta tono="info" titulo="Modo simulado">El análisis se ejecuta con un proveedor simulado, sin costo ni llamadas externas. El informe será de demostración.</Alerta>
          ) : (
            <Alerta tono="warning" titulo="Ejecución real autorizada">Este análisis consultará al proveedor de IA configurado y consumirá la autorización de un solo uso vigente.</Alerta>
          )}
          {!agenteActivo && (
            <Alerta tono="danger" titulo="No hay un agente documental activo">
              {ctx.permisos.has("inteligencia:administrar_agentes") ? <Link href="/configuracion/inteligencia">Cree o active el agente documental en Configuración → Inteligencia artificial.</Link> : "Solicite a un administrador que configure el agente documental."}
            </Alerta>
          )}

          <form className="flex flex-wrap items-end gap-3" role="search" aria-label="Seleccionar operación">
            <Campo etiqueta="Operación *" nombre="operacion" className="min-w-64 flex-1">
              <Selector name="operacion" defaultValue={operacionId} vacio="Seleccione una operación…" opciones={operaciones.map((o) => [o.id, `${o.numero} · ${o.tercero.razonSocial}`] as const)} required />
            </Campo>
            <Button type="submit" variant="outline">Ver documentos</Button>
          </form>
        </div>
      </Seccion>

      {error && <Alerta tono="danger">{error}</Alerta>}

      {operacion && (
        <Seccion
          titulo={`Documentos de ${operacion.numero}`}
          descripcion={`${operacion.tercero.razonSocial}. Solo PDF con texto seleccionable; los escaneados no se leen (no hay OCR). Máximo ${LIMITES_ANALISIS.maxDocumentos} documentos.`}
          accion={<EnlaceBoton href={`/operaciones/${operacion.id}/documentos`} variante="outline">Cargar documentos</EnlaceBoton>}
        >
          {documentos.length === 0 ? (
            <EstadoVacio icono={FileSearch} titulo="La operación no tiene PDF cargados" descripcion="Cargue facturas, listas de empaque u otros soportes en la pestaña Documentos de la operación." />
          ) : (
            <form className="space-y-4" aria-label="Seleccionar documentos">
              <input type="hidden" name="operacion" value={operacion.id} />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead className="w-10"><span className="sr-only">Seleccionar</span></TableHead><TableHead>Documento</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Tamaño</TableHead><TableHead>Cargado</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell><input type="checkbox" name="doc" value={d.id} defaultChecked={seleccionados.includes(d.id)} aria-label={`Seleccionar ${d.nombreOriginal}`} className="size-4 accent-primary" /></TableCell>
                        <TableCell className="font-medium">{d.nombreOriginal}</TableCell>
                        <TableCell>{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</TableCell>
                        <TableCell><InsigniaEstado valor={d.estado} etiqueta={ETIQUETA_ESTADO_DOCUMENTO[d.estado]} /></TableCell>
                        <TableCell className="text-right tabular-nums">{formatearTamano(d.tamanoBytes)}</TableCell>
                        <TableCell>{formatearFecha(d.creadoEn)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button type="submit">Verificar selección</Button>
            </form>
          )}
        </Seccion>
      )}

      {operacion && verificacion && (
        <Seccion titulo="Verificación de la selección" descripcion="Así se leerá cada archivo antes de consultar al agente. Esta verificación no usa ningún modelo.">
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Documento</TableHead><TableHead>Tipo</TableHead><TableHead>Texto</TableHead><TableHead className="text-right">Páginas</TableHead><TableHead className="text-right">Caracteres</TableHead><TableHead>Observación</TableHead></TableRow></TableHeader>
                <TableBody>
                  {verificacion.filas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.nombre}</TableCell>
                      <TableCell>{ETIQUETA_TIPO_DOCUMENTO[f.tipo]}</TableCell>
                      <TableCell><InsigniaEstado valor={f.estado} etiqueta={ESTADO_TEXTO[f.estado][0]} tono={ESTADO_TEXTO[f.estado][1]} /></TableCell>
                      <TableCell className="text-right tabular-nums">{f.paginas || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.caracteres.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="max-w-72 text-xs text-muted-foreground">{f.problema ?? (f.truncado ? "Se recortará por el límite de análisis." : "Listo para analizar")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!verificacion.analizable ? (
              <Alerta tono="danger" titulo="Ningún documento seleccionado tiene texto utilizable">Elija otros documentos: los PDF escaneados, protegidos o dañados no se pueden analizar.</Alerta>
            ) : verificacion.filas.some((f) => f.estado !== "CON_TEXTO") ? (
              <Alerta tono="warning">Solo se analizarán los documentos con texto; los demás quedarán indicados en el informe.</Alerta>
            ) : null}
            {verificacion.analizable && agenteActivo && (
              <FormularioAccion accion={accionSolicitarAnalisisDocumental} etiqueta={ejecuta ? "Ejecutar análisis" : "Registrar solicitud en cola"}>
                <input type="hidden" name="operacionId" value={operacion.id} />
                {verificacion.filas.map((f) => <input key={f.id} type="hidden" name="documentoId" value={f.id} />)}
                <p className="text-xs text-muted-foreground">
                  {ejecuta ? "El análisis puede tardar hasta un minuto. Al terminar verá el informe y podrá enviarlo a revisión." : "No se ejecutará ahora: la solicitud queda en cola con su trazabilidad."}
                </p>
              </FormularioAccion>
            )}
          </div>
        </Seccion>
      )}
    </div>
  )
}
