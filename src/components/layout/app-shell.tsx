"use client"

import { useState } from "react"

import type { DatosSesion } from "@/components/layout/menu-usuario"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Topbar } from "@/components/layout/topbar"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function AppShell({ children, sesion }: { children: React.ReactNode; sesion: DatosSesion }) {
  const [colapsado, setColapsado] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r bg-card transition-[width] duration-200 lg:block",
          colapsado ? "w-16" : "w-64",
        )}
      >
        <SidebarNav colapsado={colapsado} />
      </aside>

      <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
        <SheetContent side="left" className="w-64 p-0 lg:hidden" showCloseButton={false}>
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SheetDescription className="sr-only">Módulos del sistema</SheetDescription>
          <SidebarNav alNavegar={() => setMenuAbierto(false)} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          colapsado ? "lg:pl-16" : "lg:pl-64",
        )}
      >
        <Topbar
          colapsado={colapsado}
          alAlternarColapso={() => setColapsado((v) => !v)}
          alAbrirMenu={() => setMenuAbierto(true)}
          sesion={sesion}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
