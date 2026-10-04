-- Extensión para generar IDs únicos (UUID)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Roles: usuario final, analista, administrador
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Usuarios: todas las personas que usan el sistema
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol_id INT NOT NULL REFERENCES roles(id),
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Categorías: incidente, requerimiento, permiso, asesoría
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

-- 4. Tickets: el corazón del sistema
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    analista_id UUID REFERENCES usuarios(id),
    categoria_id INT REFERENCES categorias(id),
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'abierto',
    prioridad VARCHAR(20),
    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    cerrado_en TIMESTAMP
);

-- 5. Comentarios: hilo de conversación dentro de un ticket
CREATE TABLE comentarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    autor_id UUID NOT NULL REFERENCES usuarios(id),
    mensaje TEXT NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Historial de estados: para medir tiempos de atención
CREATE TABLE historial_estados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    estado_anterior VARCHAR(30),
    estado_nuevo VARCHAR(30) NOT NULL,
    cambiado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. Base de conocimiento: tickets resueltos (insumo futuro para RAG)
CREATE TABLE base_conocimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id),
    descripcion TEXT NOT NULL,
    solucion TEXT NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Datos iniciales para empezar a probar
INSERT INTO roles (nombre) VALUES ('usuario'), ('analista'), ('administrador');
INSERT INTO categorias (nombre) VALUES ('incidente'), ('requerimiento'), ('permiso'), ('asesoria');
