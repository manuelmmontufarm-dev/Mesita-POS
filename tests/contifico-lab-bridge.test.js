'use strict';

const mockQuery = jest.fn(async (sql) => {
  if (sql === 'SHOW TABLES') {
    return [[
      { Tables_in_pos_contifico: 'factura_cabecera' },
      { Tables_in_pos_contifico: 'factura_detalle' },
      { Tables_in_pos_contifico: 'inventario_producto' },
    ]];
  }
  if (String(sql).startsWith('SELECT c.idfactura_cabecera AS localId')) {
    return [[{ localId: 'pre-1', mesa: 'Mesa 4', estado: 'P', totalCents: '10.00' }]];
  }
  if (String(sql).startsWith('DELETE FROM factura_cabecera')) {
    throw new Error('DELETE command denied to user mesita_ro');
  }
  throw new Error(`query inesperada: ${sql}`);
});

jest.mock('mysql2/promise', () => ({
  createConnection: jest.fn(async () => ({ query: mockQuery, end: jest.fn(async () => {}) })),
  createPool: jest.fn(),
}), { virtual: true });

process.env.CONTIFICO_LAB = '1';
const request = require('supertest');
const app = require('../src/app');
const { BRIDGE_OPEN_ORDERS_QUERY } = require('../src/api/contifico-lab');

describe('GET /lab/bridge-check', () => {
  beforeEach(() => mockQuery.mockClear());

  test('entrega un contrato versionado que Mesita Caja puede autodetectar', async () => {
    const res = await request(app).get('/lab/bridge-check').expect(200);

    expect(res.body.checks).toEqual({ mysql: true, schema: true, readOnly: true, query: true });
    expect(res.body.setup).toEqual({
      version: 1,
      provider: 'MESITA_POS_CONTIFICO_COMPAT',
      launcherRequired: false,
      readonlyAlreadyProvisioned: true,
      mysql: {
        host: '127.0.0.1',
        port: 3307,
        database: 'pos_contifico',
        user: 'mesita_ro',
        password: 'readonly',
      },
    });
    expect(res.body.setup).not.toHaveProperty('admin');
  });

  test('verifica con la query vigente de Caja, sin exigir MESITA_TABLE', async () => {
    await request(app).get('/lab/bridge-check').expect(200);
    expect(mockQuery).toHaveBeenCalledWith(BRIDGE_OPEN_ORDERS_QUERY);
    expect(BRIDGE_OPEN_ORDERS_QUERY).toContain("c.descripcion IS NULL OR c.descripcion NOT LIKE 'VENTA DESDE PUNTO DE VENTA%'");
    expect(BRIDGE_OPEN_ORDERS_QUERY).not.toContain("c.descripcion LIKE 'MESITA_TABLE:%'");
  });
});
