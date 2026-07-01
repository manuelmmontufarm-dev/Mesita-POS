'use strict';

/**
 * Contifico-faithful producto surface.
 * Reproduces https://contifico.github.io/inventario/producto/ shapes & verbs
 * (GET/POST list+detail, PATCH update, GET /{id}/stock/, bare-array listing).
 */

const express = require('express');
const router = express.Router();
const catalogoService = require('../../services/catalogoService');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { serializeProducto } = require('../../contifico/serializers');

// GET / — list productos (bare array). Contifico filters: `filtro`, `codigo`,
// `categoria_id`, `codigo_barra`.
router.get('/', asyncHandler(async (req, res) => {
  const opts = {
    categoria_id: req.query.categoria_id,
    nombre: req.query.filtro || req.query.nombre,
    result_size: req.query.result_size,
    result_page: req.query.result_page,
  };
  const { results } = await catalogoService.listarProductos(opts);
  res.json(results.map(serializeProducto));
}));

// GET /{id}/stock/ — stock per bodega. The POS has no inventory module, so it
// reports a single logical bodega with null stock (same shape Contifico returns,
// with the "not tracked" limitation surfaced as null).
router.get('/:id/stock/', asyncHandler(async (req, res) => {
  await catalogoService.obtenerProducto(req.params.id); // 404 if missing
  res.json([{ bodega_nombre: 'Bodega Principal', bodega_id: 'bodega-principal', cantidad: null }]);
}));

// GET /{id}/ — single producto.
router.get('/:id/', asyncHandler(async (req, res) => {
  const p = await catalogoService.obtenerProducto(req.params.id);
  res.json(serializeProducto(p));
}));

// POST / — create producto. Contifico requires nombre, codigo, pvp1, estado.
router.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nombre) return res.status(400).json({ mensaje: 'Se requiere nombre.' });
  const precio = req.body.pvp1 !== undefined ? req.body.pvp1 : req.body.precio;
  if (precio === undefined) return res.status(400).json({ mensaje: 'Se requiere pvp1.' });
  const p = await catalogoService.crearProducto({
    codigo: req.body.codigo,
    nombre: req.body.nombre,
    descripcion: req.body.descripcion,
    precio,
    categoria_id: req.body.categoria_id,
    porcentaje_iva: req.body.porcentaje_iva,
    disponible: req.body.estado === undefined ? true : req.body.estado === 'A',
  });
  res.status(201).json(serializeProducto(p));
}));

// PATCH /{id}/ — update producto (Contifico uses PATCH here).
router.patch('/:id/', asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.codigo !== undefined) data.codigo = req.body.codigo;
  if (req.body.nombre !== undefined) data.nombre = req.body.nombre;
  if (req.body.descripcion !== undefined) data.descripcion = req.body.descripcion;
  if (req.body.pvp1 !== undefined) data.precio = req.body.pvp1;
  else if (req.body.precio !== undefined) data.precio = req.body.precio;
  if (req.body.categoria_id !== undefined) data.categoria_id = req.body.categoria_id;
  if (req.body.porcentaje_iva !== undefined) data.porcentaje_iva = req.body.porcentaje_iva;
  if (req.body.estado !== undefined) data.disponible = req.body.estado === 'A';
  const p = await catalogoService.actualizarProducto(req.params.id, data);
  res.json(serializeProducto(p));
}));

module.exports = router;
