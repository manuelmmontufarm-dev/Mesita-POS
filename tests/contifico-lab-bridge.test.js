'use strict';

const fs = require('fs');
const path = require('path');

const mockQuery = jest.fn(async (sql) => {
  if (sql === 'SHOW TABLES') {
    return [[
      { Tables_in_pos_contifico: 'factura_cabecera' },
      { Tables_in_pos_contifico: 'factura_detalle' },
      { Tables_in_pos_contifico: 'inventario_producto' },
      { Tables_in_pos_contifico: 'adicional' },
    ]];
  }
  if (String(sql).startsWith('SELECT c.idfactura_cabecera AS localId')) {
    // Una fila como la escribe un Contífico real: la mesa en `adicional1` y la
    // constante de venta en `descripcion` (mesa nativa apagada → mesa = NULL).
    return [[{
      localId: 'pre-1',
      mesa: null,
      adicional1: '4 Sofi',
      adicional2: 'Manuel',
      descripcion: 'VENTA PUNTO DE VENTA',
      estado: 'P',
      posDocumento: 'PRE-1',
      totalCents: '10.00',
    }]];
  }
  if (String(sql).startsWith('SELECT id, nombre, etiqueta FROM adicional')) {
    return [[{ id: 1, nombre: 'mesa', etiqueta: 'mesa' }, { id: 2, nombre: 'mesero', etiqueta: 'mesero' }]];
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
const {
  BRIDGE_OPEN_ORDERS_QUERY,
  BRIDGE_OPEN_ORDERS_FALLBACKS,
  POS_DESCRIPCION,
  defaultAdicional1,
  normalizeAdicional,
  normalizeSaveItems,
} = require('../src/api/contifico-lab');

describe('GET /lab/bridge-check', () => {
  beforeEach(() => mockQuery.mockClear());

  test('entrega un contrato versionado que Mesita Caja puede autodetectar', async () => {
    const res = await request(app).get('/lab/bridge-check').expect(200);

    expect(res.body.checks).toEqual({
      mysql: true, schema: true, readOnly: true, query: true, adicional: true,
    });
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

  test('corre la query v5 vigente de Caja, sin degradar a un respaldo', async () => {
    const res = await request(app).get('/lab/bridge-check').expect(200);
    expect(mockQuery).toHaveBeenCalledWith(BRIDGE_OPEN_ORDERS_QUERY);
    expect(res.body.query).toEqual({ level: 0, reason: null });
  });

  test('la query lee la mesa de adicional1 y NUNCA de descripcion', () => {
    // El contrato con mesita-app/apps/mesita-caja/src/queries.js (v5):
    expect(BRIDGE_OPEN_ORDERS_QUERY).toContain("NULLIF(TRIM(c.adicional1), '') AS adicional1");
    expect(BRIDGE_OPEN_ORDERS_QUERY).toContain("NULLIF(TRIM(c.adicional2), '') AS adicional2");
    // Defecto crítico #2 del piloto: `descripcion` es una constante de venta y
    // etiquetaría TODAS las mesas igual si viajara como `mesa`.
    expect(BRIDGE_OPEN_ORDERS_QUERY).not.toContain('c.descripcion AS mesa');
    expect(BRIDGE_OPEN_ORDERS_QUERY).toContain("NULLIF(TRIM(m.nombre), '') AS mesa");
    // Defecto crítico #1: filtrar por descripcion escondía 15 de 25 cuentas.
    expect(BRIDGE_OPEN_ORDERS_QUERY).not.toContain('NOT LIKE');
    expect(BRIDGE_OPEN_ORDERS_QUERY).not.toContain('SUBSTRING_INDEX');
    // Y ningún respaldo puede reintroducir la descripción como mesa.
    for (const fallback of BRIDGE_OPEN_ORDERS_FALLBACKS) {
      expect(fallback.query).toContain("NULLIF(TRIM(c.adicional1), '') AS adicional1");
      expect(fallback.query).not.toContain('c.descripcion AS mesa');
    }
  });

  test('clasifica lo que el agente mandaría, igual que el servidor de Mesita', async () => {
    const res = await request(app).get('/lab/bridge-check').expect(200);
    expect(res.body.precuentas).toEqual([
      { localId: 'pre-1', adicional1: '4 Sofi', secuencia: 'PRE-1', total: 10, kind: 'MESA', mesaNumber: 4, billLabel: 'Sofi' },
    ]);
  });

  test('muestra el catálogo `adicional` que declara cuál slot es la mesa', async () => {
    const res = await request(app).get('/lab/bridge-check').expect(200);
    expect(res.body.adicionalCatalog).toEqual([{ id: 1, nombre: 'mesa' }, { id: 2, nombre: 'mesero' }]);
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

describe('La mesa vive en adicional1 (PILOT_FINDINGS_CASA §1)', () => {
  test('abrir "Mesa 4" escribe el número pelado, como lo teclea el mesero', () => {
    expect(defaultAdicional1('Mesa 4')).toBe('4');
    expect(defaultAdicional1('Mesa 12')).toBe('12');
    // Sin número se manda tal cual: el clasificador decidirá qué es.
    expect(defaultAdicional1('Barra')).toBe('Barra');
  });

  test('la descripción es la constante de venta del POS, nunca la mesa', () => {
    expect(POS_DESCRIPCION).toBe('VENTA PUNTO DE VENTA');
    expect(POS_DESCRIPCION).not.toMatch(/mesa/i);
  });

  test('el adicional se normaliza y respeta el varchar(300) real', () => {
    expect(normalizeAdicional('  4   Sofi ')).toBe('4 Sofi');
    // Vacío es válido: en el POS el campo es `obligatorio=0`.
    expect(normalizeAdicional('')).toBe('');
    expect(normalizeAdicional(null)).toBe('');
    expect(() => normalizeAdicional('x'.repeat(301))).toThrow('300 caracteres');
  });
});

describe('Guardar pre-cuenta al estilo Contífico', () => {
  test('normaliza y consolida líneas antes del commit MySQL', () => {
    expect(normalizeSaveItems([
      { nombre: 'Cola', precio: 1.8, cantidad: 1 },
      { nombre: 'Cola', precio: '1.80', cantidad: 2 },
      { nombre: 'Ceviche', precio: 9.5, cantidad: 1 },
    ])).toEqual([
      { nombre: 'Cola', precio: 1.8, cantidad: 3, productoId: '574e8583' },
      { nombre: 'Ceviche', precio: 9.5, cantidad: 1, productoId: '1a78e472' },
    ]);
  });

  test.each([
    [null, 'items debe ser una lista'],
    [[{ nombre: '', precio: 1, cantidad: 1 }], 'nombre de producto inválido'],
    [[{ nombre: 'Cola', precio: -1, cantidad: 1 }], 'precio inválido'],
    [[{ nombre: 'Cola', precio: 1.8, cantidad: 0 }], 'cantidad inválida'],
  ])('rechaza un borrador inválido sin tocar SQL', (items, message) => {
    expect(() => normalizeSaveItems(items)).toThrow(message);
  });

  test('la pantalla ofrece Guardar y confirma por /lab/guardar', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'contifico-lab.html'), 'utf8');
    expect(html).toContain('id="btnSave"');
    expect(html).toContain('api("/guardar", { localId, items })');
    expect(html).toContain('cambios sin guardar');
  });

  test('la pantalla muestra y deja editar el Adicional 1', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'contifico-lab.html'), 'utf8');
    expect(html).toContain('id="adic1"');
    expect(html).toContain('id="adic2"');
    expect(html).toContain('api("/adicional", { localId, adicional1: $("adic1").value, adicional2: $("adic2").value })');
    // Y las cuentas que dejan de ser mesa siguen visibles, nunca se esconden.
    expect(html).toContain('id="nomesaWrap"');
  });
});
