-- 05_personas_y_usuarios.sql
-- Directorio de personas, cuentas corporativas @joluxia.com,
-- cuentas activas/inactivas, cambio obligatorio de contrasena
-- y nivel de soporte de los analistas.
-- Todos los datos personales son ficticios (Ley 1581 de 2012).

BEGIN;

-- 1. Directorio de personas (empleados y contratistas)
CREATE TABLE personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    correo_personal VARCHAR(150),
    celular VARCHAR(20) NOT NULL,
    extension VARCHAR(10),
    area VARCHAR(100) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    ubicacion VARCHAR(150),
    jefe_inmediato VARCHAR(150),
    tipo_vinculacion VARCHAR(20) NOT NULL DEFAULT 'empleado'
        CHECK (tipo_vinculacion IN ('empleado', 'contratista')),
    empresa_contratista VARCHAR(150),
    fecha_fin_labores DATE,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT contratista_con_empresa
        CHECK (tipo_vinculacion = 'empleado' OR empresa_contratista IS NOT NULL)
);

-- 2. Nuevas columnas de la cuenta de usuario
ALTER TABLE usuarios
    ADD COLUMN persona_id UUID UNIQUE REFERENCES personas(id),
    ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN nivel_soporte SMALLINT CHECK (nivel_soporte BETWEEN 1 AND 3);

-- 3. Usuarios existentes: se crea su persona y se pasa el correo a @joluxia.com
--    (se buscan por el inicio de su id para no guardar correos reales en Git)

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Jonathan', 'Felipe', 'jonathan.felipe@ejemplo.com', '3005550101', '2101', 'Finanzas', 'Auxiliar contable', 'Sede Principal - Piso 2 - Puesto 05', 'Marta Rincon')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), nombre = 'Jonathan Felipe', correo = 'jonathan.felipe@joluxia.com'
WHERE id::text LIKE '42328850%';

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Andrea', 'Gómez', 'andrea.gomez@ejemplo.com', '3005550102', '2201', 'Mercadeo', 'Analista de mercadeo', 'Sede Principal - Piso 3 - Puesto 12', 'Ricardo Pardo')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), nombre = 'Andrea Gómez', correo = 'andrea.gomez@joluxia.com'
WHERE id::text LIKE '45a53973%';

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Luis', 'Salazar', 'luis.salazar@ejemplo.com', '3005550103', '1001', 'Tecnología', 'Coordinador de mesa de ayuda', 'Sede Principal - Piso 1 - Oficina 3', 'Jonathan Yucuma')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), correo = 'luis.salazar@joluxia.com'
WHERE id::text LIKE '4da44592%';

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Steven', 'Parrado', 'steven.parrado@ejemplo.com', '3005550104', '1011', 'Tecnología', 'Analista de soporte nivel 1', 'Sede Principal - Piso 1 - Puesto 08', 'Luis Salazar')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), correo = 'steven.parrado@joluxia.com', nivel_soporte = 1
WHERE id::text LIKE '73b1591c%';

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Jonathan', 'Yucuma', 'jonathan.yucuma@ejemplo.com', '3005550105', '1000', 'Tecnología', 'Jefe de Tecnología', 'Sede Principal - Piso 1 - Oficina 1', 'Gerencia General')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), correo = 'jonathan.yucuma@joluxia.com'
WHERE id::text LIKE '8c9d57e1%';

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Luis', 'Steven', 'luis.steven@ejemplo.com', '3005550106', '2301', 'Logística', 'Auxiliar de bodega', 'Bodega Norte - Puesto 02', 'Hernan Castillo')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), correo = 'luis.steven@joluxia.com'
WHERE id::text LIKE '9d46f452%';

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Camila', 'Torres', 'camila.torres@ejemplo.com', '3005550107', '2401', 'Jurídica', 'Abogada', 'Sede Principal - Piso 4 - Puesto 03', 'Patricia Leon')
  RETURNING id)
UPDATE usuarios SET persona_id = (SELECT id FROM p), nombre = 'Camila Torres', correo = 'camila.torres@joluxia.com'
WHERE id::text LIKE 'd11b460a%';

-- 4. Usuarios nuevos (contrasena temporal: Temporal2026, deben cambiarla al entrar)

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Laura', 'Mejía', 'laura.mejia@ejemplo.com', '3005550108', '1012', 'Tecnología', 'Analista de soporte nivel 1', 'Sede Principal - Piso 1 - Puesto 09', 'Luis Salazar')
  RETURNING id)
INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id, persona_id, debe_cambiar_contrasena, nivel_soporte)
SELECT 'Laura Mejía', 'laura.mejia@joluxia.com', crypt('Temporal2026', gen_salt('bf', 10)),
       (SELECT id FROM roles WHERE nombre = 'analista'), p.id, TRUE, 1 FROM p;

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Carlos', 'Rojas', 'carlos.rojas@ejemplo.com', '3005550109', '1021', 'Tecnología', 'Especialista de soporte nivel 2', 'Sede Principal - Piso 1 - Puesto 15', 'Luis Salazar')
  RETURNING id)
INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id, persona_id, debe_cambiar_contrasena, nivel_soporte)
SELECT 'Carlos Rojas', 'carlos.rojas@joluxia.com', crypt('Temporal2026', gen_salt('bf', 10)),
       (SELECT id FROM roles WHERE nombre = 'analista'), p.id, TRUE, 2 FROM p;

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato, tipo_vinculacion, empresa_contratista, fecha_fin_labores)
  VALUES ('Diana', 'Castro', 'diana.castro@ejemplo.com', '3005550110', '1031', 'Tecnología', 'Especialista de soporte nivel 3', 'Sede Principal - Piso 1 - Puesto 20', 'Luis Salazar', 'contratista', 'Soporte Andino S.A.S.', '2027-06-30')
  RETURNING id)
INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id, persona_id, debe_cambiar_contrasena, nivel_soporte)
SELECT 'Diana Castro', 'diana.castro@joluxia.com', crypt('Temporal2026', gen_salt('bf', 10)),
       (SELECT id FROM roles WHERE nombre = 'analista'), p.id, TRUE, 3 FROM p;

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Sofía', 'Herrera', 'sofia.herrera@ejemplo.com', '3005550111', '2102', 'Contabilidad', 'Contadora', 'Sede Principal - Piso 2 - Puesto 10', 'Marta Rincon')
  RETURNING id)
INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id, persona_id, debe_cambiar_contrasena)
SELECT 'Sofía Herrera', 'sofia.herrera@joluxia.com', crypt('Temporal2026', gen_salt('bf', 10)),
       (SELECT id FROM roles WHERE nombre = 'usuario'), p.id, TRUE FROM p;

WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato)
  VALUES ('Valentina', 'Ruiz', 'valentina.ruiz@ejemplo.com', '3005550112', '2202', 'Ventas', 'Ejecutiva comercial', 'Sede Principal - Piso 3 - Puesto 04', 'Ricardo Pardo')
  RETURNING id)
INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id, persona_id, debe_cambiar_contrasena)
SELECT 'Valentina Ruiz', 'valentina.ruiz@joluxia.com', crypt('Temporal2026', gen_salt('bf', 10)),
       (SELECT id FROM roles WHERE nombre = 'usuario'), p.id, TRUE FROM p;

-- Andres: contratista con contrato terminado (su cuenta debe quedar bloqueada)
WITH p AS (
  INSERT INTO personas (nombres, apellidos, correo_personal, celular, extension, area, cargo, ubicacion, jefe_inmediato, tipo_vinculacion, empresa_contratista, fecha_fin_labores)
  VALUES ('Andrés', 'López', 'andres.lopez@ejemplo.com', '3005550113', '2501', 'Recursos Humanos', 'Auxiliar de nómina', 'Sede Principal - Piso 2 - Puesto 18', 'Claudia Vargas', 'contratista', 'Talento Temporal S.A.S.', '2026-10-31')
  RETURNING id)
INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id, persona_id, debe_cambiar_contrasena)
SELECT 'Andrés López', 'andres.lopez@joluxia.com', crypt('Temporal2026', gen_salt('bf', 10)),
       (SELECT id FROM roles WHERE nombre = 'usuario'), p.id, TRUE FROM p;

-- 5. Reglas finales: toda cuenta tiene persona y correo corporativo
ALTER TABLE usuarios ALTER COLUMN persona_id SET NOT NULL;
ALTER TABLE usuarios ADD CONSTRAINT correo_corporativo CHECK (correo LIKE '%@joluxia.com');

COMMIT;