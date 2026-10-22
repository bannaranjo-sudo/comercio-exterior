import { AlertTriangle, CheckCircle2, Info, Inbox, XCircle, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { claseCampo } from "@/components/inteligencia/estilos"
import { cn } from "@/lib/utils"

// Sistema visual compartido: color solo para comunicar jerarquía, estado y acción.

export type Tono = "primary" | "success" | "warning" | "danger" | "neutral"

const TONO_SUAVE: Record<Tono, string> = {
  primary: "bg-info-soft text-info-foreground",
  success: "bg-success-soft text-success-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-danger-soft text-danger-foreground",
  neutral: "bg-neutral-soft text-neutral-foreground",
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  etiqueta,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
  /** Texto breve sobre el título (p. ej. la empresa activa). */
  etiqueta?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0">
        {etiqueta && <div className="mb-1 text-xs font-medium text-muted-foreground">{etiqueta}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="ml-auto flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono: Icono = Inbox,
}: {
  titulo: string
  descripcion?: string
  accion?: React.ReactNode
  icono?: LucideIcon
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/60 px-4 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icono className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold">{titulo}</p>
      {descripcion && <p className="max-w-md text-sm text-muted-foreground">{descripcion}</p>}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  )
}

export function Seccion({
  titulo,
  descripcion,
  children,
  className,
  accion,
}: {
  titulo: string
  descripcion?: string
  children: React.ReactNode
  className?: string
  accion?: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader className={accion ? "grid-cols-[1fr_auto]" : undefined}>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
        {accion && <div className="col-start-2 row-span-2 row-start-1 self-center">{accion}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Indicador clave: valor grande, icono en recuadro suave y, opcionalmente, enlace al detalle. */
export function TarjetaKpi({
  titulo,
  valor,
  icono: Icono,
  tono = "primary",
  detalle,
  href,
}: {
  titulo: string
  valor: React.ReactNode
  icono: LucideIcon
  tono?: Tono
  detalle?: React.ReactNode
  href?: string
}) {
  const contenido = (
    <Card className={cn("h-full", href && "transition-shadow hover:shadow-md")}>
      <CardContent className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONO_SUAVE[tono])}>
          <Icono className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
          <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums">{valor}</p>
          {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
        </div>
      </CardContent>
    </Card>
  )
  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {contenido}
    </Link>
  ) : (
    contenido
  )
}

const ALERTA: Record<Exclude<Tono, "primary" | "neutral"> | "info", { icono: LucideIcon; clases: string }> = {
  info: { icono: Info, clases: "border-info-foreground/25 bg-info-soft text-info-foreground" },
  success: { icono: CheckCircle2, clases: "border-success-foreground/25 bg-success-soft text-success-foreground" },
  warning: { icono: AlertTriangle, clases: "border-warning-foreground/25 bg-warning-soft text-warning-foreground" },
  danger: { icono: XCircle, clases: "border-danger-foreground/25 bg-danger-soft text-danger-foreground" },
}

export function Alerta({
  tono = "info",
  titulo,
  children,
  className,
}: {
  tono?: keyof typeof ALERTA
  titulo?: string
  children?: React.ReactNode
  className?: string
}) {
  const { icono: Icono, clases } = ALERTA[tono]
  return (
    <div role={tono === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", clases, className)}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="[&_a]:underline">{children}</div>}
      </div>
    </div>
  )
}

/** Contenedor compacto de filtros de listados. */
export function BarraFiltros({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-3 shadow-xs">{children}</div>
}

/** Campo de formulario con etiqueta accesible. */
export function Campo({
  etiqueta,
  nombre,
  ayuda,
  className,
  children,
}: {
  etiqueta: string
  nombre: string
  ayuda?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={nombre} className="text-sm font-medium">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )
}

type PropsSelector = React.ComponentProps<"select"> & { opciones: readonly (readonly [string, string])[]; vacio?: string }

export function Selector({ opciones, vacio, className, ...props }: PropsSelector) {
  return (
    <select id={props.name} className={cn(claseCampo, className)} {...props}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map(([valor, etiqueta]) => (
        <option key={valor} value={valor}>
          {etiqueta}
        </option>
      ))}
    </select>
  )
}

export function Entrada(props: React.ComponentProps<"input">) {
  return <input id={props.name} {...props} className={cn(claseCampo, props.className)} />
}

export function AreaTexto(props: React.ComponentProps<"textarea">) {
  return <textarea id={props.name} rows={3} {...props} className={cn(claseCampo, "h-auto py-1.5", props.className)} />
}

// Tono de cada estado del dominio: verde = completado/correcto, azul = en curso, ámbar = atención,
// rojo = error o riesgo, gris = neutro/inactivo.
const TONO_ESTADO: Record<string, Tono> = {
  FINALIZADA: "success", APROBADO: "success", ENTREGADO: "success", REAL: "success", ACTIVO: "success", EXITOSA: "success", COMPLETADA: "success",
  EN_PREPARACION: "primary", EN_TRANSITO: "primary", RECIBIDO: "primary", EN_CURSO: "primary", PROGRAMADO: "primary", EN_PUERTO: "primary",
  EN_ADUANA: "warning", OBSERVADO: "warning", PENDIENTE: "warning", MEDIA: "warning", SIN_CONTENIDO: "warning",
  CANCELADA: "neutral", BORRADOR: "neutral", INACTIVO: "neutral", ESTIMADO: "neutral", BAJA: "neutral",
  FALLIDA: "danger", RETRASADO: "danger", ALTA: "danger", RECHAZADO: "danger",
}

export function InsigniaEstado({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono?: Tono }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONO_SUAVE[tono ?? TONO_ESTADO[valor] ?? "neutral"])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {etiqueta}
    </span>
  )
}

/** Paginación sencilla por parámetros de URL. */
export function Paginacion({ pagina, hayMas, base }: { pagina: number; hayMas: boolean; base: URLSearchParams }) {
  const enlace = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("pagina", String(p))
    return `?${q.toString()}`
  }
  if (pagina <= 1 && !hayMas) return null
  return (
    <div className="flex items-center justify-between pt-3 text-sm">
      {pagina > 1 ? <Link href={enlace(pagina - 1)} className="text-primary hover:underline">← Anterior</Link> : <span />}
      <span className="text-muted-foreground">Página {pagina}</span>
      {hayMas ? <Link href={enlace(pagina + 1)} className="text-primary hover:underline">Siguiente →</Link> : <span />}
    </div>
  )
}

type VarianteBoton = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"]

/** Enlace con apariencia de botón (evita anidar botones dentro de enlaces). */
export function EnlaceBoton({ href, variante = "default", className, children }: { href: string; variante?: VarianteBoton; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: variante }), className)}>
      {children}
    </Link>
  )
}

/** Clases de color suave por tono, para componentes que necesiten el mismo lenguaje visual. */
export const TONO = TONO_SUAVE
