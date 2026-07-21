import { useEffect, useMemo, useState } from 'react';
import { posApi } from '../api';
import { formatDateTime, formatMoney, isSriAuthorized, paymentMethodLabel } from '../domain';
import type { HistoryRecord } from '../types';
import { AsyncButton, Icon, Notice, StatePill } from './ui';

export function HistoryView({ currency, timeZone }: { currency: string; timeZone: string }) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [fiscalFilter, setFiscalFilter] = useState<'ALL' | 'PENDING_FAC' | 'SRI_NOVELTY'>('ALL');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await posApi.history();
      setRecords(response.records || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo consultar el historial.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return records.filter((record) => {
      const matches = !term || [record.tableName, record.pre.number, record.fac?.number]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es').includes(term));
      if (!matches) return false;
      if (fiscalFilter === 'PENDING_FAC') return !record.fac?.number;
      if (fiscalFilter === 'SRI_NOVELTY') return Boolean(record.sri?.status && !isSriAuthorized(record.sri.status));
      return true;
    });
  }, [records, search, fiscalFilter]);

  return (
    <main className="history-page" id="main-content">
      <section className="page-heading">
        <div><p className="eyebrow">Trazabilidad</p><h1>Historial</h1><p>PRE, cobros, factura y estado SRI se muestran por separado, tal como los reporta el gateway.</p></div>
        <AsyncButton className="button secondary" busy={loading} onClick={() => void load()}><Icon name="refresh" /> Actualizar</AsyncButton>
      </section>

      <div className="history-filters">
        <label className="search-field"><Icon name="search" /><span className="sr-only">Buscar historial</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar mesa, PRE o factura…" /></label>
        <div className="segmented-control" aria-label="Filtrar historial">
          <button className={fiscalFilter === 'ALL' ? 'active' : ''} onClick={() => setFiscalFilter('ALL')}>Todos</button>
          <button className={fiscalFilter === 'PENDING_FAC' ? 'active' : ''} onClick={() => setFiscalFilter('PENDING_FAC')}>Sin FAC</button>
          <button className={fiscalFilter === 'SRI_NOVELTY' ? 'active' : ''} onClick={() => setFiscalFilter('SRI_NOVELTY')}>Novedad SRI</button>
        </div>
      </div>

      {error && <Notice tone="danger" title="No se pudo cargar el historial">{error}</Notice>}
      {loading ? (
        <div className="history-skeleton" aria-label="Cargando historial">{[1, 2, 3].map((item) => <div key={item} />)}</div>
      ) : filtered.length === 0 ? (
        <section className="empty-state"><div className="empty-icon"><Icon name="history" size={28} /></div><h2>{records.length ? 'No hay coincidencias' : 'Aún no hay cuentas'}</h2><p>{records.length ? 'Cambia la búsqueda o el filtro.' : 'Las cuentas aparecerán aquí cuando el gateway tenga registros.'}</p></section>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead><tr><th>Cuenta</th><th>PRE</th><th>Cobros</th><th>FAC</th><th>SRI</th><th className="numeric">Total</th></tr></thead>
            <tbody>{filtered.map((record) => <HistoryRow record={record} currency={currency} timeZone={timeZone} key={record.id} />)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function HistoryRow({ record, currency, timeZone }: { record: HistoryRecord; currency: string; timeZone: string }) {
  const confirmed = record.payments.filter((payment) => payment.status === 'CONFIRMED' || payment.status === 'POS_REGISTERED');
  const review = record.payments.some((payment) => payment.status === 'MANUAL_REVIEW');
  return (
    <tr>
      <td><strong>{record.tableName}</strong><span>{formatDateTime(record.closedAt || record.openedAt, timeZone)}</span></td>
      <td><strong>{record.pre.number || 'Sin número'}</strong><StatePill tone={record.pre.status ? 'neutral' : 'muted'}>{record.pre.status || 'Sin dato'}</StatePill></td>
      <td>
        {record.payments.length ? <><strong>{confirmed.length}/{record.payments.length} confirmados</strong><span>{record.payments.map((payment) => paymentMethodLabel(payment.method)).join(' · ')}</span>{review && <StatePill tone="warning">Revisión manual</StatePill>}</> : <span className="truth-empty">Ninguno reportado</span>}
      </td>
      <td>{record.fac ? <><strong>{record.fac.number || 'Sin número'}</strong><span>{record.fac.status || 'Sin estado'}</span></> : <span className="truth-empty">No registrada</span>}</td>
      <td>{record.sri ? <><StatePill tone={isSriAuthorized(record.sri.status) ? 'success' : 'warning'}>{record.sri.status || 'Sin estado'}</StatePill><span>{formatDateTime(record.sri.authorizedAt, timeZone)}</span></> : <span className="truth-empty">Sin dato</span>}</td>
      <td className="numeric"><strong>{formatMoney(record.totalCents, currency)}</strong></td>
    </tr>
  );
}
