'use strict';

/**
 * @swagger
 * tags:
 *   name: MesitaQR
 *   description: Integración con Paga Ya — pagos QR en mesa
 */

const express = require('express');
const router = express.Router();
const mesitaqrService = require('../../services/mesitaqrService');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { buildWebhookAck } = require('../../adapters/mesitaqrAdapter');
const logger = require('../../middlewares/logger');

/**
 * @swagger
 * /mesitaqr/solicitar-pago/:
 *   post:
 *     summary: Iniciar sesión de pago QR para una mesa
 *     tags: [MesitaQR]
 *     security:
 *       - TokenAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mesa_id, orden_id, monto_total]
 *             properties:
 *               mesa_id: { type: string, example: "uuid-de-la-mesa" }
 *               orden_id: { type: string, example: "uuid-de-la-orden" }
 *               monto_total: { type: number, example: 23.00 }
 *     responses:
 *       200:
 *         description: Sesión de pago QR creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session_id: { type: string }
 *                 qr_url: { type: string }
 *                 qr_code: { type: string, description: "Base64 PNG data URI" }
 *                 expira_en: { type: string, format: date-time }
 *                 monto_total: { type: number }
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Mesa u orden no encontrada
 */
router.post('/solicitar-pago/', asyncHandler(async (req, res) => {
  const { mesa_id, orden_id, monto_total } = req.body;

  if (!mesa_id || !orden_id || monto_total === undefined) {
    return res.status(400).json({
      error: 'Se requieren mesa_id, orden_id y monto_total.',
    });
  }

  if (Number(monto_total) <= 0) {
    return res.status(400).json({ error: 'monto_total debe ser mayor a 0.' });
  }

  const result = await mesitaqrService.solicitarPago({
    mesa_id,
    orden_id,
    monto_total: Number(monto_total),
  });

  res.json(result);
}));

/**
 * @swagger
 * /mesitaqr/estado/{session_id}/:
 *   get:
 *     summary: Consultar estado de una sesión de pago QR
 *     tags: [MesitaQR]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema: { type: string }
 *         description: session_id retornado por solicitar-pago
 *     responses:
 *       200:
 *         description: Estado de la sesión
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session_id: { type: string }
 *                 estado:
 *                   type: string
 *                   enum: [pendiente, pagado, expirado]
 *                 monto_total: { type: number }
 *                 expira_en: { type: string, format: date-time }
 *                 paid_at: { type: string, format: date-time, nullable: true }
 *       404:
 *         description: Sesión no encontrada
 */
router.get('/estado/:session_id/', asyncHandler(async (req, res) => {
  const result = await mesitaqrService.estadoPago(req.params.session_id);
  res.json(result);
}));

/**
 * @swagger
 * /mesitaqr/webhook/:
 *   post:
 *     summary: Recibir confirmación de pago de MesitaQR
 *     description: |
 *       Este endpoint es llamado por Paga Ya cuando el pago QR se completa.
 *       Requiere firma HMAC-SHA256 en el header X-MesitaQR-Signature.
 *       Al confirmar el pago:
 *       - Actualiza estado de la sesión a "pagado"
 *       - Libera la mesa (estado → L)
 *       - Crea automáticamente una FAC documento
 *     tags: [MesitaQR]
 *     parameters:
 *       - in: header
 *         name: X-MesitaQR-Signature
 *         required: true
 *         schema: { type: string }
 *         description: HMAC-SHA256(rawBody, MESITAQR_WEBHOOK_SECRET) hex-encoded
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session_id, estado]
 *             properties:
 *               session_id: { type: string }
 *               estado: { type: string, example: "pagado" }
 *               monto_pagado: { type: number }
 *               referencia: { type: string }
 *     responses:
 *       200:
 *         description: Webhook procesado
 *       401:
 *         description: Firma inválida
 */
router.post('/webhook/', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  // rawBody is needed for HMAC signature verification
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
  const signature = req.headers['x-mesitaqr-signature'] || '';

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  logger.info({ event: 'MESITAQR_WEBHOOK_RECEIVED', session_id: payload.session_id });

  try {
    const result = await mesitaqrService.procesarWebhook(rawBody, signature, payload);
    res.json(buildWebhookAck(true, 'Webhook procesado correctamente.'));
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json(buildWebhookAck(false, err.message));
    }
    logger.error({ event: 'MESITAQR_WEBHOOK_ERROR', error: err.message });
    res.status(500).json(buildWebhookAck(false, 'Error interno al procesar webhook.'));
  }
}));

module.exports = router;
