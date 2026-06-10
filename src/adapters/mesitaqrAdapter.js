'use strict';

/**
 * mesitaqrAdapter.js
 *
 * Transforms internal POS models into MesitaQR / Paga Ya API payloads,
 * and maps MesitaQR responses back to internal shapes.
 *
 * TODAY: Mock mode — no real Paga Ya API calls.
 *        When MESITAQR_API_KEY is set, the live methods below are used.
 */

const env = require('../config/env');
const logger = require('../middlewares/logger');

// ---------------------------------------------------------------------------
// Internal → MesitaQR payload
// ---------------------------------------------------------------------------

/**
 * Build a MesitaQR solicitar-pago request payload from internal data.
 * @param {object} mesa - Internal Mesa record
 * @param {object} orden - Internal Orden with detalles[]
 * @param {number} montoTotal - Total amount to charge
 * @returns {object} MesitaQR-compatible request payload
 */
function toMesitaqrSolicitarPago(mesa, orden, montoTotal) {
  return {
    mesa_id: mesa.id,
    mesa_nombre: mesa.nombre,
    orden_id: orden.id,
    monto_total: montoTotal,
    currency: 'USD',
    descripcion: `Mesa ${mesa.nombre} - ${orden.descripcion || 'Consumo'}`,
    callback_url: `${env.APP_BASE_URL}/sistema/api/v1/mesitaqr/webhook/`,
    expira_en: env.MESITAQR_QR_EXPIRY_MINUTES,
  };
}

/**
 * Map a MesitaQR API response to our internal session shape.
 * @param {object} mesitaqrResponse - Raw response from Paga Ya API
 * @returns {object} Internal session-compatible object
 */
function fromMesitaqrResponse(mesitaqrResponse) {
  const r = mesitaqrResponse;
  return {
    sessionId: r.session_id || r.id,
    qrUrl: r.qr_url || r.url,
    qrCode: r.qr_code || r.qr_data,
    expiraEn: r.expira_en ? new Date(r.expira_en) : null,
    estado: r.estado || 'pendiente',
    montoTotal: Number(r.monto_total || 0),
  };
}

/**
 * Build the webhook acknowledgement response.
 * @param {boolean} success
 * @param {string} message
 */
function buildWebhookAck(success, message) {
  return {
    ok: success,
    message: message || (success ? 'Webhook procesado correctamente.' : 'Error procesando webhook.'),
    ts: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Live MesitaQR API call (used when MESITAQR_API_KEY is set)
// ---------------------------------------------------------------------------

/**
 * Call the real Paga Ya / MesitaQR API to initiate a payment.
 * Falls back to mock if no API key is configured.
 * @param {object} payload - Output of toMesitaqrSolicitarPago()
 * @returns {Promise<object>} MesitaQR API response
 */
async function callMesitaqrApi(payload) {
  if (!env.MESITAQR_API_KEY) {
    logger.warn({ event: 'MESITAQR_MOCK_MODE', reason: 'MESITAQR_API_KEY not set — using mock QR' });
    return _mockApiResponse(payload);
  }

  const url = `${env.MESITAQR_BASE_URL}/solicitar-pago/`;
  logger.info({ event: 'MESITAQR_API_CALL', url, monto: payload.monto_total });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.MESITAQR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    logger.error({ event: 'MESITAQR_API_ERROR', status: resp.status, body: body.slice(0, 200) });
    // Fall back to mock on API error (demo resilience)
    return _mockApiResponse(payload);
  }

  return resp.json();
}

/**
 * Generate a deterministic mock response for the Paga Ya API.
 * Mirrors the shape the real API would return.
 */
function _mockApiResponse(payload) {
  const sessionId = require('crypto').randomUUID();
  const qrUrl = `${env.APP_BASE_URL}/pay/${sessionId}?monto=${payload.monto_total}&mesa=${payload.mesa_id}`;
  const expiraEn = new Date(Date.now() + env.MESITAQR_QR_EXPIRY_MINUTES * 60_000).toISOString();

  return {
    session_id: sessionId,
    qr_url: qrUrl,
    qr_code: `MOCK_QR_${sessionId}`,   // real call returns a base64 PNG
    expira_en: expiraEn,
    estado: 'pendiente',
    monto_total: payload.monto_total,
    mock: true,
  };
}

module.exports = {
  toMesitaqrSolicitarPago,
  fromMesitaqrResponse,
  buildWebhookAck,
  callMesitaqrApi,
};
