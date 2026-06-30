'use strict';

const { getPrisma } = require('../config/database');
const { ESTADO_ORDEN, ESTADO_MESA, ESTADO_DOCUMENTO, IVA_RATE, SERVICE_RATE } = require('../config/constants');
const mesaService = require('./mesaService');
const ordenService = require('./ordenService');

function calcTotalesFromDetalles(detalles) {
  const subtotal = detalles.reduce(
    (sum, d) => sum + Number(d.cantidad) * Number(d.precio),
    0
  );
  const iva = Math.round(subtotal * IVA_RATE * 100) / 100;
  const servicio = Math.round(subtotal * SERVICE_RATE * 100) / 100;
  const total = Math.round((subtotal + iva + servicio) * 100) / 100;
  return { subtotal, iva, servicio, total };
}

function mapDetalle(d) {
  return {
    id: d.id,
    producto_id: d.productoId,
    nombre: d.nombreManual || d.producto?.nombre || 'Ítem',
    cantidad: Number(d.cantidad),
    precio: Number(d.precio),
    porcentaje_iva: d.porcentajeIva ?? 15,
    nota: d.nota || '',
  };
}

/**
 * Single snapshot for mesita-app sync — mesa + orden + open PRE + cobros + saldo.
 */
async function obtenerSessionMesa(mesaId) {
  const prisma = getPrisma();
  const mesa = await prisma.mesa.findUniqueOrThrow({
    where: { id: mesaId },
    include: {
      ordenes: {
        where: { estado: ESTADO_ORDEN.ABIERTA },
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          detalles: { include: { producto: true }, orderBy: { createdAt: 'asc' } },
          documentos: {
            where: { estado: ESTADO_DOCUMENTO.PENDIENTE },
            orderBy: { createdAt: 'desc' },
            include: { cobros: true },
          },
        },
      },
    },
  });

  const orden = mesa.ordenes[0] || null;
  const detalles = orden ? orden.detalles.map(mapDetalle) : [];
  const totales = calcTotalesFromDetalles(detalles);

  const openPre = orden?.documentos?.[0] || null;
  const cobros = (openPre?.cobros || []).map((c) => ({
    id: c.id,
    forma_cobro: c.formaCobro,
    monto: Number(c.monto),
    referencia: c.referencia,
    procesador: c.procesador,
    detalle: c.detalle,
    created_at: c.createdAt,
  }));

  const paidTowards = cobros.reduce((s, c) => s + c.monto, 0);
  const saldo = Math.max(0, Math.round((totales.total - paidTowards) * 100) / 100);

  return {
    mesa: {
      id: mesa.id,
      nombre: mesa.nombre,
      estado: mesa.estado,
      capacidad: mesa.capacidad,
      ubicacion: mesa.ubicacion,
    },
    orden: orden
      ? {
          id: orden.id,
          estado: orden.estado,
          comensales: orden.comensales,
          detalles,
        }
      : null,
    documento: openPre
      ? {
          id: openPre.id,
          tipo_documento: openPre.tipoDocumento,
          estado: openPre.estado,
          total: Number(openPre.total),
          subtotal_15: Number(openPre.subtotal15 || 0),
          iva: Number(openPre.iva || 0),
          servicio: Number(openPre.servicio || 0),
        }
      : null,
    cobros,
    totales,
    saldo,
    fully_paid: saldo <= 0.01 && detalles.length > 0,
  };
}

/**
 * Demo reset — close orden, cancel open PREs, mesa → Libre.
 */
async function resetDemoMesa(mesaId) {
  const prisma = getPrisma();
  const mesa = await prisma.mesa.findUniqueOrThrow({ where: { id: mesaId } });

  const openOrdenes = await prisma.orden.findMany({
    where: { mesaId, estado: ESTADO_ORDEN.ABIERTA },
  });

  for (const orden of openOrdenes) {
    await prisma.documento.updateMany({
      where: { ordenId: orden.id, estado: ESTADO_DOCUMENTO.PENDIENTE },
      data: { estado: ESTADO_DOCUMENTO.ANULADO },
    });
    await prisma.orden.update({
      where: { id: orden.id },
      data: { estado: ESTADO_ORDEN.CERRADA },
    });
  }

  await mesaService.actualizarMesa(mesaId, { estado: ESTADO_MESA.LIBRE });
  return obtenerSessionMesa(mesaId);
}

/**
 * Close mesa after full payment — orden C, mesa L, PRE → C.
 */
async function cerrarMesaPagada(mesaId, ordenId, documentoId) {
  const prisma = getPrisma();
  if (documentoId) {
    await prisma.documento.update({
      where: { id: documentoId },
      data: { estado: ESTADO_DOCUMENTO.COBRADO },
    });
  }
  if (ordenId) {
    await prisma.orden.update({
      where: { id: ordenId },
      data: { estado: ESTADO_ORDEN.CERRADA },
    });
  }
  await mesaService.liberarMesa(mesaId);
  return obtenerSessionMesa(mesaId);
}

module.exports = {
  obtenerSessionMesa,
  resetDemoMesa,
  cerrarMesaPagada,
  calcTotalesFromDetalles,
};
