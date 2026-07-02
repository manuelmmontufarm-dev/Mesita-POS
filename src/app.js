'use strict';

require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const env = require('./config/env');
const logger = require('./middlewares/logger');
const { requireApiKey } = require('./middlewares/auth');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const { connectDatabase } = require('./config/database');
const apiV1Router = require('./api/v1/index');
const apiV2Router = require('./api/v2/index');
const { ensurePlatformReady } = require('./services/platformService');

const app = express();

// ---------------------------------------------------------------------------
// Security & infrastructure middleware
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // disabled so Swagger UI inline scripts work
}));
app.use(cors());
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Rate limiting — 200 req/min per IP (Railway free tier safe)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsers (applied before routes that need JSON)
// Note: mesitaqr/webhook/ applies express.raw() at the route level for HMAC verification
app.use('/sistema/api/v1/mesitaqr/webhook/', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Database init (lazy for Vercel serverless; eager via start() on Railway/Docker)
// ---------------------------------------------------------------------------
let dbReady = false;
let dbInitPromise = null;

async function initDatabase({ fullBootstrap = false } = {}) {
  if (!env.DATABASE_URL) {
    const err = new Error('DATABASE_URL no configurada en Vercel. Agrega la URL de Supabase en Environment Variables.');
    err.statusCode = 503;
    throw err;
  }
  if (dbReady) return;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await connectDatabase();
      const skipRuntimeBootstrap = env.NODE_ENV === 'production' && env.PLATFORM_BOOTSTRAPPED;
      if (!skipRuntimeBootstrap || fullBootstrap) {
        await ensurePlatformReady();
      }
      dbReady = true;
    })().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  await dbInitPromise;
}

// Static files (demo dashboard) — served BEFORE the DB init gate so the app
// shell, JS and CSS paint instantly and never block on a cold-start Postgres
// bootstrap. express.static serves public/index.html at "/" directly (no redirect).
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database init gate — only API routes need the DB. Static assets, the
// dashboard shell and health checks skip it, so first paint is never blocked
// on the (potentially cold) database/platform bootstrap.
app.use((req, res, next) => {
  const needsDb =
    req.path.startsWith('/sistema/api/') || req.path.startsWith('/contifico/');
  if (!needsDb || req.path.includes('/health')) return next();
  initDatabase().then(() => next()).catch(next);
});

// ---------------------------------------------------------------------------
// Swagger / OpenAPI docs — lazy-loaded (keeps Vercel cold starts fast)
// ---------------------------------------------------------------------------
let swaggerSpec;

function getSwaggerSpec() {
  if (!swaggerSpec) {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'POS Mesita Demo API',
          version: '1.0.0',
          description: 'Demo POS REST API for MesitaQR + Contifico integration testing.',
        },
        servers: [{ url: '/sistema/api/v1', description: 'Current server' }],
        components: {
          securitySchemes: {
            TokenAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'Authorization',
              description: 'Use format: Token <your_api_key>',
            },
          },
        },
        security: [{ TokenAuth: [] }],
      },
      apis: [path.join(__dirname, 'api', 'v1', '*.js')],
    };
    swaggerSpec = swaggerJsdoc(swaggerOptions);
  }
  return swaggerSpec;
}

app.use(
  '/sistema/api/v1/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'POS Mesita Demo — API Docs',
    swaggerOptions: { persistAuthorization: true, spec: getSwaggerSpec() },
  })
);

app.get('/sistema/api/v1/openapi.json', (req, res) => {
  res.json(getSwaggerSpec());
});

// ---------------------------------------------------------------------------
// API routes (protected by API key)
// ---------------------------------------------------------------------------
app.get('/sistema/api/v1/health/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pos-mesita-demo',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.use('/sistema/api/v1', requireApiKey, apiV1Router);

// v2 — Contífico v2-compatible façade (frozen contract). Auth is raw-key
// (no "Token " prefix) and lives inside the router so /health/ and
// /contract-version/ stay public.
app.use('/sistema/api/v2', apiV2Router);

// Note: "/" is served directly as public/index.html by express.static above —
// no redirect, so users never see a "redirecting…" hop on load.

// ---------------------------------------------------------------------------
// Error handling (must be last)
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------
const PORT = env.PORT;

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`POS Mesita Demo running on port ${PORT}`);
      logger.info(`Swagger UI: http://localhost:${PORT}/sistema/api/v1/docs`);
      logger.info(`Dashboard:  http://localhost:${PORT}/index.html`);
      logger.info(`API base:   http://localhost:${PORT}/sistema/api/v1/`);
    });
  } catch (err) {
    logger.error('Startup failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app; // exported for tests + Vercel
module.exports.start = start;
module.exports.initDatabase = initDatabase;
