import { redirect } from "next/navigation"

// Ruta histórica: Administración ahora es «Usuarios y accesos» dentro de Configuración.
// La redirección no expone nada: el destino exige el mismo permiso (administracion:consultar).
export default function Page() {
  redirect("/configuracion/usuarios")
}
