'use strict';

/**
 * @swagger
 * tags:
 *   name: Personas
 *   description: Gestión de clientes (Contifico-compatible)
 */

const express = require('express');
const router = express.Router();
const { getPrisma } = require('../../config/database');
const { PAGINATION } = require('../../config/constants');
const { asyncHandler } = require('../../middlewares/errorHandler');

/**
 * @swagger
 * /persona/:
 *   get:
 *     summary: Listar personas (clientes)
 *     tags: [Personas]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: query
 *         name: identificacion
 *         schema: { type: string }
 *         description: Buscar por cédula o RUC
 *       - in: query
 *         name: razon_social
 *         schema: { type: string }
 *         description: Búsqueda parcial por nombre
 *       - in: query
 *         name: result_size
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: result_page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Lista de personas
 */
router.get('/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  const take = Math.min(parseInt(req.query.result_size || PAGINATION.DEFAULT_PAGE_SIZE, 10), PAGINATION.MAX_PAGE_SIZE);
  const skip = (parseInt(req.query.result_page || 1, 10) - 1) * take;

  const where = {};
  if (req.query.identificacion) {
    where.OR = [
      { cedula: req.query.identificacion },
      { ruc: { contains: req.query.identificacion } },
    ];
  }
  if (req.query.razon_social) {
    where.razonSocial = { contains: req.query.razon_social, mode: 'insensitive' };
  }

  const [count, personas] = await Promise.all([
    prisma.persona.count({ where }),
    prisma.persona.findMany({ where, skip, take, orderBy: { razonSocial: 'asc' } }),
  ]);

  res.json({ count, results: personas.map(formatPersona) });
}));

/**
 * @swagger
 * /persona/{id}/:
 *   get:
 *     summary: Obtener persona por ID
 *     tags: [Personas]
 *     security:
 *       - TokenAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Persona encontrada
 *       404:
 *         description: No encontrada
 */
router.get('/:id/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  const p = await prisma.persona.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json(formatPersona(p));
}));

/**
 * @swagger
 * /persona/:
 *   post:
 *     summary: Crear persona
 *     tags: [Personas]
 *     security:
 *       - TokenAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razon_social]
 *             properties:
 *               cedula: { type: string, example: "0922054366" }
 *               ruc: { type: string, example: "0922054366001" }
 *               razon_social: { type: string, example: "Juan Pérez" }
 *               tipo: { type: string, enum: [N, J], default: "N" }
 *               email: { type: string }
 *               telefonos: { type: string }
 *               direccion: { type: string }
 *               es_extranjero: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Persona creada
 */
router.post('/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  if (!req.body.razon_social) {
    return res.status(400).json({ error: 'Se requiere razon_social.' });
  }
  const p = await prisma.persona.create({
    data: {
      cedula: req.body.cedula || null,
      ruc: req.body.ruc || null,
      razonSocial: req.body.razon_social,
      tipo: req.body.tipo || 'N',
      email: req.body.email || null,
      telefonos: req.body.telefonos || null,
      direccion: req.body.direccion || null,
      esExtranjero: req.body.es_extranjero || false,
    },
  });
  res.status(201).json(formatPersona(p));
}));

/**
 * @swagger
 * /persona/{id}/:
 *   patch:
 *     summary: Actualizar persona
 *     tags: [Personas]
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
 *     responses:
 *       200:
 *         description: Persona actualizada
 */
router.patch('/:id/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  const updateData = {};
  const fields = ['cedula', 'ruc', 'tipo', 'email', 'telefonos', 'direccion'];
  fields.forEach((f) => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });
  if (req.body.razon_social !== undefined) updateData.razonSocial = req.body.razon_social;
  if (req.body.es_extranjero !== undefined) updateData.esExtranjero = req.body.es_extranjero;
  if (req.body.activo !== undefined) updateData.activo = req.body.activo;

  const p = await prisma.persona.update({ where: { id: req.params.id }, data: updateData });
  res.json(formatPersona(p));
}));

function formatPersona(p) {
  return {
    id: p.id,
    cedula: p.cedula,
    ruc: p.ruc,
    razon_social: p.razonSocial,
    tipo: p.tipo,
    email: p.email,
    telefonos: p.telefonos,
    direccion: p.direccion,
    es_extranjero: p.esExtranjero,
    activo: p.activo,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

module.exports = router;
