/**
 * Bootstrap endpoint — the floor map's single startup payload.
 *
 * Pins the "duplicate Mesa 1" fix: /bootstrap/ must query ONLY active
 * tables (activa: true). Deactivated tables (admin panel) previously
 * reached the floor as ghost/duplicate cards.
 */
const request = require('supertest');

process.env.API_KEY = process.env.API_KEY || 'test-api-key';

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
  it('queries ONLY active mesas (activa: true) for the floor map', async () => {
    const res = await request(app)
      .get('/sistema/api/v1/bootstrap/')
      .set('Authorization', `Token ${process.env.API_KEY}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.mesas)).toBe(true);

    const mesaCalls = mockMesaFindMany.mock.calls;
    expect(mesaCalls.length).toBeGreaterThan(0);
    const bootstrapCall = mesaCalls.find((c) => c[0]?.where?.activa !== undefined);
    expect(bootstrapCall).toBeDefined();
    expect(bootstrapCall[0].where.activa).toBe(true);
  });
});
