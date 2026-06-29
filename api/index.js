'use strict';

/**
 * Vercel serverless entry — wraps the Express app for all routes.
 */
const serverless = require('serverless-http');
const app = require('../src/app');

module.exports = serverless(app, {
  binary: ['image/*', 'application/octet-stream'],
});
