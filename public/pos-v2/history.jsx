/* ============================================================
   Mesita POS — Cuentas cerradas / Historial
   ============================================================ */

function History() {
  const store = useStore();
  const docs = store.state.docs;
  const [q, setQ] = React.useState("");
  const [tipo, setTipo] = React.useState("all");
  const [detail, setDetail] = React.useState(null);

  let rows = docs;
  if (tipo !== "all") rows = rows.filter((d) => d.tipo === tipo);
  if (q.trim()) {
    const s = q.toLowerCase().trim();
    rows = rows.filter((d) => d.num.includes(s) || d.mesa.toLowerCase().includes(s) || (d.cliente?.nombre || "").toLowerCase().includes(s));
  }

  // group by day
  const days = {};
  for (const d of rows) { const k = todayKey(d.ts); (days[k] = days[k] || []).push(d); }
  const dayKeys = Object.keys(days);

  const tipoLabel = (t) => t === "FAC" ? "Factura" : "Nota de venta";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cuentas cerradas</h1>
          <p>{docs.length} {docs.length === 1 ? "documento emitido" : "documentos emitidos"} en esta sesión.</p>
        </div>
      </div>

      <div className="hist-toolbar">
        <div className="grow">
          <span className="si"><Icon name="search" size={17} /></span>
          <input placeholder="Buscar por #, mesa o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="all">Todos</option>
          <option value="FAC">Facturas</option>
          <option value="NV">Notas de venta</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="be">🧾</div>
          <div className="bh">Aún no hay cuentas cerradas</div>
          <div style={{ marginTop: 6 }}>Cobra una mesa para ver aquí su factura o nota de venta.</div>
        </div>
      ) : dayKeys.map((k) => {
        const list = days[k];
        const tot = round2(list.reduce((s, d) => s + d.totales.total, 0));
        return (
          <div key={k}>
            <div className="day-head">
              <div>
                <div className="dt" style={{ textTransform: "capitalize" }}>{k}</div>
                <div className="dm">{list.length} {list.length === 1 ? "documento" : "documentos"}</div>
              </div>
              <div className="dtot tnum">{money(tot)}</div>
            </div>
            <table className="htable">
              <thead><tr><th>#</th><th>Tipo</th><th>Mesa</th><th>Cliente</th><th>Pago</th><th>Hora</th><th className="r">Total</th></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="lnk" onClick={() => setDetail(d)}>
                    <td style={{ fontWeight: 700 }}>{d.num}</td>
                    <td><span className={"pill-doc " + (d.tipo === "NV" ? "PRE" : "")}>{tipoLabel(d.tipo)}</span></td>
                    <td>{d.mesa}</td>
                    <td>{d.cliente?.nombre === "CONSUMIDOR FINAL" ? <span style={{ color: "var(--ink-mut)" }}>Consumidor Final</span> : (d.cliente?.nombre || "—")}</td>
                    <td>{d.via === "mqr" ? <span className="pill-doc mqr">⚡ Mesita QR</span> : payLabel(d.payments)}</td>
                    <td>{timeStr(d.ts)}</td>
                    <td className="r tnum" style={{ fontWeight: 700 }}>{money(d.totales.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {detail && <DocDetail doc={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function payLabel(payments) {
  if (!payments || !payments.length) return "—";
  if (payments.length === 1) return payments[0].method === "EF" ? "Efectivo" : payments[0].method === "TC" ? "Tarjeta" : payments[0].label;
  return payments.length + " pagos";
}

function DocDetail({ doc, onClose }) {
  const t = doc.totales;
  return (
    <Modal title={(doc.tipo === "FAC" ? "Factura" : "Nota de venta") + " #" + doc.num} sub={`${doc.mesa} · ${todayKey(doc.ts)} ${timeStr(doc.ts)}`} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={() => { Store.setPrint({ mode: "fac", doc, mesa: { nombre: doc.mesa } }); setTimeout(() => window.print(), 60); }}><Icon name="printer" size={16} /> Imprimir</button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>}>
      {doc.via === "mqr" && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "var(--brand-soft)", color: "var(--brand-dark)", fontWeight: 650, fontSize: ".86rem", marginBottom: 16 }}>⚡ Cobrado con Mesita QR · ref {doc.ref}</div>}

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: ".74rem", fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-mut)", marginBottom: 6 }}>Cliente</div>
        <div style={{ fontWeight: 600 }}>{doc.cliente?.nombre || "Consumidor Final"}</div>
        {doc.cliente?.id && doc.cliente.id !== "9999999999" && <div style={{ color: "var(--ink-mut)", fontSize: ".88rem" }}>{doc.cliente.tipo === "J" ? "RUC " : "C.I. "}{doc.cliente.id}</div>}
      </div>

      <table className="ptable" style={{ marginTop: 0 }}>
        <thead><tr><th>Cant</th><th>Descripción</th><th className="r">P. Unit</th><th className="r">Total</th></tr></thead>
        <tbody>
          {doc.detalles.map((d) => (
            <tr key={d.id}><td>{d.cantidad}</td><td>{d.nombre}{d.nota ? ` — ${d.nota}` : ""}</td><td className="r tnum">{money(d.precio)}</td><td className="r tnum">{money(d.cantidad * d.precio)}</td></tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, marginLeft: "auto", maxWidth: 280 }}>
        <Row k="Subtotal" v={money(t.subtotal)} />
        <Row k="IVA 15%" v={money(t.iva)} />
        {t.serviceEnabled && <Row k="Servicio 10%" v={money(t.servicio)} />}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", marginTop: 6, borderTop: "1px dashed var(--line)", fontWeight: 800, fontSize: "1.1rem" }}>
          <span>Total</span><span className="tnum">{money(t.total)}</span>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div style={{ fontSize: ".74rem", fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-mut)", marginBottom: 8 }}>Forma de pago</div>
        {doc.payments.map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: ".9rem", padding: "3px 0" }}>
            <span>{p.label}{p.tip ? ` (propina ${money(p.tip)})` : ""}</span><span className="tnum">{money(p.amount)}</span>
          </div>
        ))}
      </div>
      {doc.autorizacion && <div style={{ marginTop: 14, fontSize: ".76rem", color: "var(--ink-mut)" }}>Autorización SRI: <span style={{ fontFamily: "ui-monospace, monospace" }}>{doc.autorizacion}</span></div>}
    </Modal>
  );
}
function Row({ k, v }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "var(--ink-mut)", fontSize: ".92rem" }}><span>{k}</span><span className="tnum" style={{ color: "var(--ink)" }}>{v}</span></div>;
}

window.History = History;
