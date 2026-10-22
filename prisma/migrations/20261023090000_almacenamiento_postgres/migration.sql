-- CreateTable
CREATE TABLE "archivos_almacenados" (
    "clave" TEXT NOT NULL,
    "empresa_id" UUID NOT NULL,
    "contenido" BYTEA NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_almacenados_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "archivos_almacenados_empresa_id_idx" ON "archivos_almacenados"("empresa_id");

-- AddForeignKey
ALTER TABLE "archivos_almacenados" ADD CONSTRAINT "archivos_almacenados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

