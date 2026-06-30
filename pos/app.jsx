/* ============================================================
   Mesita POS — redesigned operational workflow
   Floor · order editor · bill · payments · closing · integration
   A functional demo + API-testing environment for Mesita.
   ============================================================ */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ---------------- small shared UI ---------------- */
function Badge({ tone = "neutral", children, dot = true }) {
  return (
    <span className={"badge " + tone}>
      {dot && <span className="bdot" />}
      {children}
    </span>
  );
}
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.available;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
const toneColor = {
  available: "var(--muted)", occupied: "var(--primary)", awaiting: "var(--warning)",
  partial: "var(--info)", closed: "var(--success)",
};

/* faux but stable QR */
function QR({ seed = "mesita" }) {
  const cells = useMemo(() => {
    const n = 21;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const out = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
        h = (h * 1103515245 + 12345) >>> 0;
        const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x > 1 && x < 5 && y > 1 && y < 5)) : (h % 100) < 48;
        if (on) out.push(<rect key={x + "-" + y} x={x} y={y} width="1" height="1" />);
      }
    return out;
  }, [seed]);
  return (
    <svg viewBox="0 0 21 21" shapeRendering="crispEdges" fill="#1F2933">
      {cells}
    </svg>
  );
}

/* ============================================================ SIDEBAR */
function Sidebar({ view, setView, attention }) {
  return (
    <aside className="side">
      <div className="side-brand">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">Mesi<b>ta</b> POS</div>
          <div className="brand-sub">Demo de integración</div>
        </div>
      </div>

      <div className="side-rest">
        <div className="rname">{RESTAURANT.name}</div>
        <div className="rmeta">{RESTAURANT.city} · {RESTAURANT.register}</div>
      </div>

      <div className="nav-group">Operación</div>
      <button className={"nav-item" + (view === "floor" ? " on" : "")} onClick={() => setView("floor")}>
        <Ic.grid s={18} /> Mesas
      </button>

      <div className="nav-group">Integración</div>
      <button className={"nav-item" + (view === "integration" ? " on" : "")} onClick={() => setView("integration")}>
        <Ic.plug s={18} /> Mesita · API
        {attention > 0 && <span className="nav-count alert">{attention}</span>}
      </button>

      <div className="side-foot">
        <div className="side-user">
          <div className="av">CM</div>
          <div>
            <div className="uname">{RESTAURANT.cashier}</div>
            <div className="umeta">{RESTAURANT.shift}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ============================================================ TOPBAR */
function Topbar({ title, crumb, query, setQuery, live, children }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {crumb && <div className="crumb">{crumb}</div>}
      </div>
      <div className="top-spacer" />
      {setQuery && (
        <label className="search">
          <Ic.search s={16} />
          <input placeholder="Buscar mesa o mesero…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      {children}
      <span className={"live-pill" + (live ? "" : " off")}>
        <span className="dot" /> {live ? "Mesita en vivo" : "Mesita desconectada"}
      </span>
    </div>
  );
}

/* ============================================================ FLOOR VIEW */
function SummaryStrip({ counts, filter, setFilter }) {
  const cards = [
    { key: "all", label: "Mesas activas", val: counts.active, sub: `de ${counts.total}`, color: "var(--text)" },
    { key: "occupied", label: "En curso", val: counts.occupied, sub: "tomando orden", color: toneColor.occupied },
    { key: "awaiting", label: "Por cobrar", val: counts.awaiting, sub: "cuenta lista", color: toneColor.awaiting, attention: counts.awaiting > 0 },
    { key: "partial", label: "Pago parcial", val: counts.partial, sub: "saldo pendiente", color: toneColor.partial },
    { key: "available", label: "Libres", val: counts.available, sub: "disponibles", color: toneColor.available },
  ];
  return (
    <div className="summary">
      {cards.map((c) => (
        <div key={c.key}
          className={"sum-card" + (filter === c.key ? " on" : "") + (c.attention && filter !== c.key ? " attention" : "")}
          onClick={() => setFilter(filter === c.key ? "all" : c.key)}>
          <div className="sum-top"><span className="bdot" style={{ background: c.color }} />{c.label}</div>
          <div className="sum-val tnum">{c.val}</div>
          <div className="sum-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function TableCard({ table, onOpen }) {
  const status = deriveStatus(table);
  const bill = billTotals(table);
  const paid = paidTotal(table);
  const remaining = remainingOf(table);
  const pctPaid = bill.total > 0 ? Math.min(100, Math.round((paid / bill.total) * 100)) : 0;
  const isOpen = status === "available";

  return (
    <div className={"tcard s-" + status + (table.live ? " live" : "")} onClick={() => onOpen(table)}>
      <div className="tcard-top">
        <div>
          <div className="tcard-name">{table.name}</div>
          <div className="tcard-zone">{table.zone} · {table.capacity} pax</div>
        </div>
        <StatusBadge status={status} />
      </div>

      {isOpen ? (
        <div className="tcard-foot" style={{ marginTop: 26 }}>
          <span className="tcard-zone">Sin orden</span>
          <span className="tcard-open"><Ic.plus s={15} /> Abrir mesa</span>
        </div>
      ) : (
        <>
          <div className="tcard-meta">
            <span><Ic.users s={14} /> {guestCount(table)}</span>
            {table.waiter && <span><Ic.user s={14} /> {table.waiter}</span>}
            {table.openedAt && <span><Ic.clock s={14} /> {table.openedAt}</span>}
          </div>

          {(status === "partial" || status === "closed") && (
            <div className="tprog">
              <div className="tprog-bar">
                <div className={"tprog-fill" + (status === "partial" ? " partial" : "")} style={{ width: pctPaid + "%" }} />
              </div>
              <div className="tprog-txt"><span>{pctPaid}% pagado</span><span className="tnum">{money(remaining)} pendiente</span></div>
            </div>
          )}

          <div className="tcard-foot">
            <div className="tcard-total tnum">{money(bill.total)}<small>{status === "closed" ? "pagado" : "total cuenta"}</small></div>
            <span className="tcard-open">Abrir <Ic.chevR s={15} /></span>
          </div>
        </>
      )}
    </div>
  );
}

function FloorView({ tables, query, filter, setFilter, zone, setZone, onOpen, appState, onReload }) {
  const counts = useMemo(() => {
    const c = { total: tables.length, active: 0, occupied: 0, awaiting: 0, partial: 0, available: 0, closed: 0 };
    tables.forEach((t) => { const s = deriveStatus(t); c[s]++; if (s !== "available") c.active++; });
    return c;
  }, [tables]);

  const filtered = tables.filter((t) => {
    const s = deriveStatus(t);
    if (zone !== "Todas" && t.zone !== zone) return false;
    if (filter !== "all" && s !== filter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.waiter || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const zonesPresent = ZONES.slice(1).filter((z) => filtered.some((t) => t.zone === z));

  if (appState === "loading") {
    return (
      <div className="floor">
        <div className="summary">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel" style={{ height: 78 }} />)}</div>
        <div className="tables">{Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skel-card"><div className="skel" style={{ height: 16, width: "55%" }} /><div className="skel" style={{ height: 12, width: "40%", marginTop: 10 }} /><div className="skel" style={{ height: 26, width: "50%", marginTop: 26 }} /></div>
        ))}</div>
      </div>
    );
  }

  if (appState === "error") {
    return (
      <div className="floor">
        <div className="banner error"><Ic.alert s={20} /><div className="b-txt"><b>No se pudo cargar el salón.</b> No hay respuesta del POS local. Verifica la conexión e inténtalo de nuevo.</div><button className="btn btn-sm btn-danger" onClick={onReload}><Ic.refresh s={13} /> Reintentar</button></div>
        <div className="empty"><div className="e-ic"><Ic.store s={30} /></div><h3>Salón no disponible</h3><p>Los datos de las mesas no están sincronizados todavía.</p></div>
      </div>
    );
  }

  return (
    <div className="floor">
      <SummaryStrip counts={counts} filter={filter} setFilter={setFilter} />

      <div className="floor-bar">
        <div className="seg">
          {ZONES.map((z) => (
            <button key={z} className={zone === z ? "on" : ""} onClick={() => setZone(z)}>{z}</button>
          ))}
        </div>
        <div className="legend">
          {["available", "occupied", "awaiting", "partial", "closed"].map((k) => (
            <span key={k}><span className="bdot" style={{ background: toneColor[k] }} />{STATUS[k].label}</span>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="e-ic"><Ic.grid s={28} /></div>
          <h3>No hay mesas que coincidan</h3>
          <p>Ajusta los filtros o la búsqueda para ver más mesas del salón.</p>
          <button className="btn" onClick={() => { setFilter("all"); setZone("Todas"); }}>Limpiar filtros</button>
        </div>
      ) : zone === "Todas" ? (
        zonesPresent.map((z) => (
          <div key={z}>
            <div className="zone-h">{z}</div>
            <div className="tables">
              {filtered.filter((t) => t.zone === z).map((t) => <TableCard key={t.id} table={t} onOpen={onOpen} />)}
            </div>
          </div>
        ))
      ) : (
        <div className="tables">{filtered.map((t) => <TableCard key={t.id} table={t} onOpen={onOpen} />)}</div>
      )}
    </div>
  );
}

/* ============================================================ OPEN TABLE MODAL */
function OpenTableModal({ table, onClose, onConfirm }) {
  const [guests, setGuests] = useState(2);
  const [waiter, setWaiter] = useState("");
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-ic brand"><Ic.plus s={24} /></div>
        <h3>Abrir {table.name}</h3>
        <p>{table.zone} · capacidad {table.capacity} personas. Confirma para empezar a tomar la orden.</p>
        <div className="field">
          <label>Comensales</label>
          <div className="row">
            <div className="stepper" style={{ height: 42 }}>
              <button onClick={() => setGuests((g) => Math.max(1, g - 1))}><Ic.minus s={16} /></button>
              <span className="q" style={{ minWidth: 36, fontSize: 16 }}>{guests}</span>
              <button onClick={() => setGuests((g) => Math.min(table.capacity, g + 1))}><Ic.plus s={16} /></button>
            </div>
            <span className="hint">de {table.capacity} máx.</span>
          </div>
        </div>
        <div className="field">
          <label>Mesero <span className="muted">(opcional)</span></label>
          <input className="input" placeholder="Asignar mesero" value={waiter} onChange={(e) => setWaiter(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm({ guests, waiter: waiter.trim() })}>Abrir y tomar orden</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ ORDER EDITOR */
function OrderEditor({ table, onAdd, onQty, onNote, onVoid, onSend, onClose }) {
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [q, setQ] = useState("");
  const [noteFor, setNoteFor] = useState(null);

  const items = MENU.filter((m) => (q.trim() ? m.name.toLowerCase().includes(q.toLowerCase()) : m.cat === cat));
  const counts = {};
  orderItems(table).forEach((it) => { counts[it.prodId] = (counts[it.prodId] || 0) + it.qty; });

  const drafts = draftItems(table);
  const sent = sentItems(table);
  const draftSub = subtotalOf(drafts);
  const liveTotal = computeTotals(subtotalOf(orderItems(table)));

  return (
    <div className="editor">
      <div className="menu-pane">
        <div className="menu-head">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="oh-title" style={{ fontWeight: 680, fontSize: 15 }}>Menú · {RESTAURANT.name}</div>
            <label className="search" style={{ width: 200, height: 36 }}>
              <Ic.search s={15} />
              <input placeholder="Buscar plato…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {!q.trim() && (
            <div className="cat-row">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}>{c.name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="menu-grid">
          {items.map((m) => (
            <button key={m.id} className="mitem" onClick={() => onAdd(m)}>
              {counts[m.id] > 0 && <span className="inorder">{counts[m.id]}</span>}
              <span className="emoji">{m.emoji}</span>
              <span className="mname">{m.name}</span>
              <span className="mprice tnum">{money(m.price)}</span>
            </button>
          ))}
          {items.length === 0 && <div className="hint" style={{ gridColumn: "1/-1", padding: 20 }}>Sin platos para “{q}”.</div>}
        </div>
      </div>

      <div className="order-pane">
        <div className="order-head">
          <div>
            <div className="oh-title">Orden · {table.name}</div>
            <div className="hint">{table.guests} comensales{table.waiter ? " · " + table.waiter : ""}</div>
          </div>
          <button className="iconbtn" onClick={onClose} title="Cerrar editor"><Ic.x s={18} /></button>
        </div>

        <div className="order-list">
          {orderItems(table).length === 0 && (
            <div className="empty" style={{ padding: "40px 16px" }}>
              <div className="e-ic"><Ic.receipt s={26} /></div>
              <h3>Orden vacía</h3>
              <p>Toca un plato del menú para empezar a armar la orden.</p>
            </div>
          )}

          {drafts.length > 0 && (
            <>
              <div className="osec-h"><Ic.edit s={13} /> Por enviar a cocina <span className="tag" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>{drafts.length}</span></div>
              {drafts.map((it) => <OrderLine key={it.id} it={it} draft onQty={onQty} onNote={() => setNoteFor(it)} onVoid={onVoid} />)}
            </>
          )}

          {sent.length > 0 && (
            <>
              <div className="osec-h"><Ic.checkCircle s={13} /> Enviado a cocina</div>
              {sent.map((it) => <OrderLine key={it.id} it={it} onQty={onQty} onNote={() => setNoteFor(it)} onVoid={onVoid} />)}
            </>
          )}
        </div>

        <div className="order-foot">
          {draftItems(table).length > 0 ? (
            <>
              <div className="tot-row"><span>Nuevos ({drafts.length})</span><span className="tnum">{money(draftSub)}</span></div>
              <div className="tot-row grand"><span>Total cuenta</span><span className="tnum">{money(liveTotal.total)}</span></div>
              <button className="btn btn-primary btn-block btn-lg mt8" onClick={onSend}>
                <Ic.send s={18} /> Enviar {drafts.length} a cocina
              </button>
            </>
          ) : (
            <>
              <div className="tot-row"><span>Subtotal</span><span className="tnum">{money(liveTotal.subtotal)}</span></div>
              {RESTAURANT.serviceEnabled && <div className="tot-row"><span>Servicio 10%</span><span className="tnum">{money(liveTotal.service)}</span></div>}
              <div className="tot-row"><span>IVA 15%</span><span className="tnum">{money(liveTotal.iva)}</span></div>
              <div className="tot-row grand"><span>Total cuenta</span><span className="tnum">{money(liveTotal.total)}</span></div>
              <button className="btn btn-block mt8" onClick={onClose}><Ic.check s={17} /> Orden al día</button>
            </>
          )}
        </div>
      </div>

      {noteFor && <NoteModal item={noteFor} onClose={() => setNoteFor(null)} onSave={(n) => { onNote(noteFor.id, n); setNoteFor(null); }} />}
    </div>
  );
}

function OrderLine({ it, draft, onQty, onNote, onVoid }) {
  return (
    <div className={"oline" + (draft ? " draft" : "")}>
      <span className="oemoji">{it.emoji}</span>
      <div className="oline-mid">
        <div className="oline-name">{it.name}</div>
        <div className="oline-note">
          {it.note ? <span onClick={onNote} className="add-note">📝 {it.note}</span> : <span onClick={onNote} className="add-note">+ nota / modificador</span>}
        </div>
      </div>
      <div className="oline-right">
        <span className="oline-amt tnum">{money(lineTotal(it))}</span>
        {draft ? (
          <div className="stepper">
            <button onClick={() => onQty(it.id, -1)}>{it.qty <= 1 ? <Ic.trash s={13} /> : <Ic.minus s={14} />}</button>
            <span className="q tnum">{it.qty}</span>
            <button onClick={() => onQty(it.id, +1)}><Ic.plus s={14} /></button>
          </div>
        ) : (
          <div className="row gap6">
            <span className="tag">×{it.qty}</span>
            <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => onVoid(it)} title="Anular plato"><Ic.trash s={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteModal({ item, onClose, onSave }) {
  const [v, setV] = useState(item.note || "");
  const quick = ["Sin cebolla", "Término medio", "Para llevar", "Sin sal", "Extra picante"];
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-ic brand"><Ic.edit s={22} /></div>
        <h3>Nota · {item.name}</h3>
        <p>Modificadores o indicaciones para cocina.</p>
        <div className="row gap6" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {quick.map((qk) => <button key={qk} className="tag" style={{ cursor: "pointer", padding: "5px 10px" }} onClick={() => setV(qk)}>{qk}</button>)}
        </div>
        <textarea className="input" placeholder="Escribe una nota…" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        <div className="modal-foot" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(v.trim())}>Guardar nota</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ TABLE DRAWER (detail) */
function TableDrawer({ table, tab, setTab, onEdit, onClose, onPay, onSimQR, onCloseTable, onRetry }) {
  const status = deriveStatus(table);
  const bill = billTotals(table);
  const paid = paidTotal(table);
  const remaining = remainingOf(table);
  const sent = sentItems(table);
  const drafts = draftItems(table);
  const fullyPaid = remaining <= 0.001 && bill.total > 0;

  return (
    <div className="drawer show" onClick={(e) => e.stopPropagation()}>
      <div className="dr-head">
        <div className="grow">
          <div className="dr-title">{table.name} <StatusBadge status={status} />{table.live && <Badge tone="success">QR en vivo</Badge>}</div>
          <div className="dr-meta">
            <span><Ic.users s={13} /> {table.guests} comensales</span>
            {table.waiter && <span><Ic.user s={13} /> {table.waiter}</span>}
            {table.openedAt && <span><Ic.clock s={13} /> Abierta {table.openedAt}</span>}
          </div>
        </div>
        <button className="iconbtn" onClick={onClose}><Ic.x s={18} /></button>
      </div>

      <div className="dr-tabs">
        <button className={"dr-tab" + (tab === "orden" ? " on" : "")} onClick={() => setTab("orden")}>
          <Ic.receipt s={15} /> Orden <span className="mini">{sent.length + drafts.length}</span>
        </button>
        <button className={"dr-tab" + (tab === "cuenta" ? " on" : "")} onClick={() => setTab("cuenta")}>
          <Ic.bolt s={15} /> Cuenta
        </button>
        <button className={"dr-tab" + (tab === "pagos" ? " on" : "")} onClick={() => setTab("pagos")}>
          <Ic.card s={15} /> Pagos <span className="mini">{table.payments.length}</span>
        </button>
      </div>

      <div className="dr-body">
        {tab === "orden" && <DrawerOrder table={table} />}
        {tab === "cuenta" && <DrawerBill table={table} />}
        {tab === "pagos" && <DrawerPayments table={table} onRetry={onRetry} />}
      </div>

      <div className="dr-foot">
        {tab === "orden" && (
          <>
            <div className="grow"><div className="hint">Total cuenta</div><div style={{ fontSize: 18, fontWeight: 700 }} className="tnum">{money(bill.total)}</div></div>
            <button className="btn btn-primary" onClick={onEdit}><Ic.plus s={17} /> {sent.length ? "Agregar / editar" : "Tomar orden"}</button>
          </>
        )}
        {tab === "cuenta" && (
          <>
            <div className="grow"><div className="hint">Saldo pendiente</div><div style={{ fontSize: 18, fontWeight: 700, color: fullyPaid ? "var(--success)" : "var(--text)" }} className="tnum">{money(remaining)}</div></div>
            {fullyPaid ? (
              <button className="btn btn-success" onClick={onCloseTable}><Ic.check s={17} /> Cerrar mesa</button>
            ) : (
              <button className="btn btn-primary" disabled={bill.total <= 0} onClick={() => { setTab("pagos"); onPay(); }}><Ic.card s={17} /> Cobrar</button>
            )}
          </>
        )}
        {tab === "pagos" && (
          <>
            <button className="btn btn-ghost" onClick={onSimQR} title="Simular un pago entrante de Mesita">
              <Ic.qr s={16} /> Simular pago QR
            </button>
            <div className="grow" />
            {fullyPaid ? (
              <button className="btn btn-success" onClick={onCloseTable}><Ic.check s={17} /> Cerrar mesa</button>
            ) : (
              <button className="btn btn-primary" disabled={bill.total <= 0} onClick={onPay}><Ic.plus s={16} /> Registrar pago</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DrawerOrder({ table }) {
  const sent = sentItems(table);
  const drafts = draftItems(table);
  if (sent.length === 0 && drafts.length === 0)
    return <div className="empty"><div className="e-ic"><Ic.receipt s={26} /></div><h3>Sin platos todavía</h3><p>Toma la orden para empezar la cuenta de esta mesa.</p></div>;
  return (
    <>
      {drafts.length > 0 && (
        <div className="panel" style={{ background: "var(--primary-soft)", borderColor: "#f5d8c4" }}>
          <div className="panel-h" style={{ color: "var(--primary-dark)" }}>Borrador · sin enviar</div>
          {drafts.map((it) => <div className="bline" key={it.id}><span><span className="q">{it.qty}×</span>{it.emoji} {it.name}{it.note && <span className="muted"> · {it.note}</span>}</span><span className="tnum">{money(lineTotal(it))}</span></div>)}
        </div>
      )}
      <div className="panel">
        <div className="panel-h">Enviado a cocina</div>
        {sent.map((it) => <div className="bline" key={it.id}><span><span className="q">{it.qty}×</span>{it.emoji} {it.name}{it.note && <span className="muted"> · {it.note}</span>}</span><span className="tnum">{money(lineTotal(it))}</span></div>)}
        {sent.length === 0 && <div className="hint">Aún no se ha enviado nada a cocina.</div>}
      </div>
    </>
  );
}

function DrawerBill({ table }) {
  const sent = sentItems(table);
  const bill = billTotals(table);
  const paid = paidTotal(table);
  const remaining = remainingOf(table);
  const fullyPaid = remaining <= 0.001 && bill.total > 0;

  if (bill.total <= 0)
    return <div className="empty"><div className="e-ic"><Ic.bolt s={26} /></div><h3>Cuenta vacía</h3><p>Envía platos a cocina para generar la cuenta.</p></div>;

  return (
    <>
      <div className={"balance" + (fullyPaid ? " done" : "")}>
        <div className="b-lbl">{fullyPaid ? "Cuenta pagada" : "Saldo pendiente"}</div>
        <div className="b-val tnum">{money(fullyPaid ? bill.total : remaining)}</div>
        <div className="b-split"><span>Pagado <b className="tnum">{money(paid)}</b></span><span>Total <b className="tnum">{money(bill.total)}</b></span></div>
      </div>

      <div className="panel">
        <div className="panel-h">Detalle de consumo</div>
        {sent.map((it) => (
          <div className="bline" key={it.id}><span><span className="q tnum">{it.qty}×</span>{it.emoji} {it.name}</span><span className="tnum">{money(lineTotal(it))}</span></div>
        ))}
      </div>

      <div className="panel">
        <div className="bline"><span className="muted">Subtotal</span><span className="tnum">{money(bill.subtotal)}</span></div>
        {RESTAURANT.serviceEnabled && <div className="bline"><span className="muted">Servicio 10%</span><span className="tnum">{money(bill.service)}</span></div>}
        <div className="bline"><span className="muted">IVA 15%</span><span className="tnum">{money(bill.iva)}</span></div>
        <div className="bline" style={{ fontWeight: 700, fontSize: 15 }}><span>Total</span><span className="tnum">{money(bill.total)}</span></div>
      </div>

      <div className="panel qr-card">
        <div className="qr-img"><QR seed={table.id} /></div>
        <div>
          <div style={{ fontWeight: 650, fontSize: 14 }}>QR de la mesa</div>
          <div className="hint mt8">Los comensales escanean para pagar con Mesita — total, por plato o dividido. Los pagos aparecen en la pestaña <b>Pagos</b> en tiempo real.</div>
        </div>
      </div>
    </>
  );
}

function PayRow({ p }) {
  const kind = p.status === "pending" ? "pending" : p.status === "failed" ? "failed" : p.source === "mesita" ? "mesita" : "manual";
  const icon = p.status === "pending" ? <Ic.clock s={18} /> : p.status === "failed" ? <Ic.alert s={18} /> : p.method === "qr" ? <Ic.qr s={18} /> : p.method === "cash" ? <Ic.cash s={18} /> : <Ic.card s={18} />;
  const statusBadge = p.status === "completed"
    ? <Badge tone="success">Completado</Badge>
    : p.status === "pending" ? <Badge tone="warning">Pendiente</Badge> : <Badge tone="error">Fallido</Badge>;
  return (
    <div className="pay-row">
      <div className={"pay-ic " + kind}>{icon}</div>
      <div className="pay-mid">
        <div className="pay-name">{p.payer} {p.source === "mesita" ? <Badge tone="success" dot={false}>Mesita QR</Badge> : <Badge tone="info" dot={false}>En caja</Badge>}</div>
        <div className="pay-sub">{p.note} · {p.at} · <span className="mono">{p.ref}</span></div>
      </div>
      <div className="pay-amt">
        <div className="v tnum" style={p.status !== "completed" ? { color: "var(--muted)" } : null}>{money(p.amount)}</div>
        <div className="t">{statusBadge}</div>
      </div>
    </div>
  );
}

function DrawerPayments({ table, onRetry }) {
  const bill = billTotals(table);
  const paid = paidTotal(table);
  const remaining = remainingOf(table);
  const fullyPaid = remaining <= 0.001 && bill.total > 0;
  const mesita = table.payments.filter((p) => p.source === "mesita" && p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const manual = paid - mesita;
  const failed = table.payments.filter((p) => p.status === "failed");

  return (
    <>
      <div className={"balance" + (fullyPaid ? " done" : "")}>
        <div className="b-lbl">{fullyPaid ? "Totalmente pagada" : "Saldo pendiente"}</div>
        <div className="b-val tnum">{money(fullyPaid ? 0 : remaining)}</div>
        <div className="b-split"><span>Mesita QR <b className="tnum">{money(mesita)}</b></span><span>En caja <b className="tnum">{money(manual)}</b></span><span>Total <b className="tnum">{money(bill.total)}</b></span></div>
      </div>

      {failed.length > 0 && (
        <div className="banner warn"><Ic.alert s={18} /><div className="b-txt"><b>{failed.length} pago con error.</b> Reintenta el cobro o regístralo manualmente.</div></div>
      )}

      <div className="panel">
        <div className="panel-h">Movimientos <span className="muted">{table.payments.length}</span></div>
        {table.payments.length === 0 ? (
          <div className="empty" style={{ padding: "24px 8px" }}><div className="e-ic" style={{ width: 48, height: 48 }}><Ic.card s={22} /></div><h3>Sin pagos aún</h3><p>Comparte el QR o registra un pago en caja.</p></div>
        ) : (
          table.payments.map((p) => <PayRow key={p.id} p={p} />)
        )}
      </div>
    </>
  );
}

/* ============================================================ REGISTER PAYMENT MODAL */
function RegisterPaymentModal({ table, onClose, onConfirm }) {
  const remaining = remainingOf(table);
  const [method, setMethod] = useState("qr");
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const num = parseFloat(amount) || 0;
  const valid = num > 0 && num <= remaining + 0.001;
  const methods = [
    { k: "qr", label: "QR Mesita", ic: <Ic.qr s={20} /> },
    { k: "card", label: "Tarjeta", ic: <Ic.card s={20} /> },
    { k: "cash", label: "Efectivo", ic: <Ic.cash s={20} /> },
  ];
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-ic brand"><Ic.card s={22} /></div>
        <h3>Registrar pago · {table.name}</h3>
        <p>Saldo pendiente <b className="tnum">{money(remaining)}</b>. Registra un cobro o simula un pago entrante por QR.</p>

        <div className="field">
          <label>Método</label>
          <div className="method-grid">
            {methods.map((m) => (
              <div key={m.k} className={"method" + (method === m.k ? " on" : "")} onClick={() => setMethod(m.k)}>{m.ic}{m.label}</div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Monto</label>
          <div className="amt-input"><span className="cur">$</span><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div className="amt-quick">
            <button className="btn btn-sm" onClick={() => setAmount((remaining / 2).toFixed(2))}>Mitad</button>
            <button className="btn btn-sm" onClick={() => setAmount(remaining.toFixed(2))}>Saldo total</button>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onConfirm({ method, amount: round2(num) })}>
            Registrar {money(num)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ CLOSE TABLE MODAL */
function CloseTableModal({ table, onClose, onConfirm }) {
  const bill = billTotals(table);
  const remaining = remainingOf(table);
  const blocked = remaining > 0.001;
  const mesita = table.payments.filter((p) => p.source === "mesita" && p.status === "completed").reduce((s, p) => s + p.amount, 0);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className={"modal-ic " + (blocked ? "danger" : "success")}>{blocked ? <Ic.alert s={22} /> : <Ic.check s={24} />}</div>
        <h3>{blocked ? "No se puede cerrar todavía" : "Cerrar " + table.name}</h3>
        <p>{blocked
          ? <>Queda un saldo de <b className="tnum">{money(remaining)}</b>. Cobra el total antes de cerrar la mesa.</>
          : "La cuenta está pagada al 100%. Al cerrar, la mesa quedará libre para el siguiente servicio."}</p>

        <div className="summary-box">
          <div className="sb-row"><span className="muted">Total cuenta</span><span className="tnum">{money(bill.total)}</span></div>
          <div className="sb-row"><span className="muted">Pagos Mesita QR</span><span className="tnum">{money(mesita)}</span></div>
          <div className="sb-row"><span className="muted">Pagos en caja</span><span className="tnum">{money(paidTotal(table) - mesita)}</span></div>
          <div className="sb-row total"><span>{blocked ? "Pendiente" : "Saldo"}</span><span className="tnum" style={{ color: blocked ? "var(--error)" : "var(--success)" }}>{money(remaining)}</span></div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>{blocked ? "Volver" : "Cancelar"}</button>
          {!blocked && <button className="btn btn-success" onClick={onConfirm}><Ic.check s={17} /> Confirmar cierre</button>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ INTEGRATION VIEW */
function IntegrationView({ tables, apiLog, onRetry, onResync, syncing }) {
  const [open, setOpen] = useState(null);
  const failed = apiLog.filter((e) => e.status >= 500);
  const pending = [];
  tables.forEach((t) => t.payments.forEach((p) => { if (p.status === "pending") pending.push({ t, p }); }));
  const ok = failed.length === 0;

  const codeClass = (c) => (c >= 500 ? "err" : c >= 300 ? "warn" : "ok");

  return (
    <div className="integ">
      <div className="panel">
        <div className="sync-card">
          <div className={"sync-ic " + (ok ? "ok" : "warn")}>{ok ? <Ic.checkCircle s={26} /> : <Ic.alert s={26} />}</div>
          <div className="grow">
            <div className="sync-stat">{ok ? "Sincronizado con Mesita" : "Sincronización con incidencias"}</div>
            <div className="sync-meta">
              Última sincronización {nowLabel()} · {apiLog.length} eventos · {failed.length} con error · {pending.length} pago(s) en proceso
            </div>
          </div>
          <button className="btn" disabled={syncing} onClick={onResync}><Ic.refresh s={16} /> {syncing ? "Sincronizando…" : "Resincronizar"}</button>
        </div>
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 14 }}>
        <div className="panel grow" style={{ margin: 0 }}>
          <div className="hint">Endpoint webhook</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>POST /webhooks/mesita/payment</div>
        </div>
        <div className="panel grow" style={{ margin: 0 }}>
          <div className="hint">Tenant</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>tenant_demo · La Doña Pepa</div>
        </div>
        <div className="panel grow" style={{ margin: 0 }}>
          <div className="hint">Estado del enlace</div>
          <div style={{ marginTop: 6 }}>{ok ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Degradado</Badge>}</div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="banner warn"><Ic.clock s={18} /><div className="b-txt"><b>{pending.length} pago(s) en proceso.</b> Esperando confirmación de la pasarela vía webhook de Mesita.</div></div>
      )}

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="panel-h" style={{ padding: "14px 16px", margin: 0, borderBottom: "1px solid var(--border)" }}>Registro de API · Mesita ⇄ POS</div>
        <table className="log-table">
          <thead><tr><th>Hora</th><th>Dir.</th><th>Petición</th><th>Mesa</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {apiLog.map((e) => (
              <React.Fragment key={e.id}>
                <tr className="log-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <td className="mono">{e.at}</td>
                  <td><span className={"dir-pill " + (e.dir === "in" ? "dir-in" : "dir-out")}>{e.dir === "in" ? "IN" : "OUT"}</span></td>
                  <td className="mono"><b>{e.method}</b> {e.path}</td>
                  <td>{e.table}</td>
                  <td><span className={"code-status " + codeClass(e.status)}>{e.status}</span></td>
                  <td style={{ textAlign: "right" }}>
                    {e.status >= 500
                      ? <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); onRetry(e.id); }}><Ic.refresh s={13} /> Reintentar</button>
                      : <Ic.chevD s={16} />}
                  </td>
                </tr>
                {open === e.id && (
                  <tr><td colSpan={6} style={{ background: "var(--muted-surface)" }}>
                    <div className="hint">Cuerpo {e.dir === "in" ? "recibido" : "enviado"}:</div>
                    <pre className="body-pre">{e.body}</pre>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hint mt14">Esta vista es solo para pruebas de integración. El equipo de servicio no la necesita para operar el salón.</div>
    </div>
  );
}

/* ============================================================ TOASTS */
function Toasts({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind || "success")}>
          <span className="t-ic">{t.kind === "error" ? <Ic.alert s={17} /> : <Ic.checkCircle s={17} />}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ============================================================ PREVIEW RAIL */
function PreviewRail({ appState, setAppState }) {
  const opts = [
    { k: "ready", label: "En vivo" },
    { k: "loading", label: "Cargando" },
    { k: "error", label: "Error" },
  ];
  return (
    <div className="rail">
      <span className="rlabel">Vista previa</span>
      {opts.map((o) => (
        <button key={o.k} className={appState === o.k ? "on" : ""} onClick={() => setAppState(o.k)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ============================================================ APP */
function App() {
  const [tables, setTables] = useState(() => JSON.parse(JSON.stringify(SEED_TABLES)));
  const [apiLog, setApiLog] = useState(() => JSON.parse(JSON.stringify(SEED_API_LOG)));
  const [view, setView] = useState("floor");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [zone, setZone] = useState("Todas");

  const [selId, setSelId] = useState(null);
  const [drawerTab, setDrawerTab] = useState("orden");
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState(null); // {type:'open'|'pay'|'close', table}
  const [toasts, setToasts] = useState([]);
  const [appState, setAppState] = useState("ready");
  const [syncing, setSyncing] = useState(false);

  const sel = tables.find((t) => t.id === selId) || null;

  const toast = useCallback((msg, kind) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800);
  }, []);

  const patch = (id, fn) => setTables((ts) => ts.map((t) => (t.id === id ? fn({ ...t, items: [...t.items], payments: [...t.payments] }) : t)));
  const logEvent = (ev) => setApiLog((l) => [{ id: "ev-" + Date.now(), ...ev }, ...l]);
  const nowFull = () => new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* ---- table open / select ---- */
  const onOpenCard = (table) => {
    if (deriveStatus(table) === "available") setModal({ type: "open", table });
    else { setSelId(table.id); setDrawerTab(deriveStatus(table) === "occupied" ? "orden" : "cuenta"); setEditing(false); }
  };
  const confirmOpen = ({ guests, waiter }) => {
    const id = modal.table.id;
    patch(id, (t) => { t.openedAt = nowLabel(); t.guests = guests; t.waiter = waiter || null; t.forcedStatus = null; return t; });
    setModal(null); setSelId(id); setDrawerTab("orden"); setEditing(true);
    toast(modal.table.name + " abierta");
  };
  const closeDrawer = () => { setSelId(null); setEditing(false); };

  /* ---- order mutations ---- */
  const addItem = (prod) => patch(sel.id, (t) => {
    const ex = t.items.find((i) => i.prodId === prod.id && i.status === "draft" && !i.note);
    if (ex) t.items = t.items.map((i) => (i === ex ? { ...i, qty: i.qty + 1 } : i));
    else t.items = [...t.items, mkItem(prod.id, 1, "draft")];
    return t;
  });
  const changeQty = (itemId, d) => patch(sel.id, (t) => {
    t.items = t.items.map((i) => (i.id === itemId ? { ...i, qty: i.qty + d } : i)).filter((i) => i.qty > 0);
    return t;
  });
  const setNote = (itemId, note) => patch(sel.id, (t) => { t.items = t.items.map((i) => (i.id === itemId ? { ...i, note } : i)); return t; });
  const voidItem = (it) => { if (confirm(`¿Anular ${it.qty}× ${it.name}? Esta acción quita el plato de la cuenta.`)) { patch(sel.id, (t) => { t.items = t.items.filter((i) => i.id !== it.id); return t; }); toast(it.name + " anulado"); } };
  const sendOrder = () => {
    const n = draftItems(sel).length;
    patch(sel.id, (t) => { t.items = t.items.map((i) => (i.status === "draft" ? { ...i, status: "sent" } : i)); return t; });
    logEvent({ dir: "out", at: nowFull(), method: "PUT", path: "/pos/tables/" + sel.id + "/bill", status: 200, table: sel.id, body: '{ "open": true, "synced": true }' });
    toast(n + " plato(s) enviados a cocina");
  };

  /* ---- payments ---- */
  const confirmPayment = ({ method, amount }) => {
    const t = sel;
    patch(t.id, (tb) => {
      tb.payments = [...tb.payments, {
        id: newPaymentId(), amount, method,
        source: method === "qr" ? "mesita" : "manual",
        status: "completed", payer: method === "qr" ? "Invitado QR" : RESTAURANT.register,
        at: nowLabel(), ref: method === "qr" ? makeRef() : "POS-" + Math.floor(70000 + Math.random() * 9999),
        note: method === "qr" ? "Pago por QR de Mesita" : "Registrado en caja",
      }];
      return tb;
    });
    if (method === "qr") logEvent({ dir: "in", at: nowFull(), method: "POST", path: "/webhooks/mesita/payment", status: 200, table: t.id, body: '{ "amount": ' + amount.toFixed(2) + ', "status": "completed", "source": "qr" }' });
    setModal(null); toast("Pago de " + money(amount) + " registrado");
  };
  const simQR = () => {
    const rem = remainingOf(sel);
    if (rem <= 0) { toast("La cuenta ya está pagada"); return; }
    const amount = round2(Math.min(rem, Math.max(rem / 2, 8)));
    confirmPayment({ method: "qr", amount });
  };

  /* ---- close ---- */
  const confirmClose = () => {
    const name = sel.name;
    patch(sel.id, (t) => { t.items = []; t.payments = []; t.guests = 0; t.waiter = null; t.openedAt = null; t.forcedStatus = "available"; t.live = false; return t; });
    logEvent({ dir: "out", at: nowFull(), method: "POST", path: "/pos/tables/" + sel.id + "/close", status: 200, table: sel.id, body: '{ "closed": true, "paid": true }' });
    setModal(null); closeDrawer(); toast(name + " cerrada · lista para el siguiente servicio");
  };

  /* ---- integration ---- */
  const retryEvent = (id) => {
    setApiLog((l) => l.map((e) => (e.id === id ? { ...e, status: 200, at: nowFull(), body: '{ "retried": true, "status": "ok" }' } : e)));
    toast("Evento reenviado · 200 OK");
  };
  const resync = () => { setSyncing(true); setTimeout(() => { setSyncing(false); toast("Resincronizado con Mesita"); }, 1100); };

  const attention = tables.reduce((n, t) => n + t.payments.filter((p) => p.status === "failed" || p.status === "pending").length, 0)
    + apiLog.filter((e) => e.status >= 500).length;

  const titles = { floor: "Salón", integration: "Integración Mesita" };
  const crumbs = { floor: RESTAURANT.name + " · " + RESTAURANT.shift, integration: "Pruebas de API y sincronización" };

  return (
    <div className="pos">
      <Sidebar view={view} setView={setView} attention={attention} />

      <div className="main">
        <Topbar
          title={titles[view]} crumb={crumbs[view]}
          query={view === "floor" ? query : null} setQuery={view === "floor" ? setQuery : null}
          live={appState === "ready"}>
          {view === "floor" && appState === "ready" && (
            <button className="btn btn-primary" onClick={() => {
              const free = tables.find((t) => deriveStatus(t) === "available");
              if (free) setModal({ type: "open", table: free }); else toast("No hay mesas libres", "error");
            }}><Ic.plus s={18} /> Nueva orden</button>
          )}
        </Topbar>

        <div className="scroll">
          {view === "floor"
            ? <FloorView tables={tables} query={query} filter={filter} setFilter={setFilter} zone={zone} setZone={setZone} onOpen={onOpenCard} appState={appState} onReload={() => setAppState("ready")} />
            : <IntegrationView tables={tables} apiLog={apiLog} onRetry={retryEvent} onResync={resync} syncing={syncing} />}
        </div>
      </div>

      {/* table drawer */}
      <div className={"scrim" + (sel ? " show" : "")} onClick={closeDrawer} />
      {sel && (
        editing ? (
          <div className="drawer wide show" onClick={(e) => e.stopPropagation()}>
            <div className="dr-head">
              <button className="iconbtn" onClick={() => setEditing(false)} title="Volver al detalle"><Ic.chevL s={18} /></button>
              <div className="grow"><div className="dr-title">{sel.name} · Tomar orden</div><div className="dr-meta"><span>{sel.zone}</span><span><Ic.users s={13} /> {sel.guests}</span></div></div>
              <button className="iconbtn" onClick={closeDrawer}><Ic.x s={18} /></button>
            </div>
            <OrderEditor table={sel} onAdd={addItem} onQty={changeQty} onNote={setNote} onVoid={voidItem} onSend={sendOrder} onClose={() => setEditing(false)} />
          </div>
        ) : (
          <TableDrawer
            table={sel} tab={drawerTab} setTab={setDrawerTab}
            onEdit={() => setEditing(true)} onClose={closeDrawer}
            onPay={() => setModal({ type: "pay", table: sel })}
            onSimQR={simQR}
            onCloseTable={() => setModal({ type: "close", table: sel })}
            onRetry={retryEvent}
          />
        )
      )}

      {modal && modal.type === "open" && <OpenTableModal table={modal.table} onClose={() => setModal(null)} onConfirm={confirmOpen} />}
      {modal && modal.type === "pay" && <RegisterPaymentModal table={sel} onClose={() => setModal(null)} onConfirm={confirmPayment} />}
      {modal && modal.type === "close" && <CloseTableModal table={sel} onClose={() => setModal(null)} onConfirm={confirmClose} />}

      <Toasts toasts={toasts} />
      <PreviewRail appState={appState} setAppState={setAppState} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
