'use strict';

/**
 * Contract tests for the /sistema/api/v2 Contífico-compatible façade.
 * Frozen contract: mesita-app contracts/contifico-v2/README.md.
 * Fixtures: tests/contract/fixtures (copied from the app repo — canonical there).
 */

const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.APP_BASE_URL = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Stateful in-memory Prisma mock — enough behavior for the v2 façade paths.
// State is exposed on globalThis.__v2db so tests can seed/reset.
// ---------------------------------------------------------------------------
jest.mock('@prisma/client', () => {
  const db = {
    documentos: [],
    detalles: [],
    cobros: [],
    personas: [],
    ordenes: [],
    productos: [],
    seq: 1,
  };
  globalThis.__v2db = db;

  const uid = (p) => `${p}-${db.seq++}`;

  const matchesWhere = (doc, where = {}) => {
    for (const [k, v] of Object.entries(where)) {
      if (k === 'OR' || v === undefined) continue;
      if (typeof v === 'object' && v !== null && 'in' in v) {
        if (!v.in.includes(doc[k])) return false;
      } else if (doc[k] !== v) {
        return false;
      }
    }
    return true;
  };

  const withIncludes = (doc, include = {}) => {
    if (!doc) return doc;
    const out = { ...doc };
    if (include.cobros) out.cobros = db.cobros.filter((c) => c.documentoId === doc.id);
    if (include.detallesDoc) out.detallesDoc = db.detalles.filter((d) => d.documentoId === doc.id);
    if (include.persona) out.persona = null;
    if (include.orden) out.orden = db.ordenes.find((o) => o.id === doc.ordenId) || null;
    return out;
  };

  const notFound = () => {
    const err = new Error('Record not found');
    err.code = 'P2025';
    throw err;
  };

  const prismaMock = {
    documento: {
      count: jest.fn(async ({ where } = {}) => db.documentos.filter((d) => matchesWhere(d, where)).length),
      findMany: jest.fn(async ({ where, skip = 0, take = 100, include } = {}) =>
        db.documentos
          .filter((d) => matchesWhere(d, where))
          .slice()
          .reverse() // createdAt desc ≈ insertion order reversed
          .slice(skip, skip + take)
          .map((d) => withIncludes(d, include))
      ),
      findUnique: jest.fn(async ({ where, include } = {}) => {
        const doc = db.documentos.find((d) => d.id === where.id) || null;
        return doc ? withIncludes(doc, include) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where, include } = {}) => {
        const doc = db.documentos.find((d) => d.id === where.id);
        if (!doc) notFound();
        return withIncludes(doc, include);
      }),
      create: jest.fn(async ({ data }) => {
        const doc = { id: uid('doc'), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.documentos.push(doc);
        return doc;
      }),
      update: jest.fn(async ({ where, data, include } = {}) => {
        const doc = db.documentos.find((d) => d.id === where.id);
        if (!doc) notFound();
        Object.assign(doc, data, { updatedAt: new Date() });
        return withIncludes(doc, include);
      }),
      updateMany: jest.fn(async ({ where, data } = {}) => {
        const targets = db.documentos.filter((d) => matchesWhere(d, where));
        targets.forEach((d) => Object.assign(d, data));
        return { count: targets.length };
      }),
    },
    documentoDetalle: {
      createMany: jest.fn(async ({ data }) => {
        for (const row of data) db.detalles.push({ id: uid('det'), createdAt: new Date(), ...row });
        return { count: data.length };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const before = db.detalles.length;
        db.detalles = db.detalles.filter((detail) => !matchesWhere(detail, where));
        return { count: before - db.detalles.length };
      }),
    },
    cobro: {
      create: jest.fn(async ({ data }) => {
        const cobro = { id: uid('cob'), createdAt: new Date(), ...data };
        db.cobros.push(cobro);
        return cobro;
      }),
      createMany: jest.fn(async ({ data }) => {
        for (const row of data) db.cobros.push({ id: uid('cob'), createdAt: new Date(), ...row });
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where } = {}) =>
        db.cobros.filter((c) => matchesWhere(c, where))
      ),
    },
    persona: {
      findMany: jest.fn(async ({ where } = {}) => {
        if (!where || Object.keys(where).length === 0) return db.personas.slice(0, 50);
        if (where.OR) {
          return db.personas.filter((p) =>
            where.OR.some((cond) => {
              if (cond.cedula) return p.cedula === cond.cedula;
              if (cond.ruc) return p.ruc === cond.ruc;
              if (cond.razonSocial?.contains) {
                return (p.razonSocial || '')
                  .toLowerCase()
                  .includes(cond.razonSocial.contains.toLowerCase());
              }
              return false;
            })
          );
        }
        return db.personas.filter((p) => matchesWhere(p, where));
      }),
      create: jest.fn(async ({ data }) => {
        const persona = { id: uid('per'), createdAt: new Date(), ...data };
        db.personas.push(persona);
        return persona;
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const existing = db.personas.find((p) => p.cedula === where.cedula);
        if (existing) {
          Object.assign(
            existing,
            Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined))
          );
          return existing;
        }
        const persona = { id: uid('per'), createdAt: new Date(), ...create };
        db.personas.push(persona);
        return persona;
      }),
    },
    producto: {
      count: jest.fn(async () => db.productos.length),
      findMany: jest.fn(async ({ where, skip = 0, take = 100 } = {}) =>
        db.productos
          .filter((p) => (where?.id?.in ? where.id.in.includes(p.id) : true))
          .slice(skip, skip + take)
      ),
      upsert: jest.fn(async () => ({})),
    },
    orden: {
      findUnique: jest.fn(async ({ where } = {}) => db.ordenes.find((o) => o.id === where.id) || null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
    },
    // Platform bootstrap models
    platformRestaurant: {
      findUnique: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
      create: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
      update: jest.fn().mockResolvedValue({ id: 'rest-demo-1', tenantSchema: 'tenant_demo' }),
    },
    platformUser: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'u1' }) },
    platformMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    platformSession: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    categoria: { upsert: jest.fn().mockResolvedValue({}) },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ name: null }]),
    $transaction: jest.fn(async (arg) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
    ),
  };

  return { PrismaClient: jest.fn(() => prismaMock) };
});

let app;
beforeAll(() => {
  jest.resetModules();
  app = require('../src/app');
});

const db = () => globalThis.__v2db;
const RAW_AUTH = { Authorization: 'test-api-key' }; // v2: raw key, no prefix

function seedOpenPre(overrides = {}) {
  const state = db();
  const doc = {
    id: `doc-seed-${state.seq++}`,
    ordenId: null,
    personaId: null,
    pos: '3f2a9c1e-5b7d-4e8a-9c6f-0d1e2f3a4b5c',
    fechaEmision: '01/07/2026',
    tipoDocumento: 'PRE',
    tipoRegistro: 'CLI',
    estado: 'P',
    electronico: false,
    descripcion: 'PRE MESA 12',
    referencia: 'MESITA_ORDER:bill-seed-1',
    adicional1: 'MESITA_TABLE:mesa-uuid-12',
    adicional2: null,
    subtotal0: 0,
    subtotal15: 18.26,
    iva: 2.74,
    servicio: 2.0,
    total: 23.0,
    clienteCedula: '9999999999',
    clienteRazonSocial: 'CONSUMIDOR FINAL',
    clienteTipo: 'N',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  state.documentos.push(doc);
  return doc;
}

beforeEach(() => {
  const state = db();
  state.documentos.length = 0;
  state.detalles.length = 0;
  state.cobros.length = 0;
  state.personas.length = 0;
  state.ordenes.length = 0;
  state.productos.length = 0;
});

// ---------------------------------------------------------------------------
// Authentication parity (contract O1)
// ---------------------------------------------------------------------------
describe('v2 auth parity', () => {
  test('raw API key in Authorization header is accepted', async () => {
    const res = await request(app).get('/sistema/api/v2/documento/').set(RAW_AUTH);
    expect(res.status).toBe(200);
  });

  test('v1-style "Token <key>" is rejected (401) — the v2 header is the raw key', async () => {
    const res = await request(app)
      .get('/sistema/api/v2/documento/')
      .set({ Authorization: 'Token test-api-key' });
    expect(res.status).toBe(401);
  });

  test('missing / wrong key → 401', async () => {
    expect((await request(app).get('/sistema/api/v2/documento/')).status).toBe(401);
    expect(
      (await request(app).get('/sistema/api/v2/documento/').set({ Authorization: 'nope' })).status
    ).toBe(401);
  });

  test('health and contract-version are public and leak no credentials', async () => {
    const health = await request(app).get('/sistema/api/v2/health/');
    expect(health.status).toBe(200);
    const version = await request(app).get('/sistema/api/v2/contract-version/');
    expect(version.status).toBe(200);
    expect(version.body.contract).toBe('contifico-v2-mesita');
    expect(JSON.stringify(version.body)).not.toContain('test-api-key');
  });
});

// ---------------------------------------------------------------------------
// Documento list: envelope, PRE filtering, pagination, subtotal_12 (O2/O4/O9)
// ---------------------------------------------------------------------------
describe('v2 documento list', () => {
  test('returns the full {count, next, previous, results} envelope with official wire names', async () => {
    seedOpenPre();
    const res = await request(app).get('/sistema/api/v2/documento/').set(RAW_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    // SANDBOX-VERIFIED envelope: next/previous are present (null at the edges),
    // not absent — a client that paginates must find the keys.
    expect(res.body).toHaveProperty('next', null);
    expect(res.body).toHaveProperty('previous', null);
    const doc = res.body.results[0];
    expect(doc.subtotal_12).toBe(18.26); // internal subtotal15 → wire subtotal_12
    expect(doc).not.toHaveProperty('subtotal_15');
    expect(doc.adicional1).toBe('MESITA_TABLE:mesa-uuid-12');
    expect(doc.total).toBe(23.0);
  });

  test('tipo= is rejected with 406 — never sent by the app (SANDBOX-VERIFIED)', async () => {
    seedOpenPre();
    for (const value of ['PRE', 'FAC', '']) {
      const res = await request(app)
        .get(`/sistema/api/v2/documento/?tipo=${value}`)
        .set(RAW_AUTH);
      expect(res.status).toBe(406);
    }
  });

  test('no server-side type filtering: FAC documents come back too', async () => {
    seedOpenPre({ id: 'pre-1' });
    seedOpenPre({ id: 'pre-2' });
    seedOpenPre({ id: 'fac-1', tipoDocumento: 'FAC', estado: 'F' });

    const all = await request(app).get('/sistema/api/v2/documento/').set(RAW_AUTH);
    expect(all.body.count).toBe(3); // client-side filtering is the ONLY filter
    expect(all.body.results.some((d) => d.tipo_documento === 'FAC')).toBe(true);
  });

  test('result_size is accepted but ignored — the page is always 100 rows', async () => {
    seedOpenPre({ id: 'pre-1' });
    seedOpenPre({ id: 'pre-2' });

    const res = await request(app)
      .get('/sistema/api/v2/documento/?result_size=1')
      .set(RAW_AUTH);
    expect(res.body.results).toHaveLength(2); // not 1 — the param does nothing
    expect(res.body.next).toBeNull();
  });

  test('ignores the v1 tipo_documento query param (unknown params ignored)', async () => {
    seedOpenPre();
    seedOpenPre({ id: 'fac-2', tipoDocumento: 'FAC' });
    const res = await request(app)
      .get('/sistema/api/v2/documento/?tipo_documento=PRE')
      .set(RAW_AUTH);
    expect(res.body.count).toBe(2); // filter NOT applied — client must filter defensively
  });
});

// ---------------------------------------------------------------------------
// Single documento + table identifier + MESITA_TABLE auto-write (O3 + mapping)
// ---------------------------------------------------------------------------
describe('v2 documento single + table mapping', () => {
  test('GET /documento/:id/ returns wire doc; 404 when missing', async () => {
    const doc = seedOpenPre();
    const res = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(doc.id);
    expect(res.body.subtotal_12).toBe(18.26);

    const missing = await request(app).get('/sistema/api/v2/documento/nope/').set(RAW_AUTH);
    expect(missing.status).toBe(404);
  });

  test('POST /documento/ with orden_id auto-writes MESITA_TABLE:<mesaId> into adicional1', async () => {
    db().ordenes.push({ id: 'orden-1', mesaId: 'mesa-uuid-7' });
    const res = await request(app)
      .post('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .send({
        tipo_documento: 'PRE',
        fecha_emision: '01/07/2026',
        orden_id: 'orden-1',
        subtotal_0: 0,
        subtotal_12: 4.0,
        iva: 0.6,
        total: 4.6,
        detalles: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.adicional1).toBe('MESITA_TABLE:mesa-uuid-7');
    expect(res.body.subtotal_12).toBe(4.0);
  });

  test('caller-provided adicional1 is preserved and length-capped at 300', async () => {
    const ok = await request(app)
      .post('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .send({ tipo_documento: 'PRE', total: 1, adicional1: 'MESITA_TABLE:custom-id' });
    expect(ok.status).toBe(201);
    expect(ok.body.adicional1).toBe('MESITA_TABLE:custom-id');

    const tooLong = await request(app)
      .post('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .send({ tipo_documento: 'PRE', total: 1, adicional1: 'X'.repeat(301) });
    expect(tooLong.status).toBe(400);
  });
});

describe('v2 documento full PRE update', () => {
  test('create → full PUT → GET replaces items/totals while preserving supported additive fields', async () => {
    db().productos.push(
      { id: 'prod-1', nombre: 'Ceviche', precio: 8.5, porcentajeIva: 15, disponible: true },
      { id: 'prod-2', nombre: 'Jugo', precio: 2.5, porcentajeIva: 15, disponible: true }
    );

    const created = await request(app)
      .post('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .send({
        tipo_documento: 'PRE',
        fecha_emision: '01/07/2026',
        referencia: 'MESITA_ORDER:bill-1',
        adicional1: 'MESITA_TABLE:table-1',
        adicional2: 'ADDITIVE-VALUE',
        subtotal_12: 8.5,
        iva: 1.28,
        total: 9.78,
        detalles: [{ producto_id: 'prod-1', cantidad: 1, precio: 8.5, porcentaje_iva: 15 }],
      });
    expect(created.status).toBe(201);

    const updated = await request(app)
      .put(`/sistema/api/v2/documento/${created.body.id}/`)
      .set(RAW_AUTH)
      .send({
        tipo_documento: 'PRE',
        fecha_emision: '01/07/2026',
        tipo_registro: 'CLI',
        estado: 'P',
        electronico: false,
        descripcion: 'Cena actualizada',
        referencia: 'MESITA_ORDER:bill-1',
        adicional1: 'MESITA_TABLE:table-2',
        // adicional2 is deliberately omitted: a full client must not erase a
        // supported additive field it did not own.
        subtotal_0: 0,
        subtotal_12: 11,
        iva: 1.65,
        servicio: 0,
        total: 12.65,
        ice: 0,
        future_additive_root: 'ignored-but-does-not-corrupt-known-fields',
        detalles: [
          { producto_id: 'prod-1', cantidad: 1, precio: 8.5, porcentaje_iva: 15 },
          { producto_id: 'prod-2', cantidad: 1, precio: 2.5, porcentaje_iva: 15 },
        ],
      });

    expect(updated.status).toBe(201);
    expect(updated.body.total).toBe(12.65);
    expect(updated.body.referencia).toBe('MESITA_ORDER:bill-1');
    expect(updated.body.adicional1).toBe('MESITA_TABLE:table-2');
    expect(updated.body.adicional2).toBe('ADDITIVE-VALUE');
    expect(updated.body.detalles).toHaveLength(2);

    const read = await request(app)
      .get(`/sistema/api/v2/documento/${created.body.id}/`)
      .set(RAW_AUTH);
    expect(read.body.total).toBe(12.65);
    expect(read.body.detalles.map((detail) => detail.producto_id)).toEqual(['prod-1', 'prod-2']);
  });

  test('retains cliente-only compatibility and rejects updates to closed PREs', async () => {
    const open = seedOpenPre({ clienteRazonSocial: 'CONSUMIDOR FINAL' });
    const partial = await request(app)
      .put(`/sistema/api/v2/documento/${open.id}/`)
      .set(RAW_AUTH)
      .send({ cliente: { razon_social: 'Ana Cliente', email: 'ana@example.com' } });
    expect(partial.status).toBe(201);
    expect(partial.body.cliente.razon_social).toBe('Ana Cliente');

    const closed = seedOpenPre({ estado: 'C' });
    const rejected = await request(app)
      .put(`/sistema/api/v2/documento/${closed.id}/`)
      .set(RAW_AUTH)
      .send({ total: 30, detalles: [] });
    expect(rejected.status).toBe(400);
  });
});

describe('v2 producto catalog', () => {
  const fixture = require('./contract/fixtures/producto-list-envelope.json');

  test('returns a paginated Contifico pvp1 envelope that maps exactly to integer cents', async () => {
    db().productos.push(...fixture.results.map((product) => ({
      id: product.id,
      codigo: product.codigo,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precio: product.pvp1,
      categoriaId: product.categoria_id,
      categoria: { id: product.categoria_id, nombre: product.categoria_nombre },
      porcentajeIva: product.porcentaje_iva,
      disponible: product.estado === 'A',
      updatedAt: new Date(product.fecha_modificacion),
    })));

    const res = await request(app)
      .get('/sistema/api/v2/producto/?result_size=100&result_page=1')
      .set(RAW_AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fixture);
    expect(Math.round(Number(res.body.results[0].pvp1) * 100)).toBe(850);
  });
});

// ---------------------------------------------------------------------------
// Cobros: fixtures, partial→full transitions, duplicate retry (O7)
// ---------------------------------------------------------------------------
describe('v2 cobros', () => {
  const fxTC = require('./contract/fixtures/cobro-create-request-tc.json');

  test('POST cobro accepts the golden TC fixture and returns wire cobro', async () => {
    const doc = seedOpenPre({ total: 23.0 });
    const res = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send(fxTC); // monto 11.5
    expect(res.status).toBe(201);
    expect(res.body.forma_cobro).toBe('TC');
    expect(res.body.numero_comprobante).toBe(fxTC.numero_comprobante);
    expect(res.body.tipo_ping).toBe('D');
  });

  test('undocumented params (lote, descripcion, pos) are IGNORED, not rejected', async () => {
    // SANDBOX-VERIFIED (O7): a cobro POST carrying an extra `pos` returns 201.
    // Rejecting unknown params would make the simulator stricter than the API
    // it stands in for, so requests that production accepts would fail here.
    const doc = seedOpenPre({ total: 50 });
    for (const extra of [{ lote: 'ABC123' }, { descripcion: 'ref' }, { pos: 'api-token' }]) {
      const res = await request(app)
        .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
        .set(RAW_AUTH)
        .send({ forma_cobro: 'EF', monto: 1, ...extra });
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('descripcion'); // ignored, not echoed
    }
  });

  test('documented constraints: TC requires tipo_ping; sub-cent monto rejected; numero_comprobante ≤ 15', async () => {
    const doc = seedOpenPre();
    const cases = [
      { forma_cobro: 'TC', monto: 5 }, // missing tipo_ping
      { forma_cobro: 'EF', monto: 5.005 }, // sub-cent
      { forma_cobro: 'EF', monto: 5, numero_comprobante: 'X'.repeat(16) },
      { forma_cobro: 'EF', monto: 0 },
      { forma_cobro: 'EF', monto: 5, fecha: '2026-07-01' }, // wrong date format
    ];
    for (const body of cases) {
      const res = await request(app)
        .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
        .set(RAW_AUTH)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  test('partial then full cobros flip estado P → C exactly when Σ = total', async () => {
    const doc = seedOpenPre({ total: 23.0 });

    const p1 = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 11.5, numero_comprobante: 'MSTA00000000001' });
    expect(p1.status).toBe(201);

    let read = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(read.body.estado).toBe('P'); // partial — still open
    expect(read.body.cobros).toHaveLength(1);

    const p2 = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 11.5, numero_comprobante: 'MSTA00000000002' });
    expect(p2.status).toBe(201);

    read = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(read.body.estado).toBe('C'); // fully paid
    expect(read.body.cobros).toHaveLength(2);

    // Closed document refuses further cobros
    const p3 = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 1 });
    expect(p3.status).toBe(400);
  });

  test('duplicate retry semantics: a repeated TC cobro DUPLICATES (no upstream dedupe); reconciliation must use numero_comprobante', async () => {
    const doc = seedOpenPre({ total: 23.0 });
    const body = {
      forma_cobro: 'TC',
      monto: 5.0,
      tipo_ping: 'D',
      numero_comprobante: 'MSTA0RETRY00001',
    };

    const first = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send(body);
    const second = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201); // worst-case: upstream does NOT dedupe

    const list = await request(app)
      .get(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const matching = list.body.filter((c) => c.numero_comprobante === 'MSTA0RETRY00001');
    expect(matching).toHaveLength(2); // the app's reconciliation sees both

    // overpay guard still applies: duplicate that would exceed total → 400
    const over = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 23.0 });
    expect(over.status).toBe(400);
  });

  test('EF cobros LOSE the reference: the server overwrites numero_comprobante with "Efectivo"', async () => {
    // SANDBOX-VERIFIED 2026-07-06 (O7). This is the single most dangerous
    // divergence to get wrong: if the simulator echoed the reference back, the
    // app's "I found my cobro, all good" path would pass every test here and
    // then find nothing in the restaurant — the double-charge scenario.
    const doc = seedOpenPre({ total: 23.0 });
    const res = await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 5.0, numero_comprobante: 'MSTA0CASH00001' });

    expect(res.status).toBe(201);
    expect(res.body.numero_comprobante).toBe('Efectivo');
    expect(res.body.numero_comprobante).not.toBe('MSTA0CASH00001');
    expect(res.body).not.toHaveProperty('lote'); // EF cobros carry no lote

    // …and it stays lost on read-back, so reference reconciliation is
    // impossible for cash. Absence is the only safe signal.
    const list = await request(app)
      .get(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH);
    expect(list.body.filter((c) => c.numero_comprobante === 'MSTA0CASH00001')).toHaveLength(0);
    expect(list.body[0].numero_comprobante).toBe('Efectivo');
  });

  test('saldo decrements per cobro and reaches 0 when the PRE is fully paid', async () => {
    // SANDBOX-VERIFIED (O3/O7): the live `saldo` is how the app knows a bill
    // is settled. Omitting it made every saldo read undefined here and a
    // number in production.
    const doc = seedOpenPre({ total: 23.0 });

    let read = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(read.body.saldo).toBe(23.0); // untouched PRE: saldo === total

    await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 8.0 });
    read = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(read.body.saldo).toBe(15.0);
    expect(read.body.estado).toBe('P'); // partial: still open

    await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 15.0 });
    read = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(read.body.saldo).toBe(0);
    expect(read.body.estado).toBe('C');
    expect(read.body.tipo_documento).toBe('PRE'); // no automatic PRE→FAC
  });

  test('a stale read reports the pre-cobro saldo, not the fresh one', async () => {
    const doc = seedOpenPre({ total: 23.0 });
    await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 23.0 });

    const fresh = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(fresh.body.saldo).toBe(0);

    const stale = await request(app)
      .get(`/sistema/api/v2/documento/${doc.id}/`)
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'stale');
    expect(stale.body.saldo).toBe(23.0); // snapshot has not seen the cobro
    expect(stale.body.estado).toBe('P');
    expect(stale.body.cobros).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Personas (O5)
// ---------------------------------------------------------------------------
describe('v2 personas', () => {
  const fxCreate = require('./contract/fixtures/persona-create-request.json');

  test('POST /persona/ requires the pos query param and accepts the golden fixture', async () => {
    const noPos = await request(app).post('/sistema/api/v2/persona/').set(RAW_AUTH).send(fxCreate);
    expect(noPos.status).toBe(400);

    const res = await request(app)
      .post('/sistema/api/v2/persona/?pos=3f2a9c1e-5b7d-4e8a-9c6f-0d1e2f3a4b5c')
      .set(RAW_AUTH)
      .send(fxCreate);
    expect(res.status).toBe(201);
    expect(res.body.cedula).toBe('0912345678');
    expect(res.body.razon_social).toBe('Guest Example');
  });

  test('documented validation: role booleans, tipo N needs identification', async () => {
    const cases = [
      { ...fxCreate, es_cliente: false, es_proveedor: false },
      { tipo: 'N', razon_social: 'X', es_cliente: true, es_proveedor: false }, // no cedula/ruc
      { ...fxCreate, email: 'x'.repeat(51) },
    ];
    for (const body of cases) {
      const res = await request(app)
        .post('/sistema/api/v2/persona/?pos=tok')
        .set(RAW_AUTH)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  test('GET /persona/?search= returns a bare array; exact identification match possible client-side', async () => {
    db().personas.push({
      id: 'per-1',
      cedula: '0912345678',
      ruc: null,
      razonSocial: 'Guest Example',
      tipo: 'N',
      email: 'guest@example.com',
      esExtranjero: false,
    });
    const res = await request(app)
      .get('/sistema/api/v2/persona/?search=0912345678')
      .set(RAW_AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].cedula).toBe('0912345678');
  });
});

// ---------------------------------------------------------------------------
// Fault profiles (O9) — simulator-only test extension
// ---------------------------------------------------------------------------
describe('v2 fault profiles', () => {
  test('latency:<ms> delays but succeeds', async () => {
    seedOpenPre();
    const t0 = Date.now();
    const res = await request(app)
      .get('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'latency:200');
    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(180);
  });

  test('error:400 / error:401 / error:500 return contract-shaped errors', async () => {
    const e400 = await request(app)
      .get('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'error:400');
    expect(e400.status).toBe(400);
    expect(e400.body.mensaje).toBeDefined();

    const e401 = await request(app)
      .get('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'error:401');
    expect(e401.status).toBe(401);

    const e500 = await request(app)
      .get('/sistema/api/v2/documento/')
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'error:500');
    expect(e500.status).toBe(500);
  });

  test('auth still fails 401 before fault profiles apply', async () => {
    const res = await request(app)
      .get('/sistema/api/v2/documento/')
      .set('X-Fault-Profile', 'error:500');
    expect(res.status).toBe(401);
  });

  test('stale profile hides recent cobros and closed estado (delayed consistency)', async () => {
    const doc = seedOpenPre({ total: 5.0 });
    await request(app)
      .post(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .send({ forma_cobro: 'EF', monto: 5.0, numero_comprobante: 'MSTA0STALE00001' });

    const fresh = await request(app).get(`/sistema/api/v2/documento/${doc.id}/`).set(RAW_AUTH);
    expect(fresh.body.estado).toBe('C');
    expect(fresh.body.cobros).toHaveLength(1);

    const stale = await request(app)
      .get(`/sistema/api/v2/documento/${doc.id}/`)
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'stale');
    expect(stale.body.estado).toBe('P'); // pre-cobro snapshot
    expect(stale.body.cobros).toHaveLength(0);

    const staleList = await request(app)
      .get(`/sistema/api/v2/documento/${doc.id}/cobro/`)
      .set(RAW_AUTH)
      .set('X-Fault-Profile', 'stale');
    expect(staleList.body).toHaveLength(0);
  });

  test('timeout profile aborts the connection', async () => {
    seedOpenPre();
    await expect(
      request(app)
        .get('/sistema/api/v2/documento/')
        .set(RAW_AUTH)
        .set('X-Fault-Profile', 'timeout')
    ).rejects.toThrow(); // socket destroyed → ECONNRESET / socket hang up
  });
});
