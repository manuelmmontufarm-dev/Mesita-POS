'use strict';

/**
 * v2 Persona routes — documented subset (frozen contract O5).
 * List response is a BARE ARRAY on purpose (documento list uses the
 * {count,results} envelope) so app contract tests exercise both parser paths;
 * the real envelope shape is UNVERIFIED.
 */

const express = require('express');
const router = express.Router();

const { getPrisma } = require('../../config/database');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializePersona } = require('./serializers');

function validationError(res, errores) {
  return res.status(400).json({ mensaje: 'Error de validación', errores });
}

// GET /persona/?search=<value> — fuzzy across razon_social/cedula/ruc
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const prisma = getPrisma();
    const search = String(req.query.search || '').trim();
    const where = search
      ? {
          OR: [
            { razonSocial: { contains: search, mode: 'insensitive' } },
            { cedula: search },
            { ruc: search },
          ],
        }
      : {};
    const personas = await prisma.persona.findMany({ where, take: 50 });
    res.json(personas.map(serializePersona));
  })
);

// POST /persona/?pos=<api_token> — documented create (pos query param required)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const prisma = getPrisma();
    const body = req.body || {};
    const errores = [];

    if (!req.query.pos) {
      errores.push({ campo: 'pos', detalle: 'Query param pos (API token) requerido.' });
    }
    if (!body.tipo || !['N', 'J', 'I', 'P'].includes(body.tipo)) {
      errores.push({ campo: 'tipo', detalle: 'Valores: N, J, I, P.' });
    }
    if (!body.razon_social || String(body.razon_social).length > 300) {
      errores.push({ campo: 'razon_social', detalle: 'Requerido (máx. 300).' });
    }
    if (typeof body.es_cliente !== 'boolean' || typeof body.es_proveedor !== 'boolean') {
      errores.push({ campo: 'es_cliente/es_proveedor', detalle: 'Booleanos requeridos.' });
    } else if (!body.es_cliente && !body.es_proveedor) {
      errores.push({ campo: 'es_cliente', detalle: 'Al menos un rol debe ser verdadero.' });
    }
    if ((body.tipo === 'N' || body.tipo === 'J') && !body.cedula && !body.ruc) {
      errores.push({ campo: 'cedula', detalle: 'cedula o ruc requerido para tipo N/J.' });
    }
    if (body.cedula != null && String(body.cedula).length > 10) {
      errores.push({ campo: 'cedula', detalle: 'Máximo 10 caracteres.' });
    }
    if (body.ruc != null && String(body.ruc).length > 13) {
      errores.push({ campo: 'ruc', detalle: 'Máximo 13 caracteres.' });
    }
    if (body.email != null && String(body.email).length > 50) {
      errores.push({ campo: 'email', detalle: 'Máximo 50 caracteres.' });
    }
    if (errores.length) return validationError(res, errores);

    const identificacion = body.cedula || body.ruc || null;
    const data = {
      cedula: body.cedula || (identificacion && !body.cedula ? null : body.cedula) || null,
      ruc: body.ruc || null,
      razonSocial: String(body.razon_social),
      tipo: body.tipo,
      email: body.email || null,
      telefonos: body.telefonos || null,
      direccion: body.direccion || null,
      esExtranjero: Boolean(body.es_extranjero),
    };

    const persona = body.cedula
      ? await prisma.persona.upsert({
          where: { cedula: String(body.cedula) },
          create: data,
          update: {
            ruc: data.ruc || undefined,
            razonSocial: data.razonSocial,
            email: data.email || undefined,
          },
        })
      : await prisma.persona.create({ data });

    res.status(201).json(serializePersona(persona));
  })
);

module.exports = router;
