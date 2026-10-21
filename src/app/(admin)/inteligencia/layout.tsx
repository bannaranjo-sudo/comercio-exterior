import { Subnavegacion } from "@/components/inteligencia/subnavegacion"

export default function InteligenciaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Centro de Inteligencia</h1>
        <p className="mt-1 text-muted-foreground">
          Agentes de IA configurables por empresa. Los resultados siempre requieren aprobación humana.
        </p>
      </div>
      <Subnavegacion />
      {children}
    </div>
  )
}
