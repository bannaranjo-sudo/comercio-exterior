const NOMBRE_MODULO: Record<string, string> = {
  administracion: "Administración", operaciones: "Operaciones", logistica: "Logística", inventarios: "Inventarios", costos: "Costos",
  documentos: "Documentos", terceros: "Terceros", reportes: "Reportes", inteligencia: "Centro de Inteligencia",
}

const agrupar = (codigos: Iterable<string>): [string, string[]][] => {
  const mapa = new Map<string, string[]>()
  for (const c of [...codigos].sort()) {
    const [modulo, accion] = c.split(":")
    mapa.set(modulo, [...(mapa.get(modulo) ?? []), accion.replaceAll("_", " ")])
  }
  return [...mapa.entries()]
}

/** Permisos agrupados por módulo, en lenguaje legible. */
export function ListaPermisos({ codigos }: { codigos: Iterable<string> }) {
  const grupos = agrupar(codigos)
  if (grupos.length === 0) return <p className="text-sm text-muted-foreground">Sin permisos.</p>
  return (
    <ul className="space-y-1 text-xs">
      {grupos.map(([modulo, acciones]) => (
        <li key={modulo}>
          <span className="font-medium">{NOMBRE_MODULO[modulo] ?? modulo}</span>: <span className="text-muted-foreground">{acciones.join(", ")}</span>
        </li>
      ))}
    </ul>
  )
}
