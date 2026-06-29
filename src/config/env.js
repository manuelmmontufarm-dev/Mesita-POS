'use strict';

require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',

  // API Key for Authorization: Token <KEY> (Contifico-style auth)
  API_KEY: process.env.API_KEY || 'demo-api-key-change-in-production',

  // MesitaQR / Paga Ya
  MESITAQR_BASE_URL: process.env.MESITAQR_BASE_URL || 'https://api.pagaya.ec',
  MESITAQR_API_KEY: process.env.MESITAQR_API_KEY || '',
  MESITAQR_WEBHOOK_SECRET: process.env.MESITAQR_WEBHOOK_SECRET || 'demo-webhook-secret',
  MESITAQR_QR_EXPIRY_MINUTES: parseInt(process.env.MESITAQR_QR_EXPIRY_MINUTES || '15', 10),

  // Contifico (for future live wiring — today we mock)
  CONTIFICO_BASE_URL: process.env.CONTIFICO_BASE_URL || 'https://api.contifico.com/sistema/api/v1',
  CONTIFICO_TOKEN: process.env.CONTIFICO_TOKEN || '',
  CONTIFICO_ENABLED: process.env.CONTIFICO_ENABLED === 'true',

  // Restaurant defaults
  RESTAURANT_RUC: process.env.RESTAURANT_RUC || '0900000001001',
  RESTAURANT_RAZON_SOCIAL: process.env.RESTAURANT_RAZON_SOCIAL || 'Demo Restaurante S.A.',
  RESTAURANT_DIRECCION: process.env.RESTAURANT_DIRECCION || 'Guayaquil, Ecuador',

  // App base URL (used for QR callback URLs)
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',

  // When true in production, skip runtime DDL/tenant bootstrap (done via seed/deploy).
  PLATFORM_BOOTSTRAPPED: process.env.PLATFORM_BOOTSTRAPPED === '1'
    || process.env.PLATFORM_BOOTSTRAPPED === 'true',
};

// Validate required fields in production (warn only — routes return 503 if DB missing)
if (env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'API_KEY'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error(`[env] Missing recommended environment variables: ${missing.join(', ')}`);
  }
}

module.exports = env;
