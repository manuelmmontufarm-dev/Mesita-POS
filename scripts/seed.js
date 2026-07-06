'use strict';

/**
 * Seed script — loads demo data into the POS Mesita Demo database.
 * Run with: node scripts/seed.js
 *
 * Creates:
 *   - 4 Categorias
 *   - 12 Productos (menu items)
 *   - 5 Mesas (La Doña Pepa catalog: 1–4 + 12)
 *   - 1 demo Persona
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding POS Mesita Demo...');

  // Categorias
  const categorias = await Promise.all([
    prisma.categoria.upsert({ where: { id: 'cat-entradas' }, create: { id: 'cat-entradas', nombre: 'Entradas', orden: 1 }, update: {} }),
    prisma.categoria.upsert({ where: { id: 'cat-platos' }, create: { id: 'cat-platos', nombre: 'Platos Fuertes', orden: 2 }, update: {} }),
    prisma.categoria.upsert({ where: { id: 'cat-bebidas' }, create: { id: 'cat-bebidas', nombre: 'Bebidas', orden: 3 }, update: {} }),
    prisma.categoria.upsert({ where: { id: 'cat-postres' }, create: { id: 'cat-postres', nombre: 'Postres', orden: 4 }, update: {} }),
  ]);
  console.log(`✓ ${categorias.length} categorías`);

  // Productos
  const productos = await Promise.all([
    upsertProducto('prod-ceviche',   'Ceviche Mixto',       'Camarones, pulpo y pescado', 8.50, 'cat-entradas'),
    upsertProducto('prod-patacones', 'Patacones con Queso', 'Patacones fritos con queso', 4.00, 'cat-entradas'),
    upsertProducto('prod-empanadas', 'Empanadas de Viento',  '3 unidades', 3.50, 'cat-entradas'),
    upsertProducto('prod-seco',      'Seco de Pollo',       'Con arroz y menestra', 9.50, 'cat-platos'),
    upsertProducto('prod-chaulafan', 'Chaulafán',           'Arroz chino con pollo y camarón', 10.00, 'cat-platos'),
    upsertProducto('prod-lomo',      'Lomo al Jugo',        'Con papas fritas y ensalada', 14.50, 'cat-platos'),
    upsertProducto('prod-pescado',   'Filete de Pescado',   'A la plancha con arroz', 12.00, 'cat-platos'),
    upsertProducto('prod-agua',      'Agua Mineral',        '500ml', 1.50, 'cat-bebidas'),
    upsertProducto('prod-cola',      'Gaseosa',             '350ml', 2.00, 'cat-bebidas'),
    upsertProducto('prod-jugo',      'Jugo Natural',        'Naranja, mora o tomate', 2.50, 'cat-bebidas'),
    upsertProducto('prod-cerveza',   'Cerveza Nacional',    '330ml', 3.00, 'cat-bebidas'),
    upsertProducto('prod-helado',    'Helado Artesanal',    '2 bolas', 3.50, 'cat-postres'),
  ]);
  console.log(`✓ ${productos.length} productos`);

  // Mesas — aligned with mesita-app demo catalog (La Doña Pepa)
  const mesaData = [
    { id: 'mesa-01', nombre: 'Mesa 1', capacidad: 4, ubicacion: 'Interior' },
    { id: 'mesa-02', nombre: 'Mesa 2', capacidad: 4, ubicacion: 'Interior' },
    { id: 'mesa-03', nombre: 'Mesa 3', capacidad: 6, ubicacion: 'Interior' },
    { id: 'mesa-04', nombre: 'Mesa 4', capacidad: 2, ubicacion: 'Interior' },
    { id: 'mesa-12', nombre: 'Mesa 12', capacidad: 6, ubicacion: 'Demo' },
  ];
  const mesas = await Promise.all(
    mesaData.map((m) =>
      prisma.mesa.upsert({
        where: { id: m.id },
        create: { ...m, estado: 'L', activa: true },
        update: { activa: true, ubicacion: m.ubicacion, nombre: m.nombre },
      })
    )
  );
  console.log(`✓ ${mesas.length} mesas activas`);

  const legacyIds = ['mesa-05', 'mesa-06', 'mesa-07', 'mesa-08', 'mesa-09', 'mesa-10'];
  await prisma.orden.updateMany({
    where: { mesaId: { in: legacyIds }, estado: 'A' },
    data: { estado: 'C', cerradaAt: new Date() },
  });
  const deactivated = await prisma.mesa.updateMany({
    where: { id: { in: legacyIds } },
    data: { activa: false, estado: 'L' },
  });
  if (deactivated.count > 0) {
    console.log(`✓ ${deactivated.count} mesas legacy desactivadas (05–10)`);
  }

  // Demo persona
  await prisma.persona.upsert({
    where: { cedula: '0922054366' },
    create: {
      id: 'persona-demo',
      cedula: '0922054366',
      ruc: '0922054366001',
      razonSocial: 'Juan Carlos Pérez López',
      tipo: 'N',
      email: 'juan.perez@example.com',
      telefonos: '0988800001',
      direccion: 'Av. 9 de Octubre 123, Guayaquil',
      esExtranjero: false,
    },
    update: {},
  });
  console.log('✓ 1 persona demo');

  console.log('\n✅ Seed completado exitosamente.');
  console.log('   Mesas activas: mesa-01 … mesa-04, mesa-12');
  console.log('   API Key: ver variable API_KEY en .env');

  if (process.env.RUN_PLATFORM_BOOTSTRAP === '1') {
    const { ensurePlatformReady } = require('../src/services/platformService');
    await ensurePlatformReady();
    console.log('✓ Platform tenant bootstrap');
  }
}

function upsertProducto(id, nombre, descripcion, precio, categoriaId) {
  return prisma.producto.upsert({
    where: { id },
    create: { id, nombre, descripcion, precio, categoriaId, porcentajeIva: 15, disponible: true },
    update: {},
  });
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
