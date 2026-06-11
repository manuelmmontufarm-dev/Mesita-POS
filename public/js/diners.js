// Diners (party size) persistence — server-side via Orden.comensales,
// with a localStorage cache so the floor screen can show the count
// instantly while the API call resolves.
import * as api from './api.js';

const PREFIX = 'pos.diners:';

export function getDiners(orden) {
  // Accepts either an orden object (preferred — uses server value) or just an id.
  if (!orden) return 0;
  if (typeof orden === 'object') {
    const n = Number(orden.comensales);
    if (Number.isFinite(n) && n >= 0) return n;
    return getCached(orden.id);
  }
  return getCached(orden);
}

export function getCached(ordenId) {
  if (!ordenId) return 0;
  const v = localStorage.getItem(PREFIX + ordenId);
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setDiners(ordenId, n) {
  if (!ordenId) return;
  const num = Math.max(0, Math.min(20, Math.floor(Number(n) || 0)));
  localStorage.setItem(PREFIX + ordenId, String(num));
  await api.updateOrden(ordenId, { comensales: num });
  return num;
}

export function clearDiners(ordenId) {
  if (!ordenId) return;
  localStorage.removeItem(PREFIX + ordenId);
}
