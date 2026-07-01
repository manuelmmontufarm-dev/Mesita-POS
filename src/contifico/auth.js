'use strict';

/**
 * Auth for the Contifico-compatibility surface.
 *
 * Contifico authenticates with the API key sent RAW in the Authorization
 * header (`Authorization: <APIKEY>`) — no `Token`/`Bearer` scheme word. This
 * middleware reproduces that so the surface behaves like Contifico, while also
 * tolerating `Token <key>` and `Bearer <session>` for convenience.
 */

const env = require('../config/env');
const { getTenantPrisma, runWithRequestContext } = require('../config/database');
const platformService = require('../services/platformService');

async function requireContificoAuth(req, res, next) {
  // Health check is open (matches Contifico infra endpoints being unauthenticated).
  if (req.path === '/health/' || req.path === '/health') return next();

  const authHeader = (req.headers['authorization'] || '').trim();
  if (!authHeader) {
    return res.status(401).json({ mensaje: 'No autorizado.', detail: 'Falta el header Authorization.' });
  }

  const parts = authHeader.split(' ');
  let scheme = null;
  let token = authHeader;
  if (parts.length === 2) {
    [scheme, token] = parts;
  }

  try {
    // Bearer <session> — logged-in restaurant user.
    if (scheme === 'Bearer') {
      const authContext = await platformService.authenticateSession(token);
      return withTenant(req, authContext, next);
    }

    // Raw key or "Token <key>" — Contifico-style API-key auth.
    const isApiKey = token === env.API_KEY;
    if (!isApiKey) {
      return res.status(401).json({ mensaje: 'No autorizado.', detail: 'Credenciales inválidas.' });
    }

    // In tests we avoid the platform bootstrap and let getPrisma() fall back to
    // the mocked platform client (same convention as the native middleware).
    if (env.NODE_ENV === 'test') {
      return runWithRequestContext({ auth: { legacyApiKey: true } }, next);
    }

    const authContext = await platformService.getDemoAuthContext();
    return withTenant(req, authContext, next);
  } catch (err) {
    const status = err.statusCode || err.status || 401;
    return res.status(status).json({
      mensaje: 'No autorizado.',
      detail: env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

function withTenant(req, authContext, next) {
  req.auth = authContext;
  const prisma = getTenantPrisma(authContext.tenantSchema);
  return runWithRequestContext(
    {
      prisma,
      auth: authContext,
      restaurant: authContext.restaurant,
      tenantSchema: authContext.tenantSchema,
    },
    next
  );
}

module.exports = { requireContificoAuth };
