import { Inbox } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { claseCampo } from "@/components/inteligencia/estilos"
import { cn } from "@/lib/utils"

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="ml-auto flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

export function EstadoVacio({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Inbox className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{titulo}</p>
        {descripcion && <p className="max-w-md text-sm text-muted-foreground">{descripcion}</p>}
        {accion}
      </CardContent>
    </Card>
  )
}

export function Seccion({
  titulo,
  descripcion,
  children,
  className,
}: {
  titulo: string
  descripcion?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
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

const COLOR_ESTADO: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  FINALIZADA: "default", APROBADO: "default", ENTREGADO: "default", REAL: "default",
  CANCELADA: "destructive", OBSERVADO: "destructive", RETRASADO: "destructive", ALTA: "destructive",
}

export function InsigniaEstado({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return <Badge variant={COLOR_ESTADO[valor] ?? "secondary"}>{etiqueta}</Badge>
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
