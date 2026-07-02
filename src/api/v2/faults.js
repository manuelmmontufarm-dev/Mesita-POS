'use strict';

/**
 * Deterministic fault profiles for contract testing (frozen contract O9).
 *
 * SIMULATOR-ONLY EXTENSION — real Contífico has nothing like this, so
 * production app integration code MUST NOT depend on it. It exists so tests
 * can reproduce latency, timeouts, auth failures, validation failures,
 * upstream 500s and stale reads on demand.
 *
 * Select via the X-Fault-Profile request header:
 *   latency:<ms>   delay the response by <ms> (capped at 10s)
 *   timeout        destroy the socket after 100ms (client sees abort/reset)
 *   error:400      respond 400 with the contract validation-error shape
 *   error:401      respond 401 with the contract auth-error shape
 *   error:403      respond 403
 *   error:500      respond 500
 *   stale          flag the request: documento reads serve a snapshot WITHOUT
 *                  recent cobros/estado transitions (delayed consistency)
 */
function faultProfileMiddleware(req, res, next) {
  const profile = String(req.headers['x-fault-profile'] || '').trim();
  if (!profile) return next();

  if (profile.startsWith('latency:')) {
    const ms = Math.min(parseInt(profile.slice('latency:'.length), 10) || 0, 10_000);
    setTimeout(next, ms);
    return undefined;
  }

  if (profile === 'timeout') {
    setTimeout(() => {
      req.socket.destroy();
    }, 100);
    return undefined;
  }

  if (profile === 'error:400') {
    return res.status(400).json({
      mensaje: 'Error de validación',
      errores: [{ campo: 'simulado', detalle: 'Fault profile error:400' }],
    });
  }
  if (profile === 'error:401') {
    return res.status(401).json({ detail: 'Credenciales inválidas.' });
  }
  if (profile === 'error:403') {
    return res.status(403).json({ detail: 'Prohibido.' });
  }
  if (profile === 'error:500') {
    return res.status(500).json({ error: 'Internal server error (simulated)' });
  }

  if (profile === 'stale') {
    req.v2StaleRead = true;
    return next();
  }

  // Unknown profile → ignore (forward-compatible)
  return next();
}

module.exports = { faultProfileMiddleware };
