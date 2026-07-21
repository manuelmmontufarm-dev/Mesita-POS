'use strict';

const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.POS_PILOT_ENABLED = 'true';
process.env.MESITA_APP_GATEWAY_URL = 'https://gateway.mesita.test';
process.env.POS_PILOT_GATEWAY_TIMEOUT_MS = '1000';
process.env.APP_BASE_URL = 'http://localhost:3001';

const router = require('../src/api/posPilot');
const { errorHandler } = require('../src/middlewares/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/pos-pilot', router);
  app.use(errorHandler);
  return app;
}

function gatewayResponse(status, payload, headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    status,
    headers: { get: (name) => normalized[String(name).toLowerCase()] || null },
    text: jest.fn().mockResolvedValue(payload == null ? '' : JSON.stringify(payload)),
  };
}

const app = buildApp();
const COOKIE = `${router.SESSION_COOKIE}=signed.shift.token`;
const ALLOWED_ORIGIN = 'http://localhost:3001';
const originalFetch = global.fetch;

const ROUTE_CASES = [
  ['GET', '/catalog', '/catalog'],
  ['POST', '/catalog/refresh', '/catalog/refresh'],
  ['GET', '/zones', '/zones'],
  ['POST', '/zones', '/zones'],
  ['PATCH', '/zones/zone 1', '/zones/zone%201'],
  ['DELETE', '/zones/zone-1', '/zones/zone-1'],
  ['GET', '/tables', '/tables'],
  ['POST', '/tables', '/tables'],
  ['PATCH', '/tables/table 1', '/tables/table%201'],
  ['DELETE', '/tables/table-1', '/tables/table-1'],
  ['POST', '/bills', '/bills'],
  ['GET', '/bills/bill-1', '/bills/bill-1'],
  ['PUT', '/bills/bill-1/draft', '/bills/bill-1/draft'],
  ['POST', '/bills/bill-1/sync', '/bills/bill-1/sync'],
  ['POST', '/bills/bill-1/cancel', '/bills/bill-1/cancel'],
  ['GET', '/bills/bill-1/print', '/bills/bill-1/print'],
  ['POST', '/bills/bill-1/settlements', '/bills/bill-1/settlements'],
  ['POST', '/bills/bill-1/settlements/pay 1/reconcile', '/bills/bill-1/settlements/pay%201/reconcile'],
  ['GET', '/history?limit=20', '/history?limit=20'],
  ['POST', '/conflicts/conflict-1/resolve', '/conflicts/conflict-1/resolve'],
];

const MUTATING_ROUTE_CASES = ROUTE_CASES.filter(([method]) => !['GET', 'HEAD', 'OPTIONS'].includes(method));

beforeEach(() => {
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('Mesita POS pilot SSO', () => {
  test('requires a valid ticket and never returns the access token in JSON', async () => {
    const invalid = await request(app)
      .post('/api/pos-pilot/session/exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ ticket: '' });
    expect(invalid.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    global.fetch.mockResolvedValueOnce(
      gatewayResponse(200, {
        accessToken: 'gateway-secret-token',
        expiresAt,
        user: { id: 'user-1', name: 'Ana', role: 'SERVER', restaurantId: 'rest-1' },
      })
    );

    const res = await request(app)
      .post('/api/pos-pilot/session/exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ ticket: 'one-use-ticket' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      expiresAt,
      user: { id: 'user-1', name: 'Ana', role: 'SERVER', restaurantId: 'rest-1' },
    });
    expect(JSON.stringify(res.body)).not.toContain('gateway-secret-token');
    expect(res.headers['set-cookie'][0]).toContain(`${router.SESSION_COOKIE}=gateway-secret-token`);
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(res.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(res.headers['set-cookie'][0]).toContain('Path=/api/pos-pilot');

    const [url, options] = global.fetch.mock.calls[0];
    expect(String(url)).toBe('https://gateway.mesita.test/api/pos-console/sso/exchange');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({ ticket: 'one-use-ticket' });
  });

  test('rejects missing and cross-origin mutation attempts before contacting Mesita', async () => {
    const missing = await request(app)
      .post('/api/pos-pilot/session/exchange')
      .send({ ticket: 'stolen-ticket' });
    expect(missing.status).toBe(403);

    const crossOrigin = await request(app)
      .post('/api/pos-pilot/session/exchange')
      .set('Origin', 'https://evil.example')
      .send({ ticket: 'stolen-ticket' });
    expect(crossOrigin.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('requires an allowed origin before clearing the shift cookie on logout', async () => {
    const missing = await request(app).delete('/api/pos-pilot/session').set('Cookie', COOKIE);
    expect(missing.status).toBe(403);
    expect(missing.headers['set-cookie']).toBeUndefined();

    const crossOrigin = await request(app)
      .delete('/api/pos-pilot/session')
      .set('Cookie', COOKIE)
      .set('Origin', 'https://evil.example');
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.headers['set-cookie']).toBeUndefined();

    const res = await request(app)
      .delete('/api/pos-pilot/session')
      .set('Cookie', COOKIE)
      .set('Origin', ALLOWED_ORIGIN);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toContain(`${router.SESSION_COOKIE}=`);
    expect(res.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});

describe('Mesita POS pilot gateway proxy', () => {
  test('requires the HttpOnly session and ignores browser Authorization headers', async () => {
    const missing = await request(app).get('/api/pos-pilot/bootstrap');
    expect(missing.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch.mockResolvedValueOnce(gatewayResponse(200, { user: { role: 'SERVER' } }));
    const ok = await request(app)
      .get('/api/pos-pilot/bootstrap')
      .set('Cookie', COOKIE)
      .set('Authorization', 'Bearer browser-controlled-token');
    expect(ok.status).toBe(200);

    const [url, options] = global.fetch.mock.calls[0];
    expect(String(url)).toBe('https://gateway.mesita.test/api/pos-console/v1/bootstrap');
    expect(options.headers.Authorization).toBe('Bearer signed.shift.token');
  });

  test.each(ROUTE_CASES)('maps %s %s to the allow-listed gateway path', async (method, localPath, upstreamPath) => {
    global.fetch.mockResolvedValueOnce(gatewayResponse(200, { ok: true }));
    const call = request(app)[method.toLowerCase()](`/api/pos-pilot${localPath}`).set('Cookie', COOKIE);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) call.set('Origin', ALLOWED_ORIGIN);
    if (!['GET', 'DELETE'].includes(method)) call.send({ sample: true });
    const res = await call;
    expect(res.status).toBe(200);
    expect(String(global.fetch.mock.calls[0][0])).toBe(
      `https://gateway.mesita.test/api/pos-console/v1${upstreamPath}`
    );
    expect(global.fetch.mock.calls[0][1].method).toBe(method);
  });

  test.each(MUTATING_ROUTE_CASES)(
    'rejects %s %s when Origin is missing',
    async (method, localPath) => {
      const call = request(app)[method.toLowerCase()](`/api/pos-pilot${localPath}`).set('Cookie', COOKIE);
      if (method !== 'DELETE') call.send({ sample: true });
      const res = await call;
      expect(res.status).toBe(403);
      expect(res.body.detail).toMatch(/origen permitido/i);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  test('preserves gateway status/JSON and clears an expired session on 401', async () => {
    global.fetch.mockResolvedValueOnce(
      gatewayResponse(401, { error: 'Unauthorized', detail: 'Shift expired' }, { 'x-request-id': 'req-1' })
    );
    const res = await request(app).get('/api/pos-pilot/bootstrap').set('Cookie', COOKIE);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', detail: 'Shift expired' });
    expect(res.headers['x-request-id']).toBe('req-1');
    expect(res.headers['set-cookie'][0]).toContain(`${router.SESSION_COOKIE}=`);
  });

  test('maps network and invalid-JSON failures to safe gateway errors', async () => {
    global.fetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED secret-host'));
    const unavailable = await request(app).get('/api/pos-pilot/bootstrap').set('Cookie', COOKIE);
    expect(unavailable.status).toBe(502);
    expect(unavailable.body.error).toBe('Internal server error');
    expect(JSON.stringify(unavailable.body)).not.toContain('secret-host');

    global.fetch.mockResolvedValueOnce({
      status: 200,
      headers: { get: () => null },
      text: jest.fn().mockResolvedValue('<html>upstream failure</html>'),
    });
    const invalid = await request(app).get('/api/pos-pilot/bootstrap').set('Cookie', COOKIE);
    expect(invalid.status).toBe(502);
    expect(JSON.stringify(invalid.body)).not.toContain('<html>');
  });

  test('aborts a stalled gateway response at the configured deadline', async () => {
    global.fetch.mockImplementationOnce((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    const res = await request(app).get('/api/pos-pilot/bootstrap').set('Cookie', COOKIE);
    expect(res.status).toBe(504);
    expect(res.body.detail).toMatch(/demasiado/i);
  });
});
