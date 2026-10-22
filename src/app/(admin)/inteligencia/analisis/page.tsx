import { redirect } from "next/navigation"

// Ruta histórica conservada: redirige a su nueva ubicación. El destino exige sus propios permisos.
export default function Page() {
  redirect("/inteligencia")
}
