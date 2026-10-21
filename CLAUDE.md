
# Sistema Integral de Comercio Exterior y Logística

## Objetivo
Desarrollar un software web empresarial para gestionar importaciones, exportaciones, logística, inventarios, costos, documentos y reportes.

## Stack tecnológico
- Next.js 16 con App Router.
- TypeScript.
- Tailwind CSS v4.
- shadcn/ui.
- PostgreSQL y Prisma ORM (etapa posterior).
- Arquitectura monolítica modular.
- npm como gestor de paquetes.

## Documentación
- docs/ARCHITECTURE.md: arquitectura y módulos.
- docs/ROADMAP.md: etapas de implementación.

Consultar estos documentos solo cuando sean relevantes.

## Reglas de programación
1. Desarrollar una funcionalidad por tarea.
2. Revisar únicamente los archivos relacionados.
3. Reutilizar componentes existentes.
4. Evitar dependencias innecesarias.
5. Separar interfaz, lógica de negocio y acceso a datos.
6. Utilizar TypeScript con tipos explícitos y seguros.
7. Implementar validaciones y manejo de errores.
8. Mantener una interfaz profesional, responsive y en español.
9. No modificar funcionalidades ajenas a la solicitud.
10. No ejecutar comandos destructivos sin autorización.

## Seguridad
- Nunca publicar credenciales ni archivos .env.
- Implementar permisos del lado del servidor.
- Mantener aislamiento de información por empresa.
- No utilizar información empresarial real como datos de prueba.
- No modificar datos productivos sin autorización.

## Optimización de tokens
- Mantener respuestas breves y técnicas.
- No revisar todo el repositorio innecesariamente.
- No generar documentación extensa salvo solicitud.
- Evitar explicaciones repetitivas.
- No investigar alternativas si ya existe una solución aprobada.
- No crear funcionalidades adicionales por iniciativa propia.
- Utilizar herramientas y archivos estrictamente necesarios.

## Verificación
Al finalizar cada tarea:
1. Ejecutar las pruebas pertinentes.
2. Ejecutar npm run lint y npm run build cuando corresponda.
3. Reportar errores pendientes.
4. No hacer git push automáticamente.

## Formato de respuesta
Informar únicamente:
- Cambios implementados.
- Pruebas ejecutadas.
- Errores pendientes.
- Siguiente paso recomendado.
