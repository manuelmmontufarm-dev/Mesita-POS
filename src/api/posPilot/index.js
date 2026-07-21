'use strict';

const express = require('express');
const env = require('../../config/env');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { requestGateway } = require('../../services/posPilotGatewayService');

const router = express.Router();
const SESSION_COOKIE = 'mesita_pos_pilot_session';
const MAX_SHIFT_MS = 12 * 60 * 60 * 1000;

function setNoStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.vary('Cookie');
  res.vary('Origin');
  next();
}

function requirePilotEnabled(req, res, next) {
  if (env.POS_PILOT_ENABLED) return next();
  return res.status(404).json({ error: 'Not Found' });
}

function requireAllowedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = String(req.headers.origin || '').trim();

  const allowed = new Set(env.POS_PILOT_ALLOWED_ORIGINS);
  try {
    allowed.add(new URL(env.APP_BASE_URL).origin);
  } catch (_) {
    // APP_BASE_URL validation belongs to the legacy app. An invalid value
    // must not broaden the pilot's accepted origins.
  }

  if (origin && allowed.has(origin)) return next();
  return res.status(403).json({
    error: 'Forbidden',
    detail: 'Se requiere un origen permitido para modificar la consola POS.',
  });
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch (_) {
      // Ignore malformed cookie values. Authentication will fail closed.
    }
  }
  return cookies;
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/pos-pilot',
  });
}

function requirePilotSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      detail: 'La sesión del turno expiró. Vuelve a ingresar desde Mesita.',
    });
  }
  req.posPilotAccessToken = token;
  return next();
}

function relayGatewayResult(res, result) {
  if (result.retryAfter) res.set('Retry-After', result.retryAfter);
  if (result.requestId) res.set('X-Request-Id', result.requestId);
  if (result.status === 401) clearSessionCookie(res);
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json(result.payload);
}

function proxyTo(pathBuilder) {
  return asyncHandler(async (req, res) => {
    const pathname = typeof pathBuilder === 'function' ? pathBuilder(req) : pathBuilder;
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
    const result = await requestGateway({
      pathname,
      method: req.method,
      accessToken: req.posPilotAccessToken,
      body: hasBody ? (req.body || {}) : undefined,
      query: req.query,
    });
    return relayGatewayResult(res, result);
  });
}

router.use(requirePilotEnabled, setNoStore, requireAllowedOrigin);

// Exchange a short-lived, one-use SSO ticket for the shift token. The token
// is intentionally removed from the JSON response and is never readable by
// browser JavaScript.
router.post(
  '/session/exchange',
  asyncHandler(async (req, res) => {
    const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket.trim() : '';
    if (!ticket || ticket.length > 4096 || /\s/.test(ticket)) {
      return res.status(400).json({
        error: 'Bad Request',
        detail: 'Ticket SSO inválido.',
      });
    }

    const result = await requestGateway({
      pathname: '/api/pos-console/sso/exchange',
      method: 'POST',
      body: { ticket },
    });
    if (result.status < 200 || result.status >= 300) return relayGatewayResult(res, result);

    const accessToken = result.payload?.accessToken;
    const expiresAt = new Date(result.payload?.expiresAt || '');
    if (
      typeof accessToken !== 'string' ||
      !accessToken ||
      accessToken.length > 8192 ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= new Date()
    ) {
      const err = new Error('Mesita devolvió una sesión inválida.');
      err.statusCode = 502;
      throw err;
    }

    const maxAge = Math.max(1, Math.min(expiresAt.getTime() - Date.now(), MAX_SHIFT_MS));
    res.cookie(SESSION_COOKIE, accessToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/pos-pilot',
      maxAge,
    });

    return res.status(200).json({
      expiresAt: result.payload.expiresAt,
      user: result.payload.user,
    });
  })
);

router.delete('/session', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.use(requirePilotSession);

// Read models
router.get('/bootstrap', proxyTo('/api/pos-console/v1/bootstrap'));
router.get('/catalog', proxyTo('/api/pos-console/v1/catalog'));
router.get('/zones', proxyTo('/api/pos-console/v1/zones'));
router.get('/tables', proxyTo('/api/pos-console/v1/tables'));
router.get('/bills/:id', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}`));
router.get('/bills/:id/print', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}/print`));
router.get('/history', proxyTo('/api/pos-console/v1/history'));

// Catalog and floor management
router.post('/catalog/refresh', proxyTo('/api/pos-console/v1/catalog/refresh'));
router.post('/zones', proxyTo('/api/pos-console/v1/zones'));
router.patch('/zones/:id', proxyTo((req) => `/api/pos-console/v1/zones/${encodeURIComponent(req.params.id)}`));
router.delete('/zones/:id', proxyTo((req) => `/api/pos-console/v1/zones/${encodeURIComponent(req.params.id)}`));
router.post('/tables', proxyTo('/api/pos-console/v1/tables'));
router.patch('/tables/:id', proxyTo((req) => `/api/pos-console/v1/tables/${encodeURIComponent(req.params.id)}`));
router.delete('/tables/:id', proxyTo((req) => `/api/pos-console/v1/tables/${encodeURIComponent(req.params.id)}`));

// Bill lifecycle, synchronization, payments, and conflict handling
router.post('/bills', proxyTo('/api/pos-console/v1/bills'));
router.put('/bills/:id/draft', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}/draft`));
router.post('/bills/:id/sync', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}/sync`));
router.post('/bills/:id/cancel', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}/cancel`));
router.post('/bills/:id/settlements', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}/settlements`));
router.post('/bills/:id/settlements/:paymentId/reconcile', proxyTo((req) => `/api/pos-console/v1/bills/${encodeURIComponent(req.params.id)}/settlements/${encodeURIComponent(req.params.paymentId)}/reconcile`));
router.post('/conflicts/:id/resolve', proxyTo((req) => `/api/pos-console/v1/conflicts/${encodeURIComponent(req.params.id)}/resolve`));

module.exports = router;
module.exports.SESSION_COOKIE = SESSION_COOKIE;
