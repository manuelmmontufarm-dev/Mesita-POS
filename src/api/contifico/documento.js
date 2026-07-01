'use strict';

/**
 * Contifico-faithful documento surface.
 * Reproduces https://contifico.github.io/registro/documento/ shapes & verbs.
 */

const express = require('express');
const router = express.Router();
const documentoService = require('../../services/documentoService');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializeDocumento, serializeCobro } = require('../../contifico/serializers');
const { normalizeDocumentoInput, normalizeCobroInput } = require('../../contifico/inbound');

// Contifico documento types the simulator supports. LQC (liquidación de compra)
// and other types are intentionally unsupported (same as a restaurant account).
const SUPPORTED_TIPOS = ['PRE', 'FAC'];

function badRequest(res, mensaje) {
  return res.status(400).json({ mensaje });
}

// GET / — list documentos (Contifico returns a bare array).
router.get('/', asyncHandler(async (req, res) => {
  const { results } = await documentoService.listarDocumentos(req.query);
  res.json(results.map(serializeDocumento));
}));

// POST / — create PRE/FAC.
router.post('/', asyncHandler(async (req, res) => {
  const body = normalizeDocumentoInput(req.body);
  if (!body.tipo_documento) return badRequest(res, 'Se requiere tipo_documento (PRE o FAC).');
  if (!SUPPORTED_TIPOS.includes(body.tipo_documento)) {
    return badRequest(res, `tipo_documento no soportado. Use ${SUPPORTED_TIPOS.join(' o ')}.`);
  }
  const doc = await documentoService.crearDocumento(body);
  res.status(201).json(serializeDocumento(doc));
}));

// PUT / — update a documento (Contifico updates via PUT with `id` in the body).
router.put('/', asyncHandler(async (req, res) => {
  const body = normalizeDocumentoInput(req.body);
  if (!body.id) return badRequest(res, 'Se requiere id para actualizar el documento.');
  const patch = {};
  if (body.estado !== undefined) patch.estado = body.estado;
  if (Array.isArray(body.cobros) && body.cobros.length > 0) patch.cobro = body.cobros[0];
  const doc = await documentoService.actualizarDocumento(body.id, patch);
  res.json(serializeDocumento(doc));
}));

// --- Sub-resources (must precede the generic /:id/ route) ---

// GET /{id}/cobro/ — list payments on a document.
router.get('/:id/cobro/', asyncHandler(async (req, res) => {
  const cobros = await documentoService.listarCobros(req.params.id);
  res.json(cobros.map(serializeCobro));
}));

// POST /{id}/cobro/ — register a payment.
router.post('/:id/cobro/', asyncHandler(async (req, res) => {
  const cobro = normalizeCobroInput(req.body);
  if (!cobro.forma_cobro || cobro.monto === undefined) {
    return badRequest(res, 'Se requieren forma_cobro y monto.');
  }
  const created = await documentoService.agregarCobro(req.params.id, cobro);
  res.status(201).json(serializeCobro(created));
}));

// DELETE /{id}/cobro/{cobroId}/ — remove a payment.
router.delete('/:id/cobro/:cobroId/', asyncHandler(async (req, res) => {
  await documentoService.eliminarCobro(req.params.id, req.params.cobroId);
  res.status(204).send();
}));

// PUT /{id}/sri/ — emit the SRI electronic invoice (mock signing).
router.put('/:id/sri/', asyncHandler(async (req, res) => {
  const doc = await documentoService.emitirSri(req.params.id);
  res.json(serializeDocumento(doc));
}));

// GET /{id}/retencion/ — retenciones are not modelled (empty, like Contifico
// for a document with no withholding).
router.get('/:id/retencion/', asyncHandler(async (req, res) => {
  res.json([]);
}));

// GET /{id}/ — single documento.
router.get('/:id/', asyncHandler(async (req, res) => {
  const doc = await documentoService.obtenerDocumento(req.params.id);
  res.json(serializeDocumento(doc));
}));

module.exports = router;
