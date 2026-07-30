import type {
  Bill,
  BootstrapResponse,
  DiningTable,
  DiningZone,
  HistoryResponse,
  PrintSnapshot,
  SaveDraftRequest,
  SettlementRequest,
  SettlementResult,
} from './types';
import { gatewayDraftItems } from './domain';

const API_BASE = '/api/pos-pilot';

interface ApiErrorPayload {
  code?: string;
  message?: string;
  detail?: string;
  error?: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload = {}) {
    super(
      (typeof payload.detail === 'string' && payload.detail)
      || (typeof payload.message === 'string' && payload.message)
      || (typeof payload.error === 'string' && payload.error)
      || fallbackMessage(status),
    );
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.requestId = payload.requestId;
    this.details = payload.details;
  }
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Tu sesión venció. Vuelve a ingresar desde Mesita.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'La consola POS no está habilitada para este restaurante.';
  if (status === 409) return 'Los datos cambiaron en Contífico. La cuenta requiere revisión.';
  if (status === 503) return 'Mesita no puede comunicarse con el servicio POS en este momento.';
  return 'No pudimos completar la operación.';
}

function unwrap<T>(payload: T | { data: T }): T {
  return payload && typeof payload === 'object' && 'data' in payload
    ? (payload as { data: T }).data
    : payload as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Requested-With', 'Mesita-POS');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Sin conexión. Los cambios siguen pendientes.' });
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) throw new ApiError(response.status, payload as ApiErrorPayload);
  if (response.status === 204) return undefined as T;
  return unwrap(payload as T | { data: T });
}

export const posApi = {
  exchangeTicket(ticket: string) {
    return request<{ expiresAt: string }>('/session/exchange', {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    });
  },

  logout() {
    return request<void>('/session', { method: 'DELETE' });
  },

  bootstrap(signal?: AbortSignal) {
    return request<BootstrapResponse>('/bootstrap', { signal });
  },

  refreshCatalog() {
    return request<BootstrapResponse['catalog']>('/catalog/refresh', { method: 'POST' });
  },

  createZone(input: { name: string; sortOrder: number }) {
    return request<DiningZone>('/zones', { method: 'POST', body: JSON.stringify(input) });
  },

  updateZone(id: string, input: { name: string; sortOrder: number }) {
    return request<DiningZone>(`/zones/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteZone(id: string) {
    return request<void>(`/zones/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  createTable(input: { zoneId: string; name: string; capacity: number; sortOrder: number }) {
    return request<DiningTable>('/tables', { method: 'POST', body: JSON.stringify(input) });
  },

  updateTable(id: string, input: { zoneId: string; name: string; capacity: number; sortOrder: number }) {
    return request<DiningTable>(`/tables/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteTable(id: string) {
    return request<void>(`/tables/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  openBill(input: { tableId: string; diners: number }) {
    return request<Bill>('/bills', { method: 'POST', body: JSON.stringify(input) });
  },

  getBill(id: string) {
    return request<Bill>(`/bills/${encodeURIComponent(id)}`);
  },

  saveDraft(id: string, input: SaveDraftRequest) {
    return request<Bill>(`/bills/${encodeURIComponent(id)}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        expectedRevision: input.expectedRevision,
        diners: input.diners,
        notes: input.notes,
        items: gatewayDraftItems(input.items),
      }),
    });
  },

  syncBill(id: string) {
    return request<Bill>(`/bills/${encodeURIComponent(id)}/sync`, { method: 'POST' });
  },

  cancelBill(id: string, reason: string) {
    return request<Bill>(`/bills/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  settleBill(id: string, input: SettlementRequest) {
    return request<SettlementResult>(`/bills/${encodeURIComponent(id)}/settlements`, {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        method: input.method === 'CARD'
          ? 'CARD_TERMINAL'
          : input.method === 'TRANSFER' ? 'BANK_TRANSFER' : input.method,
      }),
    });
  },

  reconcileSettlement(id: string, paymentId: string, action: 'ACCEPT_REMOTE' | 'RETRY_SAME', note?: string) {
    return request<SettlementResult>(`/bills/${encodeURIComponent(id)}/settlements/${encodeURIComponent(paymentId)}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ action, note: note?.trim() || undefined }),
    });
  },

  printSnapshot(id: string) {
    return request<PrintSnapshot>(`/bills/${encodeURIComponent(id)}/print`);
  },

  history() {
    return request<HistoryResponse>('/history');
  },

  resolveConflict(id: string, resolution: 'ACCEPT_REMOTE' | 'RETRY_LOCAL') {
    return request<Bill>(`/conflicts/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: resolution === 'ACCEPT_REMOTE' ? 'KEEP_REMOTE' : 'RETRY_LOCAL' }),
    });
  },
};
