import { describe, expect, it } from 'vitest';
import {
  clearSettlementIntent,
  readDurableDraft,
  readSettlementIntent,
  resolveDraftRecovery,
  saveDurableDraft,
  saveSettlementIntent,
  type StorageLike,
} from './localPersistence';
import type { OrderDraft } from './types';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const serverDraft: OrderDraft = {
  diners: 2,
  notes: '',
  items: [],
};

const pendingDraft: OrderDraft = {
  diners: 2,
  notes: 'ventana',
  items: [{
    clientLineId: 'local-line-1',
    productId: 'product-1',
    name: 'Ceviche',
    quantity: 2,
    unitPriceCents: 850,
    notes: 'sin cebolla',
  }],
};

describe('durable draft recovery', () => {
  it('restores an unsent draft only when its expected revision is still current', () => {
    const storage = new MemoryStorage();
    expect(saveDurableDraft('bill-1', 4, pendingDraft, storage)).toBe(true);

    expect(resolveDraftRecovery('bill-1', 4, serverDraft, storage)).toMatchObject({
      kind: 'RECOVERABLE',
      record: { expectedRevision: 4, draft: pendingDraft },
    });
  });

  it('fences a recovered draft when the server revision moved', () => {
    const storage = new MemoryStorage();
    saveDurableDraft('bill-1', 4, pendingDraft, storage);

    expect(resolveDraftRecovery('bill-1', 5, serverDraft, storage)).toMatchObject({
      kind: 'STALE',
      record: { expectedRevision: 4 },
    });
    expect(readDurableDraft('bill-1', storage)?.draft).toEqual(pendingDraft);
  });

  it('clears a stale record when the gateway already persisted the same desired state', () => {
    const storage = new MemoryStorage();
    saveDurableDraft('bill-1', 4, pendingDraft, storage);
    const persistedByGateway: OrderDraft = {
      ...pendingDraft,
      items: [{ ...pendingDraft.items[0], id: 'server-line-9', clientLineId: 'server-line-9', unitPriceCents: 900 }],
    };

    expect(resolveDraftRecovery('bill-1', 5, persistedByGateway, storage)).toEqual({ kind: 'NONE' });
    expect(readDurableDraft('bill-1', storage)).toBeNull();
  });
});

describe('durable settlement intent', () => {
  it('keeps the same idempotency key and immutable payload while an outcome is ambiguous', () => {
    const storage = new MemoryStorage();
    saveSettlementIntent({
      billId: 'bill-1',
      method: 'CARD',
      amount: '19.55',
      manualReference: 'V-123',
      idempotencyKey: 'intent-fixed-key',
      state: 'AMBIGUOUS',
      createdAt: '2026-07-21T10:00:00.000Z',
    }, storage);

    expect(readSettlementIntent('bill-1', storage)).toMatchObject({
      method: 'CARD',
      amount: '19.55',
      manualReference: 'V-123',
      idempotencyKey: 'intent-fixed-key',
      state: 'AMBIGUOUS',
    });

    clearSettlementIntent('bill-1', storage);
    expect(readSettlementIntent('bill-1', storage)).toBeNull();
  });
});
