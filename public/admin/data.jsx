/* ============================================================
   Mesita Admin — datos de plataforma (demo / handoff)
   Formas alineadas con mesita-app: Restaurant, User, Payment stats
   ============================================================ */

const money = (n) => "$" + (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

const REST_STATUS = {
  PENDING:   { label: "Pendiente",  tone: "P", hint: "Esperando aprobación de Mesita" },
  ACTIVE:    { label: "Activo",     tone: "L", hint: "Operando en dashboard y QR" },
  SUSPENDED: { label: "Suspendido", tone: "C", hint: "Acceso bloqueado" },
};

const ROLES = { OWNER: "Dueño", SERVER: "Mesero", ADMIN: "Admin Mesita" };

const SEED_RESTAURANTS = [
  {
    id: "r-demo", name: "Mesita Demo", slug: "mesita-demo", status: "ACTIVE",
    city: "Quito", ruc: "1790012345001", invoiceMode: "POS", posProvider: "CONTIFICO",
    owner: { name: "Demo Owner", email: "owner@mesita.demo", phone: "099 111 2233" },
    registeredAt: "2026-05-12", activatedAt: "2026-05-12",
    tables: 12, users: 4, openBills: 3,
    volumeMonth: 8420.5, volumeTotal: 42180, paymentsMonth: 312, paymentsTotal: 1842,
    lastActivity: "2026-06-30 10:42",
  },
  {
    id: "r-pepa", name: "La Doña Pepa", slug: "la-dona-pepa", status: "ACTIVE",
    city: "Quito", ruc: "1790098765001", invoiceMode: "POS", posProvider: "CONTIFICO",
    owner: { name: "María Fernández", email: "contacto@ladonapepa.ec", phone: "02-234-5678" },
    registeredAt: "2026-04-02", activatedAt: "2026-04-03",
    tables: 9, users: 6, openBills: 5,
    volumeMonth: 12640.8, volumeTotal: 89420, paymentsMonth: 428, paymentsTotal: 3102,
    lastActivity: "2026-06-30 11:15",
  },
  {
    id: "r-rio", name: "Bistró del Río", slug: "bistro-del-rio", status: "ACTIVE",
    city: "Guayaquil", ruc: "0991234567001", invoiceMode: "MANUAL", posProvider: null,
    owner: { name: "Carlos Ruiz", email: "carlos@bistrori.ec", phone: "098 765 4321" },
    registeredAt: "2026-03-18", activatedAt: "2026-03-19",
    tables: 18, users: 8, openBills: 2,
    volumeMonth: 5890.25, volumeTotal: 35210, paymentsMonth: 198, paymentsTotal: 1120,
    lastActivity: "2026-06-29 21:30",
  },
  {
    id: "r-p1", name: "Cevichería El Puerto", slug: "cevicheria-el-puerto", status: "PENDING",
    city: "Manta", ruc: "1312345678001", invoiceMode: "DISABLED", posProvider: null,
    owner: { name: "Andrea Vélez", email: "andrea@elpuerto.ec", phone: "099 222 3344" },
    registeredAt: "2026-06-29", activatedAt: null,
    tables: 0, users: 1, openBills: 0,
    volumeMonth: 0, volumeTotal: 0, paymentsMonth: 0, paymentsTotal: 0,
    lastActivity: "2026-06-29 18:04",
    note: "Registro desde /register — falta activar",
  },
  {
    id: "r-p2", name: "Café Montañita", slug: "cafe-montanita", status: "PENDING",
    city: "Montañita", ruc: null, invoiceMode: "DISABLED", posProvider: null,
    owner: { name: "Luis Torres", email: "luis.torres@gmail.com", phone: "098 111 0099" },
    registeredAt: "2026-06-30", activatedAt: null,
    tables: 0, users: 1, openBills: 0,
    volumeMonth: 0, volumeTotal: 0, paymentsMonth: 0, paymentsTotal: 0,
    lastActivity: "2026-06-30 08:22",
    note: "Sin RUC todavía",
  },
  {
    id: "r-p3", name: "Asadero Don Pancho", slug: "asadero-don-pancho", status: "PENDING",
    city: "Cuenca", ruc: "0103456789001", invoiceMode: "DISABLED", posProvider: null,
    owner: { name: "Pancho Méndez", email: "pancho@donpancho.ec", phone: "099 555 6677" },
    registeredAt: "2026-06-28", activatedAt: null,
    tables: 0, users: 1, openBills: 0,
    volumeMonth: 0, volumeTotal: 0, paymentsMonth: 0, paymentsTotal: 0,
    lastActivity: "2026-06-28 14:10",
  },
  {
    id: "r-sus", name: "Restaurante Prueba Smoke", slug: "smoke-test-jun", status: "SUSPENDED",
    city: "Quito", ruc: "1790000001001", invoiceMode: "DISABLED", posProvider: null,
    owner: { name: "Test User", email: "test+smoke@mesita.ec", phone: "" },
    registeredAt: "2026-06-15", activatedAt: "2026-06-15",
    tables: 2, users: 1, openBills: 0,
    volumeMonth: 0, volumeTotal: 120.5, paymentsMonth: 0, paymentsTotal: 4,
    lastActivity: "2026-06-20 09:00",
    note: "Cuenta de prueba — suspendida",
  },
];

const SEED_USERS = [
  { id: "u1", name: "Demo Owner", email: "owner@mesita.demo", role: "OWNER", restaurantId: "r-demo", restaurant: "Mesita Demo", lastLogin: "2026-06-30 09:10" },
  { id: "u2", name: "María Fernández", email: "contacto@ladonapepa.ec", role: "OWNER", restaurantId: "r-pepa", restaurant: "La Doña Pepa", lastLogin: "2026-06-30 11:00" },
  { id: "u3", name: "Carlos Ruiz", email: "carlos@bistrori.ec", role: "OWNER", restaurantId: "r-rio", restaurant: "Bistró del Río", lastLogin: "2026-06-29 20:15" },
  { id: "u4", name: "Andrea Vélez", email: "andrea@elpuerto.ec", role: "OWNER", restaurantId: "r-p1", restaurant: "Cevichería El Puerto", lastLogin: "2026-06-29 18:04" },
  { id: "u5", name: "Luis Torres", email: "luis.torres@gmail.com", role: "OWNER", restaurantId: "r-p2", restaurant: "Café Montañita", lastLogin: "2026-06-30 08:22" },
  { id: "u6", name: "Andrés M.", email: "andres@ladonapepa.ec", role: "SERVER", restaurantId: "r-pepa", restaurant: "La Doña Pepa", lastLogin: "2026-06-30 10:55" },
  { id: "u7", name: "Lucía P.", email: "lucia@ladonapepa.ec", role: "SERVER", restaurantId: "r-pepa", restaurant: "La Doña Pepa", lastLogin: "2026-06-29 22:10" },
  { id: "u8", name: "Carla M.", email: "carla@mesitademo.ec", role: "SERVER", restaurantId: "r-demo", restaurant: "Mesita Demo", lastLogin: "2026-06-30 08:40" },
];

const MONTHLY_PLATFORM = [
  { month: "Ene", volume: 18240, payments: 420 },
  { month: "Feb", volume: 21450, payments: 498 },
  { month: "Mar", volume: 24880, payments: 562 },
  { month: "Abr", volume: 29120, payments: 640 },
  { month: "May", volume: 33400, payments: 712 },
  { month: "Jun", volume: 26951.55, payments: 938 },
];

const RECENT_EVENTS = [
  { id: "ev1", at: "11:15", type: "payment", text: "Pago QR $38.40 · La Doña Pepa · Mesa 3", tone: "ok" },
  { id: "ev2", at: "10:42", type: "payment", text: "Pago QR $9.50 · Mesita Demo · Mesa 12", tone: "ok" },
  { id: "ev3", at: "08:22", type: "register", text: "Nuevo registro · Café Montañita (PENDING)", tone: "warn" },
  { id: "ev4", at: "Ayer", type: "register", text: "Nuevo registro · Cevichería El Puerto (PENDING)", tone: "warn" },
  { id: "ev5", at: "Ayer", type: "activate", text: "Restaurante activado · Bistró del Río", tone: "ok" },
];

function platformStats(restaurants) {
  const active = restaurants.filter((r) => r.status === "ACTIVE");
  const pending = restaurants.filter((r) => r.status === "PENDING");
  return {
    total: restaurants.length,
    active: active.length,
    pending: pending.length,
    suspended: restaurants.filter((r) => r.status === "SUSPENDED").length,
    volumeMonth: round2(restaurants.reduce((s, r) => s + r.volumeMonth, 0)),
    volumeTotal: round2(restaurants.reduce((s, r) => s + r.volumeTotal, 0)),
    paymentsMonth: restaurants.reduce((s, r) => s + r.paymentsMonth, 0),
    paymentsTotal: restaurants.reduce((s, r) => s + r.paymentsTotal, 0),
    users: SEED_USERS.length,
    openBills: active.reduce((s, r) => s + r.openBills, 0),
  };
}

function slugify(name) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

Object.assign(window, {
  money, round2, REST_STATUS, ROLES, SEED_RESTAURANTS, SEED_USERS,
  MONTHLY_PLATFORM, RECENT_EVENTS, platformStats, slugify, todayStr,
});
