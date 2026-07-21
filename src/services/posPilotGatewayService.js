'use strict';

const crypto = require('crypto');
const env = require('../config/env');

const MAX_GATEWAY_RESPONSE_BYTES = 2 * 1024 * 1024;

class PosPilotGatewayError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'PosPilotGatewayError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertGatewayConfigured() {
  if (env.POS_PILOT_CONFIG_ERROR) {
    throw new PosPilotGatewayError(
      'La conexión segura con Mesita no está configurada.',
      503,
      'POS_PILOT_MISCONFIGURED'
    );
  }
}

function gatewayUrl(pathname, query) {
  assertGatewayConfigured();
  const base = new URL(env.MESITA_APP_GATEWAY_URL);
  const url = new URL(pathname, `${base.origin}/`);

  for (const [key, rawValue] of Object.entries(query || {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined && value !== null) url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function requestGateway({ pathname, method = 'GET', accessToken, body, query }) {
  const url = gatewayUrl(pathname, query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.POS_PILOT_GATEWAY_TIMEOUT_MS);
  timer.unref?.();

  const headers = {
    Accept: 'application/json',
    'X-Mesita-Request-Id': crypto.randomUUID(),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  let text;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new PosPilotGatewayError(
        'Mesita devolvió una redirección inesperada.',
        502,
        'POS_PILOT_GATEWAY_REDIRECT'
      );
    }

    const announcedSize = Number(response.headers.get('content-length') || 0);
    if (announcedSize > MAX_GATEWAY_RESPONSE_BYTES) {
      throw new PosPilotGatewayError(
        'La respuesta de Mesita excede el límite permitido.',
        502,
        'POS_PILOT_GATEWAY_RESPONSE_TOO_LARGE'
      );
    }
    text = await response.text();
  } catch (err) {
    if (err instanceof PosPilotGatewayError) throw err;
    if (err?.name === 'AbortError') {
      throw new PosPilotGatewayError(
        'Mesita tardó demasiado en responder.',
        504,
        'POS_PILOT_GATEWAY_TIMEOUT'
      );
    }
    throw new PosPilotGatewayError(
      'No se pudo conectar con Mesita.',
      502,
      'POS_PILOT_GATEWAY_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timer);
  }

  if (Buffer.byteLength(text, 'utf8') > MAX_GATEWAY_RESPONSE_BYTES) {
    throw new PosPilotGatewayError(
      'La respuesta de Mesita excede el límite permitido.',
      502,
      'POS_PILOT_GATEWAY_RESPONSE_TOO_LARGE'
    );
  }

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      throw new PosPilotGatewayError(
        'Mesita devolvió una respuesta inválida.',
        502,
        'POS_PILOT_GATEWAY_INVALID_JSON'
      );
    }
  }

  return {
    status: response.status,
    payload,
    retryAfter: response.headers.get('retry-after'),
    requestId: response.headers.get('x-request-id'),
  };
}

module.exports = {
  PosPilotGatewayError,
  requestGateway,
  assertGatewayConfigured,
};
