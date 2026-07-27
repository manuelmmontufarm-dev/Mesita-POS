/**
 * contifico-lab.js — "jugar de mesero" contra el Contífico SIMULADO local.
 *
 * Este router convierte el POS demo en el TECLADO del POS de escritorio del
 * laboratorio: cada botón escribe en el MySQL local `pos_contifico`
 * (127.0.0.1:3307, ver mesita-app/scripts/bridge/pos-simulator/) EXACTAMENTE
 * como lo hace el Contífico real, según lo verificado en la instalación viva
 * (mesita-app/docs/BRIDGE_FINDINGS.md §2–§6):
 *
 *  - Pre-cuenta = fila en `factura_cabecera` con tipo='F' + estado='P' y la
 *    mesa como tag `MESITA_TABLE:<code>` en `descripcion`. Se escribe a MySQL
 *    recién cuando el mesero CONFIRMA la pre-cuenta (§2) — igual aquí.
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

const router = express.Router();

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

const r2 = (n) => Math.round(n * 100) / 100;
const productId = (nombre) => crypto.createHash('md5').update(nombre).digest('hex').slice(0, 8);

async function cabeceraAbierta(conn, mesa) {
  const [rows] = await conn.query(
    "SELECT * FROM factura_cabecera WHERE estado='P' AND tipo='F' AND descripcion = ? LIMIT 1",
    [`MESITA_TABLE:${mesa}`],
  );
  return rows[0] || null;
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
router.get('/state', async (_req, res, next) => {
  try {
    const conn = db();
    const [cabs] = await conn.query(
      "SELECT * FROM factura_cabecera WHERE estado='P' AND tipo='F' AND descripcion LIKE 'MESITA_TABLE:%' ORDER BY fecha",
    );
    const mesas = [];
    for (const c of cabs) {
      const [items] = await conn.query(
        'SELECT d.id AS lineaId, d.id_producto, p.nombre, d.cantidad, d.precio FROM factura_detalle d LEFT JOIN inventario_producto p ON p.id = d.id_producto WHERE d.idfactura_cabecera = ?',
        [c.idfactura_cabecera],
      );
      mesas.push({
        mesa: String(c.descripcion).replace('MESITA_TABLE:', ''),
        secuencia: c.secuencia,
        total: Number(c.total),
        subtotal: Number(c.tarifa_iva0) + Number(c.tarifa_iva),
        iva: Number(c.total_iva),
        servicio: Number(c.servicio),
        items: items.map((i) => ({
          lineaId: i.lineaId,
          nombre: i.nombre || i.id_producto,
          cantidad: Number(i.cantidad),
          precio: Number(i.precio),
        })),
      });
    }
    res.json({ ok: true, mesas });
  } catch (err) { next(err); }
});

// ── POST /precuenta {mesa} — confirmar la pre-cuenta la escribe en MySQL (§2) ──
router.post('/precuenta', async (req, res, next) => {
  try {
    const mesa = String(req.body?.mesa || '').trim();
    if (!mesa) return res.status(400).json({ ok: false, error: 'mesa requerida' });
    const conn = db();
    const ya = await cabeceraAbierta(conn, mesa);
    if (ya) return res.json({ ok: true, yaExistia: true, secuencia: ya.secuencia });
    const id = crypto.randomUUID();
    const secuencia = `PRE-${String(Math.floor(100000 + Math.random() * 900000))}`;
    await conn.query(
      "INSERT INTO factura_cabecera (idfactura_cabecera, tipo, estado, descripcion, secuencia, codigo_unico, tarifa_iva0, tarifa_iva, total_iva, servicio, total, tipo_sincro) VALUES (?, 'F', 'P', ?, ?, NULL, 0, 0, 0, 0, 0, 'P')",
      [id, `MESITA_TABLE:${mesa}`, secuencia],
    );
    res.json({ ok: true, secuencia });
  } catch (err) { next(err); }
});

// ── POST /agregar {mesa, nombre, precio, cantidad} ──
router.post('/agregar', async (req, res, next) => {
  try {
    const { mesa, nombre } = req.body || {};
    const precio = Number(req.body?.precio);
    const cantidad = Number(req.body?.cantidad || 1);
    if (!mesa || !nombre || !Number.isFinite(precio)) {
      return res.status(400).json({ ok: false, error: 'mesa, nombre y precio requeridos' });
    }
    const conn = db();
    const cab = await cabeceraAbierta(conn, mesa);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay pre-cuenta abierta en esa mesa' });
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

// ── POST /quitar {mesa, lineaId} ──
router.post('/quitar', async (req, res, next) => {
  try {
    const { mesa, lineaId } = req.body || {};
    const conn = db();
    const cab = await cabeceraAbierta(conn, String(mesa || ''));
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay pre-cuenta abierta en esa mesa' });
    await conn.query('DELETE FROM factura_detalle WHERE id = ? AND idfactura_cabecera = ?', [Number(lineaId), cab.idfactura_cabecera]);
    const tot = await recalcular(conn, cab.idfactura_cabecera);
    res.json({ ok: true, ...tot });
  } catch (err) { next(err); }
});

// ── POST /facturar {mesa, formaPago} — P→C local instantáneo (§5) ──
router.post('/facturar', async (req, res, next) => {
  try {
    const mesa = String(req.body?.mesa || '').trim();
    const formaPago = req.body?.formaPago === 'EF' ? 'EF' : 'TC'; // TC = tarjeta (Datafast/Mesita)
    const conn = db();
    const cab = await cabeceraAbierta(conn, mesa);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay pre-cuenta abierta en esa mesa' });
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
router.get('/bridge-check', async (_req, res, next) => {
  const conn = {
    host: process.env.POS_SIM_HOST || '127.0.0.1',
    port: Number(process.env.POS_SIM_PORT || 3307),
    database: process.env.POS_SIM_DB || 'pos_contifico',
  };
  const checks = { mysql: false, schema: false, readOnly: false, query: false };
  let precuentas = [];
  let ro = null;
  try {
    // eslint-disable-next-line global-require
    const mysql = require('mysql2/promise');
    ro = await mysql.createConnection({ ...conn, user: 'mesita_ro', password: 'readonly' });
    checks.mysql = true;

    const [tables] = await ro.query('SHOW TABLES');
    const names = tables.map((t) => Object.values(t)[0]);
    checks.schema = ['factura_cabecera', 'factura_detalle', 'inventario_producto'].every((t) => names.includes(t));

    // La query EXACTA del agente (BRIDGE_FINDINGS §3)
    const [rows] = await ro.query(
      "SELECT SUBSTRING_INDEX(c.descripcion,'MESITA_TABLE:',-1) AS mesa, c.secuencia, c.total FROM factura_cabecera c WHERE c.estado='P' AND c.tipo='F' AND c.descripcion LIKE 'MESITA_TABLE:%'",
    );
    checks.query = true;
    precuentas = rows;

    // Candado: un DELETE DEBE fallar con permiso denegado.
    try {
      await ro.query("DELETE FROM factura_cabecera WHERE 1=0");
      checks.readOnly = false; // pudo ejecutar DELETE → MAL
    } catch (err) {
      checks.readOnly = /denied/i.test(String(err && err.message));
    }
    res.json({ ok: true, checks, precuentas, conn });
  } catch (err) {
    res.json({ ok: true, checks, precuentas, conn, error: String(err && err.message).slice(0, 200) });
  } finally {
    if (ro) ro.end().catch(() => {});
  }
});

// ── POST /anular {mesa} — estado='A' ──
router.post('/anular', async (req, res, next) => {
  try {
    const mesa = String(req.body?.mesa || '').trim();
    const conn = db();
    const cab = await cabeceraAbierta(conn, mesa);
    if (!cab) return res.status(409).json({ ok: false, error: 'no hay pre-cuenta abierta en esa mesa' });
    await conn.query("UPDATE factura_cabecera SET estado='A' WHERE idfactura_cabecera = ?", [cab.idfactura_cabecera]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
