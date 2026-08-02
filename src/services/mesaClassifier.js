'use strict';

/**
 * mesaClassifier.js — port CommonJS del clasificador de Mesita.
 *
 * FUENTE DE VERDAD: mesita-app/src/modules/pos/bridge/mesa-classifier.ts
 * (verificado contra los 2.532 documentos del piloto CASA —
 * mesita-app/docs/PILOT_FINDINGS_CASA.md §1 y §4). Este archivo es una copia
 * literal de esas reglas para que el LAB agrupe los documentos por mesa
 * EXACTAMENTE como lo hará el servidor de Mesita cuando el Bridge le mande el
 * mismo `adicional1`. Si allá cambian las reglas, hay que traerlas aquí: el
 * valor del laboratorio depende de que las dos clasificaciones coincidan.
 *
 * En el install del piloto la mesa NO es una entidad del POS: vive como texto
 * libre en `factura_cabecera.adicional1`, que el propio catálogo `adicional` de
 * Contífico declara como campo "mesa" (id=1 'mesa', id=2 'mesero').
 */

/** Números 1..MESA_NUMBER_MAX son mesas físicas en el piloto. */
const MESA_NUMBER_MAX = 49;

/**
 * MESA_NUMBER_MAX+1..DELIVERY_COUNTER_MAX es el contador diario de deliveries
 * (se reinicia en 50 cada día). Por encima el número no significa nada y cae a
 * SIN_MESA, para que el dueño lo vea en pendientes en vez de perderse.
 */
const DELIVERY_COUNTER_MAX = 499;

/**
 * Tokens que marcan "esto no es una mesa". Se comparan por TOKEN EXACTO
 * normalizado, no por substring: "barra" deniega, pero "4 Barrera" NO.
 * Incluye las erratas reales observadas en el piloto.
 */
const DENY_TOKENS = new Set([
  'llevar', 'lleve', 'llev', 'barra', 'barrra', 'barar', 'yuca', 'magic',
  'prueba', 'prueb', 'domicilio', 'error', 'cortesia', 'adentro',
]);

/** Ruido alrededor del número: "mesa 8", "m8" y "#8" son la mesa 8. */
const NOISE_TOKENS = new Set(['mesa', 'm', 'n', 'no', 'nro', 'num', 'numero']);

/** Sin acentos, minúsculas, espacios colapsados. */
function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** "mesa8" → [mesa, 8] · "30magic" → [30, magic] · "#8" → [8]. */
function tokenize(normalized) {
  return normalized.match(/\d+|[a-zñ]+/g) || [];
}

/**
 * Clasifica el texto del campo mesa del POS. Total: todo valor cae en
 * exactamente un balde; nunca se adivina.
 *
 * @param {string|null|undefined} value
 * @returns {{kind: 'MESA'|'DELIVERY'|'SIN_MESA', mesaNumber?: number, billLabel?: string|null, reason?: string}}
 */
function classifyMesaLabel(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return { kind: 'SIN_MESA', reason: 'empty' };

  const tokens = tokenize(normalize(raw));
  // El deny gana SIEMPRE, incluso con número delante ("30 magic").
  if (tokens.some((token) => DENY_TOKENS.has(token))) {
    return { kind: 'SIN_MESA', reason: 'keyword' };
  }

  const numbers = [...new Set(tokens.filter((t) => /^\d+$/.test(t)).map(Number))];
  if (numbers.length !== 1) return { kind: 'SIN_MESA', reason: 'unparseable' };

  const n = numbers[0];
  const words = tokens.filter((t) => !/^\d+$/.test(t));
  if (n >= 1 && n <= MESA_NUMBER_MAX) {
    // La etiqueta de cuenta dividida se reconstruye del texto ORIGINAL (con las
    // mayúsculas del mesero), quitando el número y las palabras de ruido.
    const rest = (raw.match(/\d+|[^\d\s]+/g) || [])
      .filter((piece) => !/^\d+$/.test(piece))
      .map((piece) => piece.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
      .filter((piece) => piece && !NOISE_TOKENS.has(normalize(piece)))
      .join(' ')
      .trim();
    return { kind: 'MESA', mesaNumber: n, billLabel: rest || null };
  }
  // El delivery es SIEMPRE un número pelado; con texto al lado cae a SIN_MESA.
  if (n <= DELIVERY_COUNTER_MAX && words.length === 0) return { kind: 'DELIVERY' };
  return { kind: 'SIN_MESA', reason: 'unparseable' };
}

module.exports = { classifyMesaLabel, MESA_NUMBER_MAX, DELIVERY_COUNTER_MAX };
