'use strict';

/** Contifico v2 product catalog subset used by Mesita pullCatalog. */

const express = require('express');
const { getPrisma } = require('../../config/database');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializeProducto } = require('./serializers');

const router = express.Router();
const MAX_PAGE_SIZE = 100;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const prisma = getPrisma();
    const parsedSize = Number.parseInt(req.query.result_size, 10);
    const parsedPage = Number.parseInt(req.query.result_page, 10);
    const take = Number.isFinite(parsedSize)
      ? Math.max(1, Math.min(parsedSize, MAX_PAGE_SIZE))
      : MAX_PAGE_SIZE;
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const skip = (page - 1) * take;

    const where = {};
    const [count, products] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        skip,
        take,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        include: { categoria: true },
      }),
    ]);

    res.json({
      count,
      results: products.map(serializeProducto),
    });
  })
);

module.exports = router;
