/* ============================================================
   Mesita POS — Order screen (menú + precuenta)
   ============================================================ */

function Order({ mesaId, onBack }) {
  const store = useStore();
  const mesa = store.mesaById(mesaId);

  React.useEffect(() => { store.openMesa(mesaId); }, [mesaId]);

  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [noteFor, setNoteFor] = React.useState(null);
  const [cobroT, setCobroT] = React.useState(null); // frozen totales while cobro/success open

  if (!mesa) return null;
  const orden = mesa.orden;
  if (!orden && !cobroT) return null;
  const totales = orden ? computeTotals(orden, store.state.serviceEnabled) : null;

  let prods = PRODUCTOS;
  if (cat !== "all") prods = prods.filter((p) => p.cat === cat);
  if (q.trim()) {
    const s = q.toLowerCase().trim();
    prods = prods.filter((p) => p.nombre.toLowerCase().includes(s) || p.desc.toLowerCase().includes(s));
  }

  return (
    <>
    {orden && totales && (
    <div className="order-wrap">
      {/* ---- Menu ---- */}
      <div className="menu-pane">
        <button className="btn btn-outline btn-sm menu-back" onClick={onBack}>
          <Icon name="back" size={15} /> Volver a mesas
        </button>
        <div className="searchbar">
          <span className="si"><Icon name="search" size={17} /></span>
          <input placeholder="Buscar plato…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="cats">
          <button className={"cat" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}>Todo</button>
          {CATEGORIAS.map((c) => (
            <button key={c.id} className={"cat" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}>
              {c.icon} {c.nombre}
            </button>
          ))}
        </div>
        {prods.length === 0 ? (
          <div className="empty"><div className="be">🔍</div><div className="bh">Sin resultados</div></div>
        ) : (
          <div className="prods">
            {prods.map((p) => (
              <button key={p.id} className="pcard" onClick={() => {
                store.addDetalle(mesaId, p)
                  .then(() => toast("Añadido: " + p.nombre, "ok"))
                  .catch((e) => toast(e.message || "Error al añadir", "bad"));
              }}>
                <span className="pi">{p.icon}</span>
                <span className="pn">{p.nombre}</span>
                <span className="pd">{p.desc}</span>
                <span className="pp tnum">{money(p.precio)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- Precuenta ---- */}
      <aside className="bill">
        <div className="bill-head">
          <div className="bt">{mesa.nombre} <span className="badge O" style={{ fontSize: ".62rem" }}><span className="d" />Precuenta</span></div>
          <div className="bsub">Orden #{orden.id.replace("ord-", "")} · cambios guardados al instante</div>
          <div className="diners">
            <Icon name="users" size={15} />
            <button className="step" onClick={() => store.setComensales(mesaId, orden.comensales - 1)}>−</button>
            <span>{orden.comensales || 0} {orden.comensales === 1 ? "persona" : "personas"}</span>
            <button className="step" onClick={() => store.setComensales(mesaId, orden.comensales + 1)}>+</button>
          </div>
        </div>

        {orden.detalles.length === 0 ? (
          <div className="bill-empty">
            <div className="be">🍽️</div>
            <div className="bh">Precuenta vacía</div>
            <div>Toca un producto del menú para agregarlo.</div>
          </div>
        ) : (
          <div className="bill-items">
            {orden.detalles.map((d) => (
              <div className="li" key={d.id}>
                <span className="lpi">{d.icon}</span>
                <div className="lmain">
                  <div className="lnm">{d.nombre}</div>
                  {d.nota && <div className="lnote">“{d.nota}”</div>}
                  <div className="qty">
                    <button className="qb" onClick={() => store.setQty(mesaId, d.id, d.cantidad - 1)}>−</button>
                    <span className="qv">{d.cantidad}</span>
                    <button className="qb" onClick={() => store.setQty(mesaId, d.id, d.cantidad + 1)}>+</button>
                    <span className="qx tnum">× {money(d.precio)}</span>
                  </div>
                </div>
                <div className="lright">
                  <span className="lp tnum">{money(d.cantidad * d.precio)}</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button className="ldel" title="Nota" onClick={() => setNoteFor(d)} style={{ color: d.nota ? "var(--brand)" : undefined }}><Icon name="note" size={15} /></button>
                    <button className="ldel" title="Quitar" onClick={() => store.removeDetalle(mesaId, d.id)}><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="totals">
          <div className="tr"><span>Subtotal</span><span className="tnum">{money(totales.subtotal)}</span></div>
          <div className="tr"><span>IVA 15%</span><span className="tnum">{money(totales.iva)}</span></div>
          {totales.serviceEnabled && <div className="tr"><span>Servicio 10%</span><span className="tnum">{money(totales.servicio)}</span></div>}
          <div className="tr grand"><span>Total</span><span className="tnum">{money(totales.total)}</span></div>
        </div>

        <div className="actions">
          <button className="btn btn-danger-soft" onClick={() => {
            if (confirm("¿Anular la orden y vaciar la precuenta?")) { store.anular(mesaId); onBack(); }
          }}>Anular</button>
          <button className="btn btn-outline" disabled={!orden.detalles.length} onClick={() => { store.setPrint({ mode: "pre", mesa, orden, totales }); setTimeout(() => window.print(), 60); }}>
            <Icon name="printer" size={16} /> Precuenta
          </button>
          <button className="btn btn-ok pay btn-lg" disabled={!orden.detalles.length} onClick={() => setCobroT(totales)}>
            Cobrar · {money(totales.total)}
          </button>
        </div>
      </aside>
    </div>
    )}
      {noteFor && <NoteModal det={noteFor} onSave={(v) => { store.setNota(mesaId, noteFor.id, v); setNoteFor(null); }} onClose={() => setNoteFor(null)} />}
      {cobroT && <Cobro mesa={mesa} totales={cobroT} onClose={() => setCobroT(null)} onDone={onBack} />}
    </>
  );
}

function NoteModal({ det, onSave, onClose }) {
  const [v, setV] = React.useState(det.nota || "");
  return (
    <Modal title={`Nota para “${det.nombre}”`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onSave(v.trim())}>Guardar nota</button>
      </>}>
      <div className="field">
        <label>Nota para cocina</label>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="sin cebolla, término medio, extra salsa…" />
      </div>
    </Modal>
  );
}

window.Order = Order;
