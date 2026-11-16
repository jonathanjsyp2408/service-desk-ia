// Base de conocimiento: embeddings y busqueda de articulos por significado
const { OpenAI } = require('openai');
const pool = require('./db');

const MODELO_EMBEDDING = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

let cliente = null;
function obtenerCliente() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!cliente) {
    cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15000, maxRetries: 1 });
  }
  return cliente;
}

// Convierte una lista de textos en sus embeddings (listas de numeros)
async function generarEmbeddings(textos) {
  const client = obtenerCliente();
  if (!client) throw new Error('OPENAI_API_KEY no configurada');
  const r = await client.embeddings.create({ model: MODELO_EMBEDDING, input: textos });
  return r.data.map((d) => d.embedding);
}

// Similitud del coseno: 1 = mismo significado, 0 = nada que ver
function similitud(a, b) {
  let punto = 0, normaA = 0, normaB = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i];
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }
  return punto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

// Los articulos se cargan una vez y quedan en memoria (son pocos)
let cache = null;
async function cargarArticulos() {
  if (!cache) {
    const { rows } = await pool.query(
      `SELECT b.id, b.codigo, b.titulo, b.solucion, b.embedding, c.nombre AS categoria
       FROM base_conocimiento b
       LEFT JOIN categorias c ON c.id = b.categoria_id
       WHERE b.codigo IS NOT NULL AND b.embedding IS NOT NULL`
    );
    cache = rows;
  }
  return cache;
}

function limpiarCache() {
  cache = null;
}

// Devuelve los articulos mas parecidos al texto, ordenados de mayor a menor similitud.
// Si algo falla devuelve una lista vacia: la IA respondera sin articulo de referencia.
async function buscarArticulos(texto, limite = 2, minimo = 0.4) {
  try {
    const [vector] = await generarEmbeddings([texto]);
    const articulos = await cargarArticulos();
    return articulos
      .map((a) => ({
        id: a.id, codigo: a.codigo, titulo: a.titulo, solucion: a.solucion,
        categoria: a.categoria, similitud: similitud(vector, a.embedding),
      }))
      .filter((a) => a.similitud >= minimo)
      .sort((x, y) => y.similitud - x.similitud)
      .slice(0, limite);
  } catch (err) {
    console.error('Base de conocimiento: no se pudo buscar:', err.message);
    return [];
  }
}

module.exports = { generarEmbeddings, buscarArticulos, limpiarCache };