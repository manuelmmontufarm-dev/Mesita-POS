/* ============================================================
   Mesita POS — domain data, helpers & icons
   Restaurant: La Doña Pepa (Quito) · menú ecuatoriano
   Mirrors prisma/sync_pos_demo.sql so the prototype frontend
   can later bind to the same backend / API endpoints.
   ============================================================ */

const RESTAURANT = {
  name: "La Doña Pepa",
  city: "Quito",
  address: "Av. República del Salvador, Quito",
  ivaRate: 0.15, // IVA 15% (igual que el seed)
  serviceRate: 0.10, // servicio sugerido 10%
  serviceEnabled: true,
  currency: "$",
  cashier: "Carla M.",
  register: "Caja 1",
  shift: "Turno tarde",
};

const CATEGORIES = [
  { id: "cat-platos", name: "Platos principales" },
  { id: "cat-bebidas", name: "Bebidas" },
  { id: "cat-postres", name: "Postres" },
];

/* Menú — mismo catálogo que sync_pos_demo.sql */
const MENU = [
  { id: "prod-locro", name: "Locro de papa", price: 4.5, cat: "cat-platos", emoji: "🥔" },
  { id: "prod-seco", name: "Seco de chivo", price: 8.9, cat: "cat-platos", emoji: "🍛" },
  { id: "prod-encebollado", name: "Encebollado", price: 6.0, cat: "cat-platos", emoji: "🥣" },
  { id: "prod-ceviche", name: "Ceviche de camarón", price: 9.5, cat: "cat-platos", emoji: "🦐" },
  { id: "prod-bolon", name: "Bolón de verde", price: 4.25, cat: "cat-platos", emoji: "🟢" },
  { id: "prod-churrasco", name: "Churrasco", price: 9.5, cat: "cat-platos", emoji: "🥩" },
  { id: "prod-llapingachos", name: "Llapingachos", price: 6.75, cat: "cat-platos", emoji: "🥞" },
  { id: "prod-fritada", name: "Fritada", price: 8.5, cat: "cat-platos", emoji: "🍖" },
  { id: "prod-tigrillo", name: "Tigrillo", price: 5.5, cat: "cat-platos", emoji: "🍳" },
  { id: "prod-empanada", name: "Empanada de viento", price: 2.25, cat: "cat-platos", emoji: "🥟" },
  { id: "prod-ceviche-mixto", name: "Ceviche mixto", price: 10.5, cat: "cat-platos", emoji: "🦑" },
  { id: "prod-encocado", name: "Encocado de pescado", price: 9.75, cat: "cat-platos", emoji: "🐟" },
  { id: "prod-seco-pollo", name: "Seco de pollo", price: 7.5, cat: "cat-platos", emoji: "🍗" },
  { id: "prod-arroz-marinero", name: "Arroz marinero", price: 11.0, cat: "cat-platos", emoji: "🍤" },
  { id: "prod-patacones", name: "Patacones", price: 3.0, cat: "cat-platos", emoji: "🍌" },
  { id: "prod-parrillada", name: "Parrillada para dos", price: 22.5, cat: "cat-platos", emoji: "🍢" },
  { id: "prod-langostinos", name: "Langostinos al ajillo", price: 14.5, cat: "cat-platos", emoji: "🦞" },
  { id: "prod-arroz-verde", name: "Arroz verde", price: 3.5, cat: "cat-platos", emoji: "🍚" },
  { id: "prod-ensalada", name: "Ensalada de la casa", price: 4.75, cat: "cat-platos", emoji: "🥗" },
  { id: "prod-jugo-naranjilla", name: "Jugo de naranjilla", price: 2.5, cat: "cat-bebidas", emoji: "🧃" },
  { id: "prod-club-verde", name: "Club Verde", price: 2.75, cat: "cat-bebidas", emoji: "🍺" },
  { id: "prod-jugo-mora", name: "Jugo de mora", price: 2.5, cat: "cat-bebidas", emoji: "🫐" },
  { id: "prod-agua", name: "Agua sin gas", price: 1.25, cat: "cat-bebidas", emoji: "💧" },
  { id: "prod-cerveza-pilsener", name: "Cerveza Pilsener", price: 2.75, cat: "cat-bebidas", emoji: "🍺" },
  { id: "prod-cola", name: "Cola nacional", price: 1.75, cat: "cat-bebidas", emoji: "🥤" },
  { id: "prod-cafe", name: "Café pasado", price: 2.0, cat: "cat-bebidas", emoji: "☕" },
  { id: "prod-jugo-maracuya", name: "Jugo de maracuyá", price: 2.5, cat: "cat-bebidas", emoji: "🧃" },
  { id: "prod-agua-gas", name: "Agua con gas", price: 1.5, cat: "cat-bebidas", emoji: "🫧" },
  { id: "prod-vino", name: "Copa de vino tinto", price: 5.5, cat: "cat-bebidas", emoji: "🍷" },
  { id: "prod-humita", name: "Humita", price: 3.25, cat: "cat-postres", emoji: "🌽" },
  { id: "prod-tres-leches", name: "Tres leches", price: 4.0, cat: "cat-postres", emoji: "🍰" },
  { id: "prod-volcan-choco", name: "Volcán de chocolate", price: 5.25, cat: "cat-postres", emoji: "🍫" },
];

const menuById = (id) => MENU.find((m) => m.id === id);

/* ---- helpers (tax / money math, ported from the seed config) ---- */
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => RESTAURANT.currency + (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);

const lineTotal = (it) => round2(it.price * it.qty);
const orderItems = (table) => table.items.filter((i) => i.status !== "void");
const sentItems = (table) => table.items.filter((i) => i.status === "sent");
const draftItems = (table) => table.items.filter((i) => i.status === "draft");

const subtotalOf = (items) => round2(items.reduce((s, i) => s + lineTotal(i), 0));

function computeTotals(subtotal) {
  const service = RESTAURANT.serviceEnabled ? round2(subtotal * RESTAURANT.serviceRate) : 0;
  const iva = round2((subtotal + service) * RESTAURANT.ivaRate);
  const total = round2(subtotal + service + iva);
  return { subtotal: round2(subtotal), service, iva, total };
}

/* bill = only items already sent to the kitchen */
const billTotals = (table) => computeTotals(subtotalOf(sentItems(table)));
const paidTotal = (table) =>
  round2(table.payments.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0));
const remainingOf = (table) => round2(Math.max(0, billTotals(table).total - paidTotal(table)));
const guestCount = (table) => table.guests || 0;

/* ---- status model -------------------------------------------------
   available  → libre
   occupied   → orden en curso (con borrador o enviada, sin cobrar)
   awaiting   → cuenta lista, esperando pago
   partial    → pagada parcialmente
   closed     → cerrada (pagada al 100%)
------------------------------------------------------------------- */
const STATUS = {
  available: { key: "available", label: "Libre", tone: "neutral" },
  occupied: { key: "occupied", label: "En curso", tone: "brand" },
  awaiting: { key: "awaiting", label: "Por cobrar", tone: "warning" },
  partial: { key: "partial", label: "Pago parcial", tone: "info" },
  closed: { key: "closed", label: "Cerrada", tone: "success" },
};

function deriveStatus(table) {
  if (table.forcedStatus) return table.forcedStatus;
  const sent = sentItems(table);
  if (sent.length === 0 && table.items.length === 0 && !table.openedAt) return "available";
  const total = billTotals(table).total;
  const paid = paidTotal(table);
  if (paid > 0 && paid < total) return "partial";
  if (paid >= total && total > 0) return "closed";
  if (sent.length > 0) return "awaiting";
  return "occupied";
}

let _pid = 100;
const newPaymentId = () => "pay-" + ++_pid;
let _iid = 500;
const newItemId = () => "it-" + ++_iid;

const nowLabel = () =>
  new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

const makeRef = () =>
  "MQR-" +
  new Date().toISOString().slice(0, 10).replace(/-/g, "") +
  "-" +
  Math.floor(1000 + Math.random() * 9000);

/* ---- seed floor (mesas) -------------------------------------------
   mesa-01..04 Interior · mesa-05..08 Terraza · mesa-12 Demo
------------------------------------------------------------------- */
function mkItem(prodId, qty, status, note) {
  const p = menuById(prodId);
  return { id: newItemId(), prodId, name: p.name, emoji: p.emoji, price: p.price, qty, status, note: note || "" };
}

const SEED_TABLES = [
  {
    id: "mesa-01", name: "Mesa 1", zone: "Interior", capacity: 4, guests: 3,
    waiter: "Andrés", openedAt: "13:40",
    items: [
      mkItem("prod-seco", 2, "sent"),
      mkItem("prod-locro", 1, "sent"),
      mkItem("prod-jugo-naranjilla", 3, "sent"),
      mkItem("prod-tres-leches", 1, "sent"),
    ],
    payments: [],
  },
  {
    id: "mesa-02", name: "Mesa 2", zone: "Interior", capacity: 4, guests: 2,
    waiter: "Andrés", openedAt: "13:05",
    items: [
      mkItem("prod-ceviche-mixto", 1, "sent"),
      mkItem("prod-encebollado", 1, "sent"),
      mkItem("prod-cerveza-pilsener", 2, "sent"),
      mkItem("prod-patacones", 1, "sent"),
    ],
    payments: [
      { id: "pay-01", amount: 12.0, method: "qr", source: "mesita", status: "completed", payer: "Manuel", at: "13:52", ref: "MQR-20260629-4821", note: "Pagó sus platos" },
    ],
  },
  {
    id: "mesa-03", name: "Mesa 3", zone: "Interior", capacity: 6, guests: 5,
    waiter: "Lucía", openedAt: "12:30",
    items: [
      mkItem("prod-parrillada", 1, "sent"),
      mkItem("prod-churrasco", 2, "sent"),
      mkItem("prod-arroz-verde", 2, "sent"),
      mkItem("prod-vino", 3, "sent"),
      mkItem("prod-volcan-choco", 2, "sent"),
    ],
    payments: [
      { id: "pay-02", amount: 25.0, method: "qr", source: "mesita", status: "completed", payer: "Sofía", at: "13:10", ref: "MQR-20260629-1190", note: "División en partes iguales · 1 de 5" },
      { id: "pay-03", amount: 25.0, method: "qr", source: "mesita", status: "completed", payer: "Diego", at: "13:14", ref: "MQR-20260629-1191", note: "División en partes iguales · 1 de 5" },
      { id: "pay-04", amount: 18.0, method: "qr", source: "mesita", status: "pending", payer: "Esquina QR", at: "13:20", ref: "MQR-20260629-1192", note: "Autorizando con la pasarela…" },
    ],
  },
  {
    id: "mesa-04", name: "Mesa 4", zone: "Interior", capacity: 2, guests: 0,
    waiter: null, openedAt: null, items: [], payments: [],
  },
  {
    id: "mesa-05", name: "Mesa 5", zone: "Terraza", capacity: 4, guests: 4,
    waiter: "Lucía", openedAt: "13:58",
    items: [
      mkItem("prod-encocado", 2, "sent"),
      mkItem("prod-arroz-marinero", 1, "sent"),
      mkItem("prod-jugo-mora", 2, "draft"),
    ],
    payments: [],
  },
  {
    id: "mesa-06", name: "Mesa 6", zone: "Terraza", capacity: 4, guests: 0,
    waiter: null, openedAt: null, items: [], payments: [],
  },
  {
    id: "mesa-07", name: "Mesa 7", zone: "Terraza", capacity: 8, guests: 6,
    waiter: "Andrés", openedAt: "12:05",
    items: [
      mkItem("prod-langostinos", 2, "sent"),
      mkItem("prod-ceviche", 3, "sent"),
      mkItem("prod-cerveza-pilsener", 6, "sent"),
      mkItem("prod-tres-leches", 3, "sent"),
      mkItem("prod-cafe", 4, "sent"),
    ],
    payments: [
      { id: "pay-05", amount: 80.51, method: "card", source: "manual", status: "completed", payer: "Caja 1", at: "13:30", ref: "POS-77120", note: "Tarjeta Diners · registrada en caja" },
      { id: "pay-06", amount: 38.4, method: "qr", source: "mesita", status: "completed", payer: "Valeria", at: "13:41", ref: "MQR-20260629-5510", note: "Pagó el resto + propina" },
    ],
  },
  {
    id: "mesa-08", name: "Mesa 8", zone: "Terraza", capacity: 2, guests: 0,
    waiter: null, openedAt: null, items: [], payments: [],
  },
  {
    id: "mesa-12", name: "Mesa 12", zone: "Demo", capacity: 6, guests: 2,
    waiter: "Demo", openedAt: "14:02", live: true,
    items: [
      mkItem("prod-fritada", 1, "sent"),
      mkItem("prod-llapingachos", 1, "sent"),
      mkItem("prod-club-verde", 2, "sent"),
    ],
    payments: [
      { id: "pay-07", amount: 9.5, method: "qr", source: "mesita", status: "completed", payer: "Invitado QR", at: "14:08", ref: "MQR-20260629-9001", note: "Escaneó el QR de la mesa" },
    ],
  },
];

const ZONES = ["Todas", "Interior", "Terraza", "Demo"];

/* ---- integration / API event log (Mesita ⇄ POS) ------------------ */
const SEED_API_LOG = [
  { id: "ev-1", dir: "in", at: "14:08:12", method: "POST", path: "/webhooks/mesita/payment", status: 200, table: "mesa-12", body: '{ "ref": "MQR-20260629-9001", "amount": 9.50, "status": "completed", "source": "qr" }' },
  { id: "ev-2", dir: "out", at: "14:02:03", method: "PUT", path: "/pos/tables/mesa-12/bill", status: 200, table: "mesa-12", body: '{ "open": true, "items": 3, "total": 12.41 }' },
  { id: "ev-3", dir: "in", at: "13:41:55", method: "POST", path: "/webhooks/mesita/payment", status: 200, table: "mesa-07", body: '{ "ref": "MQR-20260629-5510", "amount": 38.40, "status": "completed" }' },
  { id: "ev-4", dir: "in", at: "13:20:31", method: "POST", path: "/webhooks/mesita/payment", status: 202, table: "mesa-03", body: '{ "ref": "MQR-20260629-1192", "amount": 18.00, "status": "pending" }' },
  { id: "ev-5", dir: "out", at: "13:05:00", method: "POST", path: "/pos/tables/mesa-02/sync", status: 500, table: "mesa-02", body: '{ "error": "gateway_timeout", "retryable": true }' },
];

Object.assign(window, {
  RESTAURANT, CATEGORIES, MENU, menuById, ZONES, STATUS,
  round2, money, lineTotal, orderItems, sentItems, draftItems, subtotalOf,
  computeTotals, billTotals, paidTotal, remainingOf, guestCount, deriveStatus,
  newPaymentId, newItemId, nowLabel, makeRef, mkItem,
  SEED_TABLES, SEED_API_LOG,
});
