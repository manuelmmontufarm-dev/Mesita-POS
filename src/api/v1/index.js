'use strict';

/**
 * API v1 router — mounts all resource routes under /sistema/api/v1/
 * All routes are protected by requireApiKey middleware (applied in app.js).
 */

const express = require('express');
const router = express.Router();
const { getPlatformPrisma } = require('../../config/database');

const mesaRouter = require('./mesa');
const ordenRouter = require('./orden');
const documentoRouter = require('./documento');
const personaRouter = require('./persona');
const productoRouter = require('./producto');
const mesitaqrRouter = require('./mesitaqr');
const authRouter = require('./auth');
const restaurantRouter = require('./restaurant');
const bootstrapRouter = require('./bootstrap');
const activityRouter = require('./activity');

// Health check (unauthenticated)
router.get('/health/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pos-mesita-demo',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

router.get('/health/db/', async (req, res) => {
  try {
    const prisma = getPlatformPrisma();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      detail: err.message,
      hint: 'Revisa DATABASE_URL en Vercel (Supabase pooler puerto 6543).',
    });
  }
});

// Resource routes
router.use('/auth', authRouter);
router.use('/bootstrap', bootstrapRouter);
router.use('/activity', activityRouter);
router.use('/restaurant', restaurantRouter);
router.use('/mesa', mesaRouter);
router.use('/orden', ordenRouter);
router.use('/documento', documentoRouter);
router.use('/persona', personaRouter);
router.use('/producto', productoRouter);
router.use('/mesitaqr', mesitaqrRouter);

module.exports = router;
