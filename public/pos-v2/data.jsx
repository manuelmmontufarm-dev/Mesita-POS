/* ============================================================
   Mesita POS — mock catalog + domain helpers
   Mirrors the real POS data shapes (mesa, orden, detalle,
   documento) so it can wire to /sistema/api/v1/ later.
   ============================================================ */

const IVA_RATE = 0.15;       // SRI · IVA 15%
const SERVICE_RATE = 0.10;   // 10% servicio
const FACTURA_THRESHOLD = 50;

// ---- Categorías ----
const CATEGORIAS = [
  { id: "cat-entradas", nombre: "Entradas", icon: "🥗" },
  { id: "cat-platos",   nombre: "Platos Fuertes", icon: "🍽️" },
  { id: "cat-bebidas",  nombre: "Bebidas", icon: "🥤" },
  { id: "cat-postres",  nombre: "Postres", icon: "🍰" },
];

// ---- Productos ----
const PRODUCTOS = [
  { id: "p-ceviche",   nombre: "Ceviche Mixto",       desc: "Camarón, pulpo y pescado",   precio: 8.50,  cat: "cat-entradas", icon: "🦐" },
  { id: "p-patacones", nombre: "Patacones con Queso", desc: "Verde frito con queso",      precio: 4.00,  cat: "cat-entradas", icon: "🧀" },
  { id: "p-empanadas", nombre: "Empanadas de Viento", desc: "3 unidades",                 precio: 3.50,  cat: "cat-entradas", icon: "🥟" },
  { id: "p-bolon",     nombre: "Bolón de Verde",      desc: "Mixto con chicharrón",       precio: 3.50,  cat: "cat-entradas", icon: "🟢" },
  { id: "p-seco",      nombre: "Seco de Pollo",       desc: "Arroz y menestra",           precio: 9.50,  cat: "cat-platos",   icon: "🍗" },
  { id: "p-chaulafan", nombre: "Chaulafán",           desc: "Arroz chino, pollo y camarón", precio: 10.00, cat: "cat-platos", icon: "🍚" },
  { id: "p-lomo",      nombre: "Lomo al Jugo",        desc: "Papas fritas y ensalada",    precio: 14.50, cat: "cat-platos",   icon: "🥩" },
  { id: "p-pescado",   nombre: "Filete de Pescado",   desc: "A la plancha con arroz",     precio: 12.00, cat: "cat-platos",   icon: "🐟" },
  { id: "p-encebollado", nombre: "Encebollado",       desc: "Porción grande",             precio: 6.00,  cat: "cat-platos",   icon: "🥣" },
  { id: "p-agua",      nombre: "Agua Mineral",        desc: "500 ml",                     precio: 1.50,  cat: "cat-bebidas",  icon: "💧" },
  { id: "p-cola",      nombre: "Gaseosa",             desc: "350 ml",                     precio: 2.00,  cat: "cat-bebidas",  icon: "🥤" },
  { id: "p-jugo",      nombre: "Jugo Natural",        desc: "Naranja, mora o tomate",     precio: 2.50,  cat: "cat-bebidas",  icon: "🧃" },
  { id: "p-cerveza",   nombre: "Cerveza Nacional",    desc: "330 ml",                     precio: 3.00,  cat: "cat-bebidas",  icon: "🍺" },
  { id: "p-helado",    nombre: "Helado Artesanal",    desc: "2 bolas",                    precio: 3.50,  cat: "cat-postres",  icon: "🍨" },
  { id: "p-tresleches",nombre: "Tres Leches",         desc: "Porción individual",         precio: 4.50,  cat: "cat-postres",  icon: "🍰" },
];

// ---- Mesas (some pre-seeded with open orders so the floor feels live) ----
function seedMesas() {
  return [
    { id: "m-01", nombre: "Mesa 1",  cap: 4, zona: "Interior", estado: "L", orden: null },
    { id: "m-02", nombre: "Mesa 2",  cap: 4, zona: "Interior", estado: "O", orden: makeOrden([["p-seco",1],["p-cola",2],["p-ceviche",1]], 3) },
    { id: "m-03", nombre: "Mesa 3",  cap: 6, zona: "Interior", estado: "L", orden: null },
    { id: "m-04", nombre: "Mesa 4",  cap: 2, zona: "Interior", estado: "P", orden: makeOrden([["p-lomo",2],["p-cerveza",3],["p-tresleches",2]], 2) },
    { id: "m-05", nombre: "Mesa 5",  cap: 4, zona: "Terraza",  estado: "O", orden: makeOrden([["p-encebollado",2],["p-jugo",2],["p-bolon",1]], 2) },
    { id: "m-06", nombre: "Mesa 6",  cap: 4, zona: "Terraza",  estado: "L", orden: null },
    { id: "m-07", nombre: "Mesa 7",  cap: 8, zona: "Terraza",  estado: "L", orden: null },
    { id: "m-08", nombre: "Mesa 8",  cap: 2, zona: "Bar",      estado: "O", orden: makeOrden([["p-cerveza",4],["p-patacones",2]], 4) },
    { id: "m-09", nombre: "Mesa 9",  cap: 4, zona: "Bar",      estado: "L", orden: null },
    { id: "m-12", nombre: "Mesa 12", cap: 6, zona: "Demo",     estado: "L", orden: null, demo: true },
  ];
}

let _ordSeq = 1000;
function makeOrden(items, comensales) {
  const detalles = items.map(([pid, qty]) => {
    const p = PRODUCTOS.find((x) => x.id === pid);
    return { id: "d-" + (_ordSeq++) + "-" + Math.random().toString(36).slice(2, 6),
      producto_id: p.id, nombre: p.nombre, icon: p.icon, cantidad: qty, precio: p.precio, iva: 15, nota: "" };
  });
  return { id: "ord-" + (_ordSeq++), estado: "A", comensales: comensales || 0, detalles, abierta: Date.now() };
}

// ---- Mock tablemates for the Mesita QR split-pay demo ----
const DEMO_DINERS = [
  { id: "d-ana",    name: "Ana",    initials: "AN", hue: 152 },
  { id: "d-manuel", name: "Manuel", initials: "MA", hue: 222 },
  { id: "d-mateo",  name: "Mateo",  initials: "MT", hue: 32  },
  { id: "d-sofia",  name: "Sofía",  initials: "SO", hue: 288 },
];

// ---- Payment methods + processors ----
const PAY_METHODS = [
  { code: "EF", label: "Efectivo",      icon: "💵" },
  { code: "TC", label: "Tarjeta",       icon: "💳" },
  { code: "TR", label: "Transferencia", icon: "🏦" },
];
const CARD_PROCESSORS = ["Datafast", "Medianet", "Kushki", "PayPhone", "Otro"];

// ---- Helpers ----
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) => "$" + (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ordenSubtotal(orden) {
  if (!orden || !orden.detalles) return 0;
  return round2(orden.detalles.reduce((s, d) => s + d.cantidad * d.precio, 0));
}
function computeTotals(orden, serviceEnabled) {
  const subtotal = ordenSubtotal(orden);
  const iva = round2(subtotal * IVA_RATE);
  const servicio = serviceEnabled ? round2(subtotal * SERVICE_RATE) : 0;
  return { subtotal, iva, servicio, total: round2(subtotal + iva + servicio), serviceEnabled };
}
function ordenCount(orden) {
  if (!orden || !orden.detalles) return 0;
  return orden.detalles.reduce((s, d) => s + d.cantidad, 0);
}

const ESTADO_MESA = { L: "Libre", O: "Ocupada", P: "Por cobrar", C: "Pagada" };
const ZONE_ORDER = ["Interior", "Terraza", "Bar", "Privado", "Demo"];

const RESTAURANT = {
  nombre: "Restaurante Demo Mesita",
  razon: "DEMO RESTAURANTE S.A.",
  ruc: "0900000001001",
  dir: "Av. 9 de Octubre 123, Guayaquil — Ecuador",
  tel: "+593 2 222-3344",
};

function todayKey(ts) {
  const d = new Date(ts || Date.now());
  return d.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function timeStr(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
}
function genRef() {
  const n = new Date();
  return "MQR-" + n.getFullYear() + String(n.getMonth() + 1).padStart(2, "0") +
    String(n.getDate()).padStart(2, "0") + "-" + Math.floor(1000 + Math.random() * 9000);
}

Object.assign(window, {
  IVA_RATE, SERVICE_RATE, FACTURA_THRESHOLD,
  CATEGORIAS, PRODUCTOS, seedMesas, makeOrden, DEMO_DINERS,
  PAY_METHODS, CARD_PROCESSORS,
  round2, money, ordenSubtotal, computeTotals, ordenCount,
  ESTADO_MESA, ZONE_ORDER, RESTAURANT, todayKey, timeStr, genRef,
});
