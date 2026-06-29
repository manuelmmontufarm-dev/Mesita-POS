'use strict';

/**
 * Vercel serverless entry — API routes under /sistema/* only.
 */
const serverless = require('serverless-http');
const app = require('../src/app');

const handler = serverless(app, {
  binary: ['image/*', 'application/octet-stream'],
});

module.exports = handler;
module.exports.config = { maxDuration: 60 };
