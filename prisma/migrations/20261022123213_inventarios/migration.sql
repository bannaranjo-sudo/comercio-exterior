-- CreateEnum
CREATE TYPE "unidad_medida" AS ENUM ('UNIDAD', 'KILOGRAMO', 'GRAMO', 'LITRO', 'METRO', 'METRO_CUADRADO', 'METRO_CUBICO', 'CAJA', 'PAR');

-- CreateEnum
CREATE TYPE "tipo_movimiento" AS ENUM ('RECEPCION', 'ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE', 'COMPENSACION');

-- CreateEnum
CREATE TYPE "sentido_movimiento" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateTable
CREATE TABLE "productos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT,
    "unidad" "unidad_medida" NOT NULL DEFAULT 'UNIDAD',
    "pais_origen" TEXT,
    "codigo_arancelario" TEXT,
    "proveedor_id" UUID,
    "stock_minimo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodegas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "ciudad" TEXT,
    "responsable_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bodegas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencias" (
    "empresa_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "bodega_id" UUID NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("producto_id","bodega_id")
);

-- CreateTable
CREATE TABLE "recepciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "operacion_id" UUID NOT NULL,
    "bodega_id" UUID NOT NULL,
    "fecha_recepcion" DATE NOT NULL,
    "documento_id" UUID,
    "clave_idempotencia" TEXT NOT NULL,
    "observaciones" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_lineas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "recepcion_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad_esperada" DECIMAL(18,4),
    "cantidad_recibida" DECIMAL(18,4) NOT NULL,
    "observacion" TEXT,

    CONSTRAINT "recepciones_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "bodega_id" UUID NOT NULL,
    "tipo" "tipo_movimiento" NOT NULL,
    "sentido" "sentido_movimiento" NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "saldo_posterior" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    "referencia" TEXT,
    "grupo_id" UUID,
    "recepcion_id" UUID,
    "operacion_id" UUID,
    "compensa_de_id" UUID,
    "clave_idempotencia" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "productos_empresa_id_activo_idx" ON "productos"("empresa_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "productos_empresa_id_sku_key" ON "productos"("empresa_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "productos_id_empresa_id_key" ON "productos"("id", "empresa_id");

-- CreateIndex
CREATE INDEX "bodegas_empresa_id_activo_idx" ON "bodegas"("empresa_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "bodegas_empresa_id_codigo_key" ON "bodegas"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "bodegas_id_empresa_id_key" ON "bodegas"("id", "empresa_id");

-- CreateIndex
CREATE INDEX "existencias_empresa_id_bodega_id_idx" ON "existencias"("empresa_id", "bodega_id");

-- CreateIndex
CREATE INDEX "recepciones_empresa_id_creado_en_idx" ON "recepciones"("empresa_id", "creado_en");

-- CreateIndex
CREATE INDEX "recepciones_operacion_id_idx" ON "recepciones"("operacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_empresa_id_numero_key" ON "recepciones"("empresa_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_empresa_id_clave_idempotencia_key" ON "recepciones"("empresa_id", "clave_idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_id_empresa_id_key" ON "recepciones"("id", "empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_lineas_recepcion_id_producto_id_key" ON "recepciones_lineas"("recepcion_id", "producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_inventario_compensa_de_id_key" ON "movimientos_inventario"("compensa_de_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_empresa_id_creado_en_idx" ON "movimientos_inventario"("empresa_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimientos_inventario_producto_id_bodega_id_creado_en_idx" ON "movimientos_inventario"("producto_id", "bodega_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimientos_inventario_grupo_id_idx" ON "movimientos_inventario"("grupo_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_inventario_empresa_id_clave_idempotencia_key" ON "movimientos_inventario"("empresa_id", "clave_idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_inventario_id_empresa_id_key" ON "movimientos_inventario"("id", "empresa_id");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_producto_id_empresa_id_fkey" FOREIGN KEY ("producto_id", "empresa_id") REFERENCES "productos"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_bodega_id_empresa_id_fkey" FOREIGN KEY ("bodega_id", "empresa_id") REFERENCES "bodegas"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_operacion_id_empresa_id_fkey" FOREIGN KEY ("operacion_id", "empresa_id") REFERENCES "operaciones"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_bodega_id_empresa_id_fkey" FOREIGN KEY ("bodega_id", "empresa_id") REFERENCES "bodegas"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_lineas" ADD CONSTRAINT "recepciones_lineas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_lineas" ADD CONSTRAINT "recepciones_lineas_recepcion_id_empresa_id_fkey" FOREIGN KEY ("recepcion_id", "empresa_id") REFERENCES "recepciones"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_lineas" ADD CONSTRAINT "recepciones_lineas_producto_id_empresa_id_fkey" FOREIGN KEY ("producto_id", "empresa_id") REFERENCES "productos"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_empresa_id_fkey" FOREIGN KEY ("producto_id", "empresa_id") REFERENCES "productos"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_bodega_id_empresa_id_fkey" FOREIGN KEY ("bodega_id", "empresa_id") REFERENCES "bodegas"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_compensa_de_id_fkey" FOREIGN KEY ("compensa_de_id") REFERENCES "movimientos_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridad adicional de Inventarios -----------------------------------------------------------------
ALTER TABLE "productos" ADD CONSTRAINT "productos_stock_minimo_chk" CHECK ("stock_minimo" >= 0);
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_no_negativa_chk" CHECK ("cantidad" >= 0);
ALTER TABLE "recepciones_lineas" ADD CONSTRAINT "recepciones_lineas_cantidades_chk"
  CHECK ("cantidad_recibida" > 0 AND ("cantidad_esperada" IS NULL OR "cantidad_esperada" > 0));
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_cantidad_chk" CHECK ("cantidad" > 0 AND "saldo_posterior" >= 0);
-- Salidas y compensaciones exigen motivo; los ajustes, una justificación de al menos 10 caracteres.
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_motivo_chk" CHECK (
  ("tipo" NOT IN ('SALIDA', 'COMPENSACION') OR ("motivo" IS NOT NULL AND length(btrim("motivo")) >= 3))
  AND ("tipo" <> 'AJUSTE' OR ("motivo" IS NOT NULL AND length(btrim("motivo")) >= 10))
);
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_compensacion_chk" CHECK ("tipo" = 'COMPENSACION' OR "compensa_de_id" IS NULL);

-- Referencias opcionales: deben pertenecer a la misma empresa (Prisma no admite claves compuestas opcionales).
CREATE TRIGGER productos_proveedor_misma_empresa
  BEFORE INSERT OR UPDATE OF proveedor_id, empresa_id ON productos
  FOR EACH ROW EXECUTE FUNCTION validar_ref_misma_empresa('proveedor_id', 'terceros');
CREATE TRIGGER recepciones_documento_misma_empresa
  BEFORE INSERT OR UPDATE OF documento_id, empresa_id ON recepciones
  FOR EACH ROW EXECUTE FUNCTION validar_ref_misma_empresa('documento_id', 'documentos');
CREATE TRIGGER movimientos_recepcion_misma_empresa
  BEFORE INSERT OR UPDATE OF recepcion_id, empresa_id ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION validar_ref_misma_empresa('recepcion_id', 'recepciones');
CREATE TRIGGER movimientos_operacion_misma_empresa
  BEFORE INSERT OR UPDATE OF operacion_id, empresa_id ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION validar_ref_misma_empresa('operacion_id', 'operaciones');
CREATE TRIGGER movimientos_compensa_misma_empresa
  BEFORE INSERT OR UPDATE OF compensa_de_id, empresa_id ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION validar_ref_misma_empresa('compensa_de_id', 'movimientos_inventario');

-- El responsable de una bodega debe ser miembro de la misma empresa.
CREATE FUNCTION validar_responsable_bodega() RETURNS trigger AS $$
BEGIN
  IF NEW.responsable_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM empresa_usuarios WHERE empresa_id = NEW.empresa_id AND usuario_id = NEW.responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable debe pertenecer a la empresa' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER bodegas_responsable_miembro
  BEFORE INSERT OR UPDATE OF responsable_id, empresa_id ON bodegas
  FOR EACH ROW EXECUTE FUNCTION validar_responsable_bodega();

-- Las recepciones solo se vinculan a operaciones de importación.
CREATE FUNCTION validar_recepcion_importacion() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM operaciones WHERE id = NEW.operacion_id AND tipo = 'IMPORTACION') THEN
    RAISE EXCEPTION 'Una recepción solo puede vincularse a una operación de importación' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER recepciones_solo_importacion
  BEFORE INSERT OR UPDATE OF operacion_id ON recepciones
  FOR EACH ROW EXECUTE FUNCTION validar_recepcion_importacion();

-- Los movimientos confirmados son inmutables: cualquier corrección es un movimiento compensatorio.
CREATE FUNCTION movimientos_inventario_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de inventario son inmutables; registre un movimiento compensatorio' USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER movimientos_inmutables
  BEFORE UPDATE OR DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION movimientos_inventario_inmutable();
