import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function AccesoDenegado({ detalle = "No tiene permiso para ver esta sección en la empresa activa." }) {
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Acceso denegado</CardTitle>
        <CardDescription>{detalle}</CardDescription>
      </CardHeader>
    </Card>
  )
}
