'use strict';

/**
 * Contifico-faithful persona surface.
 * Reproduces https://contifico.github.io/persona/persona/ shapes & verbs
 * (GET/POST/PUT, bare-array listing).
 */

const express = require('express');
const router = express.Router();
const { getPrisma } = require('../../config/database');
const { PAGINATION } = require('../../config/constants');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializePersona } = require('../../contifico/serializers');
const { normalizePersonaInput } = require('../../contifico/inbound');

// GET / — list personas (bare array).
router.get('/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  const take = Math.min(
    parseInt(req.query.result_size || PAGINATION.DEFAULT_PAGE_SIZE, 10),
    PAGINATION.MAX_PAGE_SIZE
  );
  const skip = (parseInt(req.query.result_page || 1, 10) - 1) * take;

  const where = {};
  // Contifico's persona query param is `identificacion` (cédula or RUC).
  const ident = req.query.identificacion;
  if (ident) {
    where.OR = [{ cedula: ident }, { ruc: { contains: ident } }];
  }
  // `filtro` matches razón social / nombre comercial.
  if (req.query.filtro) {
    where.razonSocial = { contains: req.query.filtro, mode: 'insensitive' };
  }

  const personas = await prisma.persona.findMany({
    where,
    skip,
    take,
    orderBy: { razonSocial: 'asc' },
  });
  res.json(personas.map(serializePersona));
}));

// GET /{id}/ — single persona.
router.get('/:id/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  const p = await prisma.persona.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json(serializePersona(p));
}));

// POST / — create persona.
router.post('/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  if (!req.body.razon_social) {
    return res.status(400).json({ mensaje: 'Se requiere razon_social.' });
  }
  const data = normalizePersonaInput(req.body);
  const p = await prisma.persona.create({
    data: {
      cedula: data.cedula,
      ruc: data.ruc,
      razonSocial: data.razon_social,
      tipo: data.tipo,
      email: data.email,
      telefonos: data.telefonos,
      direccion: data.direccion,
      esExtranjero: data.es_extranjero,
    },
  });
  res.status(201).json(serializePersona(p));
}));

// PUT / — update persona (Contifico updates via PUT with `id` in the body).
router.put('/', asyncHandler(async (req, res) => {
  const prisma = getPrisma();
  if (!req.body.id) return res.status(400).json({ mensaje: 'Se requiere id.' });
  const updateData = {};
  if (req.body.cedula !== undefined) updateData.cedula = req.body.cedula;
  if (req.body.ruc !== undefined) updateData.ruc = req.body.ruc;
  if (req.body.razon_social !== undefined) updateData.razonSocial = req.body.razon_social;
  if (req.body.tipo !== undefined) updateData.tipo = req.body.tipo;
  if (req.body.email !== undefined) updateData.email = req.body.email;
  if (req.body.telefonos !== undefined) updateData.telefonos = req.body.telefonos;
  if (req.body.direccion !== undefined) updateData.direccion = req.body.direccion;
  if (req.body.es_extranjero !== undefined) updateData.esExtranjero = req.body.es_extranjero;

  const p = await prisma.persona.update({ where: { id: req.body.id }, data: updateData });
  res.json(serializePersona(p));
}));

module.exports = router;
