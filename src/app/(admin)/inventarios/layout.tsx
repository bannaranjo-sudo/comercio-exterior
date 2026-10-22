import { AccesoDenegado } from "@/components/acceso-denegado"
import { EncabezadoPagina } from "@/components/comun/comunes"
import { Pestanas } from "@/components/comun/pestanas"
import { exigirPermisoEmpresaActiva } from "@/lib/auth/sesion"

export default async function InventariosLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirPermisoEmpresaActiva("inventarios:consultar")
  if (!ctx) return <AccesoDenegado />
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Inventarios"
        descripcion="Productos, bodegas, recepciones de importación y movimientos. Los saldos nunca pueden ser negativos y los movimientos no se modifican: se corrigen con compensaciones."
      />
      <Pestanas
        etiqueta="Secciones de inventarios"
        items={[
          { nombre: "Resumen", href: "/inventarios", exacto: true },
          { nombre: "Productos", href: "/inventarios/productos" },
          { nombre: "Bodegas", href: "/inventarios/bodegas" },
          { nombre: "Recepciones", href: "/inventarios/recepciones" },
          { nombre: "Movimientos", href: "/inventarios/movimientos" },
          { nombre: "Existencias", href: "/inventarios/existencias" },
        ]}
      />
      {children}
    </div>
  )
}
