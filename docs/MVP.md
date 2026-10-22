# MVP operativo de comercio exterior

Estado: primera versión interna con datos persistidos en PostgreSQL.

## Módulos disponibles
| Módulo | Qué permite |
|---|---|
| Terceros | Alta, edición, búsqueda, filtros y desactivación (nunca se eliminan); varios roles comerciales por tercero. |
| Operaciones | Importaciones/exportaciones con consecutivo por empresa (`IMP-AAAA-0001`), estados controlados, historial de cambios y expediente por pestañas. |
| Documentos | Carga de PDF validado (firma real, máx. 10 MB), almacenamiento privado, estados, lista de documentos requeridos configurable y descarga autenticada (`/api/documentos/[id]`). |
| Logística | Datos de transporte por operación, hitos, novedades y línea de tiempo. |
| Costos | Costos estimados/reales por categoría; totales siempre separados por moneda (sin tasas de cambio ni impuestos). |
| Dashboard | Indicadores reales de la empresa activa (operaciones, llegadas, documentos pendientes, incidencias). |
| Administración | Usuarios de la empresa, roles, permisos efectivos, activación/desactivación, invitación de un solo uso (sin contraseñas predeterminadas). |
| Centro de Inteligencia | Estructura multiproveedor con OpenAI; los análisis siguen deshabilitados. |

## Seguridad
- Cada consulta y escritura filtra por la empresa de la sesión; las relaciones usan claves compuestas `(id, empresa_id)`.
- Toda Server Action pasa por `proteger()` (sesión + permiso en la empresa activa). El cliente nunca aporta `empresaId`.
- Los archivos viven fuera de `/public` (`STORAGE_DIR`, por defecto `./storage`) detrás de la interfaz `AlmacenamientoArchivos`, sustituible por almacenamiento externo.

## Variables de entorno
Ver `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `STORAGE_DIR`, `APP_TIMEZONE` (y las de OpenAI, solo servidor).

## Demostración
1. `docker compose up -d db` y `npm run dev`; iniciar sesión con una cuenta autorizada y elegir la empresa.
2. Terceros → registrar un proveedor. Operaciones → crear una importación vinculada.
3. En el expediente: Documentos (cargar factura PDF), Logística (hito), Costos (gasto).
4. Dashboard: los cambios aparecen sin intervención manual en la base.
- Datos ficticios opcionales (solo bases `_test`/`_demo`): `npm run demo:datos`.
- Primer administrador de una empresa: `npm run auth:crear-admin -- --empresa <identificación>`.

## Limitaciones conocidas
- Almacenamiento local de archivos: sin antivirus ni versionado de documentos.
- Sin tasas de cambio ni cálculo tributario.
- Sin recuperación de contraseña por correo (el administrador genera un nuevo enlace de activación).
- Inventarios y Reportes siguen sin implementar.
