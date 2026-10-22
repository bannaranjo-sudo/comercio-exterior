import { AlertTriangle, CheckCircle2, FileText } from "lucide-react"

import { Alerta, InsigniaEstado, Seccion } from "@/components/comun/comunes"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ETIQUETA_CAMPO } from "@/lib/inteligencia/documental/esquema"
import type { EvidenciaVerificada, InformeDocumental } from "@/lib/inteligencia/documental/informe"

const ESTADO_EXTRACCION = { CON_TEXTO: ["Con texto", "success"], SIN_TEXTO: ["Sin texto (escaneado)", "warning"], ERROR: ["No legible", "danger"] } as const
const CLASIFICACION = { extraido: ["Extraído", "success"], inferido: ["Inferido", "warning"], sin_evidencia: ["Sin evidencia verificable", "danger"] } as const
const NIVEL = { alto: ["Atención alta", "danger"], medio: ["Atención media", "warning"], bajo: ["Atención baja", "neutral"] } as const

function Evidencias({ lista }: { lista: EvidenciaVerificada[] }) {
  if (lista.length === 0) return <span className="text-xs text-muted-foreground">Sin referencia</span>
  return (
    <ul className="space-y-1">
      {lista.map((e, i) => (
        <li key={i} className="text-xs">
          <span className="inline-flex items-center gap-1 font-medium">
            {e.verificada ? <CheckCircle2 className="size-3.5 text-success" aria-label="Verificada" /> : <AlertTriangle className="size-3.5 text-warning" aria-label="No verificada" />}
            {e.documento ? <a href={`/api/documentos/${e.documentoId}`} className="text-primary hover:underline">{e.documento}</a> : "Documento no analizado"}
            {e.verificada && e.pagina ? <span className="text-muted-foreground">· pág. {e.pagina}</span> : null}
          </span>
          <q className="block break-words text-muted-foreground">{e.cita}</q>
          {!e.verificada && <span className="text-warning-foreground">La cita no consta en el documento.</span>}
        </li>
      ))}
    </ul>
  )
}

/** Informe estructurado del análisis documental. Todo lo mostrado procede del resultado guardado; nada se recalcula. */
export function InformeDocumentalVista({ informe }: { informe: InformeDocumental }) {
  const v = informe.verificacion
  const kpis: [string, string][] = [
    ["Documentos analizados", String(informe.documentos.filter((d) => d.estadoExtraccion === "CON_TEXTO").length) + " de " + informe.documentos.length],
    ["Datos extraídos", String(informe.datos.length)],
    ["Inconsistencias", String(informe.inconsistencias.length)],
    ["Citas verificadas", `${v.citasVerificadas} de ${v.citasTotales}`],
  ]
  return (
    <div className="space-y-6">
      {informe.generado.simulado && (
        <Alerta tono="warning" titulo="Resultado de demostración">
          Se generó con el proveedor simulado (reglas locales, sin modelo de IA). No refleja el análisis de un modelo real.
        </Alerta>
      )}

      <Seccion titulo="Resumen ejecutivo" descripcion={`Operación ${informe.operacion.numero} · ${informe.generado.simulado ? "Proveedor simulado" : `${informe.generado.proveedor} · ${informe.generado.modelo}`}`}>
        <p className="whitespace-pre-wrap break-words text-sm">{informe.resumen}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map(([k, valor]) => (
            <div key={k} className="rounded-lg border bg-muted/30 p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>
      </Seccion>

      <Seccion titulo="Documentos analizados">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Documento</TableHead><TableHead>Tipo</TableHead><TableHead>Texto</TableHead><TableHead className="text-right">Páginas</TableHead><TableHead>Observación</TableHead></TableRow></TableHeader>
            <TableBody>
              {informe.documentos.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><a href={`/api/documentos/${d.id}`} className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="size-3.5" aria-hidden />{d.nombre}</a></TableCell>
                  <TableCell>{d.tipoEtiqueta}</TableCell>
                  <TableCell><InsigniaEstado valor={d.estadoExtraccion} etiqueta={ESTADO_EXTRACCION[d.estadoExtraccion][0]} tono={ESTADO_EXTRACCION[d.estadoExtraccion][1]} /></TableCell>
                  <TableCell className="text-right tabular-nums">{d.paginas}</TableCell>
                  <TableCell className="max-w-72 text-xs text-muted-foreground">{d.problema ?? (d.truncado ? "Texto recortado por el límite de análisis." : "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Seccion>

      <Seccion titulo="Datos extraídos" descripcion="Cada dato indica si fue extraído con evidencia verificada, inferido o no verificable.">
        {informe.datos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se extrajeron datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Dato</TableHead><TableHead>Valor</TableHead><TableHead>Clasificación</TableHead><TableHead>Evidencia y referencia</TableHead></TableRow></TableHeader>
              <TableBody>
                {informe.datos.map((d, i) => (
                  <TableRow key={i} className="align-top">
                    <TableCell className="whitespace-nowrap font-medium">{d.etiqueta ?? ETIQUETA_CAMPO[d.campo]}</TableCell>
                    <TableCell className="max-w-64 break-words">{d.valor}{d.explicacion && <p className="mt-1 text-xs text-muted-foreground">{d.explicacion}</p>}</TableCell>
                    <TableCell><InsigniaEstado valor={d.clasificacion} etiqueta={CLASIFICACION[d.clasificacion][0]} tono={CLASIFICACION[d.clasificacion][1]} /></TableCell>
                    <TableCell><Evidencias lista={d.evidencia} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Inconsistencias y nivel de atención">
        {informe.inconsistencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se detectaron inconsistencias entre los documentos analizados.</p>
        ) : (
          <ul className="divide-y">
            {informe.inconsistencias.map((x, i) => (
              <li key={i} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{x.titulo}</p>
                  <InsigniaEstado valor={x.nivel} etiqueta={NIVEL[x.nivel][0]} tono={NIVEL[x.nivel][1]} />
                </div>
                <p className="break-words text-sm text-muted-foreground">{x.detalle}</p>
                <Evidencias lista={x.evidencia} />
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Información faltante">
        {informe.noEncontrado.length + informe.faltantes.length + informe.documentosRequeridosFaltantes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se reportó información faltante.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos no encontrados</p>
              <ul className="mt-1 list-inside list-disc text-sm">{informe.noEncontrado.length ? informe.noEncontrado.map((c) => <li key={c}>{ETIQUETA_CAMPO[c]}</li>) : <li className="list-none text-muted-foreground">Ninguno</li>}</ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observaciones del análisis</p>
              <ul className="mt-1 list-inside list-disc text-sm">{informe.faltantes.length ? informe.faltantes.map((f, i) => <li key={i}>{f.elemento}{f.detalle ? ` — ${f.detalle}` : ""}</li>) : <li className="list-none text-muted-foreground">Ninguna</li>}</ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos requeridos sin cargar</p>
              <ul className="mt-1 list-inside list-disc text-sm">{informe.documentosRequeridosFaltantes.length ? informe.documentosRequeridosFaltantes.map((d) => <li key={d.tipo}>{d.etiqueta}</li>) : <li className="list-none text-muted-foreground">Ninguno</li>}</ul>
            </div>
          </div>
        )}
      </Seccion>

      {informe.advertencias.length > 0 && (
        <Alerta tono="info" titulo="Advertencias">
          <ul className="list-inside list-disc">{informe.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Alerta>
      )}
    </div>
  )
}
