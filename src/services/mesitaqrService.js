'use strict';

const crypto = require('crypto');
const QRCode = require('qrcode');
const { getPrisma } = require('../config/database');
const { MESITAQR_ESTADO, TIPO_DOCUMENTO, ESTADO_MESA } = require('../config/constants');
const env = require('../config/env');
const logger = require('../middlewares/logger');

/**
 * Initiate a QR payment session for a table.
 *
 * In production this would call the real MesitaQR / Paga Ya API.
 * For demo purposes we generate a mock QR code pointing to our own callback URL.
 *
 * @param {object} data - { mesa_id, orden_id, monto_total }
 * @returns {Promise<{qr_url, qr_code, session_id, expira_en}>}
 */
async function solicitarPago(data) {
  const prisma = getPrisma();

  // Validate mesa and orden exist
  await prisma.mesa.findUniqueOrThrow({ where: { id: data.mesa_id } });
  await prisma.orden.findUniqueOrThrow({ where: { id: data.orden_id } });

  // Expire existing pending sessions for this mesa/orden
  await prisma.mesitaqrSession.updateMany({
    where: { mesaId: data.mesa_id, estado: MESITAQR_ESTADO.PENDIENTE },
    data: { estado: MESITAQR_ESTADO.EXPIRADO },
  });

  // Calculate expiry
  const expiryMs = env.MESITAQR_QR_EXPIRY_MINUTES * 60 * 1000;
  const expiraEn = new Date(Date.now() + expiryMs);

  // Create session record first (to get the sessionId)
  const session = await prisma.mesitaqrSession.create({
    data: {
      mesaId: data.mesa_id,
      ordenId: data.orden_id,
      montoTotal: data.monto_total,
      qrCode: '',      // filled below
      qrUrl: '',       // filled below
      estado: MESITAQR_ESTADO.PENDIENTE,
      expiraEn,
    },
  });

  // Build the QR payment URL (points to our demo payment page)
  const qrUrl = `${env.APP_BASE_URL}/pay/${session.sessionId}?monto=${data.monto_total}&mesa=${data.mesa_id}`;

  // Generate QR code as base64 data URI
  const qrCode = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });

  // Update session with QR data
  await prisma.mesitaqrSession.update({
    where: { id: session.id },
    data: { qrCode, qrUrl },
  });

  // Mark mesa as PAGANDO
  await prisma.mesa.update({
    where: { id: data.mesa_id },
    data: { estado: 'P' },
  });

  logger.info({
    event: 'MESITAQR_SESSION_CREATED',
    sessionId: session.sessionId,
    mesaId: data.mesa_id,
    monto: data.monto_total,
  });

  return {
    session_id: session.sessionId,
    qr_url: qrUrl,
    qr_code: qrCode,
    expira_en: expiraEn.toISOString(),
    monto_total: data.monto_total,
    mesa_id: data.mesa_id,
    orden_id: data.orden_id,
  };
}

/**
 * Poll payment status for a session.
 * Also checks for expired sessions.
 * @param {string} sessionId - UUID from solicitarPago
 */
async function estadoPago(sessionId) {
  const prisma = getPrisma();
  const session = await prisma.mesitaqrSession.findUniqueOrThrow({
    where: { sessionId },
  });

  // Auto-expire if past expiry time
  if (session.estado === MESITAQR_ESTADO.PENDIENTE && new Date() > session.expiraEn) {
    await prisma.mesitaqrSession.update({
      where: { sessionId },
      data: { estado: MESITAQR_ESTADO.EXPIRADO },
    });
    session.estado = MESITAQR_ESTADO.EXPIRADO;
  }

  return {
    session_id: sessionId,
    estado: session.estado,
    monto_total: Number(session.montoTotal),
    mesa_id: session.mesaId,
    orden_id: session.ordenId,
    expira_en: session.expiraEn.toISOString(),
    paid_at: session.paidAt ? session.paidAt.toISOString() : null,
  };
}

/**
 * Process an incoming MesitaQR webhook.
 *
 * Validates the HMAC-SHA256 signature, then:
 *  1. Marks the session as PAGADO
 *  2. Updates mesa estado to LIBRE
 *  3. Auto-creates a FAC documento
 *
 * @param {string} rawBody - Raw request body string (for signature verification)
 * @param {string} signature - Value from X-MesitaQR-Signature header
 * @param {object} payload - Parsed JSON payload
 */
async function procesarWebhook(rawBody, signature, payload) {
  const prisma = getPrisma();

  // Verify HMAC-SHA256 signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    const err = new Error('Invalid webhook signature.');
    err.statusCode = 401;
    throw err;
  }

  const { session_id: sessionId, estado, monto_pagado } = payload;

  if (!sessionId) {
    const err = new Error('Missing session_id in webhook payload.');
    err.statusCode = 400;
    throw err;
  }

  // Find the session
  const session = await prisma.mesitaqrSession.findUnique({ where: { sessionId } });
  if (!session) {
    logger.warn({ event: 'MESITAQR_WEBHOOK_SESSION_NOT_FOUND', sessionId });
    return { ok: true, skipped: true };
  }

  // Log the webhook event
  await prisma.webhookLog.create({
    data: {
      fuente: 'mesitaqr',
      evento: estado || 'payment.completed',
      payload,
      procesado: false,
    },
  });

  if (estado !== 'pagado') {
    logger.info({ event: 'MESITAQR_WEBHOOK_IGNORED', sessionId, estado });
    return { ok: true, estado };
  }

  // Mark session as PAGADO
  await prisma.mesitaqrSession.update({
    where: { sessionId },
    data: { estado: MESITAQR_ESTADO.PAGADO, paidAt: new Date() },
  });

  // Mark mesa as LIBRE
  await prisma.mesa.update({
    where: { id: session.mesaId },
    data: { estado: ESTADO_MESA.LIBRE },
  });

  // Close the orden
  await prisma.orden.update({
    where: { id: session.ordenId },
    data: { estado: 'C', cerradaAt: new Date() },
  });

  // Auto-create FAC documento
  const factura = await _autoCrearFactura(prisma, session, monto_pagado);

  // Mark webhook log as processed
  await prisma.webhookLog.updateMany({
    where: { fuente: 'mesitaqr', procesado: false },
    data: { procesado: true },
  });

  logger.info({
    event: 'MESITAQR_PAYMENT_PROCESSED',
    sessionId,
    mesaId: session.mesaId,
    facturaId: factura.id,
  });

  return {
    ok: true,
    session_id: sessionId,
    mesa_id: session.mesaId,
    factura_id: factura.id,
    estado: MESITAQR_ESTADO.PAGADO,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Auto-create a FAC documento when a webhook payment completes.
 */
async function _autoCrearFactura(prisma, session, montoPagado) {
  const { generateSriMock } = require('../adapters/contificoAdapter');

  const orden = await prisma.orden.findUnique({
    where: { id: session.ordenId },
    include: { detalles: { include: { producto: true } } },
  });

  const monto = montoPagado || Number(session.montoTotal);
  const todayEC = new Date().toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Guayaquil',
  });
  const sriFields = generateSriMock();

  const factura = await prisma.documento.create({
    data: {
      ordenId: session.ordenId,
      fechaEmision: todayEC,
      tipoDocumento: TIPO_DOCUMENTO.FAC,
      tipoRegistro: 'CLI',
      estado: 'F',
      electronico: true,
      descripcion: `PAGO QR MESA ${session.mesaId}`,
      subtotal15: round2(monto / 1.15),
      iva: round2(monto - monto / 1.15),
      total: round2(monto),
      ...sriFields,
    },
  });

  // Create cobro for this payment
  await prisma.cobro.create({
    data: {
      documentoId: factura.id,
      formaCobro: 'EF',   // default; real integration would pass actual method
      monto,
      referencia: `MESITAQR:${session.sessionId}`,
    },
  });

  return factura;
}

/**
 * Verify MesitaQR webhook HMAC-SHA256 signature.
 * Signature = HMAC-SHA256(rawBody, MESITAQR_WEBHOOK_SECRET), hex-encoded.
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!signature) return false;
  // Fail closed: no secret configured ⇒ no webhook is ever valid.
  if (!env.MESITAQR_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.MESITAQR_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  solicitarPago,
  estadoPago,
  procesarWebhook,
  verifyWebhookSignature,
};
