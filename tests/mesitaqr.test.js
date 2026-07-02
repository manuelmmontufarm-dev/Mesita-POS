'use strict';

/**
 * Integration tests for the MesitaQR payment flow.
 *
 * These tests mock the Prisma client so they run without a real database.
 * They verify the full request/response cycle end-to-end through the Express app.
 */

const request = require('supertest');
const crypto = require('crypto');

// Set test env before importing app
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.MESITAQR_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.APP_BASE_URL = 'http://localhost:3000';

// Mock Prisma to avoid real DB calls
jest.mock('@prisma/client', () => {
  const mockMesa = {
    id: 'mesa-uuid-1',
    nombre: 'Mesa 1',
    capacidad: 4,
    estado: 'O',
    activa: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockOrden = {
    id: 'orden-uuid-1',
    mesaId: 'mesa-uuid-1',
    estado: 'A',
    descripcion: 'Test orden',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockSession = {
    id: 'session-db-id',
    sessionId: 'session-uuid-1',
    mesaId: 'mesa-uuid-1',
    ordenId: 'orden-uuid-1',
    montoTotal: 23.00,
    qrCode: 'data:image/png;base64,MOCKQR',
    qrUrl: 'http://localhost:3000/pay/session-uuid-1',
    estado: 'pendiente',
    expiraEn: new Date(Date.now() + 15 * 60 * 1000),
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prismaMock = {
    mesa: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockMesa),
      findUnique: jest.fn().mockResolvedValue(mockMesa),
      update: jest.fn().mockResolvedValue(mockMesa),
      findMany: jest.fn().mockResolvedValue([mockMesa]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(mockMesa),
    },
    orden: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockOrden),
      findUnique: jest.fn().mockResolvedValue(mockOrden),
      update: jest.fn().mockResolvedValue(mockOrden),
      findMany: jest.fn().mockResolvedValue([mockOrden]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(mockOrden),
    },
    mesitaqrSession: {
      create: jest.fn().mockResolvedValue(mockSession),
      update: jest.fn().mockResolvedValue({ ...mockSession, estado: 'pagado', paidAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(mockSession),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockSession),
    },
    documento: {
      create: jest.fn().mockResolvedValue({
        id: 'doc-uuid-1',
        tipoDocumento: 'FAC',
        estado: 'F',
        total: 23.00,
        autorizacionSRI: 'MOCK-AUTH',
        urlRide: 'https://demo.pos-mesita.ec/ride/MOCK',
        urlXml: 'https://demo.pos-mesita.ec/xml/MOCK',
        cobros: [],
        detallesDoc: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'doc-uuid-1', cobros: [], detallesDoc: [] }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    cobro: {
      create: jest.fn().mockResolvedValue({ id: 'cobro-1', formaCobro: 'EF', monto: 23.00 }),
    },
    webhookLog: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Platform bootstrap models (multi-tenant registry in public schema)
    platformRestaurant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'rest-demo-1',
        tenantSchema: 'tenant_demo',
        slug: 'demo-restaurant',
        name: 'Demo Restaurant',
        serviceChargeEnabled: true,
        serviceChargeRate: 0.1,
        setupCompleted: true,
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
      create: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
      update: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
    },
    platformUser: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    platformMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    platformSession: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    categoria: { upsert: jest.fn().mockResolvedValue({}) },
    producto: { upsert: jest.fn().mockResolvedValue({}) },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    // Platform bootstrap (ensurePlatformReady/ensureTenantSchema) runs raw SQL.
    // tableExists() checks Boolean(rows[0].name) — null ⇒ table absent ⇒ copy skipped.
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ name: null }]),
    $transaction: jest.fn(async (arg) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
    ),
  };

  return { PrismaClient: jest.fn(() => prismaMock) };
});

// Lazy-load app after mocks are set up
let app;
beforeAll(() => {
  app = require('../src/app');
});

const AUTH = { Authorization: 'Token test-api-key' };

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe('GET /sistema/api/v1/health/', () => {
  it('returns 200 without auth', async () => {
    const res = await request(app).get('/sistema/api/v1/health/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('pos-mesita-demo');
  });
});

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
describe('Auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const res = await request(app).get('/sistema/api/v1/mesa/');
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const res = await request(app)
      .get('/sistema/api/v1/mesa/')
      .set('Authorization', 'Token wrong-key');
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct token', async () => {
    const res = await request(app)
      .get('/sistema/api/v1/mesa/')
      .set(AUTH);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// MesitaQR — solicitar-pago
// ---------------------------------------------------------------------------
describe('POST /sistema/api/v1/mesitaqr/solicitar-pago/', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/sistema/api/v1/mesitaqr/solicitar-pago/')
      .set(AUTH)
      .send({ mesa_id: 'mesa-uuid-1' });  // missing orden_id + monto_total
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when monto_total is 0', async () => {
    const res = await request(app)
      .post('/sistema/api/v1/mesitaqr/solicitar-pago/')
      .set(AUTH)
      .send({ mesa_id: 'mesa-uuid-1', orden_id: 'orden-uuid-1', monto_total: 0 });
    expect(res.status).toBe(400);
  });

  it('returns valid QR payload for correct input', async () => {
    const res = await request(app)
      .post('/sistema/api/v1/mesitaqr/solicitar-pago/')
      .set(AUTH)
      .send({ mesa_id: 'mesa-uuid-1', orden_id: 'orden-uuid-1', monto_total: 23.00 });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBeDefined();
    expect(res.body.qr_url).toBeDefined();
    expect(res.body.qr_code).toBeDefined();
    expect(res.body.expira_en).toBeDefined();
    expect(Number(res.body.monto_total)).toBe(23.00);
  });
});

// ---------------------------------------------------------------------------
// MesitaQR — estado
// ---------------------------------------------------------------------------
describe('GET /sistema/api/v1/mesitaqr/estado/:session_id/', () => {
  it('returns session estado', async () => {
    const res = await request(app)
      .get('/sistema/api/v1/mesitaqr/estado/session-uuid-1/')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe('session-uuid-1');
    expect(['pendiente', 'pagado', 'expirado']).toContain(res.body.estado);
  });
});

// ---------------------------------------------------------------------------
// MesitaQR — webhook
// ---------------------------------------------------------------------------
describe('POST /sistema/api/v1/mesitaqr/webhook/', () => {
  function sign(body) {
    return crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(body)
      .digest('hex');
  }

  it('rejects webhook with missing signature', async () => {
    const body = JSON.stringify({ session_id: 'session-uuid-1', estado: 'pagado' });
    const res = await request(app)
      .post('/sistema/api/v1/mesitaqr/webhook/')
      .set('Content-Type', 'application/json')
      .send(body);
    // Note: webhook route does NOT require API key but requires HMAC signature
    expect(res.status).toBe(401);
  });

  it('processes a valid signed webhook', async () => {
    const body = JSON.stringify({
      session_id: 'session-uuid-1',
      estado: 'pagado',
      monto_pagado: 23.00,
    });
    const sig = sign(body);

    const res = await request(app)
      .post('/sistema/api/v1/mesitaqr/webhook/')
      .set('Content-Type', 'application/json')
      .set('X-MesitaQR-Signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects webhook with tampered body', async () => {
    const body = JSON.stringify({ session_id: 'session-uuid-1', estado: 'pagado' });
    const tampered = JSON.stringify({ session_id: 'session-uuid-1', estado: 'expirado' });
    const sig = sign(body);  // sign original, send tampered

    const res = await request(app)
      .post('/sistema/api/v1/mesitaqr/webhook/')
      .set('Content-Type', 'application/json')
      .set('X-MesitaQR-Signature', sig)
      .send(tampered);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------------
describe('Mesa endpoints', () => {
  it('GET /mesa/ returns list', async () => {
    const res = await request(app).get('/sistema/api/v1/mesa/').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('POST /mesa/ creates mesa', async () => {
    const res = await request(app)
      .post('/sistema/api/v1/mesa/')
      .set(AUTH)
      .send({ nombre: 'Mesa Test', capacidad: 4 });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe('Mesa 1'); // mock returns mockMesa
  });

  it('POST /mesa/ returns 400 without nombre', async () => {
    const res = await request(app)
      .post('/sistema/api/v1/mesa/')
      .set(AUTH)
      .send({ capacidad: 4 });
    expect(res.status).toBe(400);
  });
});
