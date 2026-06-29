// POS payment notifications (MesitaQR cobros).
import * as api from './api.js';
import { toast } from './ui.js';

let pollId = null;
let lastSince = new Date().toISOString();
const seenIds = new Set();

export function startPaymentNotifications() {
  if (pollId) return;
  pollId = setInterval(pollRecent, 5000);
  pollRecent();
}

export function stopPaymentNotifications() {
  if (pollId) {
    clearInterval(pollId);
    pollId = null;
  }
}

async function pollRecent() {
  try {
    const data = await api.activityRecent(lastSince);
    const results = data?.results || [];
    for (const c of results.reverse()) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      if (seenIds.size > 100) {
        const first = seenIds.values().next().value;
        seenIds.delete(first);
      }
      const mesa = c.mesa ? ` · ${c.mesa}` : '';
      toast(`Pago MesitaQR $${Number(c.monto).toFixed(2)}${mesa}`, 'ok', 5000);
    }
    if (results.length) {
      lastSince = results[results.length - 1].createdAt || new Date().toISOString();
    }
  } catch (_) { /* silent */ }
}
