-- AlterEnum
ALTER TYPE "estado_uso" ADD VALUE 'SIN_CONTENIDO';

-- AlterTable
ALTER TABLE "ia_uso" ADD COLUMN     "caracteres_salida" INTEGER,
ADD COLUMN     "motivo_fin" TEXT,
ADD COLUMN     "tokens_razonamiento" INTEGER;
