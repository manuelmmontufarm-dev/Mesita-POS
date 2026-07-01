'use strict';

/**
 * Low-level formatting helpers that reproduce Contifico's JSON conventions.
 *
 * Observed conventions from the official Contifico API guide
 * (https://contifico.github.io):
 *   - Monetary totals (subtotal, iva, servicio, total, saldo, cobro monto)
 *     are serialized as STRINGS with 2 decimals, e.g. "17.00".
 *   - Line-item quantities/prices inside `detalles[]` are serialized as
 *     NUMBERS, e.g. 1.00.
 *   - Dates are DD/MM/YYYY strings.
 *   - Absent values are explicit `null` (not omitted).
 *
 * Keeping these in one place means the simulator and the live adapter agree on
 * exactly how values are shaped, so switching to real Contifico is a no-op for
 * consumers.
 */

const crypto = require('crypto');

/** Format a monetary value as a 2-decimal string ("17" -> "17.00"). */
function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/** Coerce a decimal-ish value to a JS number (used for detalle lines). */
function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

/** Format a JS Date (or ISO string) as DD/MM/YYYY in Ecuador time. */
function ecDate(value) {
  if (!value) return null;
  // Already a DD/MM/YYYY string — pass through unchanged (do NOT let JS Date
  // reinterpret it as MM/DD/YYYY).
  if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value : null;
  }
  return d.toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Guayaquil',
  });
}

/**
 * Build a Contifico-style document number ("001-001-000000123").
 *
 * Contifico assigns this from the establishment/emission-point sequence. The
 * simulator has no SRI establishment config, so we derive a STABLE synthetic
 * number from the document id. It is deterministic (same id -> same number) and
 * shaped exactly like Contifico's, which is all a consumer can rely on — the
 * authoritative identifier remains `id`.
 */
function documentNumber(id, { establishment = '001', point = '001' } = {}) {
  if (!id) return null;
  const hash = crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8);
  const seq = parseInt(hash, 16) % 1_000_000_000;
  return `${establishment}-${point}-${String(seq).padStart(9, '0')}`;
}

module.exports = { money, num, ecDate, documentNumber };
