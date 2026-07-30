import { useMemo, useState, type FormEvent } from 'react';
import { ApiError, posApi } from '../api';
import { formatDateTime, formatMoney, isManager, sortTables, sortZones, tableState } from '../domain';
import type { DiningTable, DiningZone, IntegrationStatus, Role } from '../types';
import { AsyncButton, Icon, Modal, Notice, StatePill } from './ui';

interface Props {
  zones: DiningZone[];
  tables: DiningTable[];
  role: Role;
  currency: string;
  timeZone: string;
  integration: IntegrationStatus;
  onSelectTable: (table: DiningTable) => Promise<void>;
  onOpenTable: (table: DiningTable, diners: number) => Promise<void>;
  onReload: () => Promise<void>;
}

export function FloorView({ zones, tables, role, currency, timeZone, integration, onSelectTable, onOpenTable, onReload }: Props) {
  const [openTable, setOpenTable] = useState<DiningTable | null>(null);
  const [diners, setDiners] = useState(2);
  const [opening, setOpening] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [error, setError] = useState('');
  const orderedZones = useMemo(() => sortZones(zones), [zones]);

  async function handleTable(table: DiningTable) {
    setError('');
    if (!table.activeBill) {
      setDiners(Math.min(2, Math.max(1, table.capacity)));
      setOpenTable(table);
      return;
    }
    setSelectingId(table.id);
    try {
      await onSelectTable(table);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos abrir la cuenta.');
    } finally {
      setSelectingId(null);
    }
  }

  async function submitOpen(event: FormEvent) {
    event.preventDefault();
    if (!openTable) return;
    setOpening(true);
    setError('');
    try {
      await onOpenTable(openTable, diners);
      setOpenTable(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos abrir la mesa.');
    } finally {
      setOpening(false);
    }
  }

  const activeCount = tables.filter((table) => table.activeBill).length;
  const conflictCount = tables.filter((table) => tableState(table).tone === 'conflict').length;

  return (
    <main className="floor-page" id="main-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Salón en vivo</p>
          <h1>Mapa de mesas</h1>
          <p>{tables.length - activeCount} desocupadas · {activeCount} con cuenta abierta</p>
        </div>
        <div className="page-actions">
          <StatePill tone={integration.status.toLowerCase()}>
            <span className="live-dot" aria-hidden="true" />
            {integration.label || (integration.status === 'CONNECTED' ? 'Contífico conectado' : 'Integración con novedad')}
          </StatePill>
          {isManager(role) && (
            <button className="button secondary" onClick={() => setManageOpen(true)}>
              <Icon name="settings" /> Configurar salón
            </button>
          )}
        </div>
      </section>

      {error && <Notice tone="danger" title="No se completó la acción">{error}</Notice>}
      {conflictCount > 0 && (
        <Notice tone="warning" title={`${conflictCount} ${conflictCount === 1 ? 'mesa requiere' : 'mesas requieren'} revisión`}>
          Los envíos de esas cuentas están detenidos para no sobrescribir cambios de Contífico.
        </Notice>
      )}

      <div className="floor-legend" aria-label="Leyenda de estados">
        <span><i className="legend-dot free" />Desocupada</span>
        <span><i className="legend-dot open" />Cuenta abierta</span>
        <span><i className="legend-dot pending" />Pendiente de sync</span>
        <span><i className="legend-dot payment" />Pago iniciado</span>
        <span><i className="legend-dot conflict" />Conflicto</span>
      </div>

      {orderedZones.length === 0 ? (
        <section className="empty-state">
          <div className="empty-icon"><Icon name="map" size={28} /></div>
          <h2>Aún no hay zonas</h2>
          <p>Un manager debe crear la primera zona y sus mesas para comenzar.</p>
          {isManager(role) && <button className="button primary" onClick={() => setManageOpen(true)}>Configurar salón</button>}
        </section>
      ) : orderedZones.map((zone) => {
        const zoneTables = sortTables(tables.filter((table) => table.zoneId === zone.id));
        return (
          <section className="zone-section" key={zone.id} aria-labelledby={`zone-${zone.id}`}>
            <div className="zone-heading">
              <h2 id={`zone-${zone.id}`}>{zone.name}</h2>
              <span>{zoneTables.length} {zoneTables.length === 1 ? 'mesa' : 'mesas'}</span>
            </div>
            {zoneTables.length === 0 ? (
              <div className="zone-empty">Esta zona todavía no tiene mesas.</div>
            ) : (
              <div className="table-grid">
                {zoneTables.map((table) => {
                  const state = tableState(table);
                  const bill = table.activeBill;
                  return (
                    <button
                      className={`table-card table-${state.tone}`}
                      key={table.id}
                      onClick={() => void handleTable(table)}
                      aria-label={`${table.name}, ${state.label}${bill ? `, ${formatMoney(bill.totalCents, currency)}` : ''}`}
                      disabled={selectingId === table.id}
                    >
                      <span className="table-card-top">
                        <span className="table-name">{table.name}</span>
                        <span className={`table-status status-${state.tone}`}>{state.label}</span>
                      </span>
                      <span className="table-card-body">
                        {bill ? (
                          <>
                            <strong>{formatMoney(bill.totalCents, currency)}</strong>
                            <span>{bill.diners} {bill.diners === 1 ? 'comensal' : 'comensales'}</span>
                          </>
                        ) : (
                          <>
                            <span className="table-free-icon"><Icon name="table" size={26} /></span>
                            <span>Capacidad {table.capacity}</span>
                          </>
                        )}
                      </span>
                      <span className="table-card-footer">
                        {selectingId === table.id ? 'Abriendo…' : bill?.remoteNumber ? `PRE ${bill.remoteNumber}` : bill ? 'Ver cuenta' : 'Abrir mesa'}
                        <Icon name="chevron-right" size={17} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {openTable && (
        <Modal title={`Abrir ${openTable.name}`} description="Indica cuántas personas atenderás. Puedes cambiarlo antes del primer pago." onClose={() => !opening && setOpenTable(null)}>
          <form className="modal-form" onSubmit={submitOpen}>
            <label>
              Comensales
              <span className="stepper large-stepper">
                <button type="button" onClick={() => setDiners((value) => Math.max(1, value - 1))} aria-label="Restar comensal"><Icon name="minus" /></button>
                <output aria-live="polite">{diners}</output>
                <button type="button" onClick={() => setDiners((value) => Math.min(99, value + 1))} aria-label="Añadir comensal"><Icon name="plus" /></button>
              </span>
            </label>
            {diners > openTable.capacity && <p className="field-hint warning-text">Supera la capacidad configurada de {openTable.capacity}; puedes continuar.</p>}
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={() => setOpenTable(null)} disabled={opening}>Cancelar</button>
              <AsyncButton className="button primary" busy={opening}>Abrir cuenta</AsyncButton>
            </div>
          </form>
        </Modal>
      )}

      {manageOpen && (
        <FloorManager zones={zones} tables={tables} integration={integration} timeZone={timeZone} onClose={() => setManageOpen(false)} onReload={onReload} />
      )}
    </main>
  );
}

function FloorManager({ zones, tables, integration, timeZone, onClose, onReload }: {
  zones: DiningZone[];
  tables: DiningTable[];
  integration: IntegrationStatus;
  timeZone: string;
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const firstZone = sortZones(zones)[0];
  const [zoneForm, setZoneForm] = useState({ id: '', name: '', sortOrder: zones.length + 1 });
  const [tableForm, setTableForm] = useState({ id: '', zoneId: firstZone?.id || '', name: '', capacity: 4, sortOrder: tables.length + 1 });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key);
    setMessage(null);
    try {
      await operation();
      await onReload();
      setMessage({ tone: 'success', text: success });
      return true;
    } catch (caught) {
      setMessage({ tone: 'danger', text: caught instanceof ApiError ? caught.message : 'No se pudo guardar el cambio.' });
      return false;
    } finally {
      setBusy('');
    }
  }

  async function saveZone(event: FormEvent) {
    event.preventDefault();
    const input = { name: zoneForm.name.trim(), sortOrder: zoneForm.sortOrder };
    if (!input.name) return;
    const ok = await run('zone', () => zoneForm.id ? posApi.updateZone(zoneForm.id, input) : posApi.createZone(input), zoneForm.id ? 'Zona actualizada.' : 'Zona creada.');
    if (ok) setZoneForm({ id: '', name: '', sortOrder: zones.length + 2 });
  }

  async function saveTable(event: FormEvent) {
    event.preventDefault();
    const input = { zoneId: tableForm.zoneId, name: tableForm.name.trim(), capacity: tableForm.capacity, sortOrder: tableForm.sortOrder };
    if (!input.name || !input.zoneId) return;
    const ok = await run('table', () => tableForm.id ? posApi.updateTable(tableForm.id, input) : posApi.createTable(input), tableForm.id ? 'Mesa actualizada.' : 'Mesa creada.');
    if (ok) setTableForm({ id: '', zoneId: tableForm.zoneId, name: '', capacity: 4, sortOrder: tables.length + 2 });
  }

  async function removeZone(zone: DiningZone) {
    if (!window.confirm(`¿Eliminar la zona “${zone.name}”? Solo es posible si no contiene mesas.`)) return;
    await run(`zone-${zone.id}`, () => posApi.deleteZone(zone.id), 'Zona eliminada.');
  }

  async function removeTable(table: DiningTable) {
    if (!window.confirm(`¿Eliminar “${table.name}”? No es posible si tiene una cuenta abierta.`)) return;
    await run(`table-${table.id}`, () => posApi.deleteTable(table.id), 'Mesa eliminada.');
  }

  return (
    <Modal title="Configurar salón" description="Organiza zonas y mesas. El orden menor aparece primero en el mapa." onClose={onClose} wide>
      <div className="manager-meta">
        <span><Icon name="sync" /> Catálogo: {integration.catalogLastSyncedAt ? formatDateTime(integration.catalogLastSyncedAt, timeZone) : 'Sin sincronización registrada'}</span>
        <AsyncButton className="button secondary small" busy={busy === 'catalog'} onClick={() => void run('catalog', () => posApi.refreshCatalog(), 'Catálogo actualizado.') }>
          <Icon name="refresh" /> Actualizar catálogo
        </AsyncButton>
      </div>
      {message && <Notice tone={message.tone} title={message.text} />}
      <div className="manager-grid">
        <section>
          <div className="subheading"><h3>Zonas</h3><span>{zones.length}</span></div>
          <div className="manage-list">
            {sortZones(zones).map((zone) => (
              <div className="manage-row" key={zone.id}>
                <span className="order-number">{zone.sortOrder}</span>
                <strong>{zone.name}</strong>
                <span>{tables.filter((table) => table.zoneId === zone.id).length} mesas</span>
                <button className="icon-button" aria-label={`Editar ${zone.name}`} onClick={() => setZoneForm({ id: zone.id, name: zone.name, sortOrder: zone.sortOrder })}><Icon name="edit" /></button>
                <button className="icon-button danger" aria-label={`Eliminar ${zone.name}`} disabled={busy === `zone-${zone.id}`} onClick={() => void removeZone(zone)}><Icon name="trash" /></button>
              </div>
            ))}
            {zones.length === 0 && <p className="list-empty">Crea la primera zona.</p>}
          </div>
          <form className="inline-editor" onSubmit={saveZone}>
            <h4>{zoneForm.id ? 'Editar zona' : 'Nueva zona'}</h4>
            <label>Nombre<input value={zoneForm.name} maxLength={60} required onChange={(event) => setZoneForm({ ...zoneForm, name: event.target.value })} /></label>
            <label>Orden<input type="number" min="0" max="999" required value={zoneForm.sortOrder} onChange={(event) => setZoneForm({ ...zoneForm, sortOrder: Number(event.target.value) })} /></label>
            <div className="editor-actions">
              {zoneForm.id && <button type="button" className="button ghost small" onClick={() => setZoneForm({ id: '', name: '', sortOrder: zones.length + 1 })}>Cancelar</button>}
              <AsyncButton className="button primary small" busy={busy === 'zone'}>{zoneForm.id ? 'Guardar zona' : 'Añadir zona'}</AsyncButton>
            </div>
          </form>
        </section>

        <section>
          <div className="subheading"><h3>Mesas</h3><span>{tables.length}</span></div>
          <div className="manage-list">
            {sortTables(tables).map((table) => (
              <div className="manage-row" key={table.id}>
                <span className="order-number">{table.sortOrder}</span>
                <strong>{table.name}</strong>
                <span>{zones.find((zone) => zone.id === table.zoneId)?.name || 'Sin zona'} · {table.capacity} pers.</span>
                <button className="icon-button" aria-label={`Editar ${table.name}`} onClick={() => setTableForm({ id: table.id, zoneId: table.zoneId, name: table.name, capacity: table.capacity, sortOrder: table.sortOrder })}><Icon name="edit" /></button>
                <button className="icon-button danger" aria-label={`Eliminar ${table.name}`} disabled={busy === `table-${table.id}` || Boolean(table.activeBill)} onClick={() => void removeTable(table)}><Icon name="trash" /></button>
              </div>
            ))}
            {tables.length === 0 && <p className="list-empty">No hay mesas configuradas.</p>}
          </div>
          <form className="inline-editor" onSubmit={saveTable}>
            <h4>{tableForm.id ? 'Editar mesa' : 'Nueva mesa'}</h4>
            <label>Zona<select required value={tableForm.zoneId} onChange={(event) => setTableForm({ ...tableForm, zoneId: event.target.value })}><option value="">Selecciona…</option>{sortZones(zones).map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}</select></label>
            <label>Nombre<input value={tableForm.name} maxLength={60} required onChange={(event) => setTableForm({ ...tableForm, name: event.target.value })} /></label>
            <div className="form-columns">
              <label>Capacidad<input type="number" min="1" max="99" required value={tableForm.capacity} onChange={(event) => setTableForm({ ...tableForm, capacity: Number(event.target.value) })} /></label>
              <label>Orden<input type="number" min="0" max="999" required value={tableForm.sortOrder} onChange={(event) => setTableForm({ ...tableForm, sortOrder: Number(event.target.value) })} /></label>
            </div>
            <div className="editor-actions">
              {tableForm.id && <button type="button" className="button ghost small" onClick={() => setTableForm({ id: '', zoneId: firstZone?.id || '', name: '', capacity: 4, sortOrder: tables.length + 1 })}>Cancelar</button>}
              <AsyncButton className="button primary small" busy={busy === 'table'} disabled={zones.length === 0}>{tableForm.id ? 'Guardar mesa' : 'Añadir mesa'}</AsyncButton>
            </div>
          </form>
        </section>
      </div>
    </Modal>
  );
}
