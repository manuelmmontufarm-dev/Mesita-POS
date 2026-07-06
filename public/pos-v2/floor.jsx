/* ============================================================
   Mesita POS — Floor / Mapa de Mesas
   ============================================================ */

function Floor({ onOpen }) {
  const store = useStore();
  const mesas = store.state.mesas;
  const [showCreate, setShowCreate] = React.useState(false);
  const [name, setName] = React.useState("");
  const [capacity, setCapacity] = React.useState("4");
  const [zone, setZone] = React.useState("Salón");
  const [saving, setSaving] = React.useState(false);

  async function createTable(event) {
    event.preventDefault();
    const nombre = name.trim();
    if (!nombre || saving) return;
    setSaving(true);
    try {
      await store.createTable({
        nombre,
        capacidad: Math.max(1, Math.min(30, Number(capacity) || 4)),
        ubicacion: zone.trim() || "General",
      });
      toast(`${nombre} añadida al mapa`, "ok", "✓");
      setName("");
      setCapacity("4");
      setZone("Salón");
      setShowCreate(false);
    } catch (error) {
      toast(error?.message || "No se pudo añadir la mesa", "err", "!");
    } finally {
      setSaving(false);
    }
  }

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
        <div className="page-head-top">
          <div>
            <h1>Mapa de mesas</h1>
            <p>{activas} {activas === 1 ? "mesa activa" : "mesas activas"} · {libres} {libres === 1 ? "libre" : "libres"} · toca una mesa para tomar o cobrar su orden.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary add-table-btn"
            data-testid="add-table-btn"
            onClick={() => setShowCreate(true)}
          >
            <Icon name="plus" size={16} /> Añadir mesa
          </button>
        </div>
        <div className="legend">
          {["L", "O", "P", "C"].map((c) => (
            <span key={c} className={"badge " + c}><span className="d" />{ESTADO_MESA[c]}</span>
          ))}
        </div>
      </div>

      {showCreate && (
        <Modal
          title="Añadir mesa"
          sub="Crea una mesa nueva y agrégala de inmediato al mapa del POS."
          onClose={() => !saving && setShowCreate(false)}
          footer={(
            <>
              <button className="btn btn-outline" disabled={saving} onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-primary" form="create-table-form" type="submit" disabled={saving || !name.trim()}>
                {saving ? "Añadiendo…" : "Añadir mesa"}
              </button>
            </>
          )}
        >
          <form id="create-table-form" className="create-table-form" onSubmit={createTable}>
            <div className="field full">
              <label htmlFor="new-table-name">Nombre</label>
              <input
                id="new-table-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Mesa 13"
                maxLength={80}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-table-capacity">Capacidad</label>
              <input
                id="new-table-capacity"
                type="number"
                min="1"
                max="30"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-table-zone">Zona</label>
              <input
                id="new-table-zone"
                value={zone}
                onChange={(event) => setZone(event.target.value)}
                placeholder="Salón, Terraza…"
                maxLength={80}
              />
            </div>
          </form>
        </Modal>
      )}

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
