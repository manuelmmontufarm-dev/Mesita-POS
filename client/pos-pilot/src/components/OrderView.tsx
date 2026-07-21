import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, posApi } from '../api';
import {
  calculateDraftTotal,
  conflictAllowsAction,
  conflictReasonLabel,
  formatDateTime,
  formatMoney,
  isBillLocked,
  isManager,
  newClientLineId,
  paymentBlockReason,
  paymentMethodLabel,
  isRemoteMoneyConflict,
  settlementRetryBlockReason,
} from '../domain';
import { clearDurableDraft, clearSettlementIntent, readSettlementIntent, resolveDraftRecovery } from '../localPersistence';
import type {
  Bill,
  CatalogProduct,
  DiningTable,
  DiningZone,
  OrderDraft,
  PaymentMethodCapability,
  PrintSnapshot,
  Role,
} from '../types';
import { useDraftAutosave } from '../useDraftAutosave';
import { CheckoutDialog } from './CheckoutDialog';
import { PrintDocument } from './PrintDocument';
import { AsyncButton, Icon, Modal, Notice, StatePill } from './ui';

interface Props {
  initialBill: Bill;
  table: DiningTable;
  zone?: DiningZone;
  catalog: CatalogProduct[];
  paymentMethods: PaymentMethodCapability[];
  currency: string;
  timeZone: string;
  role: Role;
  onBack: () => Promise<void>;
}

function toDraft(bill: Bill): OrderDraft {
  return {
    diners: bill.diners || 1,
    notes: bill.notes || '',
    items: bill.items.map((item) => ({ ...item, clientLineId: item.clientLineId || item.id || newClientLineId(), notes: item.notes || '' })),
  };
}

export function OrderView({ initialBill, table, zone, catalog, paymentMethods, currency, timeZone, role, onBack }: Props) {
  const [baseDraft] = useState<OrderDraft>(() => toDraft(initialBill));
  const [initialRecovery] = useState(() => resolveDraftRecovery(initialBill.id, initialBill.revision, baseDraft));
  const [bill, setBill] = useState(initialBill);
  const [draft, setDraft] = useState<OrderDraft>(() => initialRecovery.kind === 'RECOVERABLE' ? initialRecovery.record.draft : baseDraft);
  const [recoveredDraft, setRecoveredDraft] = useState(initialRecovery.kind === 'RECOVERABLE');
  const [staleDraft, setStaleDraft] = useState(initialRecovery.kind === 'STALE' ? initialRecovery.record : null);
  const [hasAmbiguousSettlement, setHasAmbiguousSettlement] = useState(() => {
    const intent = readSettlementIntent(initialBill.id);
    return intent?.state === 'AMBIGUOUS' || intent?.state === 'SUBMITTING';
  });
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [snapshot, setSnapshot] = useState<PrintSnapshot | null>(null);
  const locked = isBillLocked(bill);
  const editable = !staleDraft && !hasAmbiguousSettlement && !locked && bill.syncState !== 'CONFLICT' && bill.status === 'OPEN';
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(catalog.filter((product) => product.available).map((product) => product.category || 'Otros'))).sort((a, b) => a.localeCompare(b, 'es'))], [catalog]);
  const products = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return catalog.filter((product) => {
      const inCategory = category === 'Todos' || (product.category || 'Otros') === category;
      const matches = !term || product.name.toLocaleLowerCase('es').includes(term);
      return inCategory && matches;
    });
  }, [catalog, category, search]);

  const handleSaved = useCallback((saved: Bill, reconciledDraft: OrderDraft) => {
    setBill((current) => ({ ...current, ...saved, items: current.items }));
    setDraft(reconciledDraft);
    setRecoveredDraft(false);
  }, []);

  const refreshConflict = useCallback(async () => {
    try {
      const current = await posApi.getBill(bill.id);
      setBill(current);
    } catch {
      setBill((current) => ({ ...current, syncState: 'CONFLICT' }));
    }
  }, [bill.id]);

  const autosave = useDraftAutosave({
    bill,
    draft,
    baseDraft,
    enabled: editable,
    durabilityEnabled: !staleDraft,
    lockedMessage: staleDraft
      ? 'Hay una copia local basada en otra revisión; se detuvieron los envíos.'
      : hasAmbiguousSettlement
        ? 'Edición bloqueada mientras se reconcilia un intento de cobro.'
        : locked ? 'Edición bloqueada después del primer pago' : 'Edición no disponible',
    onSaved: handleSaved,
    onConflict: () => { void refreshConflict(); },
  });

  const localTotal = calculateDraftTotal(draft.items);
  const reconcilablePayments = bill.payments.filter((payment) => (
    payment.status === 'MANUAL_REVIEW'
    || payment.posRegistrationStatus === 'MANUAL_REVIEW'
    || payment.status === 'FAILED'
    || payment.posRegistrationStatus === 'RETRYABLE'
    || payment.reconciliationRequired === true
    || payment.providerOutcomeAmbiguous === true
  ));
  const displayTotal = bill.syncState === 'SYNCED' && !autosave.dirty ? bill.totals.totalCents : localTotal;
  const checkoutBlockReason = staleDraft
    ? 'Revisa la copia local pendiente antes de cobrar.'
    : autosave.dirty
      ? 'Guarda y sincroniza los cambios antes de cobrar.'
      : hasAmbiguousSettlement ? settlementRetryBlockReason(bill) : paymentBlockReason(bill);

  function addProduct(product: CatalogProduct) {
    if (!editable || !product.available) return;
    setDraft((current) => {
      const existing = current.items.find((item) => item.productId === product.id && !item.notes);
      if (existing) {
        return { ...current, items: current.items.map((item) => item.clientLineId === existing.clientLineId ? { ...item, quantity: item.quantity + 1 } : item) };
      }
      return {
        ...current,
        items: [...current.items, {
          clientLineId: newClientLineId(),
          productId: product.id,
          externalProductId: product.externalId,
          name: product.name,
          quantity: 1,
          unitPriceCents: product.priceCents,
          notes: '',
        }],
      };
    });
  }

  function changeQuantity(clientLineId: string, delta: number) {
    if (!editable) return;
    setDraft((current) => ({
      ...current,
      items: current.items
        .map((item) => item.clientLineId === clientLineId ? { ...item, quantity: item.quantity + delta } : item)
        .filter((item) => item.quantity > 0),
    }));
  }

  async function syncNow(): Promise<Bill | null> {
    setBusyAction('sync');
    setError('');
    try {
      const saved = await autosave.flushNow();
      if (!saved && autosave.dirty) return null;
      const synced = await posApi.syncBill(bill.id);
      setBill(synced);
      return synced;
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'No se pudo sincronizar con Contífico.';
      setError(message);
      if (caught instanceof ApiError && caught.status === 409) await refreshConflict();
      return null;
    } finally {
      setBusyAction('');
    }
  }

  useEffect(() => {
    if (autosave.dirty
      || staleDraft
      || hasAmbiguousSettlement
      || !['PENDING', 'FAILED', 'OFFLINE'].includes(bill.syncState)) return;

    let active = true;
    let running = false;
    const retryQueuedCommand = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        const synced = await posApi.syncBill(bill.id);
        if (active) setBill(synced);
      } catch (caught) {
        if (active && caught instanceof ApiError && caught.status === 409) await refreshConflict();
      } finally {
        running = false;
      }
    };

    const firstRetry = window.setTimeout(() => { void retryQueuedCommand(); }, 3000);
    const interval = window.setInterval(() => { void retryQueuedCommand(); }, 15_000);
    window.addEventListener('online', retryQueuedCommand);
    return () => {
      active = false;
      window.clearTimeout(firstRetry);
      window.clearInterval(interval);
      window.removeEventListener('online', retryQueuedCommand);
    };
  }, [autosave.dirty, bill.id, bill.syncState, hasAmbiguousSettlement, refreshConflict, staleDraft]);

  async function printVerified() {
    setBusyAction('print');
    setError('');
    try {
      const synced = await syncNow();
      if (!synced || synced.syncState !== 'SYNCED') {
        setError('La impresión requiere una prefactura sincronizada y verificada por Contífico.');
        return;
      }
      const verified = await posApi.printSnapshot(bill.id);
      if (!verified.verifiedAt) throw new Error('El servidor no confirmó la fecha de verificación.');
      setSnapshot(verified);
      window.setTimeout(() => window.print(), 80);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo preparar la impresión verificada.');
    } finally {
      setBusyAction('');
    }
  }

  async function leaveOrder() {
    if (autosave.dirty && editable) {
      const saved = await autosave.flushNow();
      if (!saved) {
        setError('No puedes salir mientras haya cambios sin guardar. Revisa la conexión o descarta los cambios recargando la cuenta.');
        return;
      }
    }
    await onBack();
  }

  async function resolveConflict(resolution: 'ACCEPT_REMOTE' | 'RETRY_LOCAL') {
    if (!bill.conflict) return;
    if (!conflictAllowsAction(bill.conflict, resolution)) {
      setError('Este conflicto contiene cobros remotos. Por seguridad, la versión local no se puede reenviar.');
      return;
    }
    setBusyAction('conflict');
    setError('');
    try {
      const resolved = await posApi.resolveConflict(bill.conflict.id, resolution);
      const resolvedDraft = toDraft(resolved);
      if (resolution === 'ACCEPT_REMOTE') {
        autosave.acceptAuthoritativeBaseline(resolved, resolvedDraft);
        clearDurableDraft(resolved.id);
        setRecoveredDraft(false);
        setStaleDraft(null);
      }
      setBill(resolved);
      setDraft(resolvedDraft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo resolver el conflicto.');
    } finally {
      setBusyAction('');
    }
  }

  async function cancelBill() {
    if (!cancelReason.trim()) return;
    setBusyAction('cancel');
    setError('');
    try {
      const cancelled = await posApi.cancelBill(bill.id, cancelReason.trim());
      setBill(cancelled);
      setCancelOpen(false);
      await onBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cancelar la cuenta.');
    } finally {
      setBusyAction('');
    }
  }

  async function reconcilePayment(paymentId: string, action: 'ACCEPT_REMOTE' | 'RETRY_SAME') {
    setBusyAction(`payment-${paymentId}-${action}`);
    setError('');
    setActionMessage('');
    try {
      const result = await posApi.reconcileSettlement(bill.id, paymentId, action);
      setBill(result.bill);
      clearSettlementIntent(bill.id);
      setHasAmbiguousSettlement(false);
      setActionMessage(result.message || 'El servidor actualizó la conciliación del cobro.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo reconciliar el cobro.');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <main className="order-page" id="main-content">
      <header className="order-toolbar">
        <button className="button ghost" onClick={() => void leaveOrder()}><Icon name="arrow-left" /> Mesas</button>
        <div className="order-identity">
          <strong>{table.name}</strong>
          <span>{zone?.name || 'Sin zona'} · {bill.remoteNumber ? `PRE ${bill.remoteNumber}` : 'PRE aún sin número'}</span>
        </div>
        <div className="order-statuses">
          <SyncIndicator clientState={autosave.state} serverState={bill.syncState} message={autosave.message} />
          {(locked || hasAmbiguousSettlement) && <StatePill tone="payment"><Icon name="card" size={15} /> Edición bloqueada</StatePill>}
        </div>
        <div className="order-toolbar-actions">
          {isManager(role) && bill.status === 'OPEN' && !bill.firstPaymentAt && (
            <button className="button ghost danger-text" onClick={() => setCancelOpen(true)}>Cancelar cuenta</button>
          )}
          <AsyncButton className="button secondary" busy={busyAction === 'print'} onClick={() => void printVerified()}><Icon name="print" /> Imprimir</AsyncButton>
          <AsyncButton
            className="button primary"
            busy={busyAction === 'sync'}
            disabled={!editable || (!autosave.dirty && !['PENDING', 'FAILED', 'OFFLINE'].includes(bill.syncState))}
            onClick={() => void syncNow()}
          ><Icon name="save" /> Guardar ahora</AsyncButton>
        </div>
      </header>

      {error && <div className="order-alert"><Notice tone="danger" title="Acción no completada">{error}</Notice></div>}
      {actionMessage && <div className="order-alert"><Notice tone="success" title="Conciliación actualizada">{actionMessage}</Notice></div>}
      {recoveredDraft && (
        <div className="order-alert"><Notice tone="info" title="Cambios locales recuperados">La copia pendiente de este dispositivo se restauró y se enviará con la revisión original. No cierres la cuenta hasta que aparezca como guardada.</Notice></div>
      )}
      {hasAmbiguousSettlement && (
        <div className="order-alert"><Notice tone="warning" title="Cobro pendiente de conciliación">El método, monto y referencia del intento anterior permanecen bloqueados. Los productos tampoco pueden cambiar hasta que el servidor confirme el resultado o se reintente la misma intención.</Notice></div>
      )}
      {reconcilablePayments.map((payment) => {
        const retryable = payment.posRegistrationStatus === 'RETRYABLE'
          || payment.status === 'FAILED'
          || payment.registrationLeaseStale === true;
        const canAcceptRemote = payment.allowedActions?.includes('ACCEPT_REMOTE') === true;
        const canRetrySame = payment.allowedActions?.includes('RETRY_SAME') === true;
        const hasSafeAction = canAcceptRemote || canRetrySame;
        return (
        <div className="order-alert" key={payment.id}>
          <Notice tone="warning" title={!hasSafeAction
            ? 'Cobro pendiente de revisión del proveedor'
            : retryable ? 'Registro del cobro pendiente de reintento' : 'Cobro en revisión manual'}>
            <p>{paymentMethodLabel(payment.method)} · {formatMoney(payment.amountCents, currency)}{payment.manualReference ? ` · Ref. ${payment.manualReference}` : ''}</p>
            <p>{!hasSafeAction
              ? 'El proveedor todavía no confirmó un resultado que Mesita pueda conciliar con seguridad.'
              : retryable
                ? 'Mesita conservó la misma intención. Reintentar usa el cobro guardado; no crea otro cobro ni vuelve a cargar al proveedor.'
              : 'El resultado remoto requiere criterio de un manager antes de dar este cobro por conciliado.'}</p>
            {hasSafeAction && isManager(role) ? (
              <div className="notice-actions">
                {canAcceptRemote && (
                  <AsyncButton className="button secondary small" busy={busyAction === `payment-${payment.id}-ACCEPT_REMOTE`} onClick={() => void reconcilePayment(payment.id, 'ACCEPT_REMOTE')}>Aceptar evidencia remota</AsyncButton>
                )}
                {canRetrySame && (
                  <AsyncButton className="button danger small" busy={busyAction === `payment-${payment.id}-RETRY_SAME`} onClick={() => void reconcilePayment(payment.id, 'RETRY_SAME')}>Reintentar misma intención</AsyncButton>
                )}
              </div>
            ) : <strong>{!hasSafeAction
              ? 'Se requiere revisión del proveedor. No hay acciones seguras disponibles en este POS.'
              : retryable
                ? 'Solicita a un manager que reintente la misma intención o concilie la evidencia remota.'
                : 'Solicita a un manager que reconcilie este cobro.'}</strong>}
          </Notice>
        </div>
        );
      })}
      {staleDraft && (
        <div className="order-alert">
          <Notice tone="warning" title="La cuenta cambió antes de recuperar la copia local">
            <p>La copia guardada esperaba la revisión {staleDraft.expectedRevision}, pero el servidor reporta la revisión {bill.revision}. No se enviará automáticamente para evitar sobrescribir cambios más recientes.</p>
            <div className="notice-actions">
              <button className="button secondary small" onClick={() => { clearDurableDraft(bill.id); setStaleDraft(null); }}>Descartar copia local y continuar</button>
            </div>
          </Notice>
        </div>
      )}
      {bill.conflict && (
        <div className="order-alert">
          <Notice tone="danger" title="La prefactura cambió en Contífico">
            <p>{conflictReasonLabel(bill.conflict)}</p>
            {bill.conflict.remoteSummary && <p>{bill.conflict.remoteSummary}</p>}
            {isRemoteMoneyConflict(bill.conflict) && (
              <p><strong>Hay cobros remotos involucrados.</strong> La versión local no se reenviará; acepta la evidencia de Contífico y audita los pagos.</p>
            )}
            {isManager(role) ? (
              <div className="notice-actions">
                {conflictAllowsAction(bill.conflict, 'ACCEPT_REMOTE') && (
                  <AsyncButton className="button secondary small" busy={busyAction === 'conflict'} onClick={() => void resolveConflict('ACCEPT_REMOTE')}>Usar versión de Contífico</AsyncButton>
                )}
                {conflictAllowsAction(bill.conflict, 'RETRY_LOCAL') && (
                  <AsyncButton className="button danger small" busy={busyAction === 'conflict'} onClick={() => void resolveConflict('RETRY_LOCAL')}>Revalidar y enviar versión local</AsyncButton>
                )}
              </div>
            ) : <strong>Solicita a un manager que reconcilie esta cuenta.</strong>}
          </Notice>
        </div>
      )}
      {locked && (
        <div className="order-alert"><Notice tone="warning" title="Productos bloqueados">La edición se cerró al registrar el primer intento de pago. Aún puedes completar pagos parciales permitidos.</Notice></div>
      )}

      <div className="order-layout">
        <section className="catalog-panel" aria-label="Catálogo de productos">
          <div className="catalog-controls">
            <label className="search-field"><Icon name="search" /><span className="sr-only">Buscar productos</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto…" /></label>
            <div className="category-tabs" role="tablist" aria-label="Categorías">
              {categories.map((name) => <button role="tab" aria-selected={category === name} className={category === name ? 'active' : ''} key={name} onClick={() => setCategory(name)}>{name}</button>)}
            </div>
          </div>
          {products.length === 0 ? (
            <div className="catalog-empty"><Icon name="search" size={28} /><h2>No encontramos productos</h2><p>Cambia la búsqueda o actualiza el catálogo desde Configurar salón.</p></div>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <button className="product-card" key={product.id} onClick={() => addProduct(product)} disabled={!editable || !product.available}>
                  <span className="product-category">{product.category || 'Otros'}</span>
                  <strong>{product.name}</strong>
                  <span className="product-bottom"><b>{formatMoney(product.priceCents, currency)}</b><i><Icon name="plus" size={18} /></i></span>
                  {!product.available && <span className="unavailable-label">No disponible</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="ticket-panel" aria-label="Cuenta actual">
          <div className="ticket-heading">
            <div><p className="eyebrow">Cuenta actual</p><h2>{table.name}</h2></div>
            <label className="diners-control"><span><Icon name="users" size={17} /> Comensales</span><span className="stepper"><button type="button" disabled={!editable || draft.diners <= 1} onClick={() => setDraft((current) => ({ ...current, diners: Math.max(1, current.diners - 1) }))} aria-label="Restar comensal"><Icon name="minus" size={16} /></button><output>{draft.diners}</output><button type="button" disabled={!editable} onClick={() => setDraft((current) => ({ ...current, diners: Math.min(99, current.diners + 1) }))} aria-label="Añadir comensal"><Icon name="plus" size={16} /></button></span></label>
          </div>

          <div className="ticket-lines">
            {draft.items.length === 0 ? (
              <div className="ticket-empty"><span><Icon name="menu" size={25} /></span><h3>La cuenta está vacía</h3><p>Selecciona productos del menú para agregarlos.</p></div>
            ) : draft.items.map((item) => (
              <article className="ticket-line" key={item.clientLineId}>
                <div className="line-main"><strong>{item.name}</strong><b>{formatMoney(item.unitPriceCents * item.quantity, currency)}</b></div>
                <div className="line-controls">
                  <span className="stepper"><button type="button" disabled={!editable} onClick={() => changeQuantity(item.clientLineId, -1)} aria-label={`Restar ${item.name}`}><Icon name={item.quantity === 1 ? 'trash' : 'minus'} size={15} /></button><output>{item.quantity}</output><button type="button" disabled={!editable} onClick={() => changeQuantity(item.clientLineId, 1)} aria-label={`Añadir ${item.name}`}><Icon name="plus" size={15} /></button></span>
                  <span>{formatMoney(item.unitPriceCents, currency)} c/u</span>
                </div>
                <label className="line-note"><span className="sr-only">Nota para {item.name}</span><input value={item.notes} disabled={!editable} maxLength={240} placeholder="Añadir nota (sin sal, término…)" onChange={(event) => setDraft((current) => ({ ...current, items: current.items.map((candidate) => candidate.clientLineId === item.clientLineId ? { ...candidate, notes: event.target.value } : candidate) }))} /></label>
              </article>
            ))}
          </div>

          <label className="order-note">Nota general<textarea value={draft.notes} disabled={!editable} maxLength={500} rows={2} placeholder="Instrucción general para esta cuenta" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>

          <div className="ticket-summary">
            <dl>
              <div><dt>{bill.syncState === 'SYNCED' && !autosave.dirty ? 'Subtotal verificado' : 'Subtotal estimado'}</dt><dd>{formatMoney(bill.syncState === 'SYNCED' && !autosave.dirty ? bill.totals.subtotalCents : localTotal, currency)}</dd></div>
              {bill.syncState === 'SYNCED' && !autosave.dirty && <div><dt>Impuestos</dt><dd>{formatMoney(bill.totals.taxCents, currency)}</dd></div>}
              {bill.totals.paidCents > 0 && <div><dt>Pagado</dt><dd>− {formatMoney(bill.totals.paidCents, currency)}</dd></div>}
              <div className="total-row"><dt>Total</dt><dd>{formatMoney(displayTotal, currency)}</dd></div>
              {bill.totals.paidCents > 0 && <div className="balance-row"><dt>Saldo remoto</dt><dd>{formatMoney(bill.totals.balanceCents, currency)}</dd></div>}
            </dl>
            <div className="fiscal-strip">
              <span><small>PRE</small><strong>{bill.fiscal.preStatus || 'Sin dato'}</strong></span>
              <span><small>Cobros</small><strong>{bill.payments.length ? `${bill.payments.filter((payment) => payment.posRegistrationStatus === 'REGISTERED' || payment.status === 'POS_REGISTERED').length}/${bill.payments.length} en POS` : 'Ninguno'}</strong></span>
              <span><small>FAC</small><strong>{bill.fiscal.facStatus || 'No registrada'}</strong></span>
              <span><small>SRI</small><strong>{bill.fiscal.sriStatus || 'Sin dato'}</strong></span>
            </div>
            <button className="button checkout-button" disabled={Boolean(checkoutBlockReason)} aria-describedby={checkoutBlockReason ? 'checkout-disabled-reason' : undefined} onClick={() => setCheckoutOpen(true)}>
              <span><Icon name="cash" /> {hasAmbiguousSettlement ? 'Reanudar cobro' : 'Cobrar'}</span><strong>{formatMoney(bill.totals.balanceCents || displayTotal, currency)}</strong>
            </button>
            {checkoutBlockReason && <p className="checkout-disabled-reason" id="checkout-disabled-reason">{checkoutBlockReason}</p>}
            {bill.lastSyncedAt && <p className="last-sync">Última confirmación remota: {formatDateTime(bill.lastSyncedAt, timeZone)}</p>}
          </div>
        </aside>
      </div>

      {checkoutOpen && <CheckoutDialog bill={bill} methods={paymentMethods} currency={currency} timeZone={timeZone} onClose={() => setCheckoutOpen(false)} onIntentAmbiguityChange={setHasAmbiguousSettlement} onPaid={(updated) => { setBill(updated); if (updated.status === 'PAID') setCheckoutOpen(false); }} />}
      {cancelOpen && (
        <Modal title="Cancelar cuenta" description="Esta acción requiere permiso de manager y se conciliará con Contífico." onClose={() => setCancelOpen(false)}>
          <div className="modal-form"><label>Motivo<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={240} rows={3} placeholder="Explica por qué se cancela" /></label><div className="modal-actions"><button className="button ghost" onClick={() => setCancelOpen(false)}>Volver</button><AsyncButton className="button danger" busy={busyAction === 'cancel'} disabled={!cancelReason.trim()} onClick={() => void cancelBill()}>Cancelar cuenta</AsyncButton></div></div>
        </Modal>
      )}
      <PrintDocument snapshot={snapshot} currency={currency} timeZone={timeZone} />
    </main>
  );
}

function SyncIndicator({ clientState, serverState, message }: { clientState: string; serverState: string; message: string }) {
  const conflict = clientState === 'CONFLICT' || serverState === 'CONFLICT';
  const offline = clientState === 'OFFLINE' || serverState === 'OFFLINE';
  const pending = clientState === 'QUEUED' || clientState === 'SAVING' || serverState === 'PENDING' || serverState === 'SYNCING';
  const tone = conflict ? 'conflict' : offline ? 'offline' : pending ? 'pending' : serverState === 'FAILED' || clientState === 'FAILED' ? 'danger' : 'synced';
  const label = conflict ? 'Conflicto' : offline ? 'Sin conexión' : pending ? 'Sincronizando' : tone === 'danger' ? 'Error de sync' : 'Sincronizado';
  return <span className={`sync-indicator sync-${tone}`} title={message}><Icon name={offline ? 'wifi-off' : conflict ? 'conflict' : pending ? 'sync' : 'check'} size={16} /><span><strong>{label}</strong><small>{message}</small></span></span>;
}
