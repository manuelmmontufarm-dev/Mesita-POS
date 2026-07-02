'use strict';

/**
 * v2 Documento routes — strict façade over the frozen Contífico contract.
 *
 * Strictness note: where the real API's behavior is unverified (unknown
 * params, undocumented status codes), this façade takes the STRICT side and
 * returns 400 — so drift in the app client is caught by contract tests here
 * instead of surfacing against real Contífico in production.
 */

const express = require('express');
const router = express.Router();

const { getPrisma } = require('../../config/database');
const documentoService = require('../../services/documentoService');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializeDocumento, serializeCobro } = require('./serializers');

const DOC_INCLUDE = { cobros: true, detallesDoc: true, persona: true };
const OPEN_ESTADOS = ['P', 'E'];
const CLOSED_ESTADOS = ['C', 'G', 'A', 'F'];
const COBRO_ALLOWED_KEYS = new Set([
  'forma_cobro',
  'monto',
  'fecha',
  'tipo_ping',
  'numero_comprobante',
  'numero_cheque',
  'cuenta_bancaria_id',
]);
const TIPO_PING_VALUES = new Set(['D', 'M', 'E', 'P', 'A']);

function validationError(res, errores) {
  return res.status(400).json({ mensaje: 'Error de validación', errores });
}

/** Batch-resolve product names for detalles (producto_nombre is OBSERVED). */
async function productNamesFor(docs) {
  const prisma = getPrisma();
  const ids = new Set();
  for (const doc of docs) {
    for (const d of doc.detallesDoc || []) {
      if (d.productoId) ids.add(d.productoId);
    }
  }
  if (ids.size === 0) return new Map();
  try {
    const productos = await prisma.producto.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nombre: true },
    });
    return new Map(productos.map((p) => [p.id, p.nombre]));
  } catch {
    return new Map(); // names are best-effort; never fail the read
  }
}

// GET /documento/?tipo=PRE&result_size&result_page  (documented list query)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const opts = {
      // documented param is `tipo` — v1's `tipo_documento` is intentionally
      // NOT honored here (unknown params are ignored, Contífico-style)
      tipo_documento: req.query.tipo || undefined,
      result_size: req.query.result_size,
      result_page: req.query.result_page,
    };
    const { count, results } = await documentoService.listarDocumentos(opts);
    const names = await productNamesFor(results);
    const stale = Boolean(req.v2StaleRead);
    res.json({
      count,
      results: results.map((doc) => serializeDocumento(doc, names, { stale })),
    });
  })
);

// POST /documento/ — documented create (wire subtotal_12 → internal subtotal15)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const errores = [];
    if (!body.tipo_documento) errores.push({ campo: 'tipo_documento', detalle: 'Requerido.' });
    if (body.tipo_documento && !['PRE', 'FAC'].includes(body.tipo_documento)) {
      errores.push({ campo: 'tipo_documento', detalle: 'Debe ser PRE o FAC.' });
    }
    if (body.total == null) errores.push({ campo: 'total', detalle: 'Requerido.' });
    if (errores.length) return validationError(res, errores);

    const doc = await documentoService.crearDocumento({
      ...body,
      // v2 wire name → internal name. A v2 caller sending subtotal_15 is v1
      // drift; the field is ignored (unknown param).
      subtotal_15: body.subtotal_12 ?? 0,
    });
    const names = await productNamesFor([doc]);
    res.status(201).json(serializeDocumento(doc, names));
  })
);

// GET /documento/:id/ — UNDOCUMENTED-OBSERVED single read (sandbox 2026-06-02)
router.get(
  '/:id/',
  asyncHandler(async (req, res) => {
    const doc = await documentoService.obtenerDocumento(req.params.id); // throws P2025 → 404
    const names = await productNamesFor([doc]);
    res.json(serializeDocumento(doc, names, { stale: Boolean(req.v2StaleRead) }));
  })
);

// PUT /documento/:id/ — partial cliente update (UNVERIFIED against real API;
// implemented for parity experiments — app calls it only behind a config flag)
router.put(
  '/:id/',
  asyncHandler(async (req, res) => {
    const prisma = getPrisma();
    const body = req.body || {};
    const cliente = body.cliente;
    if (!cliente || typeof cliente !== 'object') {
      return validationError(res, [{ campo: 'cliente', detalle: 'Objeto cliente requerido.' }]);
    }
    const existing = await prisma.documento.findUniqueOrThrow({ where: { id: req.params.id } });
    if (CLOSED_ESTADOS.includes(existing.estado)) {
      return validationError(res, [
        { campo: 'estado', detalle: 'El documento ya no acepta modificaciones.' },
      ]);
    }
    const updated = await prisma.documento.update({
      where: { id: req.params.id },
      data: {
        clienteCedula: cliente.cedula ?? existing.clienteCedula,
        clienteRuc: cliente.ruc ?? existing.clienteRuc,
        clienteRazonSocial: cliente.razon_social ?? existing.clienteRazonSocial,
        clienteTipo: cliente.tipo ?? existing.clienteTipo,
        clienteEmail: cliente.email ?? existing.clienteEmail,
        clienteTelefonos: cliente.telefonos ?? existing.clienteTelefonos,
        clienteDireccion: cliente.direccion ?? existing.clienteDireccion,
      },
      include: DOC_INCLUDE,
    });
    const names = await productNamesFor([updated]);
    res.status(201).json(serializeDocumento(updated, names));
  })
);

// GET /documento/:id/cobro/ — documented cobro list (bare array)
router.get(
  '/:id/cobro/',
  asyncHandler(async (req, res) => {
    const prisma = getPrisma();
    await prisma.documento.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.v2StaleRead) return res.json([]); // delayed-consistency read
    const cobros = await prisma.cobro.findMany({
      where: { documentoId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(cobros.map(serializeCobro));
  })
);

// POST /documento/:id/cobro/ — documented cobro create.
// Duplicate retries are NOT deduplicated (worst-case documented semantics):
// idempotency is owned by Mesita via numero_comprobante reconciliation.
// Overpay beyond the document total is rejected 400.
router.post(
  '/:id/cobro/',
  asyncHandler(async (req, res) => {
    const prisma = getPrisma();
    const body = req.body || {};
    const errores = [];

    for (const key of Object.keys(body)) {
      if (!COBRO_ALLOWED_KEYS.has(key)) {
        errores.push({ campo: key, detalle: 'Parámetro no documentado.' });
      }
    }
    if (!body.forma_cobro || String(body.forma_cobro).length > 10) {
      errores.push({ campo: 'forma_cobro', detalle: 'Requerido (máx. 10).' });
    }
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 99_999_999.99) {
      errores.push({ campo: 'monto', detalle: 'Debe ser > 0 con máximo 8 enteros y 2 decimales.' });
    } else if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) {
      errores.push({ campo: 'monto', detalle: 'Máximo 2 decimales.' });
    }
    if (body.fecha != null && !/^\d{2}\/\d{2}\/\d{4}$/.test(String(body.fecha))) {
      errores.push({ campo: 'fecha', detalle: 'Formato dd/mm/yyyy.' });
    }
    if (body.forma_cobro === 'TC' && !body.tipo_ping) {
      errores.push({ campo: 'tipo_ping', detalle: 'Requerido para forma_cobro TC.' });
    }
    if (body.tipo_ping != null && !TIPO_PING_VALUES.has(String(body.tipo_ping))) {
      errores.push({ campo: 'tipo_ping', detalle: 'Valores: D, M, E, P, A.' });
    }
    if (body.numero_comprobante != null && String(body.numero_comprobante).length > 15) {
      errores.push({ campo: 'numero_comprobante', detalle: 'Máximo 15 caracteres.' });
    }
    if (errores.length) return validationError(res, errores);

    const doc = await prisma.documento.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { cobros: true },
    });
    if (CLOSED_ESTADOS.includes(doc.estado)) {
      return validationError(res, [
        { campo: 'estado', detalle: 'El documento ya no acepta cobros.' },
      ]);
    }

    const paidSoFar = (doc.cobros || []).reduce((s, c) => s + Number(c.monto || 0), 0);
    const total = Number(doc.total || 0);
    if (Math.round((paidSoFar + monto) * 100) > Math.round(total * 100)) {
      return validationError(res, [
        { campo: 'monto', detalle: 'La suma de cobros no puede superar el total del documento.' },
      ]);
    }

    const cobro = await prisma.cobro.create({
      data: {
        documentoId: doc.id,
        formaCobro: String(body.forma_cobro),
        monto,
        propina: 0,
        procesador: body.tipo_ping ? String(body.tipo_ping) : null,
        detalle: null,
        referencia: body.numero_comprobante ? String(body.numero_comprobante) : null,
      },
    });

    // Contífico parity: PRE flips to Cobrado when Σ cobros reaches the total.
    if (Math.round((paidSoFar + monto) * 100) === Math.round(total * 100) && total > 0) {
      await prisma.documento.update({ where: { id: doc.id }, data: { estado: 'C' } });
    }

    res.status(201).json(serializeCobro(cobro));
  })
);

// unused but exported for tests
module.exports = router;
module.exports.OPEN_ESTADOS = OPEN_ESTADOS;
module.exports.CLOSED_ESTADOS = CLOSED_ESTADOS;
