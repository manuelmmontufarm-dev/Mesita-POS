/* ============================================================
   Mesita POS — icon set (inline, stroke = currentColor)
   ============================================================ */
const _svg = (p, vb) => (props) =>
  React.createElement(
    "svg",
    {
      width: props && props.s ? props.s : 18,
      height: props && props.s ? props.s : 18,
      viewBox: vb || "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: (props && props.w) || 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    p
  );

const Ic = {
  grid: _svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>),
  plug: _svg(<><path d="M9 2v6M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" /><path d="M12 17v5" /></>),
  search: _svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>),
  users: _svg(<><path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3.2" /><path d="M22 19v-1a4 4 0 0 0-3-3.8" /><path d="M16 3.2A4 4 0 0 1 16 11" /></>),
  user: _svg(<><circle cx="12" cy="8" r="3.4" /><path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" /></>),
  clock: _svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  plus: _svg(<path d="M12 5v14M5 12h14" w={2} />),
  minus: _svg(<path d="M5 12h14" />),
  qr: _svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4" /></>),
  card: _svg(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /></>),
  cash: _svg(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9v.01M18 15v.01" /></>),
  check: _svg(<path d="M5 12.5 10 17.5 19 7" w={2.2} />),
  checkCircle: _svg(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L16 9" /></>),
  alert: _svg(<><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></>),
  x: _svg(<path d="M6 6 18 18M18 6 6 18" w={2} />),
  chevR: _svg(<path d="m9 6 6 6-6 6" />),
  chevL: _svg(<path d="m15 6-6 6 6 6" />),
  chevD: _svg(<path d="m6 9 6 6 6-6" />),
  edit: _svg(<><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3Z" /><path d="M13.5 6.5l3 3" /></>),
  trash: _svg(<><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>),
  send: _svg(<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3Z" />),
  refresh: _svg(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v4h-4" /></>),
  store: _svg(<><path d="M4 9V5h16v4M4 9l-1 0 1.5-4.2A1 1 0 0 1 5.4 4h13.2a1 1 0 0 1 .9.8L21 9M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M5 11v9h14v-9" /></>),
  receipt: _svg(<><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3Z" /><path d="M9 8h6M9 12h6" /></>),
  bolt: _svg(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />),
  bell: _svg(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  arrowUp: _svg(<path d="M12 19V5M5 12l7-7 7 7" />),
  arrowDown: _svg(<path d="M12 5v14M5 12l7 7 7-7" />),
  split: _svg(<><path d="M3 6h6l4 6 4-6h4" /><path d="M17 6h4v4M3 18h6l2-3" /></>),
  link: _svg(<><path d="M9.5 14.5 14.5 9.5" /><path d="M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" /></>),
  filter: _svg(<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />),
};

Object.assign(window, { Ic });
