import { redirect } from "next/navigation"

export const metadata = { title: "Reportes · Comercio Exterior" }

export default function Page() {
  redirect("/reportes/resumen")
}
