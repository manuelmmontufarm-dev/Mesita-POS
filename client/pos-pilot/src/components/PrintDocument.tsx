import { createPortal } from 'react-dom';
import { formatDateTime, formatMoney, paymentMethodLabel } from '../domain';
import type { PrintSnapshot } from '../types';

export function PrintDocument({ snapshot, currency, timeZone }: { snapshot: PrintSnapshot | null; currency: string; timeZone: string }) {
  if (!snapshot) return null;
  const { bill } = snapshot;
  const pre = snapshot.pre || { number: bill.fiscal.preNumber || bill.remoteNumber, status: bill.fiscal.preStatus };
  const payments = snapshot.payments || bill.payments;
  const fiscal = snapshot.fiscal || bill.fiscal;
  return createPortal(
    <article className="pilot-print-sheet" aria-hidden="true">
      <header>
        <h1>{snapshot.restaurant.name}</h1>
        {snapshot.restaurant.taxId && <p>RUC {snapshot.restaurant.taxId}</p>}
        {snapshot.restaurant.address && <p>{snapshot.restaurant.address}</p>}
      </header>
      <div className="print-title">
        <h2>PREFACTURA</h2>
        <strong>{pre.number || 'Sin número remoto'}</strong>
      </div>
      <dl className="print-meta">
        <div><dt>Mesa</dt><dd>{snapshot.table.name}{snapshot.zone?.name ? ` · ${snapshot.zone.name}` : ''}</dd></div>
        <div><dt>Comensales</dt><dd>{bill.diners}</dd></div>
        <div><dt>Verificada</dt><dd>{formatDateTime(snapshot.verifiedAt, timeZone)}</dd></div>
        <div><dt>Estado PRE</dt><dd>{pre.status || 'Sin dato'}</dd></div>
      </dl>
      <table>
        <thead><tr><th>Cant.</th><th>Producto</th><th>Valor</th></tr></thead>
        <tbody>
          {bill.items.map((item) => (
            <tr key={item.id || item.clientLineId}>
              <td>{item.quantity}</td>
              <td>{item.name}{item.notes && <small>{item.notes}</small>}</td>
              <td>{formatMoney(item.unitPriceCents * item.quantity, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="print-totals">
        <div><dt>Subtotal</dt><dd>{formatMoney(bill.totals.subtotalCents, currency)}</dd></div>
        <div><dt>Impuestos</dt><dd>{formatMoney(bill.totals.taxCents, currency)}</dd></div>
        <div className="grand-total"><dt>Total</dt><dd>{formatMoney(bill.totals.totalCents, currency)}</dd></div>
        {bill.totals.paidCents > 0 && <div><dt>Pagado</dt><dd>{formatMoney(bill.totals.paidCents, currency)}</dd></div>}
        {bill.totals.paidCents > 0 && <div><dt>Saldo</dt><dd>{formatMoney(bill.totals.balanceCents, currency)}</dd></div>}
      </dl>
      {payments.length > 0 && (
        <section className="print-payments">
          <h3>Cobros reportados por el servidor</h3>
          {payments.map((payment) => (
            <p key={payment.id}>{paymentMethodLabel(payment.method)} · {formatMoney(payment.amountCents, currency)} · {payment.status}</p>
          ))}
        </section>
      )}
      <section className="print-fiscal">
        <p><strong>FAC:</strong> {fiscal.facNumber || 'No registrada'}</p>
        <p><strong>Estado SRI:</strong> {fiscal.sriStatus || 'Sin dato'}</p>
      </section>
      <footer>Documento operativo. La información fiscal mostrada fue consultada por Mesita; no reemplaza el comprobante autorizado.</footer>
    </article>,
    document.body,
  );
}
