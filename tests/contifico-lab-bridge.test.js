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
      tables: {
        count: 8,
        source: 'pos-configuration',
        items: ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Mesa 8'],
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

  test('descarga un Launcher.exe.config compatible y de solo lectura', async () => {
    const res = await request(app).get('/lab/Launcher.exe.config').expect(200);
    expect(res.headers['content-disposition']).toContain('Launcher.exe.config');
    expect(res.text).toContain('<setting name="ConexionPos"');
    expect(res.text).toContain('Server=127.0.0.1;Database=pos_contifico;Uid=mesita_ro;Pwd=readonly;Port=3307;');
    expect(res.text).toContain('<value>MESITA_POS_CONTIFICO_COMPAT</value>');
    expect(res.text).toContain('<setting name="MesitaTableCount"');
    expect(res.text).toContain('<value>8</value>');
    expect(res.text).not.toContain('Uid=simulator');
  });
});
