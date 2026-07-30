import type { OrderDraft, PaymentMethod } from './types';

const DRAFT_VERSION = 1;
const SETTLEMENT_VERSION = 1;
const DRAFT_PREFIX = 'mesita-pos:pending-draft:';
const SETTLEMENT_PREFIX = 'mesita-pos:settlement-intent:';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DurableDraftRecord {
  version: 1;
  billId: string;
  expectedRevision: number;
  draft: OrderDraft;
  updatedAt: string;
}

export type DraftRecovery =
  | { kind: 'NONE' }
  | { kind: 'RECOVERABLE'; record: DurableDraftRecord }
  | { kind: 'STALE'; record: DurableDraftRecord };

export type SettlementIntentState = 'READY' | 'SUBMITTING' | 'AMBIGUOUS';

export interface DurableSettlementIntent {
  version: 1;
  billId: string;
  method: PaymentMethod;
  amount: string;
  manualReference: string;
  idempotencyKey: string;
  state: SettlementIntentState;
  createdAt: string;
  updatedAt: string;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function withStorage(storage?: StorageLike | null): StorageLike | null {
  return storage === undefined ? browserStorage() : storage;
}

function safeRead(key: string, storage?: StorageLike | null): unknown {
  const target = withStorage(storage);
  if (!target) return null;
  try {
    const value = target.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown, storage?: StorageLike | null): boolean {
  const target = withStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string, storage?: StorageLike | null): void {
  const target = withStorage(storage);
  if (!target) return;
  try {
    target.removeItem(key);
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
}

function validDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as OrderDraft;
  return Number.isInteger(draft.diners)
    && draft.diners >= 1
    && draft.diners <= 99
    && typeof draft.notes === 'string'
    && draft.notes.length <= 500
    && Array.isArray(draft.items)
    && draft.items.length <= 500
    && draft.items.every((item) => item
      && typeof item.clientLineId === 'string'
      && item.clientLineId.length > 0
      && typeof item.productId === 'string'
      && item.productId.length > 0
      && typeof item.name === 'string'
      && Number.isInteger(item.quantity)
      && item.quantity > 0
      && Number.isSafeInteger(item.unitPriceCents)
      && item.unitPriceCents >= 0
      && typeof item.notes === 'string'
      && item.notes.length <= 240
      && (item.id === undefined || typeof item.id === 'string'));
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

/** Fingerprint only fields accepted by the desired-state gateway payload. */
export function desiredDraftFingerprint(draft: OrderDraft): string {
  return JSON.stringify({
    diners: draft.diners,
    notes: draft.notes.trim(),
    items: draft.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes.trim(),
    })),
  });
}

export function saveDurableDraft(
  billId: string,
  expectedRevision: number,
  draft: OrderDraft,
  storage?: StorageLike | null,
): boolean {
  if (!billId || !Number.isInteger(expectedRevision) || expectedRevision < 0 || !validDraft(draft)) return false;
  const record: DurableDraftRecord = {
    version: DRAFT_VERSION,
    billId,
    expectedRevision,
    draft,
    updatedAt: new Date().toISOString(),
  };
  return safeWrite(`${DRAFT_PREFIX}${billId}`, record, storage);
}

export function readDurableDraft(billId: string, storage?: StorageLike | null): DurableDraftRecord | null {
  const value = safeRead(`${DRAFT_PREFIX}${billId}`, storage);
  if (!value || typeof value !== 'object') return null;
  const record = value as DurableDraftRecord;
  if (record.version !== DRAFT_VERSION
    || record.billId !== billId
    || !Number.isInteger(record.expectedRevision)
    || record.expectedRevision < 0
    || !validDraft(record.draft)
    || !validDate(record.updatedAt)) return null;
  return record;
}

export function clearDurableDraft(billId: string, storage?: StorageLike | null): void {
  safeRemove(`${DRAFT_PREFIX}${billId}`, storage);
}

export function resolveDraftRecovery(
  billId: string,
  serverRevision: number,
  serverDraft: OrderDraft,
  storage?: StorageLike | null,
): DraftRecovery {
  const record = readDurableDraft(billId, storage);
  if (!record) return { kind: 'NONE' };

  if (desiredDraftFingerprint(record.draft) === desiredDraftFingerprint(serverDraft)) {
    clearDurableDraft(billId, storage);
    return { kind: 'NONE' };
  }

  return record.expectedRevision === serverRevision
    ? { kind: 'RECOVERABLE', record }
    : { kind: 'STALE', record };
}

function validSettlementIntent(value: unknown, billId: string): value is DurableSettlementIntent {
  if (!value || typeof value !== 'object') return false;
  const intent = value as DurableSettlementIntent;
  return intent.version === SETTLEMENT_VERSION
    && intent.billId === billId
    && ['CASH', 'CARD', 'TRANSFER', 'MESITA'].includes(intent.method)
    && typeof intent.amount === 'string'
    && intent.amount.length <= 40
    && typeof intent.manualReference === 'string'
    && intent.manualReference.length <= 80
    && typeof intent.idempotencyKey === 'string'
    && intent.idempotencyKey.length > 0
    && intent.idempotencyKey.length <= 200
    && ['READY', 'SUBMITTING', 'AMBIGUOUS'].includes(intent.state)
    && validDate(intent.createdAt)
    && validDate(intent.updatedAt);
}

export function saveSettlementIntent(
  intent: Omit<DurableSettlementIntent, 'version' | 'updatedAt'>,
  storage?: StorageLike | null,
): boolean {
  const record: DurableSettlementIntent = {
    ...intent,
    version: SETTLEMENT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  if (!validSettlementIntent(record, intent.billId)) return false;
  return safeWrite(`${SETTLEMENT_PREFIX}${intent.billId}`, record, storage);
}

export function readSettlementIntent(
  billId: string,
  storage?: StorageLike | null,
): DurableSettlementIntent | null {
  const value = safeRead(`${SETTLEMENT_PREFIX}${billId}`, storage);
  return validSettlementIntent(value, billId) ? value : null;
}

export function clearSettlementIntent(billId: string, storage?: StorageLike | null): void {
  safeRemove(`${SETTLEMENT_PREFIX}${billId}`, storage);
}
