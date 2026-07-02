'use strict';

/**
 * API v2 router — Contífico v2-compatible façade (frozen contract).
 * Mounted at /sistema/api/v2 in app.js.
 *
 * Auth: raw API key as the full Authorization header value (no "Token ").
 * Health and contract-version are unauthenticated.
 */

const express = require('express');
const router = express.Router();

const { requireV2ApiKey } = require('./auth');
const { faultProfileMiddleware } = require('./faults');
const documentoRouter = require('./documento');
const personaRouter = require('./persona');

const CONTRACT_NAME = 'contifico-v2-mesita';
const CONTRACT_VERSION = '1.0.0';

// Unauthenticated: health + contract version (no credentials exposed)
router.get('/health/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pos-mesita-demo',
    api: 'v2',
    timestamp: new Date().toISOString(),
  });
});

router.get('/contract-version/', (req, res) => {
  res.json({
    contract: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    fixtures: 'mesita-app: contracts/contifico-v2/fixtures (canonical)',
    faultProfiles: ['latency:<ms>', 'timeout', 'error:400', 'error:401', 'error:403', 'error:500', 'stale'],
  });
});

// Everything below requires v2 auth; fault profiles run after auth so an
// invalid key still fails 401 regardless of the requested profile.
router.use(requireV2ApiKey);
router.use(faultProfileMiddleware);

router.use('/documento', documentoRouter);
router.use('/persona', personaRouter);

module.exports = router;
