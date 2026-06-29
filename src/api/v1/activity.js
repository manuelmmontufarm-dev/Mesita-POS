'use strict';

const express = require('express');
const router = express.Router();
const { getPrisma } = require('../../config/database');
const { asyncHandler } = require('../../middlewares/errorHandler');

/**
 * Recent MesitaQR cobros for POS toast notifications.
 */
router.get('/recent/', asyncHandler(async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 60_000);
  const prisma = getPrisma();

  const cobros = await prisma.cobro.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { referencia: { startsWith: 'MESITAQR:' } },
        { referencia: { startsWith: 'MQR-' } },
        { procesador: { contains: 'Mesita', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      documento: {
        include: {
          orden: { include: { mesa: true } },
        },
      },
    },
  });

  res.json({
    count: cobros.length,
    results: cobros.map((c) => ({
      id: c.id,
      monto: Number(c.monto),
      referencia: c.referencia,
      detalle: c.detalle,
      mesa: c.documento?.orden?.mesa?.nombre || null,
      createdAt: c.createdAt,
    })),
  });
}));

module.exports = router;
