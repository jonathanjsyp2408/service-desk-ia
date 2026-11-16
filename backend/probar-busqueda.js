// Prueba de la busqueda por significado en la base de conocimiento
require('dotenv').config();
const pool = require('./db');
const { buscarArticulos } = require('./conocimiento');

const ejemplos = [
  'La impresora del segundo piso no responde y no puedo imprimir',
  'Como hago para que mis companeros vean mis reuniones',
  'Necesito que me instalen Adobe Illustrator',
  'No puedo entrar a Windows, dice que mi usuario esta bloqueado',
  'Quiero saber cuando me pagan la prima de diciembre',
];

(async () => {
  for (const texto of ejemplos) {
    // Para calibrar mostramos los 3 mejores, sin minimo de similitud
    const resultados = await buscarArticulos(texto, 3, 0);
    console.log(`\n"${texto}"`);
    for (const a of resultados) {
      console.log(`   ${a.similitud.toFixed(3)}  ${a.codigo}  ${a.titulo}`);
    }
  }
  await pool.end();
})();