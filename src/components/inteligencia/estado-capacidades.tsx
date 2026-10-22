import { CheckCircle2, CircleDashed, MinusCircle } from "lucide-react"

import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import type { estadoCapacidades } from "@/lib/inteligencia/vistas"
import { formatearFechaHora } from "@/lib/formato"
import { cn } from "@/lib/utils"

type Capacidades = Awaited<ReturnType<typeof estadoCapacidades>>
type Nivel = "ok" | "pendiente" | "no"

type Fila = { clave: string; titulo: string; nivel: Nivel; detalle: string }

/** Construye las seis capacidades por separado: ninguna implica a la otra. */
export function filasCapacidades(c: Capacidades): Fila[] {
  const openai = c.proveedores.find((p) => p.proveedor === "OPENAI")!
  const nombre = PROVEEDORES.OPENAI.nombre
  return [
    {
      clave: "habilitado",
      titulo: "Proveedor habilitado",
      nivel: openai.habilitado ? "ok" : "pendiente",
      detalle: openai.habilitado ? `${nombre} habilitado para esta empresa.` : `${nombre} no está habilitado para esta empresa.`,
    },
    {
      clave: "adaptador",
      titulo: "Adaptador disponible",
      nivel: openai.adaptadorDisponible ? "ok" : "no",
      detalle: openai.adaptadorDisponible ? `Adaptador de ${nombre} implementado.` : "Sin adaptador implementado.",
    },
    {
      clave: "credencial",
      titulo: "Credencial configurada",
      nivel: openai.credencialConfigurada ? "ok" : "pendiente",
      detalle: openai.credencialConfigurada ? "Clave definida en el servidor (nunca se muestra)." : "La clave del servidor no está definida.",
    },
    {
      clave: "conexion",
      titulo: "Conexión verificada",
      nivel: openai.conexionVerificada ? "ok" : "pendiente",
      detalle: openai.conexionVerificada
        ? `Prueba con texto generado el ${formatearFechaHora(openai.conexionVerificada.fecha)} (${openai.conexionVerificada.modelo}).`
        : openai.ultimaPrueba
          ? `Última prueba: ${openai.ultimaPrueba.estado === "SIN_CONTENIDO" ? "API accesible sin texto" : "fallida"}. Sin verificación exitosa.`
          : "Aún no se ha verificado la conexión.",
    },
    {
      clave: "agentes",
      titulo: "Agente configurado",
      nivel: c.agentes.conModelo > 0 ? "ok" : "pendiente",
      detalle:
        c.agentes.total === 0
          ? "No hay agentes creados."
          : `${c.agentes.conModelo} de ${c.agentes.activos} agente(s) activo(s) con modelo asignado.`,
    },
    {
      clave: "ejecutable",
      titulo: "Análisis ejecutable",
      nivel: c.analisisEjecutable ? "ok" : "no",
      detalle: c.analisisEjecutable
        ? c.modo.efectivo === "simulado"
          ? "Disponible con proveedor SIMULADO (pruebas, sin costo)."
          : "La ejecución de análisis está disponible."
        : c.modo.efectivo === "deshabilitado"
          ? `Ejecución deshabilitada en el servidor: las solicitudes quedan en cola. ${c.modo.motivo}`
          : "Falta completar la cadena anterior.",
    },
  ]
}

const ICONO = {
  ok: { Icono: CheckCircle2, clase: "text-success" },
  pendiente: { Icono: CircleDashed, clase: "text-warning" },
  no: { Icono: MinusCircle, clase: "text-muted-foreground" },
} as const

/** Lista detallada (Configuración) o resumen horizontal compacto (Nuevo análisis). */
export function EstadoCapacidades({ capacidades, compacto = false }: { capacidades: Capacidades; compacto?: boolean }) {
  const filas = filasCapacidades(capacidades)
  return (
    <ul className={cn(compacto ? "grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3 md:grid-cols-2")}>
      {filas.map((f) => {
        const { Icono, clase } = ICONO[f.nivel]
        return (
          <li key={f.clave} className="flex gap-2.5 text-sm">
            <Icono className={cn("mt-0.5 size-4 shrink-0", clase)} aria-hidden />
            <span className="min-w-0">
              <span className="font-medium">{f.titulo}</span>
              {!compacto && <span className="block text-muted-foreground">{f.detalle}</span>}
              {compacto && <span className="block text-xs text-muted-foreground">{f.detalle}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

