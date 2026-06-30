'use strict';

/**
 * @swagger
 * tags:
 *   name: Mesas
 *   description: Gestión de mesas del restaurante
 */

const express = require('express');
const router = express.Router();
const mesaService = require('../../services/mesaService');
const mesaSessionService = require('../../services/mesaSessionService');
const { asyncHandler } = require('../../middlewares/errorHandler');

/**
 * @swagger
 * /mesa/:
 *   get:
 *     summary: Listar todas las mesas
 *     tags: [Mesas]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [L, O, P, C] }
 *         description: Filtrar por estado (L=Libre, O=Ocupada, P=Pagando, C=Cerrada)
 *       - in: query
 *         name: result_size
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: result_page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Lista de mesas
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await mesaService.listarMesas(req.query);
  res.json(result);
}));

/**
 * Demo session snapshot — one payload for mesita-app POS sync.
 */
router.get('/:id/session/', asyncHandler(async (req, res) => {
  const session = await mesaSessionService.obtenerSessionMesa(req.params.id);
  res.json(session);
}));

/**
 * Demo reset — close orden, cancel PREs, mesa Libre (staff or auto after pay).
 */
router.post('/:id/reset-demo/', asyncHandler(async (req, res) => {
  const session = await mesaSessionService.resetDemoMesa(req.params.id);
  res.json(session);
}));

router.get('/:id/', asyncHandler(async (req, res) => {
  const mesa = await mesaService.obtenerMesa(req.params.id);
  res.json(mesa);
}));

/**
 * @swagger
 * /mesa/:
 *   post:
 *     summary: Crear una nueva mesa
 *     tags: [Mesas]
 *     security:
 *       - TokenAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string, example: "Mesa 1" }
 *               capacidad: { type: integer, example: 4 }
 *               ubicacion: { type: string, example: "Terraza" }
 *     responses:
 *       201:
 *         description: Mesa creada
 */
router.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nombre) {
    return res.status(400).json({ error: 'Se requiere el campo nombre.' });
  }
  const mesa = await mesaService.crearMesa(req.body);
  res.status(201).json(mesa);
}));

/**
 * @swagger
 * /mesa/{id}/:
 *   patch:
 *     summary: Actualizar estado o configuración de una mesa
 *     tags: [Mesas]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string, enum: [L, O, P, C] }
 *               capacidad: { type: integer }
 *               ubicacion: { type: string }
 *               activa: { type: boolean }
 *     responses:
 *       200:
 *         description: Mesa actualizada
 */
router.patch('/:id/', asyncHandler(async (req, res) => {
  const mesa = await mesaService.actualizarMesa(req.params.id, req.body);
  res.json(mesa);
}));

router.delete('/:id/', asyncHandler(async (req, res) => {
  await mesaService.eliminarMesa(req.params.id);
  res.status(204).send();
}));

module.exports = router;
