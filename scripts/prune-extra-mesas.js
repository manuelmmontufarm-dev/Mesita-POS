'use strict';

/**
 * Deactivates legacy demo mesas (05–10) not used by La Doña Pepa / mesita-app catalog.
 * Keeps: mesa-01, mesa-02, mesa-03, mesa-04, mesa-12.
 *
 * Run: node scripts/prune-extra-mesas.js
 * Optional: PRUNE_SCHEMAS=public,tenant_demo (default both)
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const KEEP = new Set(['mesa-01', 'mesa-02', 'mesa-03', 'mesa-04', 'mesa-12']);
const LEGACY = ['mesa-05', 'mesa-06', 'mesa-07', 'mesa-08', 'mesa-09', 'mesa-10'];

function schemaUrl(baseUrl, schemaName) {
  if (!baseUrl) return baseUrl;
  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set('schema', schemaName);
    return parsed.toString();
  } catch {
    return baseUrl;
  }
}

async function pruneSchema(schemaName) {
  const prisma = new PrismaClient({
    datasources: { db: { url: schemaUrl(process.env.DATABASE_URL, schemaName) } },
  });

  try {
    const legacyMesas = await prisma.mesa.findMany({
      where: { id: { in: LEGACY } },
      select: { id: true },
    });
    if (!legacyMesas.length) {
      console.log(`  [${schemaName}] no legacy mesas found — skip`);
      return;
    }

    const closed = await prisma.orden.updateMany({
      where: {
        mesaId: { in: LEGACY },
        estado: 'A',
      },
      data: {
        estado: 'C',
        cerradaAt: new Date(),
      },
    });

    const deactivated = await prisma.mesa.updateMany({
      where: { id: { in: LEGACY } },
      data: { activa: false, estado: 'L' },
    });

    console.log(
      `  [${schemaName}] closed ${closed.count} open orden(es), deactivated ${deactivated.count} mesa(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const schemas = (process.env.PRUNE_SCHEMAS || 'public,tenant_demo')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log('Pruning legacy mesas (keeping:', [...KEEP].join(', '), ')');
  for (const schema of schemas) {
    await pruneSchema(schema);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('Prune failed:', err);
  process.exit(1);
});
