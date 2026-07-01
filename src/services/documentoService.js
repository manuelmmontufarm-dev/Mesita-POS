'use strict';

const { getPrisma } = require('../config/database');
const { TIPO_DOCUMENTO, ESTADO_DOCUMENTO, PAGINATION } = require('../config/constants');
const { generateSriMock } = require('../adapters/contificoAdapter');

/**
 * List documentos with Contifico-compatible pagination and filters.
 * @param {object} opts - { tipo_documento, fecha_emision, persona_identificacion, result_size, result_page }
 */
async function listarDocumentos(opts = {}) {
  const prisma = getPrisma();
  const take = Math.min(parseInt(opts.result_size || PAGINATION.DEFAULT_PAGE_SIZE, 10), PAGINATION.MAX_PAGE_SIZE);
  const skip = (parseInt(opts.result_page || 1, 10) - 1) * take;

  const where = {};
  if (opts.tipo_documento) where.tipoDocumento = opts.tipo_documento;
  if (opts.fecha_emision) where.fechaEmision = opts.fecha_emision;
  if (opts.persona_identificacion) {
    where.OR = [
      { clienteCedula: opts.persona_identificacion },
      { clienteRuc: opts.persona_identificacion },
    ];
  }

  const [count, documentos] = await Promise.all([
    prisma.documento.count({ where }),
    prisma.documento.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        cobros: true,
        detallesDoc: true,
        persona: true,
        orden: { include: { mesa: true } },
      },
    }),
  ]);

  return { count, results: documentos };
}

/**
 * Get a single documento by ID.
 * Returns full Contifico-compatible shape including url_ride, url_xml, cobros[], detalles[].
 * @param {string} id
 */
async function obtenerDocumento(id) {
  const prisma = getPrisma();
  const doc = await prisma.documento.findUniqueOrThrow({
    where: { id },
    include: {
      cobros: true,
      detallesDoc: true,
      persona: true,
      orden: { include: { mesa: true } },
    },
  });
  return doc;
}

/**
 * Create a documento (PRE or FAC).
 * Body mirrors Contifico's POST /documento/ exactly.
 *
 * @param {object} body - Full Contifico-compatible documento payload
 */
async function crearDocumento(body) {
  const prisma = getPrisma();

  const tipoDocumento = body.tipo_documento || TIPO_DOCUMENTO.PRE;
  const isFAC = tipoDocumento === TIPO_DOCUMENTO.FAC;
  validateCobrosNoOverpay(body.cobros || [], Number(body.total || 0));

  // Resolve or upsert persona from cliente data
  let personaId = null;
  if (body.cliente) {
    const persona = await _upsertPersona(prisma, body.cliente);
    personaId = persona.id;
  }

  // Build the SRI mock fields for electronic invoices
  const sriFields = isFAC ? generateSriMock() : {};

  const doc = await prisma.documento.create({
    data: {
      ordenId: body.orden_id || null,
      personaId,
      pos: body.pos || null,
      fechaEmision: body.fecha_emision || _todayEC(),
      tipoDocumento,
      tipoRegistro: body.tipo_registro || 'CLI',
      estado: body.estado || ESTADO_DOCUMENTO.PENDIENTE,
      electronico: body.electronico !== undefined ? body.electronico : true,
      descripcion: body.descripcion || null,
      subtotal0: body.subtotal_0 || 0,
      subtotal15: body.subtotal_15 || 0,
      iva: body.iva || 0,
      servicio: body.servicio || 0,
      total: body.total || 0,
      // Cliente snapshot
      clienteCedula: body.cliente?.cedula || null,
      clienteRuc: body.cliente?.ruc || null,
      clienteRazonSocial: body.cliente?.razon_social || null,
      clienteTipo: body.cliente?.tipo || null,
      clienteEmail: body.cliente?.email || null,
      clienteTelefonos: body.cliente?.telefonos || null,
      clienteDireccion: body.cliente?.direccion || null,
      clienteExtranjero: body.cliente?.es_extranjero || false,
      // SRI mock fields (only for FAC)
      ...sriFields,
    },
  });

  // Create detalles
  if (Array.isArray(body.detalles) && body.detalles.length > 0) {
    await prisma.documentoDetalle.createMany({
      data: body.detalles.map((d) => ({
        documentoId: doc.id,
        productoId: d.producto_id || null,
        cantidad: d.cantidad || 1,
        precio: d.precio || 0,
        porcentajeIva: d.porcentaje_iva !== undefined ? d.porcentaje_iva : 15,
        porcentajeDescuento: d.porcentaje_descuento || 0,
        baseCero: d.base_cero || 0,
        baseGravable: d.base_gravable || 0,
        baseNoGravable: d.base_no_gravable || 0,
      })),
    });
  }

  // Create cobros
  if (Array.isArray(body.cobros) && body.cobros.length > 0) {
    await prisma.cobro.createMany({
      data: body.cobros.map((c) => ({
        documentoId: doc.id,
        formaCobro: c.forma_cobro,
        monto: c.monto,
        propina: c.propina || 0,
        procesador: c.procesador || null,
        detalle: c.detalle || null,
        referencia: c.referencia || null,
      })),
    });
  }

  // Return full document with associations
  return prisma.documento.findUnique({
    where: { id: doc.id },
    include: { cobros: true, detallesDoc: true, persona: true },
  });
}

/**
 * Update a documento — change estado or add a cobro.
 * @param {string} id
 * @param {object} data - { estado?, cobro? }
 */
async function actualizarDocumento(id, data) {
  const prisma = getPrisma();

  // Validate document exists
  const existingDoc = await prisma.documento.findUniqueOrThrow({
    where: { id },
    include: { cobros: true },
  });

  const updateData = {};
  if (data.estado !== undefined) updateData.estado = data.estado;

  // Add a cobro if provided
  if (data.cobro) {
    validateCobrosNoOverpay(
      [...(existingDoc.cobros || []), data.cobro],
      Number(existingDoc.total || 0)
    );
    await prisma.cobro.create({
      data: {
        documentoId: id,
        formaCobro: data.cobro.forma_cobro,
        monto: data.cobro.monto,
        propina: data.cobro.propina || 0,
        procesador: data.cobro.procesador || null,
        detalle: data.cobro.detalle || null,
        referencia: data.cobro.referencia || null,
      },
    });
  }

  // If transitioning to FAC, generate SRI mock fields
  if (data.estado === ESTADO_DOCUMENTO.FACTURADO && !updateData.urlRide) {
    const sriFields = generateSriMock();
    Object.assign(updateData, sriFields);
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.documento.update({ where: { id }, data: updateData });
  }

  return prisma.documento.findUnique({
    where: { id },
    include: { cobros: true, detallesDoc: true, persona: true },
  });
}

/**
 * List the cobros (payments) attached to a documento.
 * Mirrors Contifico's `GET /documento/{id}/cobro/`.
 */
async function listarCobros(documentoId) {
  const prisma = getPrisma();
  return prisma.cobro.findMany({
    where: { documentoId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Add a cobro to a documento, validating it does not overpay the total.
 * Mirrors Contifico's `POST /documento/{id}/cobro/`.
 */
async function agregarCobro(documentoId, cobro) {
  const prisma = getPrisma();
  const doc = await prisma.documento.findUniqueOrThrow({
    where: { id: documentoId },
    include: { cobros: true },
  });
  validateCobrosNoOverpay([...(doc.cobros || []), cobro], Number(doc.total || 0));
  return prisma.cobro.create({
    data: {
      documentoId,
      formaCobro: cobro.forma_cobro,
      monto: cobro.monto,
      propina: cobro.propina || 0,
      procesador: cobro.procesador || null,
      detalle: cobro.detalle || null,
      referencia: cobro.referencia || null,
    },
  });
}

/**
 * Delete a cobro from a documento.
 * Mirrors Contifico's `DELETE /documento/{id}/cobro/`.
 */
async function eliminarCobro(documentoId, cobroId) {
  const prisma = getPrisma();
  return prisma.cobro.delete({ where: { id: cobroId } });
}

/**
 * Emit the SRI electronic invoice for a documento.
 * Mirrors Contifico's `PUT /documento/{id}/sri/`: transitions the document to
 * FACTURADO and populates autorizacion / clave_acceso / url_ride / url_xml.
 * (Currently a local SRI mock — the single swap point for live SRI signing.)
 */
async function emitirSri(documentoId) {
  return actualizarDocumento(documentoId, { estado: ESTADO_DOCUMENTO.FACTURADO });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a persona from cliente data.
 * Looks up by cedula first; creates if not found.
 */
async function _upsertPersona(prisma, cliente) {
  const identificacion = cliente.cedula || cliente.ruc;
  if (!identificacion) {
    // No identification — create without unique key
    return prisma.persona.create({
      data: {
        razonSocial: cliente.razon_social || 'CONSUMIDOR FINAL',
        tipo: cliente.tipo || 'N',
        email: cliente.email || null,
        telefonos: cliente.telefonos || null,
        direccion: cliente.direccion || null,
        esExtranjero: cliente.es_extranjero || false,
      },
    });
  }

  return prisma.persona.upsert({
    where: { cedula: identificacion },
    create: {
      cedula: cliente.cedula || identificacion,
      ruc: cliente.ruc || null,
      razonSocial: cliente.razon_social || 'CONSUMIDOR FINAL',
      tipo: cliente.tipo || 'N',
      email: cliente.email || null,
      telefonos: cliente.telefonos || null,
      direccion: cliente.direccion || null,
      esExtranjero: cliente.es_extranjero || false,
    },
    update: {
      ruc: cliente.ruc || undefined,
      razonSocial: cliente.razon_social || undefined,
      email: cliente.email || undefined,
      telefonos: cliente.telefonos || undefined,
      direccion: cliente.direccion || undefined,
    },
  });
}

/**
 * Today's date in DD/MM/YYYY format (Ecuador timezone).
 */
function _todayEC() {
  return new Date().toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Guayaquil',
  });
}

function validateCobrosNoOverpay(cobros, total) {
  if (!Array.isArray(cobros) || cobros.length === 0) return;
  const paid = cobros.reduce((sum, c) => sum + Number(c.monto || 0), 0);
  const tip = cobros.reduce((sum, c) => sum + Number(c.propina || 0), 0);
  if (paid < -0.005 || tip < -0.005) {
    const err = new Error('Los montos de cobro no pueden ser negativos.');
    err.statusCode = 400;
    throw err;
  }
  if (round2(paid) > round2(total) + 0.005) {
    const err = new Error('El monto aplicado a la cuenta no puede superar el total. Registra el extra como propina.');
    err.statusCode = 400;
    throw err;
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = {
  listarDocumentos,
  obtenerDocumento,
  crearDocumento,
  actualizarDocumento,
  listarCobros,
  agregarCobro,
  eliminarCobro,
  emitirSri,
};
