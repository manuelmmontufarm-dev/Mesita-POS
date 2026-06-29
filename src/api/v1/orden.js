'use strict';

/**
 * @swagger
 * tags:
 *   name: Órdenes
 *   description: Gestión de órdenes de mesa
 */

const express = require('express');
const router = express.Router();
const ordenService = require('../../services/ordenService');
const { asyncHandler } = require('../../middlewares/errorHandler');

/**
 * @swagger
 * /orden/:
 *   get:
 *     summary: Listar órdenes
 *     tags: [Órdenes]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: query
 *         name: mesa_id
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [A, C, X] }
 *         description: A=Abierta, C=Cerrada, X=Cancelada
 *       - in: query
 *         name: result_size
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: result_page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Lista de órdenes
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await ordenService.listarOrdenes(req.query);
  res.json(result);
}));

router.post('/open/', asyncHandler(async (req, res) => {
  const mesaId = req.body.mesa_id || req.body.mesaId;
  if (!mesaId) {
    return res.status(400).json({ error: 'Se requiere mesa_id.' });
  }
  const result = await ordenService.abrirOEncontrarOrden(mesaId);
  res.status(result.created ? 201 : 200).json(result);
}));

/**
 * @swagger
 * /orden/{id}/:
 *   get:
 *     summary: Obtener orden con detalles completos
 *     tags: [Órdenes]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Orden con detalles[]
 *       404:
 *         description: Orden no encontrada
 */
router.get('/:id/', asyncHandler(async (req, res) => {
  const orden = await ordenService.obtenerOrden(req.params.id);
  res.json(orden);
}));

/**
 * @swagger
 * /orden/:
 *   post:
 *     summary: Abrir una nueva orden en una mesa
 *     tags: [Órdenes]
 *     security:
 *       - TokenAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mesa_id]
 *             properties:
 *               mesa_id: { type: string }
 *               descripcion: { type: string, example: "Mesa 5 - cumpleaños" }
 *               mesero: { type: string, example: "Carlos" }
 *     responses:
 *       201:
 *         description: Orden creada
 */
router.post('/', asyncHandler(async (req, res) => {
  if (!req.body.mesa_id) {
    return res.status(400).json({ error: 'Se requiere mesa_id.' });
  }
  const orden = await ordenService.abrirOrden(req.body);
  res.status(201).json(orden);
}));

/**
 * @swagger
 * /orden/{id}/detalle/:
 *   post:
 *     summary: Agregar ítem a la orden
 *     tags: [Órdenes]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               producto_id: { type: string }
 *               nombre: { type: string, example: "Ceviche Mixto" }
 *               cantidad: { type: number, example: 2 }
 *               precio: { type: number, example: 8.50 }
 *               porcentaje_iva: { type: integer, example: 15 }
 *               porcentaje_descuento: { type: number, example: 0 }
 *     responses:
 *       201:
 *         description: Ítem agregado
 */
router.post('/:id/detalle/', asyncHandler(async (req, res) => {
  const detalle = await ordenService.agregarDetalle(req.params.id, req.body);
  res.status(201).json(detalle);
}));

/**
 * @swagger
 * /orden/{id}/detalle/{detalleId}/:
 *   delete:
 *     summary: Eliminar ítem de la orden
 *     tags: [Órdenes]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: detalleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ítem eliminado
 */
router.delete('/:id/detalle/:detalleId/', asyncHandler(async (req, res) => {
  const result = await ordenService.eliminarDetalle(req.params.id, req.params.detalleId);
  res.json(result);
}));

/**
 * @swagger
 * /orden/{id}/:
 *   patch:
 *     summary: Actualizar estado o descripción de la orden
 *     tags: [Órdenes]
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
 *               estado: { type: string, enum: [A, C, X] }
 *               descripcion: { type: string }
 *     responses:
 *       200:
 *         description: Orden actualizada
 */
router.patch('/:id/', asyncHandler(async (req, res) => {
  const orden = await ordenService.actualizarOrden(req.params.id, req.body);
  res.json(orden);
}));

/**
 * @swagger
 * /orden/{id}/totales/:
 *   get:
 *     summary: Calcular totales de la orden (15% IVA + 10% servicio)
 *     tags: [Órdenes]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Totales desglosados
 */
router.get('/:id/totales/', asyncHandler(async (req, res) => {
  const totales = await ordenService.calcularTotales(req.params.id);
  res.json(totales);
}));

module.exports = router;
