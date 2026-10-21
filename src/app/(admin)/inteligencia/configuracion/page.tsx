import { AccesoDenegado } from "@/components/acceso-denegado"
import { FormularioAccion } from "@/components/inteligencia/formulario-accion"
import { claseCampo } from "@/components/inteligencia/estilos"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"
import { accionGuardarProveedor } from "@/lib/inteligencia/acciones"
import { PROVEEDORES } from "@/lib/inteligencia/proveedores"
import { listarProveedores } from "@/lib/inteligencia/servicio"

export const metadata = { title: "Configuración de IA · Comercio Exterior" }

export default async function Page() {
  const ctx = await exigirPermisoEmpresaActiva("inteligencia:consultar")
  if (!ctx) return <AccesoDenegado />
  const puedeConfigurar = ctx.permisos.has("inteligencia:configurar")
  const proveedores = await listarProveedores(ctx)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Habilite los proveedores que esta empresa podrá usar. Las credenciales (claves de API) no se
        capturan ni almacenan en esta etapa.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {proveedores.map(({ proveedor, habilitado, notas }) => (
          <Card key={proveedor}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{PROVEEDORES[proveedor].nombre}</CardTitle>
                <Badge variant={habilitado ? "default" : "secondary"}>
                  {habilitado ? "Habilitado" : "Deshabilitado"}
                </Badge>
              </div>
              <CardDescription>Sin adaptador conectado.</CardDescription>
            </CardHeader>
            <CardContent>
              {puedeConfigurar ? (
                <FormularioAccion accion={accionGuardarProveedor} etiqueta="Guardar">
                  <input type="hidden" name="proveedor" value={proveedor} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="habilitado" defaultChecked={habilitado} className="size-4" />
                    Habilitar para esta empresa
                  </label>
                  <textarea
                    name="notas"
                    defaultValue={notas}
                    maxLength={500}
                    rows={2}
                    aria-label={`Notas de ${PROVEEDORES[proveedor].nombre}`}
                    placeholder="Notas internas (opcional)"
                    className={`${claseCampo} h-auto py-1.5`}
                  />
                </FormularioAccion>
              ) : (
                <p className="text-sm text-muted-foreground">{notas || "Solo lectura."}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
