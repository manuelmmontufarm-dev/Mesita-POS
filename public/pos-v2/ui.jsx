/* ============================================================
   Mesita POS — shared UI primitives
   Icons · Toasts · Modal · Avatar · FakeQR
   ============================================================ */

const ICONS = {
  back:    "M15 18l-6-6 6-6",
  search:  "M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z",
  plus:    "M12 5v14M5 12h14",
  minus:   "M5 12h14",
  trash:   "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  note:    "M11 4H7a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-4M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  x:       "M18 6L6 18M6 6l12 12",
  users:   "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0116 11",
  grid:    "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  receipt: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 7h8M8 11h8M8 15h5",
  settings:"M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 003.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  check:   "M20 6L9 17l-5-5",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  qr:      "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M17 20h4M14 20v1",
  bolt:    "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
  card:    "M2 7h20v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zM2 10h20",
  cash:    "M2 6h20v12H2zM12 9a3 3 0 100 6 3 3 0 000-6z",
  bank:    "M3 21h18M5 21V9l7-5 7 5v12M9 21v-7h6v7",
  arrow:   "M5 12h14M13 6l6 6-6 6",
};

function Icon({ name, size = 18, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flex: "0 0 auto", ...style }} className={className}>
      <path d={ICONS[name] || ""} />
    </svg>
  );
}

/* ---------- Toast bus ---------- */
const _toastListeners = new Set();
let _toastSeq = 0;
function toast(msg, kind = "ok", emoji) {
  const t = { id: ++_toastSeq, msg, kind, emoji };
  _toastListeners.forEach((l) => l(t));
}
function ToastHost() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const l = (t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200);
    };
    _toastListeners.add(l);
    return () => _toastListeners.delete(l);
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={"toast " + t.kind}>
          {t.emoji && <span className="te">{t.emoji}</span>}
          {!t.emoji && t.kind === "ok" && <span style={{ color: "var(--ok)", display: "grid" }}><Icon name="check" size={17} /></span>}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Modal ---------- */
function Modal({ title, sub, onClose, children, footer, size }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={"modal" + (size === "lg" ? " lg" : "")}>
        <div className="modal-h">
          <div>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>}
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Avatar ---------- */
function Avatar({ initials, hue, size = 30 }) {
  return (
    <span className="cav" style={{ width: size, height: size, background: `hsl(${hue} 58% 48%)` }}>{initials}</span>
  );
}

/* ---------- Fake QR (deterministic grid; squares only) ---------- */
function FakeQR({ seed = "mesita", size = 160 }) {
  const N = 25;
  const cells = React.useMemo(() => {
    // simple deterministic PRNG from seed
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
    const grid = [];
    for (let y = 0; y < N; y++) { const row = []; for (let x = 0; x < N; x++) row.push(rnd() > 0.5); grid.push(row); }
    const finder = (gx, gy) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[gy + y][gx + x] = edge || core;
      }
      for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
        if (x === -1 || y === -1 || x === 7 || y === 7) {
          const yy = gy + y, xx = gx + x;
          if (yy >= 0 && yy < N && xx >= 0 && xx < N) grid[yy][xx] = false;
        }
      }
    };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    return grid;
  }, [seed]);
  const c = size / N;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
      {cells.map((row, y) => row.map((on, x) => on ? (
        <rect key={x + "-" + y} x={x * c} y={y * c} width={c} height={c} rx={c * 0.18} fill="#1F2933" />
      ) : null))}
    </svg>
  );
}

Object.assign(window, { Icon, toast, ToastHost, Modal, Avatar, FakeQR });
