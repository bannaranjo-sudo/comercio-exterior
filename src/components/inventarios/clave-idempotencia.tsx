"use client"

import { useEffect, useRef } from "react"

/**
 * Token único por envío del formulario: un reenvío (doble clic, reintento) lleva el mismo token y el servidor
 * no duplica el movimiento. Al reiniciarse el formulario tras un éxito se genera uno nuevo.
 */
export function ClaveIdempotencia() {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const campo = ref.current
    if (!campo) return
    const renovar = () => {
      campo.value = crypto.randomUUID()
    }
    renovar()
    const formulario = campo.form
    formulario?.addEventListener("reset", renovar)
    return () => formulario?.removeEventListener("reset", renovar)
  }, [])

  return <input ref={ref} type="hidden" name="claveIdempotencia" defaultValue="" />
}
