
# Arquitectura del Sistema de Comercio Exterior

## 1. Objetivo
Desarrollar una plataforma web integral para administrar operaciones de importación, exportación, logística, inventarios, costos, documentos y reportes empresariales.

## 2. Tecnologías
- Frontend: Next.js, React y TypeScript.
- Backend: Next.js Server Actions y Route Handlers.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Diseño: Tailwind CSS y shadcn/ui.
- Arquitectura: monolito modular.

## 3. Módulos

### Dashboard
Indicadores generales, operaciones activas, alertas y estadísticas.

### Operaciones
Registro y seguimiento de importaciones y exportaciones, estados y responsables.

### Logística
Embarques, contenedores, transporte marítimo, aéreo y terrestre.

### Inventarios
Productos, bodegas, entradas, salidas y existencias.

### Costos
Gastos estimados y reales, monedas y liquidación de operaciones.

### Documentos
Archivos asociados a operaciones, versiones y trazabilidad.

### Terceros
Proveedores, clientes, agentes de aduanas y transportadoras.

### Reportes
Informes operativos, financieros y gerenciales.

### Administración
Empresas, usuarios, roles, permisos y configuración.

## 4. Entidades principales
- Empresa
- Usuario
- Rol
- Permiso
- Tercero
- Producto
- Operación
- Embarque
- Contenedor
- Documento
- Gasto
- Bodega
- Movimiento de inventario

## 5. Reglas de arquitectura
1. Cada operación pertenece a una empresa.
2. Los usuarios solo acceden a empresas autorizadas.
3. Toda operación conserva historial de cambios.
4. Los documentos se relacionan con su operación.
5. Los costos admiten diferentes monedas.
6. La validación y autorización se realizan en el servidor.
7. La lógica de negocio permanece separada de la interfaz.
8. Las modificaciones de datos importantes deben ser auditables.
9. El sistema debe permitir crecimiento modular.
10. No implementar microservicios inicialmente.

## 6. Seguridad
- Autenticación segura.
- Permisos por rol y empresa.
- Protección de documentos.
- Validación de entradas.
- Gestión segura de credenciales.
- Registro de auditoría.
