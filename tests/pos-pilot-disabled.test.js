'use strict';

const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.POS_PILOT_ENABLED = 'false';

const router = require('../src/api/posPilot');

test('the pilot API is undiscoverable while its deployment flag is off', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  const app = express();
  app.use(express.json());
  app.use('/api/pos-pilot', router);

  const res = await request(app).get('/api/pos-pilot/bootstrap');
  expect(res.status).toBe(404);
  expect(global.fetch).not.toHaveBeenCalled();
  global.fetch = originalFetch;
});
