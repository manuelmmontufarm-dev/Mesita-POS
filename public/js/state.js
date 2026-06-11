// In-memory app state with localStorage-backed API key.
import * as api from './api.js';

const KEY_STORAGE = 'pos-mesita-api-key';
const DEFAULT_KEY = 'mesita2024secret';

export const state = {
  apiKey: '',
  connection: 'idle', // 'idle' | 'ok' | 'bad' | 'checking'
  mesas: [],
  productos: [],
  categorias: [],
  current: { mesa: null, orden: null, totales: null },
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const notify = () => listeners.forEach((fn) => fn(state));

export function loadApiKey() {
  const k = localStorage.getItem(KEY_STORAGE) || DEFAULT_KEY;
  state.apiKey = k;
  api.setApiKey(k);
  return k;
}

export function saveApiKey(k) {
  state.apiKey = (k || '').trim();
  localStorage.setItem(KEY_STORAGE, state.apiKey);
  api.setApiKey(state.apiKey);
  notify();
}

export async function checkConnection() {
  state.connection = 'checking';
  notify();
  try { await api.listMesas(); state.connection = 'ok'; }
  catch (_) { state.connection = 'bad'; }
  notify();
}

export async function loadFloor() {
  const [m, p] = await Promise.all([api.listMesas(), api.listProductos()]);
  state.mesas = (m && m.results) || [];
  state.productos = (p && p.results) || [];
  const seen = new Map();
  for (const prod of state.productos) {
    const id = prod.categoria_id || prod.categoriaId || 'sin-categoria';
    const nombre = (prod.categoria && prod.categoria.nombre) || prod.categoria_nombre || labelFromId(id);
    if (!seen.has(id)) seen.set(id, { id, nombre });
  }
  state.categorias = [...seen.values()];
  notify();
}

function labelFromId(id) {
  if (!id) return 'Otros';
  return id.replace(/^cat-/, '').replace(/^\w/, (c) => c.toUpperCase());
}

export async function openMesa(mesaId) {
  const mesa = state.mesas.find((m) => m.id === mesaId);
  if (!mesa) throw new Error('Mesa no encontrada');
  state.current.mesa = mesa;
  state.current.orden = await api.getOrCreateOrden(mesa);
  await refreshTotales();
  if (mesa.estado === 'L') {
    try { await api.updateMesa(mesa.id, { estado: 'O' }); mesa.estado = 'O'; } catch (_) {}
  }
  notify();
}

export async function refreshOrden() {
  if (!state.current.orden) return;
  state.current.orden = await api.getOrden(state.current.orden.id);
  await refreshTotales();
  notify();
}

export async function refreshTotales() {
  if (!state.current.orden) { state.current.totales = null; return; }
  try { state.current.totales = await api.totalesOrden(state.current.orden.id); }
  catch (_) { state.current.totales = null; }
}

export function getCurrentTotal() {
  const t = state.current.totales;
  return t ? Number(t.total || 0) : 0;
}

export function clearCurrent() {
  state.current = { mesa: null, orden: null, totales: null };
  // Do NOT notify() — callers that clear are usually leaving the screen
  // and a notification here would re-trigger stale subscribers.
}
