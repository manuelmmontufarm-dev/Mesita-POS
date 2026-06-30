/* ============================================================
   Mesita POS — Floor / Mapa de Mesas
   ============================================================ */

function Floor({ onOpen }) {
  const store = useStore();
  const mesas = store.state.mesas;

  const groups = {};
  for (const m of mesas) { (groups[m.zona] = groups[m.zona] || []).push(m); }
  const zones = Object.keys(groups).sort((a, b) => {
    const ia = ZONE_ORDER.indexOf(a), ib = ZONE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const libres = mesas.filter((m) => m.estado === "L").length;
  const activas = mesas.length - libres;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mapa de mesas</h1>
          <p>{activas} {activas === 1 ? "mesa activa" : "mesas activas"} · {libres} {libres === 1 ? "libre" : "libres"} · toca una mesa para tomar o cobrar su orden.</p>
        </div>
        <div className="legend">
          {["L", "O", "P", "C"].map((c) => (
            <span key={c} className={"badge " + c}><span className="d" />{ESTADO_MESA[c]}</span>
          ))}
        </div>
      </div>

      {zones.map((z) => (
        <div className="zone" key={z}>
          <div className="zone-h">
            <span className="nm">{z}</span>
            <span className="ct">{groups[z].length}</span>
            <span className="ln" />
          </div>
          <div className="tables">
            {groups[z].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true })).map((m) => (
              <TableCard key={m.id} mesa={m} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableCard({ mesa, onOpen }) {
  const estado = mesa.paidFlash ? "C" : mesa.estado;
  const total = mesa.orden ? computeTotals(mesa.orden, Store.state.serviceEnabled).total : 0;
  const count = ordenCount(mesa.orden);
  const cov = mesa.coverage;

  return (
    <button
      className={"tcard is-" + estado + (mesa.paidFlash ? " is-paid turning" : "")}
      onClick={() => { if (!mesa.paidFlash) onOpen(mesa.id); }}
    >
      <span className={"badge " + estado}><span className="d" />{ESTADO_MESA[estado]}</span>
      <div className="tnm">
        {mesa.nombre}
        {mesa.demo && <span style={{ marginLeft: 7, fontSize: ".62rem", fontWeight: 700, background: "var(--brand)", color: "#fff", padding: "2px 7px", borderRadius: 6, verticalAlign: "middle" }}>DEMO</span>}
      </div>
      <div className="tmeta">
        <Icon name="users" size={14} />
        {mesa.orden && mesa.orden.comensales > 0 ? `${mesa.orden.comensales} / ${mesa.cap} personas` : `Capacidad ${mesa.cap}`}
      </div>

      <div className="tfoot">
        {mesa.paidFlash ? (
          <div className="ttotal" style={{ color: "var(--ok)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={18} /> Pagada
          </div>
        ) : mesa.orden ? (
          <>
            <div className="ttotal tnum">{money(total)}</div>
            <div className="thint">{count} {count === 1 ? "ítem" : "ítems"} en precuenta</div>
            {cov && (
              <div className="tprog"><i style={{ width: Math.min(100, cov.pct) + "%" }} /></div>
            )}
          </>
        ) : (
          <div className="thint">Toca para abrir orden</div>
        )}
      </div>
    </button>
  );
}

window.Floor = Floor;
