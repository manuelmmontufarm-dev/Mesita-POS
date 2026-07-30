import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, posApi } from '../api';
import { formatDateTime, formatMoney, newClientLineId, parseMoneyInput, paymentBlockReason, paymentCapability, settlementRetryBlockReason } from '../domain';
import { clearSettlementIntent, readSettlementIntent, saveSettlementIntent, type SettlementIntentState } from '../localPersistence';
import type { Bill, PaymentMethod, PaymentMethodCapability } from '../types';
import { AsyncButton, Icon, type IconName, Modal, Notice } from './ui';

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'MESITA'];
const METHOD_ICONS: Record<PaymentMethod, IconName> = {
  CASH: 'cash',
  CARD: 'card',
  TRANSFER: 'transfer',
  MESITA: 'check',
};

export function CheckoutDialog({ bill, methods, currency, timeZone, onClose, onPaid, onIntentAmbiguityChange }: {
  bill: Bill;
  methods: PaymentMethodCapability[];
  currency: string;
  timeZone: string;
  onClose: () => void;
  onPaid: (bill: Bill) => void;
  onIntentAmbiguityChange: (ambiguous: boolean) => void;
}) {
  const [initialIntent] = useState(() => readSettlementIntent(bill.id));
  const [method, setMethod] = useState<PaymentMethod>(() => initialIntent?.method || 'CASH');
  const [amount, setAmount] = useState(() => initialIntent?.amount || (bill.totals.balanceCents / 100).toFixed(2));
  const [reference, setReference] = useState(() => initialIntent?.manualReference || '');
  const [idempotencyKey, setIdempotencyKey] = useState(() => initialIntent?.idempotencyKey || newClientLineId());
  const [intentState, setIntentState] = useState<SettlementIntentState>(() => initialIntent?.state === 'SUBMITTING' ? 'AMBIGUOUS' : initialIntent?.state || 'READY');
  const [createdAt] = useState(() => initialIntent?.createdAt || new Date().toISOString());
  const [intentCompleted, setIntentCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const intentLocked = intentState !== 'READY';
  const blockReason = intentLocked ? settlementRetryBlockReason(bill) : paymentBlockReason(bill);
  const selected = paymentCapability(methods, method);
  const amountCents = useMemo(() => parseMoneyInput(amount), [amount]);
  const referenceRequired = method === 'CARD' || method === 'TRANSFER';
  const invalidAmount = amountCents === null || amountCents > bill.totals.balanceCents;
  const submitDisabled = intentCompleted || Boolean(blockReason) || !selected.enabled || invalidAmount || (referenceRequired && !reference.trim());

  function persistIntent(state: SettlementIntentState) {
    saveSettlementIntent({
      billId: bill.id,
      method,
      amount,
      manualReference: reference,
      idempotencyKey,
      state,
      createdAt,
    });
  }

  useEffect(() => {
    if (!intentCompleted) persistIntent(intentState);
  }, [amount, bill.id, createdAt, idempotencyKey, intentCompleted, intentState, method, reference]);

  function changeIntent(change: () => void) {
    if (intentLocked || busy) return;
    change();
    setIntentCompleted(false);
    setIdempotencyKey(newClientLineId());
    setSuccess('');
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitDisabled || amountCents === null) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setIntentState('SUBMITTING');
    persistIntent('SUBMITTING');
    try {
      const result = await posApi.settleBill(bill.id, {
        method,
        amountCents,
        manualReference: reference.trim() || undefined,
        idempotencyKey,
      });
      onPaid(result.bill);
      clearSettlementIntent(bill.id);
      onIntentAmbiguityChange(false);
      setIntentCompleted(true);
      setIntentState('READY');
      setSuccess(result.message || (result.payment.status === 'MANUAL_REVIEW'
        ? 'El pago quedó registrado para revisión manual; no se reintentará automáticamente.'
        : 'Pago recibido. El estado mostrado viene del servidor.'));
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : new ApiError(0);
      const ambiguous = apiError.status === 0 || apiError.status >= 500;
      if (ambiguous) {
        setIntentState('AMBIGUOUS');
        persistIntent('AMBIGUOUS');
        onIntentAmbiguityChange(true);
        setError(`${apiError.message} La misma intención quedó guardada; no cambies el método, monto ni referencia.`);
        try {
          const refreshed = await posApi.getBill(bill.id);
          onPaid(refreshed);
          const matchedPayment = refreshed.payments.find((payment) => payment.idempotencyKey === idempotencyKey);
          const terminalReconciliation = refreshed.status === 'PAID'
            || refreshed.totals.balanceCents <= 0
            || Boolean(matchedPayment && ['POS_REGISTERED', 'CONFIRMED', 'MANUAL_REVIEW'].includes(matchedPayment.status));
          if (terminalReconciliation) {
            clearSettlementIntent(bill.id);
            onIntentAmbiguityChange(false);
            setIntentCompleted(true);
            setIntentState('READY');
            setError('');
            setSuccess(matchedPayment?.status === 'MANUAL_REVIEW'
              ? 'El servidor encontró el intento y lo dejó en revisión manual.'
              : 'El servidor confirmó que el intento ya fue reconciliado.');
          }
        } catch {
          // The durable intent remains available after close/reload for a same-key retry.
        }
      } else {
        setIntentState('READY');
        persistIntent('READY');
        setError(apiError.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Cobrar cuenta" description="Mesita verifica la prefactura en Contífico inmediatamente antes de registrar el pago." onClose={onClose} wide>
      <div className="checkout-grid">
        <section className="checkout-methods" aria-label="Métodos de pago">
          <h3>Método de pago</h3>
          {METHODS.map((candidate) => {
            const capability = paymentCapability(methods, candidate);
            return (
              <label className={`payment-method${method === candidate ? ' selected' : ''}${!capability.enabled ? ' disabled' : ''}`} key={candidate}>
                <input type="radio" name="method" value={candidate} checked={method === candidate} onChange={() => changeIntent(() => { setMethod(candidate); setReference(''); })} disabled={!capability.enabled || intentLocked || busy} />
                <span className="payment-icon"><Icon name={METHOD_ICONS[candidate]} /></span>
                <span><strong>{capability.label}</strong><small>{capability.enabled ? methodDescription(candidate) : capability.disabledReason || 'No disponible'}</small></span>
                {method === candidate && capability.enabled && <Icon name="check" />}
              </label>
            );
          })}
        </section>

        <form className="checkout-summary" onSubmit={submit}>
          <div className="balance-card">
            <span>Saldo pendiente</span>
            <strong>{formatMoney(bill.totals.balanceCents, currency)}</strong>
            <small>Total {formatMoney(bill.totals.totalCents, currency)} · Pagado {formatMoney(bill.totals.paidCents, currency)}</small>
          </div>

          {blockReason && <Notice tone="warning" title="Cobro bloqueado">{blockReason}</Notice>}
          {intentLocked && (
            <Notice tone="warning" title="Intento de cobro conservado">El resultado anterior no fue concluyente. Solo puedes consultar o reintentar exactamente el mismo cobro con su misma clave; cerrar esta ventana no la reemplaza.</Notice>
          )}
          {bill.paymentEligibility?.verifiedAt && !blockReason && (
            <p className="verified-line"><Icon name="check" /> Elegibilidad verificada {formatDateTime(bill.paymentEligibility.verifiedAt, timeZone)}</p>
          )}
          {error && <Notice tone="danger" title="No se registró el pago">{error}</Notice>}
          {success && <Notice tone="success" title="Resultado del servidor">{success}</Notice>}

          <label className="money-field">
            Monto a cobrar
            <span><b>$</b><input inputMode="decimal" value={amount} disabled={intentLocked || busy} onChange={(event) => changeIntent(() => setAmount(event.target.value))} aria-invalid={invalidAmount} /></span>
          </label>
          {invalidAmount && <p className="field-error">Ingresa un monto entre $0,01 y el saldo pendiente.</p>}

          {referenceRequired && (
            <label>
              {method === 'CARD' ? 'Número de voucher del terminal' : 'Referencia bancaria'}
              <input value={reference} disabled={intentLocked || busy} onChange={(event) => changeIntent(() => setReference(event.target.value))} maxLength={80} required placeholder={method === 'CARD' ? 'Ej. 483921' : 'Ej. TRX-2184'} />
              <span className="field-hint">Esta referencia ayuda a reconciliar el pago; Contífico recibe una referencia determinística generada por el servidor.</span>
            </label>
          )}

          {method === 'MESITA' && selected.enabled && (
            <Notice tone="info" title="Registrar un pago Mesita completado">El cliente paga desde el QR normal de su mesa. Esta acción busca y registra ese pago único ya completado; no crea un cobro ni un QR nuevo.</Notice>
          )}

          <div className="modal-actions">
            <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cerrar</button>
            <AsyncButton className="button primary pay-button" busy={busy} disabled={submitDisabled}>
              <Icon name="check" /> {intentLocked ? 'Reintentar misma intención' : `Confirmar ${amountCents ? formatMoney(amountCents, currency) : 'pago'}`}
            </AsyncButton>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function methodDescription(method: PaymentMethod): string {
  if (method === 'CASH') return 'Efectivo en caja';
  if (method === 'CARD') return 'Terminal externo';
  if (method === 'TRANSFER') return 'Transferencia verificada';
  return 'Pago completado desde el QR de la mesa';
}
