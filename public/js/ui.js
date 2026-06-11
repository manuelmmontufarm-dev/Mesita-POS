// Small DOM helpers: toast, modal, confirm dialog, icons.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return el;
};

// ---- Toast ----
let toastStack;
function ensureToastStack() {
  if (!toastStack) {
    toastStack = h('div', { class: 'toast-stack', id: 'toast-stack' });
    document.body.appendChild(toastStack);
  }
  return toastStack;
}
export function toast(message, kind = 'info', timeoutMs = 3200) {
  const stack = ensureToastStack();
  const node = h('div', { class: `toast ${kind}` }, message);
  stack.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity 0.2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, timeoutMs);
}

// ---- Modal ----
export function openModal({ title, body, footer, size }) {
  closeModal();
  const close = () => closeModal();
  const backdrop = h('div', {
    class: 'modal-backdrop',
    id: 'app-modal',
    onclick: (e) => { if (e.target === backdrop) close(); },
  },
    h('div', { class: 'modal' + (size === 'lg' ? ' lg' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' },
        h('h3', {}, title || ''),
        h('button', { class: 'btn btn-ghost btn-icon', 'aria-label': 'Cerrar', onclick: close }, '×')
      ),
      h('div', { class: 'modal-body' }, body),
      footer ? h('div', { class: 'modal-foot' }, footer) : null,
    )
  );
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  return { close };
}
export function closeModal() {
  const m = document.getElementById('app-modal');
  if (m) m.remove();
  document.body.style.overflow = '';
}

// ---- Confirm dialog ----
export function confirmDialog({ title = 'Confirmar', message, danger = false, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
  return new Promise((resolve) => {
    const body = h('p', { style: { margin: 0, color: 'var(--ink-2)', lineHeight: 1.5 } }, message);
    const footer = h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'btn btn-ghost', onclick: () => { closeModal(); resolve(false); } }, cancelText),
      h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => { closeModal(); resolve(true); } }, confirmText)
    );
    openModal({ title, body, footer });
  });
}

// ---- Icons (inline SVG) ----
const ICONS = {
  search:   'M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z',
  plus:     'M12 5v14M5 12h14',
  minus:    'M5 12h14',
  trash:    'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M10 11v6M14 11v6M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14',
  note:     'M9 11h6M9 15h4M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z',
  print:    'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  cash:     'M3 8h18M3 8v8a2 2 0 002 2h14a2 2 0 002-2V8M7 12h2m6 0h2',
  card:     'M3 8h18M3 8a2 2 0 012-2h14a2 2 0 012 2M3 8v8a2 2 0 002 2h14a2 2 0 002-2V8M7 16h4',
  bank:     'M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 7l10-5 10 5',
  mix:      'M4 12h6m4 0h6M4 6h6m4 0h6M4 18h6m4 0h6',
  check:    'M5 12l5 5L20 7',
  back:     'M15 18l-6-6 6-6',
  users:    'M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M21 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M5 7a4 4 0 108 0 4 4 0 00-8 0z',
};
export function icon(name, size = 18) {
  const path = ICONS[name];
  if (!path) return h('span', {}, '');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'icon-svg');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

export async function withLoading(btn, fn) {
  if (!btn) return fn();
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '';
  btn.appendChild(h('span', { class: 'spin' }));
  btn.appendChild(document.createTextNode(' Procesando…'));
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = original; }
}
