/**
 * contifico-lab.js — "jugar de mesero" contra el Contífico SIMULADO local.
 *
 * Este router convierte el POS demo en el TECLADO del POS de escritorio del
 * laboratorio: cada botón escribe en el MySQL local `pos_contifico`
 * (127.0.0.1:3307, ver mesita-app/scripts/bridge/pos-simulator/) EXACTAMENTE
 * como lo hace el Contífico real, según lo verificado en la instalación viva
 * (mesita-app/docs/BRIDGE_FINDINGS.md §2–§6):
 *
 *  - Pre-cuenta = fila en `factura_cabecera` con tipo='F' + estado='P'.
 *  - LA MESA VIVE EN `adicional1`, como texto libre que escribe el mesero
 *    ("1", "4 Sofi", "para llevar"). No es una invención nuestra: el propio
 *    catálogo `adicional` de Contífico lo declara (id=1 'mesa', id=2 'mesero')
 *    y `parametro.adicionalPendiente=1` hace que el POS lo pida al guardar
 *    (mesita-app/docs/PILOT_FINDINGS_CASA.md §1 y §4, sobre 2.532 documentos
 *    reales). `descripcion` es una CONSTANTE de venta en el 100% de los
 *    documentos y jamás identifica una mesa — quien la use como mesa etiqueta
 *    todas las cuentas igual (defecto crítico #2 del piloto).
 *  - Montos en DÓLARES decimales: subtotal + IVA 15% + servicio 10% (§4).
 *  - Facturar = UPDATE local instantáneo P→C + documento + autorizacion(49) +
 *    fila en forma_pagos + tipo_sincro='C' (§5). El drop del snapshot es la
 *    señal de cierre del Bridge (§6).
 *  - Anular = estado='A'.
 *
 * LÍMITES REALES, SIN TRAMPAS: este router NO habla con Mesita, NO llama al
 * backend de Mesita, NO toca el widget. La ÚNICA vía por la que Mesita se
 * entera es el agente Bridge leyendo `pos_contifico` con el usuario
 * `mesita_ro` (GRANT SELECT) — como en el restaurante de verdad.
 *
 * Solo se monta con CONTIFICO_LAB=1 (nunca en Railway/producción).
 */

const express = require('express');
const crypto = require('crypto');
const { classifyMesaLabel } = require('../services/mesaClassifier');

const router = express.Router();

const RO_USER = process.env.POS_SIM_RO_USER || 'mesita_ro';
const RO_PASSWORD = process.env.POS_SIM_RO_PASSWORD || 'readonly';
const BRIDGE_SETUP_VERSION = 1;
const BRIDGE_PROVIDER = 'MESITA_POS_CONTIFICO_COMPAT';
const POS_TABLE_COUNT = Math.max(1, Number(process.env.POS_SIM_TABLE_COUNT || 8));

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Archivo compatible con el lector de Launcher.exe.config de Mesita Caja.
 * Solo contiene el usuario preaprovisionado con GRANT SELECT; nunca expone
 * las credenciales del usuario simulator que sí puede escribir.
 */
function launcherConfig(conn) {
  const connection = [
    `Server=${conn.host}`,
    `Database=${conn.database}`,
    `Uid=${RO_USER}`,
    `Pwd=${RO_PASSWORD}`,
    `Port=${conn.port}`,
    'SslMode=None',
  ].join(';') + ';';
  return `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <applicationSettings>
    <Pos.Infraestructura.Properties.Settings>
      <setting name="ConexionPos" serializeAs="String">
        <value>${xmlEscape(connection)}</value>
      </setting>
      <setting name="MesitaProvider" serializeAs="String">
        <value>${BRIDGE_PROVIDER}</value>
      </setting>
      <setting name="MesitaReadonlyAlreadyProvisioned" serializeAs="String">
        <value>true</value>
      </setting>
      <setting name="MesitaTableCount" serializeAs="String">
        <value>${POS_TABLE_COUNT}</value>
      </setting>
    </Pos.Infraestructura.Properties.Settings>
  </applicationSettings>
</configuration>
`;
}

// Copia LITERAL de mesita-app/apps/mesita-caja/src/queries.js (QUERY_REVISION=7,
// "v5" del piloto CASA). Si estas cadenas dejan de ser idénticas a las de allá,
// el laboratorio deja de probar lo que el restaurante va a correr.
//
// Dos cosas que la v5 corrigió y que este lab tenía mal:
//  1. NO se filtra por `descripcion`. El POS la escribe en dos variantes y la
//     llevan TODOS los documentos: el `NOT LIKE` viejo botaba 15 de 25 cuentas
//     abiertas del piloto (defecto crítico #1).
//  2. `mesa` sale SOLO de `mapa_mesas`; la mesa de verdad viaja en `adicional1`
//     y el servidor la clasifica (defecto crítico #2).
const BRIDGE_OPEN_ORDERS_QUERY =
  "SELECT c.idfactura_cabecera AS localId, NULLIF(TRIM(m.nombre), '') AS mesa, NULLIF(TRIM(c.adicional1), '') AS adicional1, NULLIF(TRIM(c.adicional2), '') AS adicional2, c.descripcion AS descripcion, c.mesa_relacionada AS mesaId, c.estado AS estado, c.secuencia AS posDocumento, c.codigo_unico AS posToken, c.ultimo_cambio AS ultimoCambio, c.fecha_creacion AS fechaCreacion, c.total AS totalCents, (c.tarifa_iva0 + c.tarifa_iva) AS subtotalCents, c.total_iva AS ivaCents, c.servicio AS servicioCents FROM factura_cabecera c LEFT JOIN mapa_mesas m ON m.id = c.mesa_relacionada AND c.mesa_relacionada > 0 WHERE c.estado = 'P' AND c.tipo = 'F'";

// Respaldos del agente, del más rico al más compatible: una columna que falte
// NO puede tumbarlo. El lab los corre en el mismo orden para reportar con qué
// nivel quedaría conectado ESTE POS. No existe respaldo "solo descripción" — se
// eliminó a propósito el 2026-07-29 por reintroducir el defecto #2.
const BRIDGE_OPEN_ORDERS_FALLBACKS = [
  {
    level: 1,
    reason: 'El POS no tiene la tabla de mesas (mapa_mesas)',
    query:
      "SELECT c.idfactura_cabecera AS localId, NULLIF(TRIM(c.adicional1), '') AS adicional1, NULLIF(TRIM(c.adicional2), '') AS adicional2, c.descripcion AS descripcion, c.estado AS estado, c.secuencia AS posDocumento, c.codigo_unico AS posToken, c.ultimo_cambio AS ultimoCambio, c.fecha_creacion AS fechaCreacion, c.total AS totalCents, (c.tarifa_iva0 + c.tarifa_iva) AS subtotalCents, c.total_iva AS ivaCents, c.servicio AS servicioCents FROM factura_cabecera c WHERE c.estado = 'P' AND c.tipo = 'F'",
  },
  {
    level: 2,
    reason: 'El POS no tiene las columnas de fecha (ultimo_cambio)',
    query:
      "SELECT c.idfactura_cabecera AS localId, NULLIF(TRIM(c.adicional1), '') AS adicional1, NULLIF(TRIM(c.adicional2), '') AS adicional2, c.descripcion AS descripcion, c.estado AS estado, c.secuencia AS posDocumento, c.codigo_unico AS posToken, c.total AS totalCents, (c.tarifa_iva0 + c.tarifa_iva) AS subtotalCents, c.total_iva AS ivaCents, c.servicio AS servicioCents FROM factura_cabecera c WHERE c.estado = 'P' AND c.tipo = 'F'",
  },
];

// El catálogo que declara qué slot adicional es la mesa. El agente lo lee
// (best effort) y lo manda en el heartbeat; el lab lo muestra como evidencia de
// que `adicional1` ES la mesa en este POS, en vez de asumirlo.
const BRIDGE_ADICIONAL_CATALOG_QUERY =
  "SELECT id, nombre, etiqueta FROM adicional WHERE estado = 'A'";

function bridgeSetup(conn) {
  return {
    version: BRIDGE_SETUP_VERSION,
    provider: BRIDGE_PROVIDER,
    launcherRequired: false,
    readonlyAlreadyProvisioned: true,
    mysql: { ...conn, user: RO_USER, password: RO_PASSWORD },
    tables: {
      count: POS_TABLE_COUNT,
      source: 'pos-configuration',
      items: Array.from({ length: POS_TABLE_COUNT }, (_, index) => `Mesa ${index + 1}`),
    },
  };
}

function simulatorConnection() {
  return {
    host: process.env.POS_SIM_HOST || '127.0.0.1',
    port: Number(process.env.POS_SIM_PORT || 3307),
    database: process.env.POS_SIM_DB || 'pos_contifico',
  };
}

// El pool se crea perezoso para que el require no explote si mysql2 no está.
let pool = null;
function db() {
  if (!pool) {
    // eslint-disable-next-line global-require
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.POS_SIM_HOST || '127.0.0.1',
      port: Number(process.env.POS_SIM_PORT || 3307),
      user: process.env.POS_SIM_USER || 'simulator',
      password: process.env.POS_SIM_PASSWORD || 'simulator',
      database: process.env.POS_SIM_DB || 'pos_contifico',
      connectionLimit: 4,
    });
  }
  return pool;
}

const IVA_RATE = 0.15;      // Ecuador 2026 (BRIDGE_FINDINGS §4)
const SERVICIO_RATE = 0.1;  // 10% servicio

/**
 * Lo que Contífico escribe en `descripcion` en el 100% de los documentos: una
 * constante de venta, no la mesa. El piloto vio dos variantes; esta es la que
 * ya tiene sembrada el MySQL del laboratorio (PILOT_FINDINGS_CASA §5.1).
 */
const POS_DESCRIPCION = 'VENTA PUNTO DE VENTA';

/** varchar(300) en el POS real; se recorta antes de tocar MySQL. */
const ADICIONAL_MAX_LENGTH = 300;

const r2 = (n) => Math.round(n * 100) / 100;
const productId = (nombre) => crypto.createHash('md5').update(nombre).digest('hex').slice(0, 8);

/**
 * Valor por defecto del campo "mesa" al abrir la pre-cuenta de "Mesa 4": el
 * número pelado, "4". Es lo que teclea el mesero en el POS del piloto — de las
 * 25 cuentas abiertas, el número solo iba acompañado cuando dividían la cuenta
 * ("4 Sofi"). Cualquier texto sin número se manda tal cual y el clasificador
 * decidirá (así "para llevar" se comporta como en el restaurante).
 */
function defaultAdicional1(mesa) {
  const match = String(mesa || '').match(/\d+/);
  return match ? match[0] : String(mesa || '').trim();
}

/** Normaliza lo que el mesero escribe en un adicional. Vacío es válido: en el
 *  POS real el campo es `obligatorio=0` y una cuenta puede quedarse sin mesa. */
function normalizeAdicional(value) {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (text.length > ADICIONAL_MAX_LENGTH) {
    throw new Error(`el adicional no puede pasar de ${ADICIONAL_MAX_LENGTH} caracteres`);
  }
  return text;
}

/**
 * Valida y normaliza el borrador que la pantalla confirma con Guardar.
 * Contífico persiste una fila de detalle por producto/precio; dos entradas
 * iguales se consolidan en cantidad antes de tocar MySQL.
 */
function normalizeSaveItems(value) {
  if (!Array.isArray(value)) throw new Error('items debe ser una lista');
  if (value.length > 200) throw new Error('demasiados productos en la pre-cuenta');
  const grouped = new Map();
  for (const raw of value) {
    const nombre = String(raw?.nombre || '').trim();
    const precio = r2(Number(raw?.precio));
    const cantidad = Number(raw?.cantidad);
    if (!nombre || nombre.length > 128) throw new Error('nombre de producto inválido');
    if (!Number.isFinite(precio) || precio < 0 || precio > 100000) throw new Error(`precio inválido para ${nombre}`);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1000) throw new Error(`cantidad inválida para ${nombre}`);
    const key = `${productId(nombre)}:${precio.toFixed(2)}`;
    const previous = grouped.get(key);
    if (previous) previous.cantidad = r2(previous.cantidad + cantidad);
    else grouped.set(key, { nombre, precio, cantidad: r2(cantidad), productoId: productId(nombre) });
  }
  return [...grouped.values()];
}

/**
 * Un documento abierto por su id local (`idfactura_cabecera`).
 *
 * El lab identifica los documentos por id y NO por el texto de la mesa a
 * propósito: `adicional1` es texto libre y editable — si se usara como llave,
 * renombrar la mesa a "4 Sofi" desconectaría la cuenta de su propia fila.
 */
async function cabeceraAbierta(conn, localId) {
  const [rows] = await conn.query(
    "SELECT * FROM factura_cabecera WHERE estado='P' AND tipo='F' AND idfactura_cabecera = ? LIMIT 1",
    [String(localId || '')],
  );
  return rows[0] || null;
}

/** Enriquece una fila con la MISMA clasificación que hará el servidor de Mesita. */
function describirDocumento(cab) {
  const adicional1 = cab.adicional1 == null ? '' : String(cab.adicional1).trim();
  const adicional2 = cab.adicional2 == null ? '' : String(cab.adicional2).trim();
  const clasificacion = classifyMesaLabel(adicional1);
  return {
    localId: cab.idfactura_cabecera,
    secuencia: cab.secuencia,
    // Los tres campos crudos del header, tal como los leerá el agente.
    adicional1,
    adicional2,
    descripcion: cab.descripcion == null ? '' : String(cab.descripcion),
    // Lo que Mesita deduce de `adicional1`: mesa física, delivery o sin mesa.
    kind: clasificacion.kind,
    mesaNumber: clasificacion.mesaNumber ?? null,
    billLabel: clasificacion.billLabel ?? null,
    motivo: clasificacion.reason ?? null,
    total: Number(cab.total),
    subtotal: r2(Number(cab.tarifa_iva0) + Number(cab.tarifa_iva)),
    iva: Number(cab.total_iva),
    servicio: Number(cab.servicio),
  };
}

/** Recalcula los totales del header desde las líneas (mismo modelo que el POS real). */
async function recalcular(conn, idCabecera) {
  const [lineas] = await conn.query(
    'SELECT cantidad, precio FROM factura_detalle WHERE idfactura_cabecera = ?',
    [idCabecera],
  );
  const subtotal = r2(lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.precio), 0));
  const iva = r2(subtotal * IVA_RATE);
  const servicio = r2(subtotal * SERVICIO_RATE);
  const total = r2(subtotal + iva + servicio);
  await conn.query(
    'UPDATE factura_cabecera SET tarifa_iva = ?, tarifa_iva0 = 0, total_iva = ?, servicio = ?, total = ? WHERE idfactura_cabecera = ?',
    [subtotal, iva, servicio, total, idCabecera],
  );
  return { subtotal, iva, servicio, total };
}

// ── GET /state — lo que el POS ve en SU PROPIA base (no es trampa: es su BD) ──
// Sin filtro por `descripcion`: TODA pre-cuenta abierta se devuelve, incluidas
// las que no clasifican como mesa. Esconder documentos es el defecto crítico #1
// del piloto y la pantalla tiene que poder mostrarlos.
router.get('/state', async (_req, res, next) => {
  try {
    const conn = db();
    const [cabs] = await conn.query(
      "SELECT * FROM factura_cabecera WHERE estado='P' AND tipo='F' ORDER BY fecha_creacion",
    );
    const documentos = [];
    for (const c of cabs) {
      const [items] = await conn.query(
        'SELECT d.id AS lineaId, d.id_producto, p.nombre, d.cantidad, d.precio FROM factura_detalle d LEFT JOIN inventario_producto p ON p.id = d.id_producto WHERE d.idfactura_cabecera = ?',
        [c.idfactura_cabecera],
      );
      documentos.push({
        ...describirDocumento(c),
        items: items.map((i) => ({
          lineaId: i.lineaId,
          nombre: i.nombre || i.id_producto,
          cantidad: Number(i.cantidad),
          precio: Number(i.precio),
        })),
      });
    }
    res.json({ ok: true, documentos });
  } catch (err) { next(err); }
});

// ── POST /precuenta {mesa} — confirmar la pre-cuenta la escribe en MySQL (§2) ──
// La mesa entra por `adicional1` (el campo que el catálogo `adicional` declara
// como 'mesa') y `descripcion` recibe la constante de venta del POS. Es
// exactamente el par de valores que tienen los 2.532 documentos del piloto.
router.post('/precuenta', async (req, res, next) => {
  try {
    const mesa = String(req.body?.mesa || '').trim();
    if (!mesa) return res.status(400).json({ ok: false, error: 'mesa requerida' });
    let adicional1;
    let adicional2;
    try {
      // El mesero puede teclear la mesa a mano; si no, se usa el número.
      adicional1 = normalizeAdicional(req.body?.adicional1 ?? defaultAdicional1(mesa));
      adicional2 = normalizeAdicional(req.body?.adicional2);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const id = crypto.randomUUID();
    const secuencia = `PRE-${String(Math.floor(100000 + Math.random() * 900000))}`;
    const conn = db();
    await conn.query(
      "INSERT INTO factura_cabecera (idfactura_cabecera, tipo, estado, descripcion, adicional1, adicional2, mesa_relacionada, secuencia, codigo_unico, tarifa_iva0, tarifa_iva, total_iva, servicio, total, tipo_sincro) VALUES (?, 'F', 'P', ?, ?, ?, 0, ?, NULL, 0, 0, 0, 0, 0, 'P')",
      [id, POS_DESCRIPCION, adicional1 || null, adicional2 || null, secuencia],
    );
    const cab = await cabeceraAbierta(conn, id);
    res.json({ ok: true, ...describirDocumento(cab), items: [] });
  } catch (err) { next(err); }
});

// ── POST /adicional {localId, adicional1, adicional2} ──
// El mesero corrige el campo "mesa" (y el de "mesero") de una cuenta abierta,
// como en el POS real. Es la única llave entre el documento y la mesa física:
// escribir "para llevar" o "51" saca la cuenta de su mesa, y así debe verse.
router.post('/adicional', async (req, res, next) => {
  try {
    const localId = String(req.body?.localId || '').trim();
    if (!localId) return res.status(400).json({ ok: false, error: 'localId requerido' });
    const conn = db();
    const cab = await cabeceraAbierta(conn, localId);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay una pre-cuenta abierta con ese id' });

    let adicional1;
    let adicional2;
    try {
      // Un campo ausente en el body se deja como está; "" sí lo borra.
      adicional1 = req.body?.adicional1 === undefined
        ? (cab.adicional1 == null ? '' : String(cab.adicional1))
        : normalizeAdicional(req.body.adicional1);
      adicional2 = req.body?.adicional2 === undefined
        ? (cab.adicional2 == null ? '' : String(cab.adicional2))
        : normalizeAdicional(req.body.adicional2);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    await conn.query(
      'UPDATE factura_cabecera SET adicional1 = ?, adicional2 = ? WHERE idfactura_cabecera = ?',
      [adicional1 || null, adicional2 || null, cab.idfactura_cabecera],
    );
    const fresh = await cabeceraAbierta(conn, localId);
    res.json({ ok: true, ...describirDocumento(fresh) });
  } catch (err) { next(err); }
});

// ── POST /agregar {localId, nombre, precio, cantidad} ──
router.post('/agregar', async (req, res, next) => {
  try {
    const { localId, nombre } = req.body || {};
    const precio = Number(req.body?.precio);
    const cantidad = Number(req.body?.cantidad || 1);
    if (!localId || !nombre || !Number.isFinite(precio)) {
      return res.status(400).json({ ok: false, error: 'localId, nombre y precio requeridos' });
    }
    const conn = db();
    const cab = await cabeceraAbierta(conn, localId);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay una pre-cuenta abierta con ese id' });
    const pid = productId(String(nombre));
    await conn.query(
      'INSERT INTO inventario_producto (id, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
      [pid, String(nombre)],
    );
    // Como el POS real: el mismo producto INCREMENTA la cantidad de su línea,
    // no crea una línea nueva (una fila por producto en factura_detalle).
    const [ya] = await conn.query(
      'SELECT id FROM factura_detalle WHERE idfactura_cabecera = ? AND id_producto = ? AND precio = ? LIMIT 1',
      [cab.idfactura_cabecera, pid, r2(precio)],
    );
    if (ya[0]) {
      await conn.query('UPDATE factura_detalle SET cantidad = cantidad + ? WHERE id = ?', [cantidad, ya[0].id]);
    } else {
      await conn.query(
        'INSERT INTO factura_detalle (idfactura_cabecera, id_producto, cantidad, precio) VALUES (?, ?, ?, ?)',
        [cab.idfactura_cabecera, pid, cantidad, r2(precio)],
      );
    }
    const tot = await recalcular(conn, cab.idfactura_cabecera);
    res.json({ ok: true, ...tot });
  } catch (err) { next(err); }
});

// ── POST /quitar {localId, lineaId} ──
router.post('/quitar', async (req, res, next) => {
  try {
    const { localId, lineaId } = req.body || {};
    const conn = db();
    const cab = await cabeceraAbierta(conn, localId);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay una pre-cuenta abierta con ese id' });
    await conn.query('DELETE FROM factura_detalle WHERE id = ? AND idfactura_cabecera = ?', [Number(lineaId), cab.idfactura_cabecera]);
    const tot = await recalcular(conn, cab.idfactura_cabecera);
    res.json({ ok: true, ...tot });
  } catch (err) { next(err); }
});

// ── POST /guardar {localId, items[]} — confirmación nativa de la pre-cuenta ──
// En Contífico real el documento vive en memoria hasta pulsar Pre Cuenta /
// Guardar (BRIDGE_FINDINGS §2). Aquí hacemos lo mismo: reemplazo completo y
// atómico de factura_detalle + recálculo de factura_cabecera. El Bridge NO es
// llamado y conserva GRANT SELECT: solo descubrirá el commit en su siguiente
// lectura del MySQL local.
router.post('/guardar', async (req, res, next) => {
  let conn = null;
  try {
    const localId = String(req.body?.localId || '').trim();
    if (!localId) return res.status(400).json({ ok: false, error: 'localId requerido' });
    let items;
    try {
      items = normalizeSaveItems(req.body?.items);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    conn = await db().getConnection();
    await conn.beginTransaction();
    const [cabRows] = await conn.query(
      "SELECT * FROM factura_cabecera WHERE estado='P' AND tipo='F' AND idfactura_cabecera = ? LIMIT 1 FOR UPDATE",
      [localId],
    );
    const cab = cabRows[0] || null;
    if (!cab) {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: 'no hay una pre-cuenta abierta con ese id' });
    }

    // El reemplazo ocurre dentro de una transacción InnoDB: el Bridge ve el
    // snapshot anterior o el nuevo, nunca una cuenta parcialmente guardada.
    await conn.query('DELETE FROM factura_detalle WHERE idfactura_cabecera = ?', [cab.idfactura_cabecera]);
    for (const item of items) {
      await conn.query(
        'INSERT INTO inventario_producto (id, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
        [item.productoId, item.nombre],
      );
      await conn.query(
        'INSERT INTO factura_detalle (idfactura_cabecera, id_producto, cantidad, precio) VALUES (?, ?, ?, ?)',
        [cab.idfactura_cabecera, item.productoId, item.cantidad, item.precio],
      );
    }
    const totals = await recalcular(conn, cab.idfactura_cabecera);
    await conn.commit();
    res.json({
      ok: true,
      localId,
      adicional1: cab.adicional1 == null ? '' : String(cab.adicional1),
      secuencia: cab.secuencia,
      items: items.length,
      savedAt: new Date().toISOString(),
      ...totals,
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// ── POST /facturar {localId, formaPago} — P→C local instantáneo (§5) ──
router.post('/facturar', async (req, res, next) => {
  try {
    const localId = String(req.body?.localId || '').trim();
    const formaPago = req.body?.formaPago === 'EF' ? 'EF' : 'TC'; // TC = tarjeta (Datafast/Mesita)
    const conn = db();
    const cab = await cabeceraAbierta(conn, localId);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay una pre-cuenta abierta con ese id' });
    const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM factura_cabecera WHERE estado='C'");
    const documento = `001-002-${String(n + 1).padStart(9, '0')}`;
    const autorizacion = Array.from({ length: 49 }, () => Math.floor(Math.random() * 10)).join('');
    await conn.query(
      "UPDATE factura_cabecera SET estado='C', documento = ?, autorizacion = ?, tipo_sincro='C' WHERE idfactura_cabecera = ?",
      [documento, autorizacion, cab.idfactura_cabecera],
    );
    await conn.query(
      'INSERT INTO forma_pagos (id_cabecera, forma_pago, monto_tarjeta) VALUES (?, ?, ?)',
      [cab.idfactura_cabecera, formaPago, formaPago === 'TC' ? Number(cab.total) : 0],
    );
    res.json({ ok: true, documento, total: Number(cab.total) });
  } catch (err) { next(err); }
});

// ── GET /bridge-check — todo lo necesario para verificar la conexión del puente ──
// Se conecta EXACTAMENTE como lo hará el agente de Mesita Caja (usuario
// mesita_ro/readonly), corre su query real, y PRUEBA que no puede escribir.
router.get('/bridge-check', async (_req, res, next) => {  // eslint-disable-line no-unused-vars
  const conn = simulatorConnection();
  const checks = { mysql: false, schema: false, readOnly: false, query: false, adicional: false };
  let precuentas = [];
  let queryLevel = null;   // 0 = la v5 completa; 1/2 = respaldo que sí corrió
  let queryReason = null;
  let adicionalCatalog = [];
  let ro = null;
  try {
    // eslint-disable-next-line global-require
    const mysql = require('mysql2/promise');
    ro = await mysql.createConnection({ ...conn, user: RO_USER, password: RO_PASSWORD });
    checks.mysql = true;

    const [tables] = await ro.query('SHOW TABLES');
    const names = tables.map((t) => Object.values(t)[0]);
    checks.schema = ['factura_cabecera', 'factura_detalle', 'inventario_producto'].every((t) => names.includes(t));

    // Las queries EXACTAS del agente vigente, degradando igual que él.
    const intentos = [
      { level: 0, reason: null, query: BRIDGE_OPEN_ORDERS_QUERY },
      ...BRIDGE_OPEN_ORDERS_FALLBACKS,
    ];
    let ultimoError = null;
    for (const intento of intentos) {
      try {
        const [rows] = await ro.query(intento.query);
        checks.query = true;
        queryLevel = intento.level;
        queryReason = intento.reason;
        // La clasificación del servidor, aplicada a lo que el agente mandaría.
        precuentas = rows.map((row) => {
          const clasificacion = classifyMesaLabel(row.adicional1);
          return {
            localId: row.localId,
            adicional1: row.adicional1 == null ? '' : String(row.adicional1),
            secuencia: row.posDocumento,
            total: Number(row.totalCents),
            kind: clasificacion.kind,
            mesaNumber: clasificacion.mesaNumber ?? null,
            billLabel: clasificacion.billLabel ?? null,
          };
        });
        break;
      } catch (err) {
        ultimoError = err;
      }
    }
    if (!checks.query && ultimoError) throw ultimoError;

    // El catálogo que declara qué slot es la mesa — la prueba estructural de
    // que `adicional1` no es una convención nuestra sino del propio POS.
    try {
      const [rows] = await ro.query(BRIDGE_ADICIONAL_CATALOG_QUERY);
      adicionalCatalog = rows.map((r) => ({ id: Number(r.id), nombre: String(r.nombre ?? '') }));
      checks.adicional = adicionalCatalog.some((r) => r.id === 1 && /mesa/i.test(r.nombre));
    } catch { /* install sin catálogo adicional */ }

    // Candado: un DELETE DEBE fallar con permiso denegado.
    try {
      await ro.query("DELETE FROM factura_cabecera WHERE 1=0");
      checks.readOnly = false; // pudo ejecutar DELETE → MAL
    } catch (err) {
      checks.readOnly = /denied/i.test(String(err && err.message));
    }
    res.json({
      ok: true,
      checks,
      precuentas,
      query: { level: queryLevel, reason: queryReason },
      adicionalCatalog,
      conn,
      setup: bridgeSetup(conn),
      launcher: {
        downloadUrl: '/lab/Launcher.exe.config',
        configPath: process.env.POS_SIM_LAUNCHER_PATH || null,
      },
    });
  } catch (err) {
    res.json({
      ok: true,
      checks,
      precuentas,
      query: { level: queryLevel, reason: queryReason },
      adicionalCatalog,
      conn,
      setup: bridgeSetup(conn),
      launcher: {
        downloadUrl: '/lab/Launcher.exe.config',
        configPath: process.env.POS_SIM_LAUNCHER_PATH || null,
      },
      error: String(err && err.message).slice(0, 200),
    });
  } finally {
    if (ro) ro.end().catch(() => {});
  }
});

// Archivo físico simulado para probar el mismo camino que Contífico real.
router.get('/Launcher.exe.config', (_req, res) => {
  res.type('application/xml');
  res.set('Content-Disposition', 'attachment; filename="Launcher.exe.config"');
  res.send(launcherConfig(simulatorConnection()));
});

// ── POST /anular {localId} — estado='A' ──
router.post('/anular', async (req, res, next) => {
  try {
    const localId = String(req.body?.localId || '').trim();
    const conn = db();
    const cab = await cabeceraAbierta(conn, localId);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay una pre-cuenta abierta con ese id' });
    await conn.query("UPDATE factura_cabecera SET estado='A' WHERE idfactura_cabecera = ?", [cab.idfactura_cabecera]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.BRIDGE_OPEN_ORDERS_QUERY = BRIDGE_OPEN_ORDERS_QUERY;
module.exports.BRIDGE_OPEN_ORDERS_FALLBACKS = BRIDGE_OPEN_ORDERS_FALLBACKS;
module.exports.POS_DESCRIPCION = POS_DESCRIPCION;
module.exports.defaultAdicional1 = defaultAdicional1;
module.exports.normalizeAdicional = normalizeAdicional;
module.exports.bridgeSetup = bridgeSetup;
module.exports.launcherConfig = launcherConfig;
module.exports.normalizeSaveItems = normalizeSaveItems;
