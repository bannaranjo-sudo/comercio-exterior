-- CreateEnum
CREATE TYPE "proveedor_ia" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE');

-- CreateEnum
CREATE TYPE "tipo_agente" AS ENUM ('ORQUESTADOR', 'ESPECIALISTA');

-- CreateEnum
CREATE TYPE "estado_ejecucion" AS ENUM ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'FALLIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "estado_aprobacion" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "ia_proveedores" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "proveedor" "proveedor_ia" NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_agentes" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "tipo_agente" NOT NULL DEFAULT 'ESPECIALISTA',
    "instrucciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orquestador_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_agentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_asignaciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "agente_id" UUID NOT NULL,
    "proveedor" "proveedor_ia" NOT NULL,
    "modelo" TEXT NOT NULL,
    "prioridad" INTEGER NOT NULL DEFAULT 1,
    "parametros" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_asignaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_ejecuciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "agente_id" UUID NOT NULL,
    "solicitada_por_id" UUID NOT NULL,
    "estado" "estado_ejecucion" NOT NULL DEFAULT 'PENDIENTE',
    "entrada" JSONB,
    "proveedor" "proveedor_ia",
    "modelo" TEXT,
    "error" TEXT,
    "ejecucion_padre_id" UUID,
    "iniciada_en" TIMESTAMP(3),
    "finalizada_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_ejecuciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_resultados" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "ejecucion_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_resultados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_aprobaciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "resultado_id" UUID NOT NULL,
    "estado" "estado_aprobacion" NOT NULL DEFAULT 'PENDIENTE',
    "decidida_por_id" UUID,
    "comentario" TEXT,
    "decidida_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_aprobaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ia_proveedores_empresa_id_proveedor_key" ON "ia_proveedores"("empresa_id", "proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "ia_agentes_empresa_id_codigo_key" ON "ia_agentes"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ia_agentes_id_empresa_id_key" ON "ia_agentes"("id", "empresa_id");

-- CreateIndex
CREATE INDEX "ia_asignaciones_empresa_id_idx" ON "ia_asignaciones"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "ia_asignaciones_agente_id_prioridad_key" ON "ia_asignaciones"("agente_id", "prioridad");

-- CreateIndex
CREATE INDEX "ia_ejecuciones_empresa_id_creado_en_idx" ON "ia_ejecuciones"("empresa_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "ia_ejecuciones_id_empresa_id_key" ON "ia_ejecuciones"("id", "empresa_id");

-- CreateIndex
CREATE INDEX "ia_resultados_empresa_id_creado_en_idx" ON "ia_resultados"("empresa_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "ia_resultados_id_empresa_id_key" ON "ia_resultados"("id", "empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "ia_aprobaciones_resultado_id_key" ON "ia_aprobaciones"("resultado_id");

-- CreateIndex
CREATE INDEX "ia_aprobaciones_empresa_id_estado_idx" ON "ia_aprobaciones"("empresa_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ia_aprobaciones_resultado_id_empresa_id_key" ON "ia_aprobaciones"("resultado_id", "empresa_id");

-- AddForeignKey
ALTER TABLE "ia_proveedores" ADD CONSTRAINT "ia_proveedores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_agentes" ADD CONSTRAINT "ia_agentes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_agentes" ADD CONSTRAINT "ia_agentes_orquestador_id_fkey" FOREIGN KEY ("orquestador_id") REFERENCES "ia_agentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_asignaciones" ADD CONSTRAINT "ia_asignaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_asignaciones" ADD CONSTRAINT "ia_asignaciones_agente_id_empresa_id_fkey" FOREIGN KEY ("agente_id", "empresa_id") REFERENCES "ia_agentes"("id", "empresa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_asignaciones" ADD CONSTRAINT "ia_asignaciones_empresa_id_proveedor_fkey" FOREIGN KEY ("empresa_id", "proveedor") REFERENCES "ia_proveedores"("empresa_id", "proveedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_ejecuciones" ADD CONSTRAINT "ia_ejecuciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_ejecuciones" ADD CONSTRAINT "ia_ejecuciones_agente_id_empresa_id_fkey" FOREIGN KEY ("agente_id", "empresa_id") REFERENCES "ia_agentes"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_ejecuciones" ADD CONSTRAINT "ia_ejecuciones_solicitada_por_id_fkey" FOREIGN KEY ("solicitada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_ejecuciones" ADD CONSTRAINT "ia_ejecuciones_ejecucion_padre_id_fkey" FOREIGN KEY ("ejecucion_padre_id") REFERENCES "ia_ejecuciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_resultados" ADD CONSTRAINT "ia_resultados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_resultados" ADD CONSTRAINT "ia_resultados_ejecucion_id_empresa_id_fkey" FOREIGN KEY ("ejecucion_id", "empresa_id") REFERENCES "ia_ejecuciones"("id", "empresa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_aprobaciones" ADD CONSTRAINT "ia_aprobaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_aprobaciones" ADD CONSTRAINT "ia_aprobaciones_resultado_id_empresa_id_fkey" FOREIGN KEY ("resultado_id", "empresa_id") REFERENCES "ia_resultados"("id", "empresa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_aprobaciones" ADD CONSTRAINT "ia_aprobaciones_decidida_por_id_fkey" FOREIGN KEY ("decidida_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una decisión (aprobado/rechazado) siempre requiere un usuario y una fecha: no hay aprobación automática.
ALTER TABLE "ia_aprobaciones" ADD CONSTRAINT "ia_aprobaciones_decision_humana_chk" CHECK ("estado" = 'PENDIENTE' OR ("decidida_por_id" IS NOT NULL AND "decidida_en" IS NOT NULL));
