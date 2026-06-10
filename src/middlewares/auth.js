'use strict';

const env = require('../config/env');

/**
 * API Key authentication middleware.
 * Contifico-compatible style: Authorization: Token <API_KEY>
 *
 * Every endpoint (except health + swagger) requires this header.
 */
function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Token' || !token) {
    return res.status(401).json({
      error: 'Unauthorized',
      detail: 'Missing or invalid Authorization header. Use: Authorization: Token <API_KEY>',
    });
  }

  if (token !== env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      detail: 'Invalid API key.',
    });
  }

  next();
}

module.exports = { requireApiKey };
