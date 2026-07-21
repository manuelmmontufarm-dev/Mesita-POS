import type {
  Bill,
  BillItem,
  DiningTable,
  DiningZone,
  OrderDraft,
  PaymentMethod,
  PaymentMethodCapability,
  PaymentRecordMethod,
  PosConflict,
} from './types';

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

export function formatDateTime(value?: string | null, timeZone?: string): string {
  if (!value) return 'Sin dato';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin dato';
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', timeZone };
  try {
    return new Intl.DateTimeFormat('es-EC', options).format(date);
  } catch {
    return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
}

export function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function calculateDraftTotal(items: BillItem[]): number {
  return items.reduce((total, item) => total + item.unitPriceCents * item.quantity, 0);
}

/**
 * Separates one unit from a grouped ticket line so it can carry its own
 * kitchen note. The existing note stays on the original group and the new
 * unit starts without a note, making the scope unambiguous on the PRE.
 */
export function splitDraftItemUnit(
  items: BillItem[],
  clientLineId: string,
  separatedClientLineId = newClientLineId(),
): BillItem[] {
  return items.flatMap((item) => {
    if (item.clientLineId !== clientLineId || item.quantity <= 1) return [item];
    return [
      { ...item, quantity: item.quantity - 1 },
      {
        ...item,
        id: undefined,
        clientLineId: separatedClientLineId,
        quantity: 1,
        lineTotalCents: undefined,
        notes: '',
      },
    ];
  });
}

export function draftFingerprint(draft: OrderDraft): string {
  return JSON.stringify({
    diners: draft.diners,
    notes: draft.notes.trim(),
    items: draft.items.map((item) => ({
      clientLineId: item.clientLineId,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      notes: item.notes.trim(),
    })),
  });
}

export function gatewayDraftItems(items: BillItem[]): Array<{
  lineId?: string;
  catalogItemId: string;
  quantity: number;
  notes?: string;
}> {
  return items.map((item) => ({
    lineId: item.id,
    catalogItemId: item.productId,
    quantity: item.quantity,
    notes: item.notes || undefined,
  }));
}

export function reconcileDraftLineIds(
  current: OrderDraft,
  sent: OrderDraft,
  savedItems: BillItem[],
): OrderDraft {
  const used = new Set<number>();
  const serverIdByClientId = new Map<string, string>();

  for (const sentItem of sent.items) {
    const sentNotes = sentItem.notes.trim();
    const matchIndex = savedItems.findIndex((savedItem, index) => {
      if (used.has(index)) return false;
      if (sentItem.id) return savedItem.id === sentItem.id || savedItem.clientLineId === sentItem.id;
      return savedItem.productId === sentItem.productId && savedItem.notes.trim() === sentNotes;
    });
    if (matchIndex < 0) continue;
    used.add(matchIndex);
    const matched = savedItems[matchIndex];
    const serverId = matched.id || matched.clientLineId;
    if (serverId) serverIdByClientId.set(sentItem.clientLineId, serverId);
  }

  return {
    ...current,
    items: current.items.map((item) => item.id || !serverIdByClientId.has(item.clientLineId)
      ? item
      : { ...item, id: serverIdByClientId.get(item.clientLineId) }),
  };
}

export function sortZones(zones: DiningZone[]): DiningZone[] {
  return [...zones].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

export function sortTables(tables: DiningTable[]): DiningTable[] {
  return [...tables].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

export function isManager(role: string): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function isBillLocked(bill: Bill): boolean {
  return bill.editLocked || Boolean(bill.firstPaymentAt);
}

export function tableState(table: DiningTable): {
  tone: 'free' | 'open' | 'pending' | 'conflict' | 'payment';
  label: string;
} {
  const bill = table.activeBill;
  if (!bill) return { tone: 'free', label: 'Desocupada' };
  if (bill.syncState === 'CONFLICT' || bill.conflictId) return { tone: 'conflict', label: 'Revisar conflicto' };
  if (bill.status === 'PAID') return { tone: 'payment', label: 'Pagada' };
  if (bill.status === 'PARTIALLY_PAID' || bill.editLocked) return { tone: 'payment', label: 'Pago iniciado' };
  if (bill.syncState !== 'SYNCED') return { tone: 'pending', label: 'Pendiente de sync' };
  return { tone: 'open', label: 'Cuenta abierta' };
}

export function paymentBlockReason(bill: Bill): string | null {
  if (bill.conflict || bill.syncState === 'CONFLICT') return 'Resuelve el conflicto con Contífico antes de cobrar.';
  if (bill.syncState !== 'SYNCED') return 'La prefactura aún no está sincronizada con Contífico.';
  if (!bill.remoteDocumentId) return 'Contífico todavía no confirmó la prefactura.';
  if (!bill.paymentEligibility) return 'Esperando la verificación de cobro del servidor.';
  if (!bill.paymentEligibility.eligible) return paymentEligibilityReasonLabel(bill.paymentEligibility.reason);
  if (bill.totals.balanceCents <= 0) return 'Esta cuenta no tiene saldo pendiente.';
  return null;
}

const PAYMENT_ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  REMOTE_CONFLICT: 'La prefactura cambió en Contífico. Un manager debe reconciliarla antes de cobrar.',
  NOT_SYNCED: 'La prefactura todavía no está sincronizada con Contífico.',
  NO_REMOTE_PRE: 'Contífico todavía no confirmó la prefactura.',
  NO_BALANCE: 'Esta cuenta no tiene saldo pendiente.',
  PAYMENT_RECONCILIATION_REQUIRED: 'Hay un cobro pendiente de revisión. Un manager debe reconciliarlo antes de aceptar otro pago.',
};

export function paymentEligibilityReasonLabel(reason?: string | null): string {
  const normalized = reason?.trim();
  if (!normalized) return 'El servidor bloqueó el cobro.';
  const known = PAYMENT_ELIGIBILITY_REASON_LABELS[normalized.toUpperCase()];
  if (known) return known;
  // Preserve a human explanation from the gateway, but never expose an unknown
  // machine code as operator-facing copy.
  return /^[A-Z][A-Z0-9_]*$/.test(normalized)
    ? 'El servidor bloqueó el cobro. Actualiza la cuenta o solicita ayuda a un manager.'
    : normalized;
}

const REMOTE_MONEY_MARKER = /(?:COBRO|PAYMENT|SETTLEMENT|PAGO)/i;

export function isRemoteMoneyConflict(conflict: PosConflict): boolean {
  if (REMOTE_MONEY_MARKER.test(conflict.reason) || REMOTE_MONEY_MARKER.test(conflict.kind || '')) return true;
  // An explicit allow-list is authoritative. If the gateway withholds RETRY_LOCAL,
  // fail closed even when a newer conflict kind is not known by this frontend.
  return Array.isArray(conflict.allowedActions) && !conflict.allowedActions.includes('RETRY_LOCAL');
}

export function conflictAllowsAction(
  conflict: PosConflict,
  action: 'ACCEPT_REMOTE' | 'RETRY_LOCAL',
): boolean {
  if (action === 'RETRY_LOCAL' && isRemoteMoneyConflict(conflict)) return false;
  return !Array.isArray(conflict.allowedActions) || conflict.allowedActions.includes(action);
}

export function conflictReasonLabel(conflict: PosConflict): string {
  const normalized = conflict.reason.trim().toUpperCase();
  if (normalized === 'REMOTE_COBRO_CHANGED') {
    return 'Contífico reporta cobros que no coinciden con la copia local.';
  }
  if (normalized === 'REMOTE_PRE_CHANGED') {
    return 'Los productos o totales de la prefactura cambiaron en Contífico.';
  }
  return /^[A-Z][A-Z0-9_]*$/.test(conflict.reason.trim())
    ? 'Contífico reporta un cambio remoto que requiere revisión.'
    : conflict.reason;
}

/** A known ambiguous intent may be retried only after these hard safety fences pass. */
export function settlementRetryBlockReason(bill: Bill): string | null {
  if (bill.conflict || bill.syncState === 'CONFLICT') return 'Resuelve el conflicto con Contífico antes de reconciliar el cobro.';
  if (bill.syncState !== 'SYNCED') return 'La prefactura debe estar sincronizada antes de reconciliar el cobro.';
  if (!bill.remoteDocumentId) return 'Contífico todavía no confirmó la prefactura.';
  if (bill.totals.balanceCents <= 0) return 'La cuenta ya no tiene saldo; actualiza el estado antes de reintentar.';
  return null;
}

export function paymentCapability(
  methods: PaymentMethodCapability[],
  method: PaymentMethod,
): PaymentMethodCapability {
  return methods.find((candidate) => candidate.method === method) || {
    method,
    label: paymentMethodLabel(method),
    enabled: false,
    disabledReason: 'Este método no está configurado por el servidor.',
  };
}

export function paymentMethodLabel(method: PaymentRecordMethod | null | undefined): string {
  if (!method) return 'Método no informado';
  if (method === 'EXTERNAL') return 'Contífico externo (método no informado)';
  return ({ CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', MESITA: 'Mesita' } as const)[method];
}

export function isSriAuthorized(status?: string | null): boolean {
  return ['AUTORIZADO', 'AUTHORIZED', 'SRI_AUTHORIZED'].includes((status || '').toUpperCase());
}

export function newClientLineId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
