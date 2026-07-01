'use strict';

/**
 * Contract tests for the Contifico-compatibility surface
 * (/contifico/sistema/api/v1). These assert byte-for-byte parity with
 * Contifico's documented shapes, verbs and auth. Prisma is mocked, so no DB.
 */

const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.APP_BASE_URL = 'http://localhost:3000';

const mockDoc = {
  id: 'doc-uuid-1',
  ordenId: null,
  personaId: 'persona-uuid-1',
  pos: 'pos-token-1',
  fechaEmision: '10/06/2026',
  tipoDocumento: 'PRE',
  tipoRegistro: 'CLI',
  estado: 'P',
  electronico: true,
  descripcion: 'PRE MESA 5',
  subtotal0: 0,
  subtotal15: 18.26,
  iva: 2.74,
  servicio: 2.0,
  total: 23.0,
  autorizacionSRI: null,
  claveAcceso: null,
  urlRide: null,
  urlXml: null,
  clienteCedula: '0922054366',
  clienteRuc: '0922054366001',
  clienteRazonSocial: 'Juan Pérez',
  clienteTipo: 'N',
  clienteEmail: 'cliente@example.com',
  clienteTelefonos: '0988800001',
  clienteDireccion: 'Guayaquil',
  clienteExtranjero: false,
  cobros: [{ id: 'cobro-1', formaCobro: 'CH', monto: 10.0, propina: 1.0, referencia: 'MESITAQR:abc', procesador: null, detalle: null, createdAt: new Date() }],
  detallesDoc: [
    { id: 'det-1', productoId: 'prod-1', cantidad: 2, precio: 8.5, porcentajeIva: 15, porcentajeDescuento: 0, baseCero: 0, baseGravable: 17.0, baseNoGravable: 0 },
  ],
  orden: null,
  persona: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFAC = {
  ...mockDoc,
  tipoDocumento: 'FAC',
  estado: 'F',
  autorizacionSRI: 'MOCK-AUTH-123',
  claveAcceso: 'DEMO123456789',
  urlRide: 'https://demo.pos-mesita.ec/ride/DEMO123456789',
  urlXml: 'https://demo.pos-mesita.ec/xml/DEMO123456789',
};

const mockPersona = {
  id: 'persona-uuid-1', cedula: '0922054366', ruc: null, razonSocial: 'Juan Pérez',
  tipo: 'N', email: 'x@y.com', telefonos: '099', direccion: 'GYE', esExtranjero: false,
  activo: true, createdAt: new Date(), updatedAt: new Date(),
};

const mockProducto = {
  id: 'prod-1', codigo: 'P001', nombre: 'Ceviche', descripcion: 'rico', precio: 8.5,
  categoriaId: 'cat-1', categoria: { id: 'cat-1', nombre: 'Platos' }, porcentajeIva: 15,
  disponible: true, createdAt: new Date(), updatedAt: new Date(),
};

const mockCategoria = { id: 'cat-1', nombre: 'Platos', orden: 1, activa: true, createdAt: new Date() };

jest.mock('@prisma/client', () => {
  const prismaMock = {
    documento: {
      create: jest.fn().mockResolvedValue(mockDoc),
      findUnique: jest.fn().mockResolvedValue(mockDoc),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockDoc),
      findMany: jest.fn().mockResolvedValue([mockDoc]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(mockDoc),
    },
    documentoDetalle: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cobro: {
      create: jest.fn((args) => Promise.resolve({ id: 'cobro-new', createdAt: new Date(), ...(args && args.data) })),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(mockDoc.cobros),
      delete: jest.fn().mockResolvedValue({ id: 'cobro-1' }),
    },
    persona: {
      upsert: jest.fn().mockResolvedValue(mockPersona),
      create: jest.fn().mockResolvedValue(mockPersona),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockPersona),
      findMany: jest.fn().mockResolvedValue([mockPersona]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(mockPersona),
    },
    producto: {
      findMany: jest.fn().mockResolvedValue([mockProducto]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockProducto),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(mockProducto),
      update: jest.fn().mockResolvedValue(mockProducto),
    },
    categoria: { findMany: jest.fn().mockResolvedValue([mockCategoria]) },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return { PrismaClient: jest.fn(() => prismaMock) };
});

// Skip the platform bootstrap that app.js runs on first request.
jest.mock('../src/services/platformService', () => ({
  ensurePlatformReady: jest.fn().mockResolvedValue(undefined),
  getDemoAuthContext: jest.fn().mockResolvedValue({ tenantSchema: null, restaurant: { id: 'r1' } }),
  authenticateSession: jest.fn().mockResolvedValue({ tenantSchema: null, restaurant: { id: 'r1' } }),
}));

let app;
beforeAll(() => {
  jest.resetModules();
  app = require('../src/app');
});

const BASE = '/contifico/sistema/api/v1';
// Contifico-style raw API key (no scheme word).
const AUTH = { Authorization: 'test-api-key' };

describe('Contifico-compat auth', () => {
  it('rejects requests without Authorization (401)', async () => {
    const res = await request(app).get(`${BASE}/documento/`);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid key (401)', async () => {
    const res = await request(app).get(`${BASE}/documento/`).set({ Authorization: 'wrong-key' });
    expect(res.status).toBe(401);
  });

  it('accepts the raw API key', async () => {
    const res = await request(app).get(`${BASE}/documento/`).set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('GET /documento/ (Contifico shape)', () => {
  it('returns a BARE ARRAY (not {count,results})', async () => {
    const res = await request(app).get(`${BASE}/documento/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.count).toBeUndefined();
  });

  it('serializes a documento exactly like Contifico', async () => {
    const res = await request(app).get(`${BASE}/documento/`).set(AUTH);
    const doc = res.body[0];
    // Document number synthesized in Contifico's NNN-NNN-NNNNNNNNN format
    expect(doc.documento).toMatch(/^\d{3}-\d{3}-\d{9}$/);
    // Monetary totals are STRINGS with 2 decimals
    expect(doc.total).toBe('23.00');
    expect(doc.iva).toBe('2.74');
    expect(doc.subtotal_15).toBe('18.26');
    // Contifico's published key alias is present too
    expect(doc.subtotal_12).toBe('18.26');
    expect(doc.ice).toBe('0.00');
    // detalle numbers are NUMBERS with the full Contifico field set
    const det = doc.detalles[0];
    expect(typeof det.cantidad).toBe('number');
    expect(det).toHaveProperty('base_gravable');
    expect(det).toHaveProperty('porcentaje_ice');
    expect(det).toHaveProperty('irbpnr');
    // cobro carries the full Contifico field set + CH mapped to CQ
    const cobro = doc.cobros[0];
    expect(cobro.forma_cobro).toBe('CQ');
    expect(cobro.monto).toBe('10.00');
    expect(cobro).toHaveProperty('numero_cheque');
    expect(cobro).toHaveProperty('tipo_ping');
    // cliente snapshot
    expect(doc.cliente.razon_social).toBe('Juan Pérez');
    expect(doc.tipo_documento).toBe('PRE');
    // DD/MM/YYYY passes through unchanged (not reinterpreted as MM/DD)
    expect(doc.fecha_emision).toBe('10/06/2026');
  });
});

describe('GET /registro/documento/ (list alias)', () => {
  it('returns a bare array', async () => {
    const res = await request(app).get(`${BASE}/registro/documento/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /documento/', () => {
  it('creates a PRE and returns Contifico shape (no SRI fields yet)', async () => {
    const res = await request(app).post(`${BASE}/documento/`).set(AUTH).send({
      fecha_emision: '10/06/2026', tipo_documento: 'PRE', total: 23.0,
      subtotal_12: 18.26, iva: 2.74, servicio: 2.0,
      cliente: { cedula: '0922054366', razon_social: 'Juan Pérez', tipo: 'N' },
      detalles: [{ producto_id: 'prod-1', cantidad: 2, precio: 8.5, porcentaje_iva: 15, base_gravable: 17 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.tipo_documento).toBe('PRE');
    expect(res.body.autorizacion).toBeNull();
    expect(res.body.url_ride).toBeNull();
  });

  it('rejects unsupported tipo_documento (400)', async () => {
    const res = await request(app).post(`${BASE}/documento/`).set(AUTH).send({ tipo_documento: 'LQC' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /documento/{id}/sri/ (emit electronic invoice)', () => {
  it('issues SRI fields and marks the document facturado', async () => {
    const { PrismaClient } = require('@prisma/client');
    const instance = new PrismaClient();
    instance.documento.findUniqueOrThrow.mockResolvedValueOnce(mockDoc);
    instance.documento.findUnique.mockResolvedValue(mockFAC);

    const res = await request(app).put(`${BASE}/documento/doc-uuid-1/sri/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.url_ride).toBeTruthy();
    expect(res.body.autorizacion).toBeTruthy();
    expect(res.body.estado).toBe('F');
  });
});

describe('/documento/{id}/cobro/', () => {
  it('lists cobros as a bare array', async () => {
    const res = await request(app).get(`${BASE}/documento/doc-uuid-1/cobro/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('registers a cobro and maps forma_cobro CQ -> CH internally', async () => {
    const res = await request(app).post(`${BASE}/documento/doc-uuid-1/cobro/`).set(AUTH)
      .send({ forma_cobro: 'CQ', monto: 5.0 });
    expect(res.status).toBe(201);
    // Response re-serializes CH back to Contifico's CQ
    expect(res.body.forma_cobro).toBe('CQ');
    expect(res.body.monto).toBe('5.00');
  });
});

describe('GET /persona/ + /producto/ (bare arrays, Contifico shape)', () => {
  it('persona list is a bare array with role flags', async () => {
    const res = await request(app).get(`${BASE}/persona/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].es_cliente).toBe(true);
    expect(res.body[0]).toHaveProperty('nombre_comercial');
  });

  it('producto list uses pvp1 + estado + tipo', async () => {
    const res = await request(app).get(`${BASE}/producto/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const p = res.body[0];
    expect(p.pvp1).toBe('8.50');
    expect(p.estado).toBe('A');
    expect(p.tipo).toBe('PRO');
  });

  it('producto stock endpoint returns a bodega array', async () => {
    const res = await request(app).get(`${BASE}/producto/prod-1/stock/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('bodega_id');
  });
});

describe('Unsupported modules return empty collections', () => {
  it('GET /bodega/ -> []', async () => {
    const res = await request(app).get(`${BASE}/bodega/`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
