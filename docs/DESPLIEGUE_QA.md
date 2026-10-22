# Despliegue del entorno QA (Vercel + PostgreSQL gestionado)

Entorno remoto, permanente y **independiente del desarrollo local**: base propia, archivos propios, secretos propios y
empresa ficticia `QA-0001`. Nada se copia desde la base local ni desde COOPDECOC.

## 1. Compatibilidad con Vercel

| Aspecto | Estado |
| --- | --- |
| Next.js 16 (App Router, Server Actions, `proxy.ts`) | Compatible; sin servidor propio ni procesos persistentes. |
| Prisma 7 + `@prisma/adapter-pg` | Compatible. `postinstall` ejecuta `prisma generate`; el cliente (`src/generated`) no va a Git. |
| Better Auth | Compatible. En remoto exige `BETTER_AUTH_URL` https, secreto ≥ 32 caracteres y un único origen confiable. |
| Documentos PDF | El disco de Vercel es efímero → proveedor **PostgreSQL** (`STORAGE_DRIVER=postgres`, tabla `archivos_almacenados`). Local sigue siendo el predeterminado en desarrollo. |
| Tamaño de PDF | Vercel limita el cuerpo de una solicitud a ~4,5 MB → en Vercel el máximo por PDF es **4 MB** (`DOCUMENTOS_MAX_MB`). |
| Migraciones | Manuales y controladas (`npm run qa:migrar`), nunca automáticas en el build. |
| IA (OpenAI) | Desactivada en QA aunque exista una clave, salvo `IA_QA_HABILITADA=true`. |

## 2. Servicios externos necesarios (los crea usted)

1. **Repositorio GitHub** privado con este código (usted hace el `git push`; aquí no se hizo).
2. **Cuenta Vercel** y un proyecto nuevo y exclusivo (p. ej. `comercio-exterior-qa`). *Nota:* el plan Hobby es para uso personal no comercial; para una empresa corresponde el plan Pro.
3. **PostgreSQL gestionado exclusivo de QA** (Neon, Supabase, Vercel Postgres/Marketplace u otro). Necesita dos URL con `sslmode=require`: una **con pooler** (`DATABASE_URL`) y una **directa** (`DIRECT_URL`). Elija la región más cercana a la de las funciones de Vercel.

No se necesita Vercel Blob, S3 ni Redis.

## 3. Variables de entorno (se cargan solo en Vercel → Settings → Environment Variables)

| Variable | Valor | Obligatoria |
| --- | --- | --- |
| `APP_ENV` | `qa` | Sí |
| `BETTER_AUTH_URL` | `https://<dominio-qa>.vercel.app` (sin barra final) | Sí |
| `BETTER_AUTH_SECRET` | Secreto nuevo, solo para QA: `openssl rand -base64 48` | Sí |
| `DATABASE_URL` | URL **con pooler** de la base de QA | Sí |
| `DIRECT_URL` | URL **directa** de la base de QA | Sí |
| `STORAGE_DRIVER` | `postgres` | Sí |
| `DOCUMENTOS_MAX_MB` | `4` | Recomendada |
| `DB_POOL_MAX` | `3` | Recomendada |
| `APP_TIMEZONE` | `America/Bogota` | Opcional |
| `OPENAI_API_KEY`, `IA_QA_HABILITADA`, `IA_PRUEBA_REAL_AUTORIZADA` | **No definirlas** (IA apagada) | — |

Reglas: use secretos **distintos** a los locales; no pegue estas variables en el repositorio ni en chats; no reutilice la URL de la base local.
Defina `BETTER_AUTH_URL` con el dominio **de producción** del proyecto (no con URL de vista previa: no serían orígenes confiables).

## 4. Pasos para el primer enlace HTTPS

1. **Base de datos:** cree la base de QA y copie sus dos URL (no las comparta).
2. **GitHub:** cree el repositorio privado, `git remote add origin …` y suba la rama de trabajo; cree la rama `qa` desde un commit verificado.
3. **Vercel:** *Add New → Project →* importe el repositorio; framework Next.js (detecta `vercel.json`); en *Settings → Git* deje `qa` como *Production Branch*; cargue las variables de la sección 3 para *Production*. Aún **no** despliegue (o deje que falle la primera vez: no importa).
4. **Migrar la base de QA** desde su computador (PowerShell; las variables viven solo en esa ventana, ciérrela al terminar):
   ```powershell
   $env:DATABASE_URL = "<URL directa de la base de QA>"
   $env:QA_CONFIRMAR_HOST = "<host de esa URL, p. ej. ep-xxxx.neon.tech>"
   npm run qa:migrar
   ```
   El script **no lee `.env`**, rechaza hosts locales, exige confirmar el host y solo ejecuta `prisma migrate deploy` (nunca `reset` ni seeds).
5. **Inicializar QA** (una vez; idempotente), en la misma ventana:
   ```powershell
   $env:APP_ENV = "qa"
   $env:BETTER_AUTH_URL = "https://<dominio-qa>.vercel.app"
   $env:QA_ADMIN_CORREO = "<su correo>"
   $env:QA_LUISA_CORREO = "<correo de Luisa>"
   $env:QA_DATOS_DEMO = "si"          # opcional: datos ficticios identificados como DEMO
   npm run qa:inicializar
   ```
   Crea la empresa ficticia `QA-0001` ("Empresa Demostrativa QA (datos ficticios)"), los tres roles, su cuenta y la de Luisa **sin contraseña**, y **imprime una vez** un enlace de activación por persona. Se niega a correr si la base contiene empresas que no sean `QA-*`.
6. **Desplegar:** en Vercel, *Deployments → Redeploy* (o suba un commit a la rama `qa`). Abra `https://<dominio-qa>.vercel.app`: debe mostrar el acceso y, ya dentro, el aviso "Entorno de pruebas · datos ficticios".
7. **Activar su cuenta** con su enlace (defina su propia contraseña, mínimo 12 caracteres) y compruebe el recorrido de la sección 7.

## 5. Cuenta de Luisa (procedimiento seguro)

- Rol **Operador** de `QA-0001`: consulta, crea y edita en módulos operativos y puede exportar reportes. **No** tiene Administración, configuración de IA ni eliminación de registros.
- Entregue su enlace de activación por un canal privado (un solo uso, vence en 48 h; en base solo se guarda su hash). Luisa define su propia contraseña; no existen contraseñas predeterminadas.
- Si el enlace vence: inicie sesión como administrador → Configuración → Usuarios y accesos → generar nuevo enlace.
- Para retirarle el acceso: desactive su membresía en esa misma pantalla.

## 6. Publicar cambios después

1. Verifique en local: `npm test`, `npm run lint`, `npm run build`.
2. Si hubo migraciones nuevas: ejecute `npm run qa:migrar` (paso 4) **antes** de desplegar.
3. Fusione a la rama `qa` y haga `git push`: Vercel despliega automáticamente. Para revertir, *Deployments →* versión anterior → *Promote*.

## 7. Verificación tras desplegar

- `/acceso` carga por HTTPS; sin sesión, cualquier otra ruta redirige a `/acceso`.
- Entrar como Luisa: no aparece Administración; `/configuracion/…` sensibles responden sin acceso.
- Crear una importación → cargar un PDF (≤ 4 MB) → descargarlo; registrar una recepción; abrir Reportes y exportar.
- Centro de Inteligencia: debe indicar que no hay proveedor/clave conectada (IA apagada).

## 8. Limitaciones y riesgos

- **Límite de rate de login:** Better Auth lo guarda en memoria de cada instancia serverless; no es global. Mitigación: contraseñas fuertes (≥ 12) y pocas cuentas conocidas.
- **PDF en la base:** simple y privado, pero la base crece; adecuado para QA, no para volumen productivo (allí conviene almacenamiento de objetos privado: la interfaz `AlmacenamientoArchivos` ya lo permite).
- **PDF ≤ 4 MB** en Vercel por el límite de solicitudes de la plataforma.
- **Arranque en frío** de funciones y de la base (según proveedor): la primera carga puede tardar unos segundos.
- La rama de producción de Vercel apunta a `qa`: no conecte este proyecto a la base local ni a COOPDECOC.
- Los datos de QA son ficticios; no cargue información empresarial real.
