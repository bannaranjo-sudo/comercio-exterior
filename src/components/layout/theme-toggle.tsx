"use client"

import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  function alternar() {
    const oscuro = document.documentElement.classList.toggle("dark")
    try {
      localStorage.setItem("tema", oscuro ? "dark" : "light")
    } catch {}
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={alternar}
      aria-label="Cambiar entre modo claro y oscuro"
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
    </Button>
  )
}
