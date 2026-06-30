/* ============================================================
   Mesita POS — app shell, router, API panel, print
   ============================================================ */

function App() {
  const store = useStore();
  const [route, setRoute] = React.useState({ name: "floor" });
  const [apiPanel, setApiPanel] = React.useState(false);
  const [settings, setSettings] = React.useState(false);

  const go = (name, mesaId) => setRoute({ name, mesaId });
  const docCount = store.state.docs.length;

  return (
    <div className="app">
      {route.name !== "order" && (
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark"><Icon name="grid" size={20} /></span>
            <span className="brand-name">Mesita POS<small>Consola de caja</small></span>
          </div>
          <nav className="topnav">
            <a className={route.name === "floor" ? "on" : ""} onClick={() => go("floor")} href="#">
              <Icon name="grid" size={17} /><span>Mesas</span>
            </a>
            <a className={route.name === "history" ? "on" : ""} onClick={() => go("history")} href="#">
              <Icon name="receipt" size={17} /><span>Cuentas cerradas</span>
              {docCount > 0 && <span className="cnt">{docCount}</span>}
            </a>
          </nav>
          <div className="spacer" />
          <button className={"api-pill" + (store.state.apiOnline ? "" : " off")} onClick={() => setApiPanel(true)}>
            <span className="qd" />
            {store.state.apiOnline ? "Mesita API · Conectada" : "Mesita API · Sin conexión"}
          </button>
          <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Ajustes"><Icon name="settings" size={19} /></button>
        </header>
      )}

      <main className="main">
        {route.name === "floor" && <Floor onOpen={(id) => go("order", id)} />}
        {route.name === "order" && <Order mesaId={route.mesaId} onBack={() => go("floor")} />}
        {route.name === "history" && <History />}
      </main>

      {apiPanel && <ApiPanel onClose={() => setApiPanel(false)} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
      <ToastHost />
      <PrintRegion />
    </div>
  );
}

/* ---------- API activity panel (the integration story) ---------- */
function ApiPanel({ onClose }) {
  const store = useStore();
  const acts = store.state.activity;
  const kindColor = (k) => k === "hook" ? "var(--brand)" : k === "err" ? "var(--bad)" : "var(--ok)";
  return (
    <Modal title="Conexión Mesita API" sub="Cada acción del POS viaja por la API de Mesita." onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderRadius: 14, background: store.state.apiOnline ? "var(--ok-soft)" : "var(--muted-surf)", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className="qd" style={{ width: 11, height: 11, borderRadius: "50%", background: store.state.apiOnline ? "var(--ok)" : "var(--ink-mut)", display: "inline-block" }} />
          <div>
            <div style={{ fontWeight: 700 }}>{store.state.apiOnline ? "Conectada" : "Sin conexión"}</div>
            <div style={{ fontSize: ".8rem", color: "var(--ink-mut)", fontFamily: "ui-monospace, monospace" }}>POST /sistema/api/v1 · token ••••2024</div>
          </div>
        </div>
        <button className="btn btn-sm btn-outline" onClick={() => store.setApiOnline(!store.state.apiOnline)}>
          {store.state.apiOnline ? "Simular caída" : "Reconectar"}
        </button>
      </div>

      <div style={{ fontSize: ".74rem", fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-mut)", marginBottom: 10 }}>Actividad reciente</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto", fontFamily: "ui-monospace, monospace", fontSize: ".8rem" }}>
        {acts.length === 0 && <div style={{ color: "var(--ink-mut)", fontFamily: "var(--font)" }}>Sin actividad todavía. Abre una mesa o cobra para ver las llamadas.</div>}
        {acts.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "6px 8px", borderRadius: 8, background: "var(--muted-surf)" }}>
            <span style={{ color: "var(--ink-mut)", flex: "0 0 auto" }}>{timeStr(a.ts)}</span>
            <span style={{ fontWeight: 700, color: kindColor(a.kind), flex: "0 0 auto", minWidth: 52 }}>{a.method}</span>
            <span style={{ color: "var(--ink)", wordBreak: "break-all" }}>{a.path}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- Settings ---------- */
function Settings({ onClose }) {
  const store = useStore();
  return (
    <Modal title="Ajustes" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderRadius: 14, background: "var(--muted-surf)", marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Cargo por servicio 10%</div>
          <div style={{ fontSize: ".82rem", color: "var(--ink-mut)" }}>Se aplica a todas las cuentas nuevas.</div>
        </div>
        <Toggle on={store.state.serviceEnabled} onChange={(v) => store.setServiceEnabled(v)} />
      </div>
      <div style={{ fontSize: ".74rem", fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-mut)", margin: "4px 0 10px" }}>Datos del restaurante</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".9rem" }}>
        <KV k="Nombre" v={RESTAURANT.nombre} />
        <KV k="RUC" v={RESTAURANT.ruc} />
        <KV k="Dirección" v={RESTAURANT.dir} />
        <KV k="API key" v="mesita2024secret" mono />
      </div>
    </Modal>
  );
}
function KV({ k, v, mono }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
    <span style={{ color: "var(--ink-mut)" }}>{k}</span>
    <span style={{ fontWeight: 600, fontFamily: mono ? "ui-monospace, monospace" : "inherit" }}>{v}</span>
  </div>;
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{ width: 48, height: 28, borderRadius: 100, background: on ? "var(--brand)" : "#cbb9a6", position: "relative", transition: "background .2s", flex: "0 0 auto" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
    </button>
  );
}

/* ---------- Print region ---------- */
function PrintRegion() {
  const store = useStore();
  const p = store.state.print;
  if (!p) return null;
  if (p.mode === "pre") return <PrintDoc title="PRECUENTA" subtitle="SIN VALIDEZ TRIBUTARIA" mesa={p.mesa.nombre} detalles={p.orden.detalles} totales={p.totales} />;
  if (p.mode === "fac") return <PrintDoc title={p.doc.tipo === "FAC" ? "FACTURA" : "NOTA DE VENTA"} subtitle={p.doc.cliente?.nombre || "CONSUMIDOR FINAL"} mesa={p.mesa.nombre} detalles={p.doc.detalles} totales={p.doc.totales} num={p.doc.num} via={p.doc.via} payments={p.doc.payments} />;
  return null;
}
function PrintDoc({ title, subtitle, mesa, detalles, totales, num, via, payments }) {
  return (
    <div className="print-region">
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: "16pt" }}>{RESTAURANT.nombre}</div>
        <div style={{ fontSize: "9pt" }}>{RESTAURANT.razon} · R.U.C. {RESTAURANT.ruc}</div>
        <div style={{ fontSize: "9pt" }}>{RESTAURANT.dir} · {RESTAURANT.tel}</div>
      </div>
      <div style={{ border: "2px solid #000", padding: 8, textAlign: "center", fontWeight: 800, letterSpacing: ".1em", margin: "10px 0" }}>
        {title}<div style={{ fontSize: "8pt", fontWeight: 700 }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5pt", borderBottom: "1px dashed #000", paddingBottom: 6, marginBottom: 8 }}>
        <span>Mesa: <b>{mesa}</b></span>
        {num && <span>Doc: <b>#{num}</b></span>}
        <span>{timeStr()}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
        <thead><tr><th style={{ textAlign: "left", borderBottom: "1px solid #000", padding: "3px 4px" }}>Cant</th><th style={{ textAlign: "left", borderBottom: "1px solid #000", padding: "3px 4px" }}>Descripción</th><th style={{ textAlign: "right", borderBottom: "1px solid #000", padding: "3px 4px" }}>Total</th></tr></thead>
        <tbody>
          {detalles.map((d) => (
            <tr key={d.id}><td style={{ padding: "3px 4px", verticalAlign: "top" }}>{d.cantidad}</td><td style={{ padding: "3px 4px" }}>{d.nombre}{d.nota ? ` — ${d.nota}` : ""}</td><td style={{ padding: "3px 4px", textAlign: "right" }}>{money(d.cantidad * d.precio)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, marginLeft: "auto", width: 240 }}>
        <PR k="Subtotal" v={money(totales.subtotal)} />
        <PR k="IVA 15%" v={money(totales.iva)} />
        {totales.serviceEnabled && <PR k="Servicio 10%" v={money(totales.servicio)} />}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #000", marginTop: 4, paddingTop: 5, fontWeight: 800, fontSize: "12pt" }}><span>TOTAL</span><span>{money(totales.total)}</span></div>
      </div>
      {payments && (
        <div style={{ marginTop: 12, borderTop: "1px dashed #000", paddingTop: 6, fontSize: "9.5pt" }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>Forma de pago{via === "mqr" ? " · Mesita QR" : ""}</div>
          {payments.map((p, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between" }}><span>{p.label}</span><span>{money(p.amount)}</span></div>)}
        </div>
      )}
      <div style={{ marginTop: 16, textAlign: "center", fontSize: "8.5pt", borderTop: "1px dashed #000", paddingTop: 8 }}>
        Gracias por su preferencia · Mesita
      </div>
    </div>
  );
}
function PR({ k, v }) { return <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}><span>{k}</span><span>{v}</span></div>; }

window.App = App;
