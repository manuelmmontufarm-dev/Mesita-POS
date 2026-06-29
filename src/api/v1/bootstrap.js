'use strict';

const express = require('express');
const router = express.Router();
const mesaService = require('../../services/mesaService');
const catalogoService = require('../../services/catalogoService');
const ordenService = require('../../services/ordenService');
const platformService = require('../../services/platformService');
const { asyncHandler } = require('../../middlewares/errorHandler');

/**
 * Single payload for POS app startup — mesas, menu, restaurant.
 */
router.get('/', asyncHandler(async (req, res) => {
  const restaurantId = req.auth?.restaurant?.id;
  const [mesasResult, productosResult, restaurant] = await Promise.all([
    mesaService.listarMesas({ result_size: 100 }),
    catalogoService.listarProductos({ result_size: 200, disponible: true }),
    restaurantId
      ? platformService.getSettings(restaurantId).catch(() => req.auth?.restaurant || null)
      : Promise.resolve(req.auth?.restaurant || null),
  ]);

  const mesas = await Promise.all(
    (mesasResult.results || []).map(async (m) => {
      const activeOrden = (m.ordenes && m.ordenes[0]) || null;
      let orden_activa_total = null;
      if (activeOrden) {
        try {
          const t = await ordenService.calcularTotales(activeOrden.id);
          orden_activa_total = t.total;
        } catch (_) { /* ignore */ }
      }
      return { ...m, orden_activa_total };
    }),
  );

  res.json({
    restaurant,
    mesas,
    productos: productosResult.results || [],
    categorias: [],
    timestamp: new Date().toISOString(),
  });
}));

module.exports = router;
