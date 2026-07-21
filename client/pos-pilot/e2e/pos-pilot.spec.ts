import { expect, test, type Page } from '@playwright/test';
import type { Bill, BillItem, PaymentRecord } from '../src/types';

const NOW = '2026-07-20T18:00:00.000Z';
const catalog = [
  { id: 'prod-1', externalId: 'CF-1', name: 'Ceviche clásico', category: 'Entradas', priceCents: 850, available: true },
  { id: 'prod-2', externalId: 'CF-2', name: 'Empanadas de verde', category: 'Entradas', priceCents: 525, available: true },
  { id: 'prod-3', externalId: 'CF-3', name: 'Arroz marinero', category: 'Platos fuertes', priceCents: 1425, available: true },
];

function emptyBill(id = 'bill-new', tableId = 'table-2'): Bill {
  return {
    id, tableId, revision: 1, status: 'OPEN', syncState: 'SYNCED', diners: 2, notes: '', items: [],
    totals: { subtotalCents: 0, taxCents: 0, totalCents: 0, paidCents: 0, balanceCents: 0 },
    payments: [], fiscal: { preNumber: null, preStatus: null, facNumber: null, facStatus: null, sriStatus: null },
    remoteDocumentId: null, remoteNumber: null, lastSyncedAt: null, firstPaymentAt: null, editLocked: false,
    paymentEligibility: { eligible: false, reason: 'La prefactura todavía no fue sincronizada.' }, conflict: null,
  };
}

function existingBill(): Bill {
  const item: BillItem = { id: 'line-existing', clientLineId: 'line-existing', productId: 'prod-1', externalProductId: 'CF-1', name: 'Ceviche clásico', quantity: 2, unitPriceCents: 850, notes: '' };
  return {
    ...emptyBill('bill-existing', 'table-1'), revision: 4, diners: 3, items: [item], remoteDocumentId: 'remote-pre-1', remoteNumber: '001-002-123', lastSyncedAt: NOW,
    totals: { subtotalCents: 1700, taxCents: 255, totalCents: 1955, paidCents: 0, balanceCents: 1955 },
    fiscal: { preNumber: '001-002-123', preStatus: 'PENDIENTE', facNumber: null, facStatus: null, sriStatus: null },
    paymentEligibility: { eligible: true, verifiedAt: NOW },
  };
}

function conflictBill(): Bill {
  return {
    ...existingBill(), id: 'bill-conflict', tableId: 'table-3', syncState: 'CONFLICT',
    conflict: { id: 'conflict-1', detectedAt: NOW, reason: 'REMOTE_COBRO_CHANGED', kind: 'REMOTE_COBRO', allowedActions: ['ACCEPT_REMOTE'], remoteSummary: 'Contífico reporta un cobro adicional.' },
    paymentEligibility: { eligible: false, reason: 'REMOTE_CONFLICT' },
  };
}

function bootstrap(state?: ApiState) {
  const response = {
    restaurant: { id: 'rest-1', name: 'La Mesa del Puerto', currency: 'USD', timeZone: 'America/Guayaquil', posConsoleEnabled: true, sandbox: true },
    user: { id: 'user-1', name: 'Ana Rivera', role: 'MANAGER' },
    integration: { status: 'CONNECTED', label: 'Contífico conectado', lastCheckedAt: NOW, catalogLastSyncedAt: NOW },
    zones: [{ id: 'zone-1', name: 'Salón principal', sortOrder: 1 }, { id: 'zone-2', name: 'Terraza', sortOrder: 2 }],
    tables: [
      { id: 'table-1', zoneId: 'zone-1', name: 'Mesa 1', capacity: 4, sortOrder: 1, activeBill: { id: 'bill-existing', status: 'OPEN', syncState: 'SYNCED', totalCents: 1955, balanceCents: 1955, diners: 3, remoteNumber: '001-002-123' } },
      { id: 'table-2', zoneId: 'zone-1', name: 'Mesa 2', capacity: 4, sortOrder: 2, activeBill: null },
      { id: 'table-3', zoneId: 'zone-2', name: 'Terraza 1', capacity: 4, sortOrder: 1, activeBill: { id: 'bill-conflict', status: 'OPEN', syncState: 'CONFLICT', totalCents: 1955, balanceCents: 1955, diners: 3, conflictId: 'conflict-1' } },
    ] as Array<Record<string, any>>,
    catalog,
    paymentMethods: [
      { method: 'CASH', label: 'Efectivo', enabled: true },
      { method: 'CARD', label: 'Tarjeta', enabled: true },
      { method: 'TRANSFER', label: 'Transferencia', enabled: false, disabledReason: 'Pendiente de certificación en sandbox.' },
      { method: 'MESITA', label: 'Mesita', enabled: true },
    ],
  };
  if (state?.billOpened) {
    response.tables[1] = {
      ...response.tables[1],
      activeBill: {
        id: state.bill.id,
        status: state.bill.status,
        syncState: state.bill.syncState,
        totalCents: state.bill.totals.totalCents,
        balanceCents: state.bill.totals.balanceCents,
        diners: state.bill.diners,
        remoteNumber: state.bill.remoteNumber,
        editLocked: state.bill.editLocked,
      },
    };
  }
  return response;
}

type ApiState = ReturnType<typeof createState>;

function createState() {
  return {
    bill: emptyBill(),
    billOpened: false,
    draftOffline: false,
    exchangedTicket: null as string | null,
    draftBodies: [] as Array<Record<string, any>>,
    syncCount: 0,
    printCount: 0,
    settlement: null as Record<string, any> | null,
    settlementBodies: [] as Array<Record<string, any>>,
    paymentReconciliation: null as Record<string, any> | null,
    conflictResolution: null as Record<string, any> | null,
    conflictDraftBodies: [] as Array<Record<string, any>>,
    createdZone: null as Record<string, any> | null,
    createdTable: null as Record<string, any> | null,
    nextLine: 1,
  };
}

async function installApi(page: Page): Promise<ApiState> {
  const state = createState();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => document.documentElement.setAttribute('data-print-called', 'true'),
    });
  });

  await page.route('**/api/pos-pilot/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/pos-pilot', '');
    const method = request.method();
    const body = request.postDataJSON?.() || {};
    const fulfill = (payload: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

    if (method === 'POST' && path === '/session/exchange') {
      state.exchangedTicket = body.ticket;
      return fulfill({ expiresAt: NOW });
    }
    if (method === 'GET' && path === '/bootstrap') return fulfill(bootstrap(state));
    if (method === 'POST' && path === '/zones') {
      state.createdZone = body;
      return fulfill({ id: 'zone-new', ...body });
    }
    if (method === 'POST' && path === '/tables') {
      state.createdTable = body;
      return fulfill({ id: 'table-new', activeBill: null, ...body });
    }
    if (method === 'POST' && path === '/bills') {
      state.bill = { ...emptyBill(), diners: body.diners, tableId: body.tableId };
      state.billOpened = true;
      return fulfill(state.bill);
    }
    if (method === 'GET' && path === '/bills/bill-existing') return fulfill(existingBill());
    if (method === 'GET' && path === '/bills/bill-conflict') return fulfill(conflictBill());
    if (method === 'GET' && path === '/bills/bill-new') return fulfill(state.bill);
    if (method === 'PUT' && path === '/bills/bill-new/draft') {
      if (state.draftOffline) return route.abort('internetdisconnected');
      state.draftBodies.push(body);
      const items: BillItem[] = body.items.map((wire: Record<string, any>) => {
        const product = catalog.find((candidate) => candidate.id === wire.catalogItemId)!;
        const lineId = wire.lineId || `server-line-${state.nextLine++}`;
        return { id: lineId, clientLineId: lineId, productId: product.id, externalProductId: product.externalId, name: product.name, quantity: wire.quantity, unitPriceCents: product.priceCents, notes: wire.notes || '' };
      });
      const totalCents = items.reduce((sum: number, item: Record<string, any>) => sum + item.quantity * item.unitPriceCents, 0);
      state.bill = {
        ...state.bill, revision: state.bill.revision + 1, diners: body.diners, notes: body.notes || '', items, syncState: 'PENDING',
        totals: { subtotalCents: totalCents, taxCents: 0, totalCents, paidCents: 0, balanceCents: totalCents },
        paymentEligibility: { eligible: false, reason: 'Sincronización pendiente.' },
      };
      return fulfill(state.bill);
    }
    if (method === 'PUT' && path === '/bills/bill-conflict/draft') {
      state.conflictDraftBodies.push(body);
      return fulfill({ ...conflictBill(), revision: conflictBill().revision + 1, conflict: null, syncState: 'PENDING' });
    }
    if (method === 'POST' && path === '/bills/bill-new/sync') {
      state.syncCount += 1;
      state.bill = {
        ...state.bill, syncState: 'SYNCED', remoteDocumentId: 'remote-new', remoteNumber: '001-002-900', lastSyncedAt: NOW,
        fiscal: { ...state.bill.fiscal, preNumber: '001-002-900', preStatus: 'PENDIENTE' },
        paymentEligibility: { eligible: true, verifiedAt: NOW },
      };
      return fulfill(state.bill);
    }
    if (method === 'GET' && path === '/bills/bill-new/print') {
      state.printCount += 1;
      return fulfill({
        verifiedAt: NOW,
        restaurant: { name: 'La Mesa del Puerto', taxId: '0999999999001' }, zone: { name: 'Salón principal' }, table: { name: 'Mesa 2' }, bill: state.bill,
        pre: { number: '001-002-900', status: 'PENDIENTE' }, payments: state.bill.payments, fiscal: state.bill.fiscal,
      });
    }
    if (method === 'POST' && path === '/bills/bill-new/settlements') {
      state.settlementBodies.push(body);
      if (state.settlementBodies.length === 1) {
        return fulfill({ error: 'Gateway Timeout', detail: 'Resultado no confirmado; reintenta la misma intención.' }, 504);
      }
      state.settlement = body;
      const responseMethod = body.method === 'CARD_TERMINAL' ? 'CARD' : body.method === 'BANK_TRANSFER' ? 'TRANSFER' : body.method;
      const payment: PaymentRecord = { id: 'pay-1', method: responseMethod, amountCents: body.amountCents, status: 'POS_REGISTERED', manualReference: body.manualReference, idempotencyKey: body.idempotencyKey, createdAt: NOW };
      state.bill = {
        ...state.bill, status: 'PAID', editLocked: true, firstPaymentAt: NOW, payments: [payment],
        totals: { ...state.bill.totals, paidCents: state.bill.totals.totalCents, balanceCents: 0 },
        paymentEligibility: { eligible: false, reason: 'La cuenta ya está pagada.' },
      };
      return fulfill({ bill: state.bill, payment, message: 'Pago confirmado.' });
    }
    if (method === 'POST' && path === '/bills/bill-new/settlements/pay-review/reconcile') {
      state.paymentReconciliation = body;
      const payment = { ...state.bill.payments[0], status: 'POS_REGISTERED', posRegistrationStatus: 'REGISTERED' } as PaymentRecord;
      state.bill = { ...state.bill, payments: [payment] };
      return fulfill({ bill: state.bill, payment, message: 'Cobro conciliado con evidencia remota.' });
    }
    if (method === 'POST' && path === '/bills/bill-new/settlements/pay-retryable/reconcile') {
      state.paymentReconciliation = body;
      const payment = { ...state.bill.payments[0], status: 'POS_REGISTERED', posRegistrationStatus: 'REGISTERED' } as PaymentRecord;
      state.bill = { ...state.bill, payments: [payment] };
      return fulfill({ bill: state.bill, payment, message: 'La misma intención quedó registrada en Contífico.' });
    }
    if (method === 'POST' && path === '/bills/bill-new/settlements/pay-stale-registration/reconcile') {
      state.paymentReconciliation = body;
      const payment = { ...state.bill.payments[0], status: 'POS_REGISTERED', posRegistrationStatus: 'REGISTERED' } as PaymentRecord;
      state.bill = { ...state.bill, payments: [payment] };
      return fulfill({ bill: state.bill, payment, message: 'La misma intención quedó registrada en Contífico.' });
    }
    if (method === 'POST' && path === '/conflicts/conflict-1/resolve') {
      state.conflictResolution = body;
      const remoteItem: BillItem = {
        id: 'remote-only-line', clientLineId: 'remote-only-line', productId: 'remote-unmapped-product',
        externalProductId: 'CF-REMOTE-9', name: 'Producto agregado en Contífico', quantity: 1,
        unitPriceCents: 2375, notes: 'Estado remoto autoritativo',
      };
      return fulfill({
        ...conflictBill(), revision: 5, syncState: 'SYNCED', conflict: null, items: [remoteItem],
        remoteFingerprint: 'accepted-remote-fingerprint', lastSyncedAt: NOW,
        totals: { subtotalCents: 2375, taxCents: 0, totalCents: 2375, paidCents: 0, balanceCents: 2375 },
        paymentEligibility: { eligible: true, verifiedAt: NOW },
      });
    }
    if (method === 'GET' && path === '/history') {
      return fulfill({ records: [{
        id: 'history-1', tableName: 'Mesa 8', openedAt: NOW, closedAt: NOW, totalCents: 4825,
        pre: { number: '001-002-880', status: 'PAGADA' },
        payments: [{ id: 'pay-history', method: 'CASH', amountCents: 4825, status: 'POS_REGISTERED', createdAt: NOW }],
        fac: null, sri: null,
      }] });
    }
    return fulfill({ error: 'Unexpected mocked route', detail: `${method} ${path}` }, 500);
  });
  return state;
}

test('launch ticket is exchanged from the fragment and erased before bootstrap completes', async ({ page }) => {
  const state = await installApi(page);
  await page.goto('./#ticket=one-use-fragment-ticket');
  await expect(page.getByRole('heading', { name: 'Mapa de mesas' })).toBeVisible();
  expect(state.exchangedTicket).toBe('one-use-fragment-ticket');
  expect(new URL(page.url()).hash).toBe('');
  expect(new URL(page.url()).searchParams.has('ticket')).toBe(false);
});

test('manager floor, open bill, autosave, stable line update, print and payment', async ({ page }) => {
  const state = await installApi(page);
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'Mapa de mesas' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Terraza 1, Revisar conflicto/ })).toBeVisible();

  await page.getByRole('button', { name: 'Configurar salón' }).click();
  const manager = page.getByRole('dialog', { name: 'Configurar salón' });
  const zoneForm = manager.locator('form.inline-editor').nth(0);
  await zoneForm.getByLabel('Nombre').fill('Patio');
  await zoneForm.getByLabel('Orden').fill('3');
  await zoneForm.getByRole('button', { name: 'Añadir zona' }).click();
  await expect(manager.getByText('Zona creada.')).toBeVisible();
  expect(state.createdZone).toEqual({ name: 'Patio', sortOrder: 3 });

  const tableForm = manager.locator('form.inline-editor').nth(1);
  await tableForm.getByLabel('Zona').selectOption('zone-2');
  await tableForm.getByLabel('Nombre').fill('Terraza 2');
  await tableForm.getByLabel('Capacidad').fill('6');
  await tableForm.getByLabel('Orden').fill('2');
  await tableForm.getByRole('button', { name: 'Añadir mesa' }).click();
  await expect(manager.getByText('Mesa creada.')).toBeVisible();
  expect(state.createdTable).toEqual({ zoneId: 'zone-2', name: 'Terraza 2', capacity: 6, sortOrder: 2 });
  await manager.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByRole('button', { name: /Mesa 2, Desocupada/ }).click();
  await page.getByRole('dialog', { name: 'Abrir Mesa 2' }).getByRole('button', { name: 'Abrir cuenta' }).click();
  await expect(page.getByRole('complementary', { name: 'Cuenta actual' })).toBeVisible();

  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.getByRole('button', { name: /Empanadas de verde/ }).click();
  await expect(page.getByText(/guardado automático en menos de 2 s/)).toBeVisible();
  await page.clock.fastForward(1999);
  expect(state.draftBodies).toHaveLength(0);
  await page.clock.fastForward(1);
  await expect.poll(() => state.draftBodies.length).toBe(1);
  expect(state.draftBodies[0].items[0]).toMatchObject({ catalogItemId: 'prod-2', quantity: 1 });
  expect(state.draftBodies[0].items[0]).not.toHaveProperty('lineId');

  await page.getByRole('complementary', { name: 'Cuenta actual' }).getByRole('button', { name: 'Añadir Empanadas de verde' }).click();
  await page.getByRole('button', { name: 'Guardar ahora' }).click();
  await expect.poll(() => state.draftBodies.length).toBe(2);
  await expect.poll(() => state.syncCount).toBeGreaterThanOrEqual(1);
  expect(state.draftBodies[1].items[0]).toMatchObject({ lineId: 'server-line-1', catalogItemId: 'prod-2', quantity: 2 });

  await page.getByRole('button', { name: 'Imprimir' }).click();
  await expect.poll(() => state.printCount).toBe(1);
  await page.clock.fastForward(100);
  await expect.poll(() => page.locator('html').getAttribute('data-print-called')).toBe('true');

  await page.getByRole('button', { name: /Cobrar/ }).click();
  const checkout = page.getByRole('dialog', { name: 'Cobrar cuenta' });
  await expect(checkout.getByRole('radio', { name: /Transferencia/ })).toBeDisabled();
  await checkout.getByRole('radio', { name: /Tarjeta/ }).check();
  await checkout.getByLabel('Número de voucher del terminal').fill('V-123');
  await checkout.getByRole('button', { name: /Confirmar/ }).click();
  await expect(checkout.getByText('Resultado no confirmado; reintenta la misma intención.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Empanadas de verde/ }).first()).toBeDisabled();
  const firstIntentKey = state.settlementBodies[0].idempotencyKey;
  await checkout.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await page.getByRole('button', { name: /Reanudar cobro/i }).click();
  const resumedCheckout = page.getByRole('dialog', { name: 'Cobrar cuenta' });
  await expect(resumedCheckout.getByRole('radio', { name: /Tarjeta/ })).toBeChecked();
  await expect(resumedCheckout.getByRole('radio', { name: /Tarjeta/ })).toBeDisabled();
  await expect(resumedCheckout.getByLabel('Número de voucher del terminal')).toHaveValue('V-123');
  await resumedCheckout.getByRole('button', { name: /Reintentar misma intención/ }).click();
  await expect(resumedCheckout).toBeHidden();
  expect(state.settlement).toMatchObject({ method: 'CARD_TERMINAL', manualReference: 'V-123' });
  expect(typeof state.settlement?.idempotencyKey).toBe('string');
  expect(state.settlementBodies).toHaveLength(2);
  expect(state.settlementBodies[1].idempotencyKey).toBe(firstIntentKey);
  await expect(page.getByRole('button', { name: /Empanadas de verde/ }).first()).toBeDisabled();
});

test('an unsent draft survives an offline save and reload, then recovers behind the same revision fence', async ({ page }) => {
  const state = await installApi(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Mesa 2, Desocupada/ }).click();
  await page.getByRole('dialog', { name: 'Abrir Mesa 2' }).getByRole('button', { name: 'Abrir cuenta' }).click();

  state.draftOffline = true;
  await page.getByRole('button', { name: /Empanadas de verde/ }).click();
  await page.getByRole('button', { name: 'Guardar ahora' }).click();
  await expect(page.getByText(/Sin conexión/).first()).toBeVisible();
  expect(state.draftBodies).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('mesita-pos:pending-draft:')))).toBe(true);

  state.draftOffline = false;
  await page.reload();
  await page.getByRole('button', { name: /Mesa 2, Cuenta abierta/ }).click();
  await expect(page.getByText('Cambios locales recuperados')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Cuenta actual' })).toContainText('Empanadas de verde');
  await expect.poll(() => state.draftBodies.length, { timeout: 6_000 }).toBe(1);
  expect(state.draftBodies[0]).toMatchObject({ expectedRevision: 1 });
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('mesita-pos:pending-draft:')))).toBe(false);
  await expect.poll(() => state.syncCount, { timeout: 6_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Sincronizado').first()).toBeVisible();
});

for (const paymentCase of [
  { label: 'Efectivo', wireMethod: 'CASH' },
  { label: 'Mesita', wireMethod: 'MESITA' },
]) {
  test(`${paymentCase.label} preserves one intent key and uses the certified request mapping`, async ({ page }) => {
    const state = await installApi(page);
    state.billOpened = true;
    state.bill = { ...existingBill(), id: 'bill-new', tableId: 'table-2' };
    await page.goto('./');
    await page.getByRole('button', { name: /Mesa 2, Cuenta abierta/ }).click();
    await page.getByRole('button', { name: /Cobrar/ }).click();
    const checkout = page.getByRole('dialog', { name: 'Cobrar cuenta' });
    if (paymentCase.label !== 'Efectivo') {
      await checkout.getByRole('radio', { name: new RegExp(paymentCase.label) }).check();
    }

    await checkout.getByRole('button', { name: /Confirmar/ }).click();
    await expect(checkout.getByText(/misma intención quedó guardada/)).toBeVisible();
    const firstKey = state.settlementBodies[0].idempotencyKey;
    await checkout.getByRole('button', { name: /Reintentar misma intención/ }).click();
    await expect(checkout).toBeHidden();

    expect(state.settlementBodies).toHaveLength(2);
    expect(state.settlementBodies[0].method).toBe(paymentCase.wireMethod);
    expect(state.settlementBodies[1].idempotencyKey).toBe(firstKey);
  });
}

test('a manager can resolve a manual-review payment without creating a new intent', async ({ page }) => {
  const state = await installApi(page);
  const reviewPayment: PaymentRecord = {
    id: 'pay-review', method: 'CASH', amountCents: 500, status: 'MANUAL_REVIEW', posRegistrationStatus: 'MANUAL_REVIEW', idempotencyKey: 'server-stored-intent', allowedActions: ['ACCEPT_REMOTE', 'RETRY_SAME'], createdAt: NOW,
  };
  state.billOpened = true;
  state.bill = {
    ...existingBill(), id: 'bill-new', tableId: 'table-2', status: 'PARTIALLY_PAID', editLocked: true, firstPaymentAt: NOW, payments: [reviewPayment],
    totals: { subtotalCents: 1700, taxCents: 255, totalCents: 1955, paidCents: 500, balanceCents: 1455 },
    paymentEligibility: { eligible: false, reason: 'Hay un cobro en revisión manual.' },
  };
  await page.goto('./');
  await page.getByRole('button', { name: /Mesa 2, Pago iniciado/ }).click();
  await expect(page.getByText(/Efectivo · \$5,00/)).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar evidencia remota' }).click();
  await expect(page.getByText('Cobro conciliado con evidencia remota.')).toBeVisible();
  expect(state.paymentReconciliation).toEqual({ action: 'ACCEPT_REMOTE' });
});

test('a manager retries a keyed RETRYABLE payment through reconciliation without creating a new charge', async ({ page }) => {
  const state = await installApi(page);
  const retryablePayment: PaymentRecord = {
    id: 'pay-retryable', method: 'MESITA', amountCents: 1955, status: 'FAILED',
    providerStatus: 'COMPLETED', posRegistrationStatus: 'RETRYABLE', source: 'MESITA',
    idempotencyKey: 'server-stored-retryable-intent', allowedActions: ['ACCEPT_REMOTE', 'RETRY_SAME'], createdAt: NOW,
  };
  state.billOpened = true;
  state.bill = {
    ...existingBill(), id: 'bill-new', tableId: 'table-2', status: 'OPEN', editLocked: true,
    firstPaymentAt: NOW, payments: [retryablePayment],
    paymentEligibility: { eligible: false, reason: 'PAYMENT_RECONCILIATION_REQUIRED' },
  };

  await page.goto('./');
  await page.getByRole('button', { name: /Mesa 2, Pago iniciado/ }).click();
  await expect(page.getByText('Registro del cobro pendiente de reintento')).toBeVisible();
  await expect(page.getByText(/no crea otro cobro ni vuelve a cargar al proveedor/)).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar misma intención' }).click();
  await expect(page.getByText('La misma intención quedó registrada en Contífico.')).toBeVisible();

  expect(state.paymentReconciliation).toEqual({ action: 'RETRY_SAME' });
  expect(state.settlementBodies).toHaveLength(0);
});

test('a provider-ambiguous payment with no allowed actions requires review and exposes no reconciliation controls', async ({ page }) => {
  const state = await installApi(page);
  const ambiguousPayment: PaymentRecord = {
    id: 'pay-provider-ambiguous', method: 'MESITA', amountCents: 1955, status: 'MANUAL_REVIEW',
    providerStatus: 'PENDING', posRegistrationStatus: 'MANUAL_REVIEW', source: 'MESITA',
    idempotencyKey: 'provider-result-still-ambiguous', allowedActions: [], createdAt: NOW,
  };
  state.billOpened = true;
  state.bill = {
    ...existingBill(), id: 'bill-new', tableId: 'table-2', status: 'OPEN', editLocked: true,
    firstPaymentAt: NOW, payments: [ambiguousPayment],
    paymentEligibility: { eligible: false, reason: 'PAYMENT_RECONCILIATION_REQUIRED' },
  };

  await page.goto('./');
  await page.getByRole('button', { name: /Mesa 2, Pago iniciado/ }).click();
  await expect(page.getByText('Cobro pendiente de revisión del proveedor')).toBeVisible();
  await expect(page.getByText(/No hay acciones seguras disponibles en este POS/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar evidencia remota' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar misma intención' })).toHaveCount(0);
  expect(state.paymentReconciliation).toBeNull();
  expect(state.settlementBodies).toHaveLength(0);
});

test('a stale completed registration lease is recoverable only through the stored intent', async ({ page }) => {
  const state = await installApi(page);
  const stalePayment: PaymentRecord = {
    id: 'pay-stale-registration', method: 'MESITA', amountCents: 1955, status: 'CONFIRMED',
    providerStatus: 'COMPLETED', posRegistrationStatus: 'PENDING', source: 'MESITA',
    idempotencyKey: 'server-stored-stale-intent', reconciliationRequired: true,
    registrationLeaseStale: true, allowedActions: ['ACCEPT_REMOTE', 'RETRY_SAME'], createdAt: NOW,
  };
  state.billOpened = true;
  state.bill = {
    ...existingBill(), id: 'bill-new', tableId: 'table-2', status: 'OPEN', editLocked: true,
    firstPaymentAt: NOW, payments: [stalePayment],
    paymentEligibility: { eligible: false, reason: 'PAYMENT_RECONCILIATION_REQUIRED' },
  };

  await page.goto('./');
  await page.getByRole('button', { name: /Mesa 2, Pago iniciado/ }).click();
  await expect(page.getByText('Registro del cobro pendiente de reintento')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar misma intención' }).click();
  expect(state.paymentReconciliation).toEqual({ action: 'RETRY_SAME' });
  expect(state.settlementBodies).toHaveLength(0);
});

test('accepted remote conflict becomes the clean baseline and history never invents FAC or SRI state', async ({ page }) => {
  const state = await installApi(page);
  await page.goto('./');
  await page.evaluate(({ now, item }) => {
    localStorage.setItem('mesita-pos:pending-draft:bill-conflict', JSON.stringify({
      version: 1,
      billId: 'bill-conflict',
      expectedRevision: 4,
      draft: { diners: 3, notes: 'copia local', items: [{ ...item, quantity: 3 }] },
      updatedAt: now,
    }));
  }, { now: NOW, item: existingBill().items[0] });
  await page.getByRole('button', { name: /Terraza 1, Revisar conflicto/ }).click();
  await expect(page.getByText('Cambios locales recuperados')).toBeVisible();
  await expect(page.getByText('La prefactura cambió en Contífico')).toBeVisible();
  await expect(page.getByText(/Hay cobros remotos involucrados/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revalidar y enviar versión local' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar versión de Contífico' }).click();
  await expect(page.getByText('La prefactura cambió en Contífico')).toBeHidden();
  await expect(page.getByText('Producto agregado en Contífico', { exact: true })).toBeVisible();
  expect(state.conflictResolution).toEqual({ action: 'KEEP_REMOTE' });
  await page.waitForTimeout(2_300);
  expect(state.conflictDraftBodies).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('mesita-pos:pending-draft:bill-conflict'))).toBeNull();

  await page.getByRole('button', { name: 'Mesas' }).click();
  await page.getByRole('button', { name: 'Historial' }).click();
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Mesa 8' });
  await expect(row).toContainText('001-002-880');
  await expect(row).toContainText('No registrada');
  await expect(row).toContainText('Sin dato');
  await expect(row).toContainText('Efectivo');
});
