import { describe, expect, it } from 'vitest';
import { calculateDraftTotal, conflictAllowsAction, conflictReasonLabel, draftFingerprint, gatewayDraftItems, isRemoteMoneyConflict, isSriAuthorized, parseMoneyInput, paymentBlockReason, paymentEligibilityReasonLabel, paymentMethodLabel, reconcileDraftLineIds, splitDraftItemUnit, tableState } from './domain';
import type { Bill, DiningTable, OrderDraft } from './types';

const bill = (overrides: Partial<Bill> = {}): Bill => ({
  id: 'bill-1',
  tableId: 'table-1',
  revision: 1,
  status: 'OPEN',
  syncState: 'SYNCED',
  diners: 2,
  notes: '',
  items: [],
  totals: { subtotalCents: 1000, taxCents: 0, totalCents: 1000, paidCents: 0, balanceCents: 1000 },
  payments: [],
  fiscal: {},
  remoteDocumentId: 'pre-1',
  editLocked: false,
  paymentEligibility: { eligible: true, verifiedAt: '2026-07-20T12:00:00Z' },
  ...overrides,
});

describe('money helpers', () => {
  it('parses decimal currency without floating point rounding', () => {
    expect(parseMoneyInput('10.25')).toBe(1025);
    expect(parseMoneyInput('10,2')).toBe(1020);
    expect(parseMoneyInput('0')).toBeNull();
    expect(parseMoneyInput('4.999')).toBeNull();
  });

  it('sums integer-cent line totals', () => {
    expect(calculateDraftTotal([
      { clientLineId: 'a', productId: 'p', name: 'Uno', quantity: 3, unitPriceCents: 199, notes: '' },
    ])).toBe(597);
  });
});

describe('truthful state guards', () => {
  it('does not allow payment without server eligibility', () => {
    expect(paymentBlockReason(bill({ paymentEligibility: null }))).toContain('servidor');
    expect(paymentBlockReason(bill({ syncState: 'PENDING' }))).toContain('sincronizada');
    expect(paymentBlockReason(bill())).toBeNull();
  });

  it('translates gateway payment eligibility codes instead of exposing them to staff', () => {
    expect(paymentEligibilityReasonLabel('REMOTE_CONFLICT')).toContain('reconciliarla');
    expect(paymentEligibilityReasonLabel('NOT_SYNCED')).toContain('sincronizada');
    expect(paymentEligibilityReasonLabel('NO_REMOTE_PRE')).toContain('confirmó');
    expect(paymentEligibilityReasonLabel('NO_BALANCE')).toContain('saldo');
    expect(paymentEligibilityReasonLabel('PAYMENT_RECONCILIATION_REQUIRED')).toContain('cobro pendiente');
    expect(paymentEligibilityReasonLabel('A_NEW_GATEWAY_CODE')).not.toContain('A_NEW_GATEWAY_CODE');
    expect(paymentEligibilityReasonLabel('Explicación legible del servidor.')).toBe('Explicación legible del servidor.');
  });

  it('never offers a local retry when a conflict contains remote money', () => {
    const cobroConflict = {
      id: 'conflict-cobro', detectedAt: '2026-07-20T12:00:00Z',
      reason: 'REMOTE_COBRO_CHANGED', kind: 'REMOTE_COBRO', allowedActions: ['ACCEPT_REMOTE'] as const,
    };
    expect(isRemoteMoneyConflict(cobroConflict)).toBe(true);
    expect(conflictAllowsAction(cobroConflict, 'RETRY_LOCAL')).toBe(false);
    expect(conflictAllowsAction(cobroConflict, 'ACCEPT_REMOTE')).toBe(true);
    expect(conflictReasonLabel(cobroConflict)).toContain('cobros');

    const preConflict = {
      id: 'conflict-pre', detectedAt: '2026-07-20T12:00:00Z',
      reason: 'REMOTE_PRE_CHANGED', allowedActions: ['ACCEPT_REMOTE', 'RETRY_LOCAL'] as const,
    };
    expect(isRemoteMoneyConflict(preConflict)).toBe(false);
    expect(conflictAllowsAction(preConflict, 'RETRY_LOCAL')).toBe(true);
  });

  it('prioritizes conflicts in table state', () => {
    const table: DiningTable = {
      id: 't', zoneId: 'z', name: 'Mesa 1', capacity: 4, sortOrder: 1,
      activeBill: { id: 'b', status: 'OPEN', syncState: 'CONFLICT', totalCents: 10, balanceCents: 10, diners: 1 },
    };
    expect(tableState(table)).toEqual({ tone: 'conflict', label: 'Revisar conflicto' });
  });

  it('recognizes the gateway SRI authorization state and never invents a payment method', () => {
    expect(isSriAuthorized('SRI_AUTHORIZED')).toBe(true);
    expect(isSriAuthorized('PENDING')).toBe(false);
    expect(paymentMethodLabel(null)).toBe('Método no informado');
    expect(paymentMethodLabel('EXTERNAL')).toBe('Contífico externo (método no informado)');
  });
});

describe('draft fingerprint', () => {
  it('splits one unit into a separate PRE line with an independent kitchen note', () => {
    const items = [{
      id: 'server-line-1', clientLineId: 'local-line-1', productId: 'p1', name: 'Ceviche',
      quantity: 2, unitPriceCents: 850, lineTotalCents: 1700, notes: 'Sin cebolla',
    }];

    const split = splitDraftItemUnit(items, 'local-line-1', 'local-line-2');

    expect(split).toEqual([
      { ...items[0], quantity: 1 },
      {
        ...items[0], id: undefined, clientLineId: 'local-line-2', quantity: 1,
        lineTotalCents: undefined, notes: '',
      },
    ]);
    expect(gatewayDraftItems(split)).toEqual([
      { lineId: 'server-line-1', catalogItemId: 'p1', quantity: 1, notes: 'Sin cebolla' },
      { lineId: undefined, catalogItemId: 'p1', quantity: 1, notes: undefined },
    ]);
  });

  it('captures server-relevant fields and normalizes surrounding notes', () => {
    const draft: OrderDraft = {
      diners: 2,
      notes: '  cerca de ventana ',
      items: [{ clientLineId: 'a', productId: 'p', name: 'Producto', quantity: 1, unitPriceCents: 100, notes: ' sin sal ' }],
    };
    expect(draftFingerprint(draft)).toBe(draftFingerprint({
      ...draft,
      notes: 'cerca de ventana',
      items: [{ ...draft.items[0], notes: 'sin sal' }],
    }));
  });

  it('reconciles the server line ID into edits made while the first save was in flight', () => {
    const sent: OrderDraft = {
      diners: 2,
      notes: '',
      items: [{ clientLineId: 'local-1', productId: 'p1', name: 'Producto', quantity: 1, unitPriceCents: 100, notes: '' }],
    };
    const current: OrderDraft = {
      ...sent,
      items: [
        { ...sent.items[0], quantity: 2 },
        { clientLineId: 'local-2', productId: 'p2', name: 'Nuevo', quantity: 1, unitPriceCents: 200, notes: '' },
      ],
    };
    const savedItems = [{ ...sent.items[0], id: 'server-line-1', clientLineId: 'server-line-1' }];

    const reconciled = reconcileDraftLineIds(current, sent, savedItems);
    expect(reconciled.items[0]).toMatchObject({ id: 'server-line-1', clientLineId: 'local-1', quantity: 2 });
    expect(reconciled.items[1].id).toBeUndefined();
    expect(gatewayDraftItems(reconciled.items)).toEqual([
      { lineId: 'server-line-1', catalogItemId: 'p1', quantity: 2, notes: undefined },
      { lineId: undefined, catalogItemId: 'p2', quantity: 1, notes: undefined },
    ]);
  });

  it('matches duplicate products by ordered note occurrence without replacing local keys', () => {
    const sent: OrderDraft = {
      diners: 1,
      notes: '',
      items: [
        { clientLineId: 'local-a', productId: 'p1', name: 'Uno', quantity: 1, unitPriceCents: 100, notes: 'sin sal' },
        { clientLineId: 'local-b', productId: 'p1', name: 'Uno', quantity: 1, unitPriceCents: 100, notes: 'sin sal' },
      ],
    };
    const saved = sent.items.map((item, index) => ({ ...item, id: `server-${index + 1}`, clientLineId: `server-${index + 1}` }));
    const reconciled = reconcileDraftLineIds(sent, sent, saved);
    expect(reconciled.items.map((item) => [item.clientLineId, item.id])).toEqual([
      ['local-a', 'server-1'], ['local-b', 'server-2'],
    ]);
  });
});
