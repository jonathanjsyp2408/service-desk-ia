// Calcula y guarda el embedding de cada articulo de la base de conocimiento.
// Ejecutar despues de agregar o modificar articulos: node indexar-conocimiento.js
require('dotenv').config();
const pool = require('./db');
const { generarEmbeddings } = require('./conocimiento');

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, titulo, descripcion, solucion
       FROM base_conocimiento WHERE codigo IS NOT NULL ORDER BY codigo`
    );
    console.log(`Articulos encontrados: ${rows.length}`);

    const textos = rows.map((a) => `${a.titulo}\n${a.descripcion}\n${a.solucion}`);
    const vectores = await generarEmbeddings(textos);

    for (let i = 0; i < rows.length; i++) {
      await pool.query('UPDATE base_conocimiento SET embedding = $1::jsonb WHERE id = $2', [
        JSON.stringify(vectores[i]), rows[i].id,
      ]);
      console.log(`${rows[i].codigo} indexado (${vectores[i].length} numeros)`);
    }
    console.log('Listo.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();