-- CreateEnum
CREATE TYPE "rol_tercero" AS ENUM ('PROVEEDOR', 'CLIENTE', 'AGENTE_ADUANA', 'TRANSPORTADOR', 'OPERADOR_LOGISTICO', 'OTRO');

-- CreateEnum
CREATE TYPE "ambito_tercero" AS ENUM ('NACIONAL', 'INTERNACIONAL');

-- CreateEnum
CREATE TYPE "tipo_operacion" AS ENUM ('IMPORTACION', 'EXPORTACION');

-- CreateEnum
CREATE TYPE "estado_operacion" AS ENUM ('BORRADOR', 'EN_PREPARACION', 'EN_TRANSITO', 'EN_ADUANA', 'FINALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "incoterm" AS ENUM ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP');

-- CreateEnum
CREATE TYPE "modalidad_transporte" AS ENUM ('MARITIMO', 'AEREO', 'TERRESTRE', 'MULTIMODAL');

-- CreateEnum
CREATE TYPE "tipo_documento" AS ENUM ('FACTURA_COMERCIAL', 'LISTA_EMPAQUE', 'DOCUMENTO_TRANSPORTE', 'CERTIFICADO_ORIGEN', 'FICHA_TECNICA', 'DECLARACION_ADUANERA', 'POLIZA_SEGURO', 'OTRO');

-- CreateEnum
CREATE TYPE "estado_documento" AS ENUM ('PENDIENTE', 'RECIBIDO', 'OBSERVADO', 'APROBADO');

-- CreateEnum
CREATE TYPE "estado_envio" AS ENUM ('PROGRAMADO', 'EN_TRANSITO', 'EN_PUERTO', 'ENTREGADO', 'RETRASADO');

-- CreateEnum
CREATE TYPE "tipo_evento" AS ENUM ('HITO', 'NOVEDAD');

-- CreateEnum
CREATE TYPE "severidad_novedad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "categoria_costo" AS ENUM ('VALOR_COMERCIAL', 'FLETE_INTERNACIONAL', 'SEGURO', 'GASTOS_PORTUARIOS', 'AGENCIA_ADUANAS', 'TRANSPORTE_NACIONAL', 'ALMACENAMIENTO', 'TRIBUTOS_ADUANEROS', 'OTROS');

-- CreateEnum
CREATE TYPE "estado_costo" AS ENUM ('ESTIMADO', 'REAL');

-- CreateTable
CREATE TABLE "terceros" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "identificacion_fiscal" TEXT NOT NULL,
    "ambito" "ambito_tercero" NOT NULL DEFAULT 'NACIONAL',
    "roles" "rol_tercero"[],
    "pais" TEXT NOT NULL,
    "ciudad" TEXT,
    "direccion" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "contacto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terceros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadores" (
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_pkey" PRIMARY KEY ("empresa_id","nombre")
);

-- CreateTable
CREATE TABLE "operaciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "tipo_operacion" NOT NULL,
    "estado" "estado_operacion" NOT NULL DEFAULT 'BORRADOR',
    "fecha_apertura" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tercero_id" UUID NOT NULL,
    "pais_origen" TEXT NOT NULL,
    "pais_destino" TEXT NOT NULL,
    "incoterm" "incoterm" NOT NULL,
    "lugar_incoterm" TEXT NOT NULL,
    "moneda" VARCHAR(3) NOT NULL,
    "valor_estimado" DECIMAL(18,2) NOT NULL,
    "modalidad" "modalidad_transporte" NOT NULL,
    "responsable_id" UUID NOT NULL,
    "observaciones" TEXT,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operaciones_historial" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operaciones_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "tipo" "tipo_documento" NOT NULL,
    "estado" "estado_documento" NOT NULL DEFAULT 'RECIBIDO',
    "nombre_original" TEXT NOT NULL,
    "clave_almacenamiento" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "observaciones" TEXT,
    "subido_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitos_documentales" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "tipo_operacion" "tipo_operacion" NOT NULL,
    "tipo_documento" "tipo_documento" NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "requisitos_documentales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "medio_transporte" "modalidad_transporte",
    "numero_guia" TEXT,
    "transportador_id" UUID,
    "puerto_origen" TEXT,
    "puerto_destino" TEXT,
    "fecha_estimada_salida" DATE,
    "fecha_real_salida" DATE,
    "fecha_estimada_llegada" DATE,
    "fecha_real_llegada" DATE,
    "estado_envio" "estado_envio" NOT NULL DEFAULT 'PROGRAMADO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_logisticos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "tipo" "tipo_evento" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha_evento" TIMESTAMP(3) NOT NULL,
    "severidad" "severidad_novedad",
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "resuelta_en" TIMESTAMP(3),
    "registrado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_logisticos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "categoria" "categoria_costo" NOT NULL,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "moneda" VARCHAR(3) NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "estado_costo" NOT NULL,
    "observacion" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "usada_en" TIMESTAMP(3),
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terceros_empresa_id_activo_idx" ON "terceros"("empresa_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "terceros_empresa_id_identificacion_fiscal_key" ON "terceros"("empresa_id", "identificacion_fiscal");

-- CreateIndex
CREATE UNIQUE INDEX "terceros_id_empresa_id_key" ON "terceros"("id", "empresa_id");

-- CreateIndex
CREATE INDEX "operaciones_empresa_id_estado_idx" ON "operaciones"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "operaciones_empresa_id_creado_en_idx" ON "operaciones"("empresa_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_empresa_id_consecutivo_key" ON "operaciones"("empresa_id", "consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_empresa_id_numero_key" ON "operaciones"("empresa_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_id_empresa_id_key" ON "operaciones"("id", "empresa_id");

-- CreateIndex
CREATE INDEX "operaciones_historial_operacion_id_creado_en_idx" ON "operaciones_historial"("operacion_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_clave_almacenamiento_key" ON "documentos"("clave_almacenamiento");

-- CreateIndex
CREATE INDEX "documentos_empresa_id_estado_idx" ON "documentos"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "documentos_operacion_id_tipo_idx" ON "documentos"("operacion_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "requisitos_documentales_empresa_id_tipo_operacion_tipo_docu_key" ON "requisitos_documentales"("empresa_id", "tipo_operacion", "tipo_documento");

-- CreateIndex
CREATE INDEX "envios_empresa_id_fecha_estimada_llegada_idx" ON "envios"("empresa_id", "fecha_estimada_llegada");

-- CreateIndex
CREATE UNIQUE INDEX "envios_operacion_id_empresa_id_key" ON "envios"("operacion_id", "empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "envios_operacion_id_key" ON "envios"("operacion_id");

-- CreateIndex
CREATE INDEX "eventos_logisticos_operacion_id_fecha_evento_idx" ON "eventos_logisticos"("operacion_id", "fecha_evento");

-- CreateIndex
CREATE INDEX "eventos_logisticos_empresa_id_tipo_resuelta_idx" ON "eventos_logisticos"("empresa_id", "tipo", "resuelta");

-- CreateIndex
CREATE INDEX "costos_operacion_id_estado_idx" ON "costos"("operacion_id", "estado");

-- CreateIndex
CREATE INDEX "costos_empresa_id_moneda_idx" ON "costos"("empresa_id", "moneda");

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_token_hash_key" ON "invitaciones"("token_hash");

-- CreateIndex
CREATE INDEX "invitaciones_usuario_id_idx" ON "invitaciones"("usuario_id");

-- AddForeignKey
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores" ADD CONSTRAINT "contadores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_tercero_id_empresa_id_fkey" FOREIGN KEY ("tercero_id", "empresa_id") REFERENCES "terceros"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_empresa_id_responsable_id_fkey" FOREIGN KEY ("empresa_id", "responsable_id") REFERENCES "empresa_usuarios"("empresa_id", "usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_historial" ADD CONSTRAINT "operaciones_historial_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_historial" ADD CONSTRAINT "operaciones_historial_operacion_id_empresa_id_fkey" FOREIGN KEY ("operacion_id", "empresa_id") REFERENCES "operaciones"("id", "empresa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_historial" ADD CONSTRAINT "operaciones_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_operacion_id_empresa_id_fkey" FOREIGN KEY ("operacion_id", "empresa_id") REFERENCES "operaciones"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitos_documentales" ADD CONSTRAINT "requisitos_documentales_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_operacion_id_empresa_id_fkey" FOREIGN KEY ("operacion_id", "empresa_id") REFERENCES "operaciones"("id", "empresa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios" ADD CONSTRAINT "envios_transportador_id_fkey" FOREIGN KEY ("transportador_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_logisticos" ADD CONSTRAINT "eventos_logisticos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_logisticos" ADD CONSTRAINT "eventos_logisticos_operacion_id_empresa_id_fkey" FOREIGN KEY ("operacion_id", "empresa_id") REFERENCES "operaciones"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_logisticos" ADD CONSTRAINT "eventos_logisticos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos" ADD CONSTRAINT "costos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos" ADD CONSTRAINT "costos_operacion_id_empresa_id_fkey" FOREIGN KEY ("operacion_id", "empresa_id") REFERENCES "operaciones"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos" ADD CONSTRAINT "costos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridad adicional --------------------------------------------------------------------------
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_valores_chk" CHECK ("valor_estimado" >= 0 AND "moneda" ~ '^[A-Z]{3}$');
ALTER TABLE "costos" ADD CONSTRAINT "costos_valores_chk" CHECK ("valor" >= 0 AND "moneda" ~ '^[A-Z]{3}$');
ALTER TABLE "eventos_logisticos" ADD CONSTRAINT "eventos_novedad_chk" CHECK ("tipo" = 'NOVEDAD' OR "severidad" IS NULL);

-- Referencia opcional entre tablas: debe pertenecer a la misma empresa (Prisma no admite claves compuestas opcionales).
CREATE FUNCTION validar_ref_misma_empresa() RETURNS trigger AS $$
DECLARE
  ref_id uuid;
  ref_empresa uuid;
BEGIN
  EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO ref_id USING NEW;
  IF ref_id IS NOT NULL THEN
    EXECUTE format('SELECT empresa_id FROM %I WHERE id = $1', TG_ARGV[1]) INTO ref_empresa USING ref_id;
    IF ref_empresa IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'La referencia debe pertenecer a la misma empresa' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER envios_transportador_misma_empresa
  BEFORE INSERT OR UPDATE OF transportador_id, empresa_id ON envios
  FOR EACH ROW EXECUTE FUNCTION validar_ref_misma_empresa('transportador_id', 'terceros');