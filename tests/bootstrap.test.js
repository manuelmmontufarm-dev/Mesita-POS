/**
 * Bootstrap endpoint — the floor map's single startup payload.
 *
 * Pins the "duplicate Mesa 1" fix: /bootstrap/ must query ONLY active
 * tables (activa: true). Deactivated tables (admin panel) previously
 * reached the floor as ghost/duplicate cards.
 */
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.API_KEY = process.env.API_KEY || 'test-api-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.APP_BASE_URL = 'http://localhost:3000';

const mockMesa = {
  id: 'mesa-01',
  nombre: 'Mesa 1',
  capacidad: 4,
  estado: 'L',
  ubicacion: 'Interior',
  activa: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ordenes: [],
};

const mockMesaFindMany = jest.fn().mockResolvedValue([mockMesa]);

jest.mock('@prisma/client', () => {
  const prismaMock = {
    mesa: {
      findMany: (...args) => mockMesaFindMany(...args),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(mockMesa),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockMesa),
    },
    producto: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    platformRestaurant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'rest-demo',
        tenantSchema: 'tenant_demo',
        slug: 'demo-restaurant',
        name: 'Demo Restaurant',
      }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'rest-demo',
          tenantSchema: 'tenant_demo',
          slug: 'demo-restaurant',
          name: 'Demo Restaurant',
          ...data,
        })
      ),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'rest-new', ...data })
      ),
    },
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return { PrismaClient: jest.fn(() => prismaMock) };
});

let app;
beforeAll(() => {
  app = require('../src/app');
});

describe('GET /sistema/api/v1/bootstrap/', () => {
  it('returns only active mesas (activa !== false) for the floor map', async () => {
    mockMesaFindMany.mockResolvedValueOnce([
      mockMesa,
      { ...mockMesa, id: 'mesa-ghost', nombre: 'Mesa ghost', activa: false },
    ]);

    const res = await request(app)
      .get('/sistema/api/v1/bootstrap/')
      .set('Authorization', `Token ${process.env.API_KEY}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.mesas)).toBe(true);
    expect(res.body.mesas).toHaveLength(1);
    expect(res.body.mesas.every((m) => m.activa !== false)).toBe(true);
  });
});
