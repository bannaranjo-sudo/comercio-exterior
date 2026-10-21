-- CreateEnum
CREATE TYPE "tipo_uso" AS ENUM ('PRUEBA_CONEXION', 'EJECUCION');

-- CreateEnum
CREATE TYPE "estado_uso" AS ENUM ('EN_CURSO', 'EXITOSA', 'FALLIDA');

-- CreateTable
CREATE TABLE "ia_uso" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_uso" NOT NULL,
    "proveedor" "proveedor_ia" NOT NULL,
    "modelo" TEXT NOT NULL,
    "estado" "estado_uso" NOT NULL DEFAULT 'EN_CURSO',
    "codigo_error" TEXT,
    "duracion_ms" INTEGER,
    "tokens_entrada" INTEGER,
    "tokens_salida" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_uso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ia_uso_empresa_id_tipo_creado_en_idx" ON "ia_uso"("empresa_id", "tipo", "creado_en");

-- AddForeignKey
ALTER TABLE "ia_uso" ADD CONSTRAINT "ia_uso_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_uso" ADD CONSTRAINT "ia_uso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Refuerzo de aislamiento: las relaciones opcionales (orquestador y ejecución padre) no pueden cruzar empresas.
-- Prisma no admite claves foráneas compuestas opcionales, por lo que se exige en la base con triggers.
CREATE FUNCTION ia_validar_misma_empresa() RETURNS trigger AS $$
DECLARE
  empresa_referida uuid;
BEGIN
  IF TG_TABLE_NAME = 'ia_agentes' AND NEW.orquestador_id IS NOT NULL THEN
    SELECT empresa_id INTO empresa_referida FROM ia_agentes WHERE id = NEW.orquestador_id;
  ELSIF TG_TABLE_NAME = 'ia_ejecuciones' AND NEW.ejecucion_padre_id IS NOT NULL THEN
    SELECT empresa_id INTO empresa_referida FROM ia_ejecuciones WHERE id = NEW.ejecucion_padre_id;
  ELSE
    RETURN NEW;
  END IF;
  IF empresa_referida IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La referencia debe pertenecer a la misma empresa' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ia_agentes_misma_empresa
  BEFORE INSERT OR UPDATE OF orquestador_id, empresa_id ON ia_agentes
  FOR EACH ROW EXECUTE FUNCTION ia_validar_misma_empresa();

CREATE TRIGGER ia_ejecuciones_misma_empresa
  BEFORE INSERT OR UPDATE OF ejecucion_padre_id, empresa_id ON ia_ejecuciones
  FOR EACH ROW EXECUTE FUNCTION ia_validar_misma_empresa();
