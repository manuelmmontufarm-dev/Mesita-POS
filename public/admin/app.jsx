/* ============================================================
   Mesita Admin — panel de plataforma (super-admin)
   Reutiliza pos-v2/pos.css + ui.jsx (Icon, Modal, toast…)
   ============================================================ */

function StatusPill({ status }) {
  const s = REST_STATUS[status] || REST_STATUS.PENDING;
  return <span className={"status-pill " + s.tone}>{s.label}</span>;
}

function AdminApp() {
  const [route, setRoute] = React.useState("overview");
  const [restaurants, setRestaurants] = React.useState(() => JSON.parse(JSON.stringify(SEED_RESTAURANTS)));
  const [users, setUsers] = React.useState(() => JSON.parse(JSON.stringify(SEED_USERS)));
  const [detail, setDetail] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [statusF, setStatusF] = React.useState("ALL");

  const stats = React.useMemo(() => platformStats(restaurants), [restaurants]);
  const pending = restaurants.filter((r) => r.status === "PENDING");

  const patchRest = (id, fn) => setRestaurants((rs) => rs.map((r) => (r.id === id ? fn({ ...r }) : r)));
  const approve = (id) => {
    patchRest(id, (r) => { r.status = "ACTIVE"; r.activatedAt = todayStr(); return r; });
    toast("Restaurante activado — ya puede usar el dashboard", "ok");
    if (detail && detail.id === id) setDetail((d) => ({ ...d, status: "ACTIVE", activatedAt: todayStr() }));
  };
  const suspend = (id) => {
    patchRest(id, (r) => { r.status = "SUSPENDED"; return r; });
    toast("Restaurante suspendido", "bad");
    if (detail && detail.id === id) setDetail((d) => ({ ...d, status: "SUSPENDED" }));
  };
  const reject = (id) => {
    setRestaurants((rs) => rs.filter((r) => r.id !== id));
    setUsers((us) => us.filter((u) => u.restaurantId !== id));
    toast("Solicitud rechazada y eliminada", "bad");
    if (detail && detail.id === id) setDetail(null);
  };
  const createRest = (payload) => {
    const id = "r-" + Date.now();
    const row = {
      id, name: payload.name, slug: payload.slug || slugify(payload.name),
      status: payload.activate ? "ACTIVE" : "PENDING",
      city: payload.city || "—", ruc: payload.ruc || null,
      invoiceMode: "DISABLED", posProvider: null,
      owner: { name: payload.ownerName, email: payload.ownerEmail, phone: payload.phone || "" },
      registeredAt: todayStr(), activatedAt: payload.activate ? todayStr() : null,
      tables: 0, users: 1, openBills: 0,
      volumeMonth: 0, volumeTotal: 0, paymentsMonth: 0, paymentsTotal: 0,
      lastActivity: new Date().toLocaleString("es-EC", { hour: "2-digit", minute: "2-digit" }),
      note: payload.activate ? "Creado por admin" : "Creado por admin — pendiente",
    };
    setRestaurants((rs) => [row, ...rs]);
    setUsers((us) => [...us, {
      id: "u-" + Date.now(), name: payload.ownerName, email: payload.ownerEmail,
      role: "OWNER", restaurantId: id, restaurant: payload.name,
      lastLogin: "—",
    }]);
    setCreateOpen(false);
    toast(payload.activate ? "Restaurante creado y activado" : "Restaurante creado (pendiente)", "ok");
  };

  const nav = [
    { id: "overview", label: "Resumen", icon: "grid" },
    { id: "pending", label: "Solicitudes", icon: "bolt", cnt: pending.length },
    { id: "restaurants", label: "Restaurantes", icon: "receipt" },
    { id: "volume", label: "Volumen Mesita", icon: "card" },
    { id: "users", label: "Cuentas", icon: "users" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" style={{ background: "var(--ink)" }}><Icon name="bolt" size={20} /></span>
          <span className="brand-name">Mesita Admin<small>Plataforma · Super admin</small></span>
        </div>
        <nav className="topnav">
          {nav.map((n) => (
            <a key={n.id} className={route === n.id ? "on" : ""} onClick={() => setRoute(n.id)} href="#">
              <Icon name={n.icon} size={17} /><span>{n.label}</span>
              {n.cnt > 0 && <span className="cnt">{n.cnt}</span>}
            </a>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> Nuevo restaurante
        </button>
      </header>

      <main className="main">
        {route === "overview" && (
          <Overview stats={stats} pending={pending} restaurants={restaurants}
            onApprove={approve} onOpen={setDetail} onGoPending={() => setRoute("pending")} />
        )}
        {route === "pending" && (
          <PendingView pending={pending} onApprove={approve} onReject={reject} onOpen={setDetail} />
        )}
        {route === "restaurants" && (
          <RestaurantsView restaurants={restaurants} q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF}
            onOpen={setDetail} onApprove={approve} onSuspend={suspend} />
        )}
        {route === "volume" && <VolumeView stats={stats} restaurants={restaurants} />}
        {route === "users" && <UsersView users={users} q={q} setQ={setQ} />}
      </main>

      {detail && (
        <RestaurantModal rest={detail} onClose={() => setDetail(null)}
          onApprove={() => approve(detail.id)} onSuspend={() => suspend(detail.id)} onReject={() => reject(detail.id)} />
      )}
      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreate={createRest} />}
      <ToastHost />
    </div>
  );
}

/* ---------- Resumen ---------- */
function Overview({ stats, pending, restaurants, onApprove, onOpen, onGoPending }) {
  const recent = [...restaurants].sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || "")).slice(0, 5);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Resumen de plataforma</h1>
          <p>Volumen procesado por Mesita QR, restaurantes activos y solicitudes pendientes de aprobación.</p>
        </div>
      </div>

      <div className="kpi4">
        <div className="sbox"><div className="l">Restaurantes activos</div><div className="v tnum">{stats.active}</div></div>
        <div className={"sbox" + (stats.pending ? " saldo" : "")}>
          <div className="l">Pendientes de aprobar</div>
          <div className="v tnum">{stats.pending}</div>
        </div>
        <div className="sbox highlight"><div className="l">Volumen Mesita · junio</div><div className="v tnum">{money(stats.volumeMonth)}</div></div>
        <div className="sbox"><div className="l">Pagos QR · junio</div><div className="v tnum">{stats.paymentsMonth}</div></div>
      </div>

      <div className="admin-split">
        <section>
          <div className="zone-h" style={{ marginBottom: 12 }}>
            <span className="nm">Solicitudes nuevas</span>
            {pending.length > 0 && <span className="ct">{pending.length}</span>}
            <span className="ln" />
            {pending.length > 3 && <button className="btn btn-ghost btn-sm" onClick={onGoPending}>Ver todas</button>}
          </div>
          {pending.length === 0 ? (
            <div className="empty" style={{ padding: "32px 16px" }}>
              <div className="be">✓</div>
              <div className="bh">Sin solicitudes pendientes</div>
              <p style={{ marginTop: 6, fontSize: ".88rem" }}>Los nuevos registros desde /register aparecerán aquí.</p>
            </div>
          ) : (
            <div className="pending-list">
              {pending.slice(0, 3).map((r) => (
                <PendingCard key={r.id} rest={r} onApprove={() => onApprove(r.id)} onOpen={() => onOpen(r)} compact />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="zone-h" style={{ marginBottom: 12 }}>
            <span className="nm">Actividad reciente</span><span className="ln" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {RECENT_EVENTS.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)", fontSize: ".88rem" }}>
                <span style={{ fontSize: ".75rem", fontWeight: 700, color: "var(--ink-mut)", flex: "0 0 auto", minWidth: 42 }}>{e.at}</span>
                <span style={{ color: e.tone === "warn" ? "#B97A14" : "var(--ink)" }}>{e.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="zone-h" style={{ marginTop: 28, marginBottom: 12 }}>
        <span className="nm">Restaurantes</span><span className="ct">{restaurants.length}</span><span className="ln" />
      </div>
      <table className="htable">
        <thead><tr>
          <th>Restaurante</th><th>Ciudad</th><th>Estado</th><th className="r">Vol. mes</th><th className="r">Pagos mes</th>
        </tr></thead>
        <tbody>
          {recent.map((r) => (
            <tr key={r.id} className="lnk" onClick={() => onOpen(r)}>
              <td><strong>{r.name}</strong><div style={{ fontSize: ".78rem", color: "var(--ink-mut)" }}>{r.slug}</div></td>
              <td>{r.city}</td>
              <td><StatusPill status={r.status} /></td>
              <td className="r tnum">{money(r.volumeMonth)}</td>
              <td className="r tnum">{r.paymentsMonth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingCard({ rest, onApprove, onReject, onOpen, compact }) {
  return (
    <div className="pending-card">
      <div className="pc-main">
        <div className="pc-name">{rest.name}</div>
        <div className="pc-meta">
          {rest.owner.name} · {rest.owner.email}
          {rest.city && <> · {rest.city}</>}
          {rest.note && <> · <em>{rest.note}</em></>}
        </div>
        <div className="pc-meta">Registrado {rest.registeredAt}</div>
      </div>
      <div className="pc-actions">
        {!compact && <button className="btn btn-outline btn-sm" onClick={onOpen}>Ver detalle</button>}
        {onReject && <button className="btn btn-danger-soft btn-sm" onClick={onReject}>Rechazar</button>}
        <button className="btn btn-ok btn-sm" onClick={onApprove}><Icon name="check" size={15} /> Aprobar</button>
      </div>
    </div>
  );
}

/* ---------- Solicitudes ---------- */
function PendingView({ pending, onApprove, onReject, onOpen }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Solicitudes de registro</h1>
          <p>Dueños que se registraron en el dashboard y esperan que Mesita active su restaurante.</p>
        </div>
        <StatusPill status="PENDING" />
      </div>
      {pending.length === 0 ? (
        <div className="empty"><div className="be">📭</div><div className="bh">No hay solicitudes</div></div>
      ) : (
        <div className="pending-list">
          {pending.map((r) => (
            <PendingCard key={r.id} rest={r}
              onApprove={() => onApprove(r.id)} onReject={() => onReject(r.id)} onOpen={() => onOpen(r)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Restaurantes ---------- */
function RestaurantsView({ restaurants, q, setQ, statusF, setStatusF, onOpen, onApprove, onSuspend }) {
  const filtered = restaurants.filter((r) => {
    if (statusF !== "ALL" && r.status !== statusF) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return r.name.toLowerCase().includes(s) || r.slug.includes(s) || r.owner.email.toLowerCase().includes(s) || (r.city || "").toLowerCase().includes(s);
  });
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Restaurantes</h1><p>{filtered.length} de {restaurants.length} en la plataforma.</p></div>
      </div>
      <div className="hist-toolbar">
        <div className="grow">
          <span className="si"><Icon name="search" size={17} /></span>
          <input placeholder="Buscar nombre, slug, email o ciudad…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="ALL">Todos los estados</option>
          <option value="ACTIVE">Activos</option>
          <option value="PENDING">Pendientes</option>
          <option value="SUSPENDED">Suspendidos</option>
        </select>
      </div>
      <table className="htable">
        <thead><tr>
          <th>Restaurante</th><th>Dueño</th><th>Estado</th><th>Modo factura</th><th className="r">Mesas</th><th className="r">Vol. mes</th><th></th>
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                <div style={{ fontSize: ".78rem", color: "var(--ink-mut)" }}>{r.slug} · {r.city}</div>
              </td>
              <td style={{ fontSize: ".88rem" }}>{r.owner.name}<div style={{ color: "var(--ink-mut)", fontSize: ".78rem" }}>{r.owner.email}</div></td>
              <td><StatusPill status={r.status} /></td>
              <td><span className="pill-doc">{r.invoiceMode}</span></td>
              <td className="r tnum">{r.tables}</td>
              <td className="r tnum">{money(r.volumeMonth)}</td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onOpen(r)}>Detalle</button>
                {r.status === "PENDING" && <button className="btn btn-ok btn-sm" onClick={() => onApprove(r.id)}>Aprobar</button>}
                {r.status === "ACTIVE" && <button className="btn btn-danger-soft btn-sm" onClick={() => onSuspend(r.id)}>Suspender</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Volumen ---------- */
function VolumeView({ stats, restaurants }) {
  const maxV = Math.max(...MONTHLY_PLATFORM.map((m) => m.volume));
  const top = [...restaurants].filter((r) => r.status === "ACTIVE").sort((a, b) => b.volumeMonth - a.volumeMonth);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Volumen Mesita</h1>
          <p>Dinero procesado vía pagos QR de Mesita (no incluye cobros manuales en caja del POS).</p>
        </div>
      </div>

      <div className="sum3" style={{ marginBottom: 24 }}>
        <div className="sbox highlight"><div className="l">Este mes (plataforma)</div><div className="v tnum">{money(stats.volumeMonth)}</div></div>
        <div className="sbox"><div className="l">Histórico total</div><div className="v tnum">{money(stats.volumeTotal)}</div></div>
        <div className="sbox"><div className="l">Pagos QR · junio</div><div className="v tnum">{stats.paymentsMonth}</div></div>
      </div>

      <div className="zone-h" style={{ marginBottom: 10 }}><span className="nm">Volumen mensual · 2026</span><span className="ln" /></div>
      <div className="bar-chart">
        {MONTHLY_PLATFORM.map((m, i) => (
          <div key={m.month} className="bar-col">
            <div className="bar-val tnum">{money(m.volume)}</div>
            <div className={"bar on"} style={{ height: Math.max(8, (m.volume / maxV) * 100) + "%" }} title={m.payments + " pagos"} />
            <div className="bar-lbl">{m.month}</div>
          </div>
        ))}
      </div>

      <div className="zone-h" style={{ marginTop: 28, marginBottom: 12 }}>
        <span className="nm">Por restaurante · junio</span><span className="ln" />
      </div>
      <table className="htable">
        <thead><tr><th>Restaurante</th><th className="r">Volumen mes</th><th className="r">Pagos</th><th className="r">Ticket prom.</th><th className="r">Total histórico</th></tr></thead>
        <tbody>
          {top.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong></td>
              <td className="r tnum">{money(r.volumeMonth)}</td>
              <td className="r tnum">{r.paymentsMonth}</td>
              <td className="r tnum">{r.paymentsMonth ? money(r.volumeMonth / r.paymentsMonth) : "—"}</td>
              <td className="r tnum">{money(r.volumeTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Cuentas ---------- */
function UsersView({ users, q, setQ }) {
  const filtered = users.filter((u) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.restaurant.toLowerCase().includes(s);
  });
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Cuentas de usuario</h1><p>{filtered.length} usuarios en restaurantes de la plataforma.</p></div>
      </div>
      <div className="hist-toolbar">
        <div className="grow">
          <span className="si"><Icon name="search" size={17} /></span>
          <input placeholder="Buscar nombre, email o restaurante…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <table className="htable">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Restaurante</th><th>Último acceso</th></tr></thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong><div style={{ fontSize: ".78rem", color: "var(--ink-mut)" }}>{u.email}</div></td>
              <td><span className="pill-doc">{ROLES[u.role] || u.role}</span></td>
              <td>{u.restaurant}</td>
              <td style={{ color: "var(--ink-mut)", fontSize: ".88rem" }}>{u.lastLogin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Modal detalle ---------- */
function RestaurantModal({ rest, onClose, onApprove, onSuspend, onReject }) {
  const st = REST_STATUS[rest.status];
  return (
    <Modal title={rest.name} sub={rest.slug + " · " + rest.city} onClose={onClose} size="lg"
      footer={
        <>
          {rest.status === "PENDING" && (
            <>
              <button className="btn btn-danger-soft" onClick={onReject}>Rechazar</button>
              <button className="btn btn-ok" onClick={onApprove}><Icon name="check" size={16} /> Aprobar y activar</button>
            </>
          )}
          {rest.status === "ACTIVE" && (
            <button className="btn btn-danger-soft" onClick={onSuspend}>Suspender</button>
          )}
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </>
      }>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <StatusPill status={rest.status} />
        <span style={{ fontSize: ".82rem", color: "var(--ink-mut)" }}>{st.hint}</span>
      </div>

      <div className="sum3">
        <div className="sbox"><div className="l">Volumen · mes</div><div className="v tnum">{money(rest.volumeMonth)}</div></div>
        <div className="sbox"><div className="l">Pagos QR · mes</div><div className="v tnum">{rest.paymentsMonth}</div></div>
        <div className="sbox"><div className="l">Mesas / usuarios</div><div className="v tnum">{rest.tables} / {rest.users}</div></div>
      </div>

      <div className="fgrid" style={{ marginTop: 16 }}>
        <div className="field"><label>Dueño</label><div style={{ fontWeight: 600 }}>{rest.owner.name}</div><div style={{ fontSize: ".85rem", color: "var(--ink-mut)" }}>{rest.owner.email}</div></div>
        <div className="field"><label>Teléfono</label><div>{rest.owner.phone || "—"}</div></div>
        <div className="field"><label>RUC</label><div className="tnum">{rest.ruc || "—"}</div></div>
        <div className="field"><label>Integración POS</label><div>{rest.invoiceMode}{rest.posProvider ? " · " + rest.posProvider : ""}</div></div>
        <div className="field"><label>Registrado</label><div>{rest.registeredAt}</div></div>
        <div className="field"><label>Activado</label><div>{rest.activatedAt || "—"}</div></div>
        <div className="field full"><label>Dashboard dueño</label>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: ".85rem", color: "var(--brand-dark)" }}>
            /dashboard/owner/panel · tenant {rest.slug}
          </div>
        </div>
        {rest.note && <div className="field full"><label>Nota</label><div style={{ fontSize: ".9rem", color: "var(--ink-mut)" }}>{rest.note}</div></div>}
      </div>
    </Modal>
  );
}

/* ---------- Crear restaurante ---------- */
function CreateModal({ onClose, onCreate }) {
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [ruc, setRuc] = React.useState("");
  const [activate, setActivate] = React.useState(false);
  const ok = name.trim() && ownerName.trim() && ownerEmail.includes("@");

  return (
    <Modal title="Nuevo restaurante" sub="Crear tenant manualmente o dejar pendiente para revisión." onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!ok} onClick={() => onCreate({ name: name.trim(), city, ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim(), phone, ruc, activate })}>
            {activate ? "Crear y activar" : "Crear (pendiente)"}
          </button>
        </>
      }>
      <div className="fgrid">
        <div className="field full"><label>Nombre del restaurante</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. La Parrilla del Centro" /></div>
        <div className="field"><label>Ciudad</label><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Quito" /></div>
        <div className="field"><label>RUC (opcional)</label><input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="1790…" /></div>
        <div className="field"><label>Nombre del dueño</label><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} /></div>
        <div className="field"><label>Email del dueño</label><input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} /></div>
        <div className="field"><label>Teléfono</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="choice" style={{ marginTop: 16 }}>
        <button type="button" className={!activate ? "on" : ""} onClick={() => setActivate(false)}>
          <div className="ct">Pendiente</div><div className="cs">El dueño no puede operar hasta aprobar</div>
        </button>
        <button type="button" className={activate ? "on" : ""} onClick={() => setActivate(true)}>
          <div className="ct">Activar ya</div><div className="cs">Listo para dashboard y mesas</div>
        </button>
      </div>
      {name.trim() && <p style={{ marginTop: 12, fontSize: ".82rem", color: "var(--ink-mut)" }}>Slug: <code>{slugify(name)}</code></p>}
    </Modal>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
