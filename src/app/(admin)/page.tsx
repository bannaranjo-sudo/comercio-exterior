import { AlertTriangle, CheckCircle2, Clock, FileWarning, Ship } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata = { title: "Dashboard · Comercio Exterior" }

// DATOS FICTICIOS: solo para demostración visual del diseño.
const indicadores = [
  { titulo: "Operaciones activas", valor: "00", icono: Ship },
  { titulo: "Embarques en tránsito", valor: "00", icono: Clock },
  { titulo: "Documentos pendientes", valor: "00", icono: FileWarning },
  { titulo: "Operaciones cerradas", valor: "00", icono: CheckCircle2 },
]

const operaciones = [
  { codigo: "DEMO-001", tipo: "Importación", estado: "En tránsito", responsable: "Responsable A" },
  { codigo: "DEMO-002", tipo: "Exportación", estado: "En preparación", responsable: "Responsable B" },
  { codigo: "DEMO-003", tipo: "Importación", estado: "En aduana", responsable: "Responsable C" },
  { codigo: "DEMO-004", tipo: "Exportación", estado: "Cerrada", responsable: "Responsable A" },
]

const alertas = [
  "Alerta de ejemplo: documento por vencer.",
  "Alerta de ejemplo: embarque con retraso.",
  "Alerta de ejemplo: costo por conciliar.",
]

const actividad = [
  "Actividad de ejemplo: operación creada.",
  "Actividad de ejemplo: documento cargado.",
  "Actividad de ejemplo: estado actualizado.",
]

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Resumen general de la operación.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">
          Datos ficticios de demostración
        </Badge>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Operaciones recientes</CardTitle>
            <CardDescription>Registros ficticios de ejemplo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Responsable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operaciones.map((o) => (
                  <TableRow key={o.codigo}>
                    <TableCell className="font-medium">{o.codigo}</TableCell>
                    <TableCell>{o.tipo}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{o.estado}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{o.responsable}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertas</CardTitle>
              <CardDescription>Ejemplos ficticios.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {alertas.map((a) => (
                  <li key={a} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Resumen de actividades</CardTitle>
              <CardDescription>Ejemplos ficticios.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {actividad.map((a) => (
                  <li key={a} className="flex gap-2">
                    <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
