// Prueba del modulo de IA con tickets de ejemplo
require('dotenv').config();
const { clasificarTicket } = require('./ia');

const ejemplos = [
  ['No puedo ingresar al correo', 'Desde ayer el correo dice que la clave es incorrecta y no puedo trabajar'],
  ['Instalar Office', 'Necesito que me instalen Office en el equipo nuevo que me entregaron'],
  ['Acceso a carpeta de contabilidad', 'Necesito permiso de lectura a la carpeta compartida de contabilidad'],
  ['Como configuro la firma del correo', 'Quisiera saber como poner mi firma en los correos que envio'],
  ['Se cayo el sistema de facturacion', 'Ningun usuario de la empresa puede facturar desde las 8 am'],
];

(async () => {
  for (const [titulo, descripcion] of ejemplos) {
    const r = await clasificarTicket(titulo, descripcion);
    console.log(titulo, '->', r);
  }
})();