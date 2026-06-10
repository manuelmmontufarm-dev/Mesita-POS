'use strict';

const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// Singleton Prisma client — safe for serverless and long-running processes alike
let prisma;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    });
  }
  return prisma;
}

async function connectDatabase() {
  const client = getPrisma();
  try {
    await client.$connect();
    console.info('[DB] Connected to PostgreSQL via Prisma');
    return client;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    throw err;
  }
}

async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    console.info('[DB] Disconnected from PostgreSQL');
  }
}

module.exports = { getPrisma, connectDatabase, disconnectDatabase };
