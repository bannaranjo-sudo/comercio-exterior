# Análisis documental con IA

Flujo: Centro de Inteligencia → Nuevo análisis → **Análisis documental** (o pestaña *Inteligencia* de una operación) →
elegir operación y PDF → verificar la lectura → ejecutar → informe → enviar a revisión → aprobar, rechazar o devolver.

## Capas
1. **Extracción** (`documental/extraccion.ts`): texto por página de PDF con texto seleccionable. Sin OCR: un PDF escaneado se identifica como "sin texto" y un PDF dañado o protegido se informa, sin consultar al modelo.
2. **Razonamiento** (`prompt.ts`, adaptadores): el modelo recibe los documentos como *datos no confiables* (marcas únicas por ejecución; las instrucciones incluidas en un documento no se obedecen) y devuelve un JSON validado por esquema (`esquema.ts`). Una respuesta inválida no se guarda.
3. **Verificación** (`evidencia.ts`): cada cita se comprueba contra el texto del documento; la página se corrige o se descarta y lo no verificable se marca "sin evidencia". Los datos se clasifican como *extraído*, *inferido* o *sin evidencia*.

El informe no modifica operaciones, inventarios ni costos, no aprueba nada por sí mismo y no incluye clasificación arancelaria definitiva.

## Modo de ejecución (`IA_ANALISIS_MODO`)
| Valor | Efecto |
| --- | --- |
| *(sin definir)* / `deshabilitado` | **Predeterminado.** Las solicitudes quedan "En cola"; no se ejecuta ni se consume nada. |
| `simulado` | Proveedor local de pruebas, sin costo ni llamadas externas (resultado de demostración). |
| `real` | Llama a OpenAI. Exige clave del servidor **y** una autorización de un solo uso (abajo); sin ambas degrada a `deshabilitado`. |

## Control de consumo
Reserva atómica por empresa (bloqueo asesor de PostgreSQL), límites por usuario (10/h) y por empresa (30/h), máximo 2 ejecuciones simultáneas,
cola de 25, huella por selección de documentos (impide duplicados activos y repetir un informe vigente), registro de modelo, proveedor, duración y
tokens (sin contenido), y recuperación de ejecuciones interrumpidas (EN_CURSO > 5 min → FALLIDA, con reintento).

## Autorizar UNA sola ejecución real
1. Un administrador habilita OpenAI y asigna un modelo al agente *Análisis documental* en Configuración → Inteligencia artificial.
2. En el entorno del servidor (nunca en Git ni en la base) defina: `OPENAI_API_KEY`, `IA_ANALISIS_MODO=real` e `IA_ANALISIS_REAL_AUTORIZACION=<código aleatorio de 16+ caracteres>` (p. ej. `openssl rand -base64 24`). En QA añada `IA_QA_HABILITADA=true`. Reinicie.
3. Ejecute **un** análisis con documentos ficticios. El código queda consumido (se guarda solo su hash): una segunda ejecución real exige un código nuevo.
4. Al terminar, retire `IA_ANALISIS_MODO` y `OPENAI_API_KEY` del entorno.

## Cambios de base de datos (aditivos)
`DEVUELTO` en `estado_aprobacion`, `SIMULADO` en `proveedor_ia`, `ia_ejecuciones.huella` (+ índice único parcial de selecciones activas), `ia_uso.ejecucion_id` y `ia_uso.autorizacion_hash` (único).
