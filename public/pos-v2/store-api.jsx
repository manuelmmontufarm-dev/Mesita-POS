/* Mesita POS v2 — live API store (replaces mock store.jsx) */
const API_BASE = "/sistema/api/v1";
const SESSION_KEY = "pos-mesita-session";
const POLL_MS = 2500;

function authHeaders() {
  const h = { Accept: "application/json", "Content-Type": "application/json" };
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.token) {
        h.Authorization = "Bearer " + s.token;
        return h;
      }
    }
  } catch (_) { /* ignore */ }
  const key = localStorage.getItem("pos-api-key") || "";
  if (key) h.Authorization = "Token " + key;
  return h;
}

async function api(path, { method = "GET", json } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: authHeaders(),
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty */ }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || "HTTP " + res.status;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function todayEc() {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
  });
}

function mapDetalle(d) {
  const p = d.producto || {};
  return {
    id: d.id,
    producto_id: d.productoId || d.producto_id || p.id,
    nombre: d.nombre || d.nombreManual || p.nombre || "Ítem",
    icon: p.emoji || p.icon || "🍽️",
    cantidad: Number(d.cantidad || 1),
    precio: Number(d.precio || 0),
    iva: d.porcentajeIva ?? d.porcentaje_iva ?? 15,
    nota: d.nota || "",
  };
}

function mapOrden(o) {
  if (!o) return null;
  const detalles = (o.detalles || []).map(mapDetalle);
  return {
    id: o.id,
    estado: o.estado || "A",
    comensales: o.comensales || 0,
    detalles,
    abierta: o.createdAt || Date.now(),
  };
}

function mapMesa(m, session) {
  const orden = session?.orden ? mapOrden(session.orden) : null;
  const total = session?.totales?.total ?? null;
  const saldo = session?.saldo ?? total;
  let coverage = null;
  if (total > 0.009 && saldo != null && saldo < total - 0.009) {
    coverage = { pct: Math.round(((total - saldo) / total) * 100) };
  }
  return {
    id: m.id,
    nombre: m.nombre,
    cap: m.capacidad || 4,
    zona: m.ubicacion || "General",
    estado: m.estado || "L",
    demo: m.nombre === "Mesa 12" || m.ubicacion === "Demo",
    orden,
    coverage,
    paidFlash: false,
    _session: session || null,
  };
}

function createStore() {
  const state = {
    mesas: [],
    docs: [],
    activity: [],
    apiOnline: true,
    serviceEnabled: true,
    print: null,
    loading: true,
    authError: null,
  };
  let version = 0;
  const listeners = new Set();
  const emit = () => { version += 1; listeners.forEach((l) => l()); };
  let pollTimer = null;

  function log(method, path, kind) {
    state.activity.unshift({
      id: "a" + Date.now() + Math.random(),
      ts: Date.now(),
      method,
      path,
      kind: kind || "req",
    });
    if (state.activity.length > 30) state.activity.length = 30;
  }

  const mesaById = (id) => state.mesas.find((m) => m.id === id);

  async function refreshMesaSession(mesaId) {
    const session = await api("/mesa/" + mesaId + "/session/");
    const idx = state.mesas.findIndex((m) => m.id === mesaId);
    if (idx >= 0) {
      const prev = state.mesas[idx];
      state.mesas[idx] = mapMesa({ ...prev, estado: session.mesa?.estado || prev.estado }, session);
    }
    emit();
    return session;
  }

  async function loadBootstrap() {
    state.loading = true;
    state.authError = null;
    emit();
    try {
      const boot = await api("/bootstrap/");
      state.apiOnline = true;
      state.serviceEnabled = boot.restaurant?.service_enabled !== false;

      const catMap = {};
      (boot.productos || []).forEach((p) => {
        const cid = p.categoriaId || p.categoria_id || "cat-other";
        if (!catMap[cid]) {
          catMap[cid] = {
            id: cid,
            nombre: p.categoria?.nombre || "Menú",
            icon: p.categoria?.emoji || "🍽️",
          };
        }
      });
      window.CATEGORIAS = Object.values(catMap);
      window.PRODUCTOS = (boot.productos || []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        desc: p.descripcion || "",
        precio: Number(p.precio || 0),
        cat: p.categoriaId || p.categoria_id || "cat-other",
        icon: p.emoji || "🍽️",
      }));

      const mesaRows = boot.mesas || [];
      state.mesas = await Promise.all(
        mesaRows.map(async (m) => {
          try {
            const session = await api("/mesa/" + m.id + "/session/");
            return mapMesa(m, session);
          } catch (_) {
            return mapMesa(m, null);
          }
        }),
      );
      log("GET", "/bootstrap/", "ok");
    } catch (e) {
      state.apiOnline = false;
      state.authError = e.message || "Sin conexión";
      log("GET", "/bootstrap/", "err");
    } finally {
      state.loading = false;
      emit();
    }
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      const active = state.mesas.filter((m) => m.estado === "O" || m.estado === "P");
      for (const m of active.slice(0, 6)) {
        try { await refreshMesaSession(m.id); } catch (_) { /* ignore */ }
      }
    }, POLL_MS);
  }

  const apiStore = {
    state,
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getSnapshot() { return version; },
    emit, log, mesaById,
    loadBootstrap,
    refreshMesaSession,

    setApiOnline(v) { state.apiOnline = v; log("system", v ? "conexión restablecida" : "conexión perdida", v ? "ok" : "err"); emit(); },
    setServiceEnabled(v) { state.serviceEnabled = v; emit(); },
    setPrint(obj) { state.print = obj; emit(); },

    async openMesa(id) {
      const m = mesaById(id);
      if (!m) return null;
      if (!m.orden) {
        log("POST", "/orden/open/ {mesa_id:" + id + "}", "ok");
        await api("/orden/open/", { method: "POST", json: { mesa_id: id } });
        await refreshMesaSession(id);
      }
      return mesaById(id)?.orden || null;
    },

    async addDetalle(id, prod) {
      const m = mesaById(id);
      if (!m) return;
      await apiStore.openMesa(id);
      const orden = mesaById(id)?.orden;
      if (!orden) return;
      log("POST", "/orden/" + orden.id + "/detalle/", "ok");
      await api("/orden/" + orden.id + "/detalle/", {
        method: "POST",
        json: {
          producto_id: prod.id,
          nombre: prod.nombre,
          cantidad: 1,
          precio: prod.precio,
          porcentaje_iva: 15,
        },
      });
      await refreshMesaSession(id);
    },

    async setQty(id, detId, qty) {
      const m = mesaById(id);
      if (!m?.orden) return;
      const d = m.orden.detalles.find((x) => x.id === detId);
      if (!d) return;
      if (qty <= 0) {
        log("DELETE", "/orden/" + m.orden.id + "/detalle/" + detId, "ok");
        await api("/orden/" + m.orden.id + "/detalle/" + detId + "/", { method: "DELETE" });
      } else if (qty !== d.cantidad) {
        await api("/orden/" + m.orden.id + "/detalle/" + detId + "/", { method: "DELETE" });
        await api("/orden/" + m.orden.id + "/detalle/", {
          method: "POST",
          json: {
            producto_id: d.producto_id,
            nombre: d.nombre,
            cantidad: qty,
            precio: d.precio,
            porcentaje_iva: d.iva || 15,
          },
        });
        log("PATCH", "/orden/" + m.orden.id + "/detalle/" + detId, "ok");
      }
      await refreshMesaSession(id);
    },

    async removeDetalle(id, detId) {
      await apiStore.setQty(id, detId, 0);
    },

    async setNota(id, detId, nota) {
      const m = mesaById(id);
      if (!m?.orden) return;
      const d = m.orden.detalles.find((x) => x.id === detId);
      if (!d) return;
      await api("/orden/" + m.orden.id + "/detalle/" + detId + "/", { method: "DELETE" });
      await api("/orden/" + m.orden.id + "/detalle/", {
        method: "POST",
        json: {
          producto_id: d.producto_id,
          nombre: d.nombre,
          cantidad: d.cantidad,
          precio: d.precio,
          porcentaje_iva: d.iva || 15,
        },
      });
      await refreshMesaSession(id);
    },

    async setComensales(id, n) {
      const m = mesaById(id);
      if (!m?.orden) return;
      await api("/orden/" + m.orden.id + "/", {
        method: "PATCH",
        json: { comensales: Math.max(0, n) },
      });
      log("PATCH", "/orden/" + m.orden.id + " {comensales}", "ok");
      await refreshMesaSession(id);
    },

    async anular(id) {
      const m = mesaById(id);
      if (!m) return;
      if (m.orden) {
        await api("/orden/" + m.orden.id + "/", { method: "PATCH", json: { estado: "X" } });
        log("PATCH", "/orden/" + m.orden.id + " {estado:X}", "ok");
      }
      await api("/mesa/" + id + "/reset-demo/", { method: "POST" });
      log("POST", "/mesa/" + id + "/reset-demo/", "ok");
      await refreshMesaSession(id);
    },

    markPorCobrar(id) {
      const m = mesaById(id);
      if (m && m.estado === "O") {
        api("/mesa/" + id + "/", { method: "PATCH", json: { estado: "P" } }).then(() => refreshMesaSession(id));
      }
    },

    createMqrSession(id) {
      log("POST", "/mesitaqr/solicitar-pago/", "ok");
      apiStore.markPorCobrar(id);
      return genRef();
    },

    mqrWebhook(name) {
      log("webhook", "← mesitaqr payment.completed · " + name, "hook");
      emit();
    },

    async finalizeCobro({ mesaId, payments, totales, cliente, facturaOn, via }) {
      const m = mesaById(mesaId);
      if (!m) return null;
      if (via === "mqr") log("webhook", "← mesitaqr table.completed", "hook");

      const session = await refreshMesaSession(mesaId);
      const ordenId = session?.orden?.id || m.orden?.id;
      let docId = session?.documento?.id;

      const tipo = facturaOn ? "FAC" : "PRE";
      const bodyBase = {
        tipo_documento: tipo,
        orden_id: ordenId,
        fecha_emision: todayEc(),
        descripcion: "Cobro " + m.nombre,
        subtotal_15: totales.subtotal,
        iva: totales.iva,
        servicio: totales.servicio,
        total: totales.total,
        estado: "P",
      };
      if (facturaOn && cliente) {
        bodyBase.cliente = {
          cedula: cliente.id?.length === 10 ? cliente.id : undefined,
          ruc: cliente.id?.length === 13 ? cliente.id : undefined,
          razon_social: cliente.nombre || "CONSUMIDOR FINAL",
          tipo: cliente.tipo || "N",
          email: cliente.email || "",
          direccion: cliente.dir || "Ecuador",
        };
      }

      if (!docId) {
        log("POST", "/documento/", "ok");
        const created = await api("/documento/", { method: "POST", json: bodyBase });
        docId = created.id;
      }

      for (const p of payments) {
        const ref = p.ref || ("POS-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7));
        log("PATCH", "/documento/" + docId + " {cobro}", "ok");
        await api("/documento/" + docId + "/", {
          method: "PATCH",
          json: {
            cobro: {
              forma_cobro: p.method === "EF" ? "EF" : p.method === "TR" ? "TR" : "TC",
              monto: p.amount,
              propina: p.tip || 0,
              procesador: via === "mqr" ? "MesitaQR" : "Caja",
              detalle: p.label || "Caja",
              referencia: ref,
            },
          },
        });
      }

      await api("/documento/" + docId + "/", { method: "PATCH", json: { estado: "C" } });
      log("POST", "/mesa/" + mesaId + "/reset-demo/", "ok");
      await api("/mesa/" + mesaId + "/reset-demo/", { method: "POST" });

      const doc = {
        id: docId,
        num: String(1000 + state.docs.length + 1).padStart(6, "0"),
        mesa: m.nombre,
        tipo: facturaOn ? "FAC" : "NV",
        via: via || "manual",
        ts: Date.now(),
        cliente: cliente || null,
        detalles: (m.orden ? m.orden.detalles : []).map((d) => ({ ...d })),
        totales: { ...totales },
        payments: payments.map((p) => ({ ...p })),
        ref: via === "mqr" ? genRef() : null,
        autorizacion: facturaOn ? genAuth() : null,
      };
      state.docs.unshift(doc);

      const idx = state.mesas.findIndex((x) => x.id === mesaId);
      if (idx >= 0) {
        state.mesas[idx].estado = "C";
        state.mesas[idx].orden = null;
        state.mesas[idx].coverage = null;
        state.mesas[idx].paidFlash = true;
      }
      emit();

      setTimeout(() => apiStore.releaseMesa(mesaId), 1800);
      return doc;
    },

    releaseMesa(id) {
      const m = mesaById(id);
      if (!m?.paidFlash) return;
      m.estado = "L";
      m.paidFlash = false;
      m.coverage = null;
      m.orden = null;
      log("PATCH", "/mesa/" + id + " {estado:L}", "ok");
      refreshMesaSession(id).catch(() => {});
      emit();
    },
  };

  loadBootstrap().then(startPoll);
  return apiStore;
}

function genAuth() {
  let s = "";
  for (let i = 0; i < 37; i++) s += Math.floor(Math.random() * 10);
  return s;
}

const Store = createStore();

function useStore() {
  React.useSyncExternalStore(Store.subscribe, Store.getSnapshot);
  return Store;
}

window.Store = Store;
window.useStore = useStore;
