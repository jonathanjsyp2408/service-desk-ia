// Medicion de la precision de la IA con el set de prueba.
// Uso (desde la carpeta backend):  node medicion/medir.js
// No crea tickets en la base de datos: llama directamente al modulo de IA.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const ExcelJS = require('exceljs');
const pool = require('../db');
const { procesarTicket } = require('../ia');

const ARCHIVO_SET = path.join(__dirname, 'Set_prueba_tickets_IA.xlsx');
const TIPOS = ['incidente', 'requerimiento', 'permiso', 'asesoria'];
const PRIORIDADES = ['critica', 'alta', 'media', 'baja'];

// Precios en USD por millon de tokens del modelo usado.
// Verificar los vigentes en la pagina de precios de OpenAI antes de reportarlos.
const PRECIO_ENTRADA = 0.4;
const PRECIO_SALIDA = 1.6;

const texto = (celda) => String(celda.text || '').trim();
const pct = (a, b) => (b ? a / b : null);

// 1) Leer el set: se usa la etiqueta corregida si existe; si no, la esperada
async function leerSet() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ARCHIVO_SET);
  const ws = wb.getWorksheet('Tickets');
  const filas = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const id = texto(row.getCell(1));
    if (!id) return;
    const tipoCorregido = texto(row.getCell(9)).toLowerCase();
    const prioridadCorregida = texto(row.getCell(10)).toLowerCase();
    filas.push({
      id,
      titulo: texto(row.getCell(2)),
      descripcion: texto(row.getCell(3)),
      tipo: tipoCorregido || texto(row.getCell(4)).toLowerCase(),
      prioridad: prioridadCorregida || texto(row.getCell(5)).toLowerCase(),
      limite: texto(row.getCell(6)) === 'Sí',
      revisado: texto(row.getCell(8)) !== '',
    });
  });
  return filas;
}

// 2) Metricas
function exactitud(filas, campo) {
  const ok = filas.filter((f) => f[campo]).length;
  return { ok, n: filas.length, valor: pct(ok, filas.length) };
}

function metricasPorTipo(filas) {
  return TIPOS.map((t) => {
    const tp = filas.filter((f) => f.tipo === t && f.tipo_ia === t).length;
    const fp = filas.filter((f) => f.tipo !== t && f.tipo_ia === t).length;
    const fn = filas.filter((f) => f.tipo === t && f.tipo_ia !== t).length;
    const precision = pct(tp, tp + fp);
    const recall = pct(tp, tp + fn);
    const f1 = precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall) : 0;
    return { tipo: t, soporte: tp + fn, precision, recall, f1 };
  });
}

function matriz(filas, campoEsperado, campoIA, valores) {
  const columnas = [...valores, 'sin respuesta'];
  return valores.map((esp) => ({
    esperado: esp,
    conteos: columnas.map((pred) =>
      filas.filter((f) => f[campoEsperado] === esp && (f[campoIA] || 'sin respuesta') === pred).length),
  }));
}

// 3) Excel de resultados
function hoja(wb, nombre, encabezados, filas, anchos) {
  const ws = wb.addWorksheet(nombre);
  ws.addRow(encabezados);
  ws.getRow(1).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3B5C' } };
  filas.forEach((f) => ws.addRow(f));
  ws.columns.forEach((col, i) => { col.width = anchos[i] || 14; });
  ws.eachRow((row, n) => {
    if (n > 1) row.font = { name: 'Arial', size: 10 };
    row.alignment = { vertical: 'top', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

(async () => {
  const set = await leerSet();
  console.log(`Set de prueba: ${set.length} tickets. Modelo: ${process.env.OPENAI_MODEL}\n`);

  // Ejecutar la IA sobre cada ticket, uno por uno
  for (let i = 0; i < set.length; i++) {
    const f = set[i];
    const inicio = Date.now();
    const r = await procesarTicket(f.titulo, f.descripcion);
    f.segundos = (Date.now() - inicio) / 1000;
    f.tipo_ia = r ? r.categoria : null;
    f.prioridad_ia = r ? r.prioridad : null;
    f.tipo_respuesta = r ? r.tipo_respuesta : null;
    f.articulo = r ? r.articulo_codigo : null;
    f.respuesta = r ? r.respuesta : null;
    f.tokens_entrada = r ? r.tokens_entrada || 0 : 0;
    f.tokens_salida = r ? r.tokens_salida || 0 : 0;
    f.ok_tipo = f.tipo_ia === f.tipo;
    f.ok_prioridad = f.prioridad_ia === f.prioridad;
    f.ok_ambos = f.ok_tipo && f.ok_prioridad;
    f.prioridad_cercana = f.prioridad_ia !== null &&
      Math.abs(PRIORIDADES.indexOf(f.prioridad_ia) - PRIORIDADES.indexOf(f.prioridad)) <= 1;
    console.log(
      `[${i + 1}/${set.length}] ${f.id}  tipo: ${f.tipo_ia || '-'} ${f.ok_tipo ? 'OK' : 'X'}  ` +
      `prioridad: ${f.prioridad_ia || '-'} ${f.ok_prioridad ? 'OK' : 'X'}  (${f.segundos.toFixed(1)} s)`
    );
  }

  const sinLimite = set.filter((f) => !f.limite);
  const tipo = exactitud(set, 'ok_tipo');
  const tipoSL = exactitud(sinLimite, 'ok_tipo');
  const prio = exactitud(set, 'ok_prioridad');
  const prioSL = exactitud(sinLimite, 'ok_prioridad');
  const cercana = exactitud(set, 'prioridad_cercana');
  const ambos = exactitud(set, 'ok_ambos');
  const porTipo = metricasPorTipo(set);
  const f1Macro = porTipo.reduce((s, t) => s + t.f1, 0) / porTipo.length;
  const fallos = set.filter((f) => f.tipo_ia === null).length;
  const tiempos = set.map((f) => f.segundos);
  const tokensEntrada = set.reduce((s, f) => s + f.tokens_entrada, 0);
  const tokensSalida = set.reduce((s, f) => s + f.tokens_salida, 0);
  const costo = (tokensEntrada * PRECIO_ENTRADA + tokensSalida * PRECIO_SALIDA) / 1e6;
  const contar = (campo, valor) => set.filter((f) => f[campo] === valor).length;

  // Resumen en pantalla
  const p = (v) => (v === null ? '-' : `${(v * 100).toFixed(1)} %`);
  console.log('\n===== RESULTADOS =====');
  console.log(`Exactitud de tipo:        ${p(tipo.valor)} (${tipo.ok}/${tipo.n})   sin casos limite: ${p(tipoSL.valor)}`);
  console.log(`Exactitud de prioridad:   ${p(prio.valor)} (${prio.ok}/${prio.n})   sin casos limite: ${p(prioSL.valor)}`);
  console.log(`Prioridad a max. 1 nivel: ${p(cercana.valor)}`);
  console.log(`F1 macro de tipo:         ${f1Macro.toFixed(3)}`);
  console.log(`Tiempo promedio:          ${(tiempos.reduce((a, b) => a + b, 0) / set.length).toFixed(2)} s`);
  console.log(`Costo estimado:           US$ ${costo.toFixed(4)}`);

  // Excel de resultados
  const wb = new ExcelJS.Workbook();
  const pctFmt = '0.0%';

  const resumen = hoja(wb, 'Resumen', ['Indicador', 'Valor', 'Detalle'], [
    ['Tickets evaluados', set.length, ''],
    ['Tickets revisados por los autores', set.filter((f) => f.revisado).length, 'Con la columna "¿De acuerdo?" diligenciada'],
    ['Casos límite', set.length - sinLimite.length, 'Tickets ambiguos marcados en el set'],
    ['Fallos de la IA (sin respuesta)', fallos, ''],
    ['Exactitud de tipo (todos)', tipo.valor, `${tipo.ok} de ${tipo.n}`],
    ['Exactitud de tipo (sin casos límite)', tipoSL.valor, `${tipoSL.ok} de ${tipoSL.n}`],
    ['Exactitud de prioridad (todos)', prio.valor, `${prio.ok} de ${prio.n}`],
    ['Exactitud de prioridad (sin casos límite)', prioSL.valor, `${prioSL.ok} de ${prioSL.n}`],
    ['Prioridad a máximo un nivel de distancia', cercana.valor, `${cercana.ok} de ${cercana.n}`],
    ['Tipo y prioridad correctos', ambos.valor, `${ambos.ok} de ${ambos.n}`],
    ['F1 macro de tipo', f1Macro, 'Promedio del F1 de los 4 tipos'],
    ['Tiempo promedio por ticket (s)', tiempos.reduce((a, b) => a + b, 0) / set.length, 'Búsqueda + clasificación + respuesta'],
    ['Tiempo máximo (s)', Math.max(...tiempos), ''],
    ['Tokens de entrada', tokensEntrada, ''],
    ['Tokens de salida', tokensSalida, ''],
    ['Costo estimado (USD)', costo, `Precios usados: ${PRECIO_ENTRADA} / ${PRECIO_SALIDA} USD por millón de tokens`],
    ['Costo por ticket (USD)', costo / set.length, ''],
    ['Respuestas de autoservicio', contar('tipo_respuesta', 'autoservicio'), ''],
    ['Respuestas informativas', contar('tipo_respuesta', 'informativa'), ''],
    ['Escalamientos', contar('tipo_respuesta', 'escalamiento'), ''],
    ['Respuestas basadas en un artículo', set.filter((f) => f.articulo).length, 'Usaron la base de conocimiento'],
    ['Modelo', process.env.OPENAI_MODEL || 'gpt-4.1-mini', ''],
    ['Fecha de la medición', new Date().toLocaleString('es-CO'), ''],
  ], [42, 16, 60]);
  [6, 7, 8, 9, 10, 11].forEach((r) => { resumen.getCell(`B${r}`).numFmt = pctFmt; });
  resumen.getCell('B12').numFmt = '0.000';
  resumen.getCell('B13').numFmt = '0.00';
  resumen.getCell('B14').numFmt = '0.00';
  resumen.getCell('B17').numFmt = '0.0000';
  resumen.getCell('B18').numFmt = '0.000000';

  const tipos = hoja(wb, 'Por tipo', ['Tipo', 'Tickets', 'Precisión', 'Recall', 'F1'],
    porTipo.map((t) => [t.tipo, t.soporte, t.precision, t.recall, t.f1]), [18, 10, 12, 12, 12]);
  ['C', 'D', 'E'].forEach((c) => tipos.getColumn(c).eachCell((cell, n) => { if (n > 1) cell.numFmt = pctFmt; }));

  hoja(wb, 'Confusión tipo', ['Esperado \\ IA', ...TIPOS, 'sin respuesta'],
    matriz(set, 'tipo', 'tipo_ia', TIPOS).map((m) => [m.esperado, ...m.conteos]), [18, 14, 14, 14, 14, 14]);

  hoja(wb, 'Confusión prioridad', ['Esperado \\ IA', ...PRIORIDADES, 'sin respuesta'],
    matriz(set, 'prioridad', 'prioridad_ia', PRIORIDADES).map((m) => [m.esperado, ...m.conteos]), [18, 12, 12, 12, 12, 14]);

  hoja(wb, 'Detalle', ['ID', 'Título', 'Tipo esperado', 'Tipo IA', '¿Acierta tipo?', 'Prioridad esperada',
    'Prioridad IA', '¿Acierta prioridad?', 'Caso límite', 'Tipo de respuesta', 'Artículo', 'Tiempo (s)', 'Respuesta de la IA'],
    set.map((f) => [f.id, f.titulo, f.tipo, f.tipo_ia || 'sin respuesta', f.ok_tipo ? 'Sí' : 'No', f.prioridad,
      f.prioridad_ia || 'sin respuesta', f.ok_prioridad ? 'Sí' : 'No', f.limite ? 'Sí' : 'No',
      f.tipo_respuesta || '', f.articulo || '', Number(f.segundos.toFixed(2)), f.respuesta || '']),
    [7, 34, 15, 15, 12, 14, 14, 12, 10, 14, 10, 10, 70]);

  const marca = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const salida = path.join(__dirname, `resultados_${marca}.xlsx`);
  await wb.xlsx.writeFile(salida);
  console.log(`\nResultados guardados en: ${salida}`);

  await pool.end();
})().catch(async (err) => {
  console.error('Error en la medición:', err.message);
  await pool.end().catch(() => {});
});