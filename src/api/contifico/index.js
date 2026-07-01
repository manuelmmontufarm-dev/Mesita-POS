'use strict';

/**
 * Contifico-compatibility API surface.
 *
 * Mounted at /contifico/sistema/api/v1 and shaped to be byte-for-byte identical
 * to https://api.contifico.com/sistema/api/v1 — same endpoints, field names,
 * verbs, auth and (documented) limitations. It is backed by the SAME database
 * as the native POS API via the shared services, so switching a consumer to
 * live Contifico is a base-URL + auth change with no data migration.
 *
 * The native POS API at /sistema/api/v1 is unchanged; this is an additive,
 * parallel surface.
 */

const express = require('express');
const router = express.Router();

const { requireContificoAuth } = require('../../contifico/auth');
const documentoRouter = require('./documento');
const personaRouter = require('./persona');
const productoRouter = require('./producto');
const { buildUnsupportedRouter } = require('./unsupported');

const documentoService = require('../../services/documentoService');
const catalogoService = require('../../services/catalogoService');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializeDocumento, serializeCategoria } = require('../../contifico/serializers');

// Health (unauthenticated) — parity with Contifico infra endpoints.
router.get('/health/', (req, res) => {
  res.json({ status: 'ok', surface: 'contifico-compat', version: 'v1', timestamp: new Date().toISOString() });
});

// Everything else requires Contifico-style auth.
router.use(requireContificoAuth);

// Transacción: documento listing lives at /registro/documento/ in Contifico,
// while create/detail/sub-resources live at /documento/.
router.get('/registro/documento/', asyncHandler(async (req, res) => {
  const { results } = await documentoService.listarDocumentos(req.query);
  res.json(results.map(serializeDocumento));
}));

router.use('/documento', documentoRouter);
router.use('/persona', personaRouter);
router.use('/producto', productoRouter);

// Inventario: categoría listing (read-only in Contifico).
router.get('/categoria/', asyncHandler(async (req, res) => {
  const categorias = await catalogoService.listarCategorias();
  res.json(categorias.map(serializeCategoria));
}));

// Unsupported modules -> empty collections (same as an account without add-ons).
router.use(buildUnsupportedRouter());

module.exports = router;
