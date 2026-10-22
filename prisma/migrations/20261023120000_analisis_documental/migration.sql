-- AlterEnum
ALTER TYPE "proveedor_ia" ADD VALUE 'SIMULADO';

-- AlterEnum
ALTER TYPE "estado_aprobacion" ADD VALUE 'DEVUELTO';

-- AlterTable
ALTER TABLE "ia_ejecuciones" ADD COLUMN     "huella" TEXT;

-- AlterTable
ALTER TABLE "ia_uso" ADD COLUMN     "autorizacion_hash" TEXT,
ADD COLUMN     "ejecucion_id" UUID;

-- CreateIndex
CREATE INDEX "ia_ejecuciones_empresa_id_huella_idx" ON "ia_ejecuciones"("empresa_id", "huella");

-- CreateIndex
CREATE UNIQUE INDEX "ia_uso_autorizacion_hash_key" ON "ia_uso"("autorizacion_hash");

-- AddForeignKey
ALTER TABLE "ia_uso" ADD CONSTRAINT "ia_uso_ejecucion_id_fkey" FOREIGN KEY ("ejecucion_id") REFERENCES "ia_ejecuciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Un solo análisis activo por huella (operación + documentos): impide duplicados concurrentes.
CREATE UNIQUE INDEX "ia_ejecuciones_huella_activa_key" ON "ia_ejecuciones"("empresa_id", "huella")
  WHERE "huella" IS NOT NULL AND "estado" IN ('PENDIENTE', 'EN_CURSO');
