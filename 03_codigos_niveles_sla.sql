BEGIN;

-- 1) Prefijo y contador por tipo de ticket
ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS prefijo VARCHAR(5),
  ADD COLUMN IF NOT EXISTS ultimo_numero INTEGER NOT NULL DEFAULT 0;

UPDATE categorias SET prefijo = CASE nombre
  WHEN 'incidente'     THEN 'INC'
  WHEN 'requerimiento' THEN 'REQ'
  WHEN 'permiso'       THEN 'PER'
  WHEN 'asesoria'      THEN 'ASE'
END;

-- Si alguna categoria no tiene prefijo, esto falla y no se guarda nada
ALTER TABLE categorias ALTER COLUMN prefijo SET NOT NULL;

-- 2) Codigo, nivel de soporte, proveedor y fechas del SLA
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS nivel SMALLINT NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS proveedor VARCHAR(150),
  ADD COLUMN IF NOT EXISTS fecha_limite TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resuelto_en TIMESTAMP;

-- 3) Tiempos de SLA (horas para resolver) por tipo y prioridad
CREATE TABLE IF NOT EXISTS sla (
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  prioridad VARCHAR(20) NOT NULL CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
  horas INTEGER NOT NULL CHECK (horas > 0),
  PRIMARY KEY (categoria_id, prioridad)
);

INSERT INTO sla (categoria_id, prioridad, horas)
SELECT c.id, v.prioridad, v.horas
FROM categorias c
JOIN (VALUES
  ('incidente', 'critica', 4),  ('incidente', 'alta', 8),
  ('incidente', 'media', 24),   ('incidente', 'baja', 48),
  ('requerimiento', 'critica', 8), ('requerimiento', 'alta', 24),
  ('requerimiento', 'media', 48),  ('requerimiento', 'baja', 72),
  ('permiso', 'critica', 8),    ('permiso', 'alta', 24),
  ('permiso', 'media', 48),     ('permiso', 'baja', 72),
  ('asesoria', 'critica', 8),   ('asesoria', 'alta', 16),
  ('asesoria', 'media', 24),    ('asesoria', 'baja', 48)
) AS v(categoria, prioridad, horas) ON v.categoria = c.nombre
ON CONFLICT (categoria_id, prioridad) DO UPDATE SET horas = EXCLUDED.horas;

-- 4) Historial de reclasificaciones y escalamientos
CREATE TABLE IF NOT EXISTS historial_cambios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id),
  campo VARCHAR(30) NOT NULL,
  valor_anterior VARCHAR(200),
  valor_nuevo VARCHAR(200),
  cambiado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5) Tickets existentes: aplicar la clasificacion de la IA donde falte
UPDATE tickets t SET categoria_id = c.id
FROM categorias c
WHERE t.categoria_id IS NULL AND t.categoria_ia = c.nombre;

UPDATE tickets SET prioridad = prioridad_ia
WHERE prioridad IS NULL AND prioridad_ia IS NOT NULL;

-- Codigos para los tickets ya clasificados, en orden de creacion
WITH orden AS (
  SELECT t.id, c.prefijo,
         ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.creado_en) AS n
  FROM tickets t
  JOIN categorias c ON c.id = t.categoria_id
  WHERE t.codigo IS NULL
)
UPDATE tickets t SET codigo = orden.prefijo || '-' || LPAD(orden.n::text, 4, '0')
FROM orden WHERE t.id = orden.id;

-- Cada contador queda en el ultimo numero usado
UPDATE categorias c SET ultimo_numero = (
  SELECT COUNT(*) FROM tickets t WHERE t.categoria_id = c.id AND t.codigo IS NOT NULL
);

-- Fecha limite del SLA para los tickets que ya tienen tipo y prioridad
UPDATE tickets t SET fecha_limite = t.creado_en + make_interval(hours => s.horas)
FROM sla s
WHERE s.categoria_id = t.categoria_id AND s.prioridad = t.prioridad;

-- Fecha de solucion de los tickets ya resueltos o cerrados
UPDATE tickets t SET resuelto_en = h.primero
FROM (
  SELECT ticket_id, MIN(cambiado_en) AS primero
  FROM historial_estados
  WHERE estado_nuevo IN ('resuelto', 'cerrado')
  GROUP BY ticket_id
) h
WHERE h.ticket_id = t.id AND t.estado IN ('resuelto', 'cerrado');

COMMIT;