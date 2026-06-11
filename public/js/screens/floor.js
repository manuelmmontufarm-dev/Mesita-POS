// Floor / table grid screen.
import { state, subscribe, loadFloor } from '../state.js';
import { h, icon } from '../ui.js';
import { ESTADO_MESA, money } from '../format.js';
import { getDiners } from '../diners.js';

const ZONE_ORDER = ['Interior', 'Terraza', 'Bar', 'Privado'];

export async function renderFloor(root) {
  root.innerHTML = '';
  root.classList.remove('full');

  const crumbs = document.getElementById('crumbs');
  if (crumbs) crumbs.textContent = 'Mapa de mesas';

  const container = h('div', {});
  root.appendChild(container);
  container.appendChild(buildSkeleton());

  try {
    await loadFloor();
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(buildError(err.message));
    return;
  }

  paint(container);

  const unsub = subscribe(() => { if (root.firstChild === container) paint(container); });
  const obs = new MutationObserver(() => {
    if (!root.contains(container)) { unsub(); obs.disconnect(); }
  });
  obs.observe(root, { childList: true });
}

function paint(container) {
  container.innerHTML = '';
  container.appendChild(buildHeader());

  if (!state.mesas.length) {
    container.appendChild(h('div', { class: 'center-empty' },
      h('div', { class: 'big' }, '🪑'),
      h('div', {}, 'No hay mesas configuradas.'),
      h('div', { style: { fontSize: '0.85rem', marginTop: '6px' } }, 'Ejecuta el seed: '),
      h('code', { style: { padding: '4px 8px', background: 'var(--bg)', borderRadius: '6px', marginTop: '4px' } }, 'node scripts/seed.js'),
    ));
    return;
  }

  const groups = new Map();
  for (const m of state.mesas) {
    const zone = m.ubicacion || 'General';
    if (!groups.has(zone)) groups.set(zone, []);
    groups.get(zone).push(m);
  }

  const zones = [...groups.keys()].sort((a, b) => {
    const ia = ZONE_ORDER.indexOf(a); const ib = ZONE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
  });

  for (const zone of zones) {
    const mesas = groups.get(zone).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    container.appendChild(buildZone(zone, mesas));
  }
}

function buildHeader() {
  return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' } },
    h('div', {},
      h('h2', { style: { margin: 0, fontSize: '1.4rem', fontWeight: 800 } }, 'Mapa de Mesas'),
      h('div', { style: { color: 'var(--mute)', fontSize: '0.9rem', marginTop: '2px' } }, 'Selecciona una mesa para abrir o continuar su orden.'),
    ),
    buildLegend(),
  );
}

function buildLegend() {
  const row = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
  for (const code of ['L', 'O', 'P', 'C']) {
    row.appendChild(h('span', { class: `badge badge-${code}` },
      h('span', { class: 'dot' }), ESTADO_MESA[code]));
  }
  return row;
}

function buildZone(name, mesas) {
  const zone = h('div', { class: 'zone' },
    h('div', { class: 'zone-title' },
      name, h('span', { class: 'count' }, String(mesas.length)),
    ),
  );
  const grid = h('div', { class: 'tables-grid' });
  for (const m of mesas) grid.appendChild(buildTableCard(m));
  zone.appendChild(grid);
  return zone;
}

function buildTableCard(m) {
  const activeOrden = (m.ordenes && m.ordenes[0]) || null;
  const diners = getDiners(activeOrden);
  const card = h('button', {
    class: 'table-card',
    onclick: () => { location.hash = `#/mesa/${encodeURIComponent(m.id)}`; },
    style: { font: 'inherit', cursor: 'pointer', textAlign: 'left' },
  },
    h('div', { class: `badge badge-${m.estado || 'L'}` }, h('span', { class: 'dot' }), ESTADO_MESA[m.estado] || m.estado),
    h('div', { class: 'name' }, m.nombre || '—'),
    h('div', { class: 'meta' }, iconSpan('users'),
      diners > 0
        ? `${diners} / ${m.capacidad || 4} personas`
        : `Cap. ${m.capacidad || 4}`,
    ),
  );

  const t = m.orden_activa_total;
  if (t != null) {
    card.appendChild(h('div', { class: 'total' }, money(t), h('small', {}, ' total actual')));
  } else if (m.estado && m.estado !== 'L') {
    card.appendChild(h('div', { class: 'total' }, h('small', {}, 'Toca para ver la orden')));
  } else {
    card.appendChild(h('div', { class: 'total' }, h('small', {}, 'Toca para abrir orden')));
  }

  return card;
}

function iconSpan(name) {
  const wrap = h('span', { style: { display: 'inline-flex', verticalAlign: 'middle' } });
  wrap.appendChild(icon(name, 14));
  return wrap;
}

function buildSkeleton() {
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'skeleton', style: { height: '24px', width: '40%', marginBottom: '20px' } }));
  const grid = h('div', { class: 'tables-grid' });
  for (let i = 0; i < 8; i++) grid.appendChild(h('div', { class: 'skeleton', style: { height: '130px' } }));
  wrap.appendChild(grid);
  return wrap;
}

function buildError(msg) {
  return h('div', { class: 'center-empty' },
    h('div', { class: 'big' }, '⚠️'),
    h('div', { style: { fontWeight: 700, color: 'var(--ink)' } }, 'No se pudo cargar el piso'),
    h('div', { style: { fontSize: '0.9rem', marginTop: '6px' } }, msg),
    h('button', { class: 'btn btn-outline', style: { marginTop: '14px' }, onclick: () => location.reload() }, 'Reintentar'),
  );
}
