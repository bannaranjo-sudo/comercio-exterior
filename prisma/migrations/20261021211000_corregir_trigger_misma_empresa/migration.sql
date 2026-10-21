-- Corrige ia_validar_misma_empresa(): evita leer campos que no existen en la tabla que dispara el trigger.
CREATE OR REPLACE FUNCTION ia_validar_misma_empresa() RETURNS trigger AS $$
DECLARE
  empresa_referida uuid;
BEGIN
  IF TG_TABLE_NAME = 'ia_agentes' THEN
    IF NEW.orquestador_id IS NOT NULL THEN
      SELECT empresa_id INTO empresa_referida FROM ia_agentes WHERE id = NEW.orquestador_id;
      IF empresa_referida IS DISTINCT FROM NEW.empresa_id THEN
        RAISE EXCEPTION 'La referencia debe pertenecer a la misma empresa' USING ERRCODE = '23503';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'ia_ejecuciones' THEN
    IF NEW.ejecucion_padre_id IS NOT NULL THEN
      SELECT empresa_id INTO empresa_referida FROM ia_ejecuciones WHERE id = NEW.ejecucion_padre_id;
      IF empresa_referida IS DISTINCT FROM NEW.empresa_id THEN
        RAISE EXCEPTION 'La referencia debe pertenecer a la misma empresa' USING ERRCODE = '23503';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
