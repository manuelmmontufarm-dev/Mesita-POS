'use strict';

const crypto = require('crypto');
const env = require('../../config/env');
const { getTenantPrisma, runWithRequestContext } = require('../../config/database');
const platformService = require('../../services/platformService');

/** Constant-time credential comparison (also false for empty keys). */
function keyMatches(candidate, expected) {
  if (!candidate || !expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * v2 auth — Contífico parity (frozen contract O1).
 *
 * The documented scheme is the RAW API key as the full Authorization header
 * value ("Authorization: SECRETKEY"). No "Token " prefix, no "Bearer ".
 * A v1-style "Token <key>" header therefore fails: the full string does not
 * equal the key. This asymmetry is intentional — it is exactly how the real
 * v2 API behaves and it catches clients that still send v1 auth.
 */
async function requireV2ApiKey(req, res, next) {
  // Health + contract-version are mounted before this middleware.
  try {
    const raw = req.headers['authorization'] || '';
    if (!keyMatches(raw, env.API_KEY)) {
      return res.status(401).json({ detail: 'Credenciales inválidas.' });
    }

    if (env.NODE_ENV === 'test') {
      return runWithRequestContext({ auth: { legacyApiKey: true } }, next);
    }

    const authContext = await platformService.getDemoAuthContext();
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
  } catch (err) {
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      error: status === 401 ? 'Unauthorized' : 'Internal server error',
      // Internal detail only in explicit development — staging/unknown envs
      // get the safe body.
      detail: env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

module.exports = { requireV2ApiKey };
