/* ============================================================
   Mesita POS — Cobro (payment) modal
   · Mesita QR live flow (the integration demo)
   · Manual multipago: Efectivo / Tarjeta / Transferencia
   · Factura electrónica + Consumidor Final
   ============================================================ */

const TAB_META = [
  { code: "EF",  label: "Efectivo", icon: "💵" },
  { code: "TC",  label: "Tarjeta", icon: "💳" },
  { code: "TR",  label: "Transferencia", icon: "🏦" },
];

function Cobro({ mesa, totales, onClose, onDone }) {
  const total = totales.total;
  const [tab, setTab] = React.useState("EF");
  const [payments, setPayments] = React.useState([]);
  const [facturaOn, setFacturaOn] = React.useState(total >= FACTURA_THRESHOLD);
  const [cliente, setCliente] = React.useState({ tipo: "N", nombre: "", cedula: "", ruc: "", email: "", dir: "" });
  const [errs, setErrs] = React.useState({});
  const [phase, setPhase] = React.useState("pay"); // pay | success
  const [doc, setDoc] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const handed = round2(payments.reduce((s, p) => s + p.amount, 0));
  const saldo = Math.max(0, round2(total - handed));
  const vuelto = round2(payments.reduce((s, p) => s + Math.max(0, (p.tendered || p.amount) - p.amount), 0));

  function addPayment(p) {
    const amt = round2(p.amount);
    if (amt <= 0) return toast("Ingresa un monto mayor a 0", "bad");
    if (saldo <= 0) return toast("La cuenta ya está cubierta", "bad");
    let row = { id: "p" + Date.now() + Math.random(), method: p.method, label: p.label, amount: amt, tip: p.tip || 0 };
    if (p.method === "EF" && amt > saldo) { row.tendered = amt; row.amount = saldo; }
    else if (amt > saldo + 0.005) row.amount = saldo;
    setPayments((prev) => [...prev, row]);
  }
  const removePayment = (id) => setPayments((prev) => prev.filter((p) => p.id !== id));

  async function finalize(via, pays) {
    setBusy(true);
    const cli = facturaOn ? buildCliente(cliente) : { nombre: "CONSUMIDOR FINAL", id: "9999999999", email: "", dir: "Ecuador", tipo: "N" };
    const d = await Store.finalizeCobro({ mesaId: mesa.id, payments: pays, totales, cliente: cli, facturaOn, via });
    setDoc(d); setPhase("success"); setBusy(false);
  }

  function onAceptar() {
    if (saldo > 0) return;
    if (facturaOn) {
      const e = validateCliente(cliente);
      setErrs(e);
      if (Object.keys(e).length) return toast("Revisa los datos del cliente", "bad");
    }
    finalize("manual", payments);
  }

  if (phase === "success") return <Success doc={doc} mesa={mesa} onClose={() => { onClose(); onDone(); setTimeout(() => Store.releaseMesa(mesa.id), 2000); }} />;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn-ok btn-lg" disabled={saldo > 0 || busy} onClick={onAceptar}>
        {busy ? <span className="spin" /> : saldo > 0 ? `Falta ${money(saldo)}` : "✓ Aceptar y facturar"}
      </button>
    </>
  );

  return (
    <Modal size="lg" title={`Cobrar — ${mesa.nombre}`} sub={`${ordenCount({ detalles: doc ? [] : mesa.orden?.detalles || [] })} ítems · total ${money(total)}`} onClose={onClose} footer={footer}>
      <div className="seg">
        {TAB_META.map((t) => (
          <button key={t.code} className={(tab === t.code ? "on" : "") + (t.code === "mqr" ? " mqr" : "")} onClick={() => setTab(t.code)}>
            <span className="ic">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <ManualPane tab={tab} total={total} saldo={saldo} vuelto={vuelto} payments={payments}
        addPayment={addPayment} removePayment={removePayment}
        facturaOn={facturaOn} setFacturaOn={setFacturaOn} cliente={cliente} setCliente={setCliente} errs={errs} />
    </Modal>
  );
}

/* ============================================================
   Mesita QR — live coverage flow
   ============================================================ */
function MesitaQRPane({ mesa, total, totales, busy, onCancel, onComplete }) {
  const nDiners = Math.max(2, Math.min(mesa.orden?.comensales || 4, 6));
  const ref = React.useRef("");

  // Build the diner split once.
  const diners = React.useMemo(() => {
    const base = round2(total / nDiners);
    const arr = [];
    let acc = 0;
    for (let i = 0; i < nDiners; i++) {
      const name = DEMO_DINERS[i] ? DEMO_DINERS[i].name : "Comensal " + (i + 1);
      const init = DEMO_DINERS[i] ? DEMO_DINERS[i].initials : "C" + (i + 1);
      const hue = DEMO_DINERS[i] ? DEMO_DINERS[i].hue : (i * 70) % 360;
      let share = i === nDiners - 1 ? round2(total - acc) : base;
      acc = round2(acc + share);
      arr.push({ id: "dn" + i, name, init, hue, share, paid: false });
    }
    return arr;
  }, [nDiners, total]);

  const [paid, setPaid] = React.useState({});   // id -> true
  const [status, setStatus] = React.useState("waiting"); // waiting | paid
  const paidCount = Object.keys(paid).length;
  const paidAmt = round2(diners.reduce((s, d) => s + (paid[d.id] ? d.share : 0), 0));
  const pct = total > 0 ? Math.round((paidAmt / total) * 100) : 0;

  React.useEffect(() => { ref.current = Store.createMqrSession(mesa.id); }, []);

  // reflect coverage on the floor card
  React.useEffect(() => {
    const m = Store.mesaById(mesa.id);
    if (m) { m.coverage = { pct }; Store.emit(); }
  }, [pct]);

  function payNext() {
    const next = diners.find((d) => !paid[d.id]);
    if (!next) return;
    const np = { ...paid, [next.id]: true };
    setPaid(np);
    Store.mqrWebhook(next.name);
    toast(`${next.name} pagó su parte · ${money(next.share)}`, "mqr", "⚡");
    if (Object.keys(np).length === diners.length) {
      setStatus("paid");
      setTimeout(() => {
        const pays = diners.map((d) => ({ id: d.id, method: "MQR", label: "Mesita QR · " + d.name, amount: d.share, tip: 0 }));
        onComplete(pays);
      }, 1100);
    }
  }

  // auto-advance to feel live (paced); user can also tap "Simular siguiente"
  React.useEffect(() => {
    if (status === "paid") return;
    const t = setTimeout(payNext, 2200);
    return () => clearTimeout(t);
  }, [paid, status]);

  return (
    <div className="mqr">
      <div className="mqr-card">
        <span className="mqr-brand">⚡ Cobro con Mesita QR · vía API</span>
        <div className="qr">
          <FakeQR seed={mesa.id + total} />
          {status !== "paid" && <span className="qr-scan" />}
        </div>
        <div className={"mqr-status" + (status === "paid" ? " paid" : "")}>
          <span className="sd" />
          {status === "paid" ? "Mesa cubierta · cerrando cuenta…" : "Esperando pago del cliente…"}
        </div>
        <div style={{ fontSize: ".82rem", color: "var(--ink-mut)", maxWidth: 300, textAlign: "center" }}>
          El cliente escanea el QR y paga desde su teléfono. Cada pago llega al POS como un webhook de Mesita.
        </div>
      </div>

      <div className="cover">
        <div className="cover-top">
          <span className="ck">Cobertura de la mesa</span>
          <span className="cv tnum">{money(paidAmt)} / {money(total)} · {pct}%</span>
        </div>
        <div className="cover-bar"><i style={{ width: pct + "%" }} /></div>
        <div className="cover-list">
          {diners.map((d) => (
            <div key={d.id} className={"cover-row" + (paid[d.id] ? " paid" : "")}>
              <span className="cav" style={{ background: `hsl(${d.hue} 58% 48%)` }}>{d.init}</span>
              <span className="cnm">{d.name}</span>
              <span className="cam tnum">{money(d.share)}</span>
              <span className={"cst " + (paid[d.id] ? "k" : "w")}>{paid[d.id] ? "✓ Pagado" : "Pagando…"}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 16 }}>
        <button className="btn btn-ghost" style={{ flex: "0 0 auto" }} onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={payNext} disabled={status === "paid" || busy}>
          Simular siguiente pago
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Manual multipago
   ============================================================ */
function ManualPane(props) {
  const { tab, total, saldo, vuelto, payments, addPayment, removePayment, facturaOn, setFacturaOn, cliente, setCliente, errs } = props;
  return (
    <div>
      <div className="sum3">
        <div className="sbox"><div className="l">Total</div><div className="v tnum">{money(total)}</div></div>
        <div className={"sbox saldo" + (saldo === 0 ? " zero" : "")}>
          <div className="l">{saldo === 0 ? "Cubierto" : "Saldo"}</div>
          <div className="v tnum">{saldo === 0 ? "✓ $0.00" : money(saldo)}</div>
        </div>
        <div className="sbox vuelto"><div className="l">Vuelto</div><div className="v tnum">{money(vuelto)}</div></div>
      </div>

      {tab === "EF" && <EfectivoTab saldo={saldo} addPayment={addPayment} />}
      {tab === "TC" && <TarjetaTab saldo={saldo} addPayment={addPayment} />}
      {tab === "TR" && <TransferTab saldo={saldo} addPayment={addPayment} />}

      <PaymentsTable payments={payments} removePayment={removePayment} />

      <FacturaSection total={total} facturaOn={facturaOn} setFacturaOn={setFacturaOn} cliente={cliente} setCliente={setCliente} errs={errs} />
    </div>
  );
}

function EfectivoTab({ saldo, addPayment }) {
  const [v, setV] = React.useState("");
  const opts = [{ l: "Exacto", a: round2(saldo) }, { l: "Redondeo", a: Math.ceil(saldo) }, { l: "$10", a: 10 }, { l: "$20", a: 20 }, { l: "$50", a: 50 }];
  return (
    <div>
      <div className="qrow">
        {opts.filter((o) => o.a > 0).map((o, i) => (
          <button key={i} className="qbtn" onClick={() => addPayment({ method: "EF", label: "Efectivo", amount: o.a })}>
            <span className="ql">{o.l}</span><span className="qa tnum">{money(o.a)}</span>
          </button>
        ))}
      </div>
      <div className="addrow">
        <div className="field"><label>Monto recibido</label>
          <input type="number" step="0.01" min="0" placeholder="0.00" value={v} onChange={(e) => setV(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={() => { addPayment({ method: "EF", label: "Efectivo", amount: round2(v) }); setV(""); }}>
          <Icon name="plus" size={16} /> Agregar
        </button>
      </div>
    </div>
  );
}
function TarjetaTab({ saldo, addPayment }) {
  const [proc, setProc] = React.useState(CARD_PROCESSORS[0]);
  const [v, setV] = React.useState(round2(saldo) || "");
  const [tip, setTip] = React.useState("");
  return (
    <div className="addrow three">
      <div className="field"><label>Procesador</label>
        <select value={proc} onChange={(e) => setProc(e.target.value)}>{CARD_PROCESSORS.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="field"><label>Monto</label><input type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} /></div>
      <div className="field"><label>Propina</label><input type="number" step="0.01" placeholder="0.00" value={tip} onChange={(e) => setTip(e.target.value)} /></div>
      <button className="btn btn-primary" onClick={() => { addPayment({ method: "TC", label: proc, amount: round2(v), tip: round2(tip) }); }}>
        <Icon name="plus" size={16} /> Agregar
      </button>
    </div>
  );
}
function TransferTab({ saldo, addPayment }) {
  const [ref, setRef] = React.useState("");
  const [v, setV] = React.useState(round2(saldo) || "");
  return (
    <div className="addrow">
      <div className="field"><label>Banco / referencia</label><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Pichincha · #00123" /></div>
      <div className="field" style={{ display: "none" }} />
      <div className="field"><label>Monto</label><input type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} /></div>
      <button className="btn btn-primary" onClick={() => { addPayment({ method: "TR", label: ref || "Transferencia", amount: round2(v) }); }}>
        <Icon name="plus" size={16} /> Agregar
      </button>
    </div>
  );
}

function PaymentsTable({ payments, removePayment }) {
  if (!payments.length) return <div className="empty-pay">Aún no hay pagos registrados. Agrega uno con los controles de arriba.</div>;
  const icon = (m) => m === "EF" ? "💵" : m === "TC" ? "💳" : "🏦";
  return (
    <table className="ptable">
      <thead><tr><th>Método</th><th>Detalle</th><th className="r">Propina</th><th className="r">Monto</th><th /></tr></thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id}>
            <td><span className="meth">{icon(p.method)} {p.method === "EF" ? "Efectivo" : p.method === "TC" ? "Tarjeta" : "Transf."}</span></td>
            <td>{p.label}{p.tendered ? ` · vuelto ${money(p.tendered - p.amount)}` : ""}</td>
            <td className="r tnum">{p.tip ? money(p.tip) : "—"}</td>
            <td className="r tnum" style={{ fontWeight: 700 }}>{money(p.amount)}</td>
            <td><button className="xb" onClick={() => removePayment(p.id)}><Icon name="x" size={16} /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FacturaSection({ total, facturaOn, setFacturaOn, cliente, setCliente, errs }) {
  const forced = total >= FACTURA_THRESHOLD;
  const set = (k, v) => setCliente((c) => ({ ...c, [k]: v }));
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: ".82rem", fontWeight: 700, marginBottom: 9, color: "var(--ink-mut)" }}>Tipo de comprobante</div>
      <div className="choice">
        <button className={facturaOn ? "" : "on"} onClick={() => setFacturaOn(false)}>
          <div className="ct">Consumidor Final</div><div className="cs">Nota de venta · sin datos</div>
        </button>
        <button className={facturaOn ? "on" : ""} onClick={() => setFacturaOn(true)}>
          <div className="ct">Factura Electrónica</div><div className="cs">Requiere cédula/RUC + email</div>
        </button>
      </div>
      {forced && facturaOn && <div style={{ fontSize: ".76rem", color: "var(--ink-mut)", marginTop: 7 }}>Preseleccionada por monto ≥ {money(FACTURA_THRESHOLD)}.</div>}

      {facturaOn && (
        <div className="fgrid" style={{ marginTop: 14 }}>
          <div className="field full">
            <div style={{ display: "flex", gap: 8 }}>
              <button className={"btn btn-sm " + (cliente.tipo === "N" ? "btn-primary" : "btn-outline")} style={{ flex: 1 }} onClick={() => set("tipo", "N")}>Persona Natural</button>
              <button className={"btn btn-sm " + (cliente.tipo === "J" ? "btn-primary" : "btn-outline")} style={{ flex: 1 }} onClick={() => set("tipo", "J")}>Persona Jurídica</button>
            </div>
          </div>
          <div className="field full"><label>{cliente.tipo === "J" ? "Razón social" : "Nombre completo"}</label>
            <input className={errs.nombre ? "err" : ""} value={cliente.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
          {cliente.tipo === "N"
            ? <div className="field"><label>Cédula</label><input className={errs.cedula ? "err" : ""} maxLength={10} value={cliente.cedula} onChange={(e) => set("cedula", e.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
            : <div className="field"><label>RUC</label><input className={errs.ruc ? "err" : ""} maxLength={13} value={cliente.ruc} onChange={(e) => set("ruc", e.target.value.replace(/\D/g, "").slice(0, 13))} /></div>}
          <div className="field"><label>Email</label><input className={errs.email ? "err" : ""} type="email" value={cliente.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="field full"><label>Dirección</label><input className={errs.dir ? "err" : ""} value={cliente.dir} onChange={(e) => set("dir", e.target.value)} /></div>
        </div>
      )}
    </div>
  );
}

/* ---------- Success ---------- */
function Success({ doc, mesa, onClose }) {
  const viaMqr = doc.via === "mqr";
  return (
    <Modal title="Cobro completado" onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={() => { Store.setPrint({ mode: "fac", doc, mesa }); setTimeout(() => window.print(), 60); }}><Icon name="printer" size={16} /> Imprimir</button>
        <button className="btn btn-primary" onClick={onClose}>Listo</button>
      </>}>
      <div className="success">
        <div className="ok-ring"><div className="disc"><Icon name="check" size={28} /></div></div>
        <h2>{viaMqr ? "Pagado vía Mesita QR" : "Pago registrado"}</h2>
        <p>{doc.tipo === "FAC" ? "Factura" : "Nota de venta"} #{doc.num} · {mesa.nombre} · {money(doc.totales.total)}</p>
        {viaMqr && <p style={{ marginTop: 4, color: "var(--brand-dark)", fontWeight: 600, fontSize: ".84rem" }}>Confirmado por webhook · ref {doc.ref}</p>}
        <div className="chips">
          {doc.payments.map((p, i) => <span key={i} className="chip">{p.label} · {money(p.amount)}</span>)}
        </div>
        <p style={{ marginTop: 14, fontSize: ".82rem" }}>Al volver a mesas, {mesa.nombre} quedará libre para el siguiente comensal.</p>
      </div>
    </Modal>
  );
}

/* ---------- helpers ---------- */
function buildCliente(c) {
  return {
    nombre: (c.nombre || "").trim().toUpperCase(),
    id: c.tipo === "J" ? c.ruc : c.cedula,
    tipo: c.tipo, email: c.email.trim(), dir: c.dir.trim(),
  };
}
function validateCliente(c) {
  const e = {};
  if (!c.nombre.trim()) e.nombre = 1;
  if (c.tipo === "N" && !/^\d{10}$/.test(c.cedula)) e.cedula = 1;
  if (c.tipo === "J" && !/^\d{13}$/.test(c.ruc)) e.ruc = 1;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) e.email = 1;
  if (!c.dir.trim()) e.dir = 1;
  return e;
}

window.Cobro = Cobro;
