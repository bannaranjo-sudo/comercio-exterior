"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Vuelve a leer la página cada pocos segundos mientras un análisis está en ejecución. */
export function AutoRefresco({ cadaMs = 4000 }: { cadaMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), cadaMs)
    return () => clearInterval(t)
  }, [router, cadaMs])
  return null
}
