'use strict';

/**
 * Contifico modules the POS deliberately does NOT simulate: inventory
 * (bodega, variante, marca, movimiento-inventario, guía), accounting
 * (contabilidad) and banking (banco).
 *
 * A restaurant Contifico account without those add-ons returns empty
 * collections for these read endpoints, so the simulator does the same — this
 * is an intentional "same limitations" behavior, not a bug. Writes are not
 * accepted.
 */

const express = require('express');
const { asyncHandler } = require('../../middlewares/errorHandler');

const EMPTY_LIST_ENDPOINTS = [
  '/bodega/',
  '/variante/',
  '/marca/',
  '/movimiento-inventario/',
  '/inventario/guia/',
  '/contabilidad/centro-costo/',
  '/contabilidad/cuenta-contable/',
  '/banco/cuenta/',
  '/banco/movimiento/',
];

function buildUnsupportedRouter() {
  const router = express.Router();
  for (const path of EMPTY_LIST_ENDPOINTS) {
    router.get(path, asyncHandler(async (req, res) => res.json([])));
  }
  return router;
}

module.exports = { buildUnsupportedRouter, EMPTY_LIST_ENDPOINTS };
