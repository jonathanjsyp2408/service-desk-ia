BEGIN;

-- 1) Numero consecutivo del ticket
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS numero INTEGER;

-- Numerar los tickets existentes en orden de creacion
WITH orden AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY creado_en) AS n
  FROM tickets
)
UPDATE tickets t SET numero = orden.n
FROM orden WHERE t.id = orden.id;

-- Secuencia para los tickets nuevos, empezando despues del ultimo numero
CREATE SEQUENCE IF NOT EXISTS tickets_numero_seq OWNED BY tickets.numero;
SELECT setval('tickets_numero_seq', COALESCE((SELECT MAX(numero) FROM tickets), 0) + 1, false);

ALTER TABLE tickets
  ALTER COLUMN numero SET DEFAULT nextval('tickets_numero_seq'),
  ALTER COLUMN numero SET NOT NULL,
  ADD CONSTRAINT tickets_numero_unico UNIQUE (numero);

-- 2) Columnas para la sugerencia de la IA
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS categoria_ia VARCHAR(50),
  ADD COLUMN IF NOT EXISTS prioridad_ia VARCHAR(20);

COMMIT;