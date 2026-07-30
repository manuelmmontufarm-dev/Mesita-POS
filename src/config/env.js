'use strict';

require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',

  // API Key for Authorization: Token <KEY> (v1) / raw key (v2, Contifico-style).
  // FAIL CLOSED in production: the demo fallback must never satisfy auth on a
  // deploy that forgot to set API_KEY. An empty key can never match — both
  // auth middlewares reject empty credentials before comparing.
  API_KEY:
    process.env.API_KEY ||
    (process.env.NODE_ENV === 'production' ? '' : 'demo-api-key-change-in-production'),

  // MesitaQR / Paga Ya
  MESITAQR_BASE_URL: process.env.MESITAQR_BASE_URL || 'https://api.pagaya.ec',
  MESITAQR_API_KEY: process.env.MESITAQR_API_KEY || '',
  // Same fail-closed rule: an empty secret disables webhook acceptance rather
  // than allowing HMAC forgery with a public default.
  MESITAQR_WEBHOOK_SECRET:
    process.env.MESITAQR_WEBHOOK_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'demo-webhook-secret'),
  MESITAQR_QR_EXPIRY_MINUTES: parseInt(process.env.MESITAQR_QR_EXPIRY_MINUTES || '15', 10),

  // Contifico (for future live wiring — today we mock)
  CONTIFICO_BASE_URL: process.env.CONTIFICO_BASE_URL || 'https://api.contifico.com/sistema/api/v1',
  CONTIFICO_TOKEN: process.env.CONTIFICO_TOKEN || '',
  CONTIFICO_ENABLED: process.env.CONTIFICO_ENABLED === 'true',

  // Mesita table-mapping field written onto PRE/FAC documents
  // (frozen contract: MESITA_TABLE:<mesaId> in adicional1 by default;
  //  allowed: adicional1 | adicional2 | descripcion)
  MESITA_TABLE_FIELD: ['adicional1', 'adicional2', 'descripcion'].includes(
    process.env.MESITA_TABLE_FIELD
  )
    ? process.env.MESITA_TABLE_FIELD
    : 'adicional1',

  // Restaurant defaults
  RESTAURANT_RUC: process.env.RESTAURANT_RUC || '1790123456001',
  RESTAURANT_RAZON_SOCIAL: process.env.RESTAURANT_RAZON_SOCIAL || 'La Doña Pepa',
  RESTAURANT_DIRECCION: process.env.RESTAURANT_DIRECCION || 'Av. República del Salvador, Quito',
  RESTAURANT_EMAIL: process.env.RESTAURANT_EMAIL || 'contacto@ladonapepa.ec',
  RESTAURANT_PHONE: process.env.RESTAURANT_PHONE || '02-234-5678',

  // App base URL (used for QR callback URLs)
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',

  // Mesita POS write-through pilot. Mesita-app is the only service allowed to
  // hold Contifico credentials; this application acts strictly as a BFF.
  POS_PILOT_ENABLED: process.env.POS_PILOT_ENABLED === 'true',
  MESITA_APP_GATEWAY_URL:
    process.env.MESITA_APP_GATEWAY_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'),
  POS_PILOT_GATEWAY_TIMEOUT_MS: boundedInt(
    process.env.POS_PILOT_GATEWAY_TIMEOUT_MS,
    180_000,
    1_000,
    300_000
  ),
  POS_PILOT_ALLOWED_ORIGINS: String(process.env.POS_PILOT_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  // When true in production, skip runtime DDL/tenant bootstrap (done via seed/deploy).
  PLATFORM_BOOTSTRAPPED: process.env.PLATFORM_BOOTSTRAPPED === '1'
    || process.env.PLATFORM_BOOTSTRAPPED === 'true',
};

env.POS_PILOT_CONFIG_ERROR = validatePosPilotConfig(env);

// Validate required fields in production (warn only — routes return 503 if DB missing)
if (env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'API_KEY'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error(`[env] Missing recommended environment variables: ${missing.join(', ')}`);
  }
  if (env.POS_PILOT_ENABLED && env.POS_PILOT_CONFIG_ERROR) {
    console.error(`[env] POS pilot disabled by invalid configuration: ${env.POS_PILOT_CONFIG_ERROR}`);
  }
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function validatePosPilotConfig(config) {
  if (!config.POS_PILOT_ENABLED) return null;
  if (!config.MESITA_APP_GATEWAY_URL) return 'MESITA_APP_GATEWAY_URL is required.';

  try {
    const url = new URL(config.MESITA_APP_GATEWAY_URL);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'MESITA_APP_GATEWAY_URL must use http or https.';
    }
    if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      return 'MESITA_APP_GATEWAY_URL must be an origin without credentials, a path, query parameters, or a fragment.';
    }
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (config.NODE_ENV === 'production' && url.protocol !== 'https:' && !isLocal) {
      return 'MESITA_APP_GATEWAY_URL must use https in production.';
    }
  } catch (_) {
    return 'MESITA_APP_GATEWAY_URL must be an absolute URL.';
  }

  return null;
}

module.exports = env;
module.exports.validatePosPilotConfig = validatePosPilotConfig;
