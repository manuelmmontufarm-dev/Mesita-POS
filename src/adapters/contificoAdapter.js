'use strict';

/**
 * contificoAdapter.js
 *
 * Bidirectional schema transformer between our internal POS models
 * and Contifico's API v1/v2 JSON shapes.
 *
 * TODAY: All Contifico calls are MOCKED (no live API calls).
 *        When CONTIFICO_ENABLED=true, toContificoDocumento() builds the
 *        real payload and forwardToContifico() sends it.
 *
 * SWAP STRATEGY: To go live, set CONTIFICO_ENABLED=true and provide
 *        CONTIFICO_TOKEN + CONTIFICO_BASE_URL in the environment.
 *        The swap lives entirely in this file — no service changes needed.
 *
 * See: /docs/contifico-compatibility.md for full swap guide.
 */

const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../middlewares/logger');
const { SRI_MOCK_PREFIX } = require('../config/constants');

// ---------------------------------------------------------------------------
// Internal → Contifico transformations
// ---------------------------------------------------------------------------

/**
 * Transform an internal Orden + Documento into a Contifico FAC/PRE payload.
 * The returned object is ready to POST to https://api.contifico.com/sistema/api/v1/documento/
 *
 * @param {object} orden - Internal Orden with detalles[] included
 * @param {object} documento - Internal Documento with cobros[] included
 * @param {object} opts - { tipo_documento: 'FAC'|'PRE' }
 * @returns {object} Contifico-compatible documento payload
 */
function toContificoDocumento(orden, documento, opts = {}) {
  const tipoDocumento = opts.tipo_documento || documento.tipoDocumento || 'PRE';

  return {
    pos: documento.pos || env.API_KEY,
    fecha_emision: documento.fechaEmision,
    tipo_documento: tipoDocumento,
    tipo_registro: documento.tipoRegistro || 'CLI',
    estado: documento.estado || 'P',
    electronico: documento.electronico !== false,

    cliente: toContificoPersona({
      cedula: documento.clienteCedula,
      ruc: documento.clienteRuc,
      razon_social: documento.clienteRazonSocial,
      tipo: documento.clienteTipo,
      email: documento.clienteEmail,
      telefonos: documento.clienteTelefonos,
      direccion: documento.clienteDireccion,
      es_extranjero: documento.clienteExtranjero,
    }),

    descripcion: documento.descripcion,
    subtotal_0: Number(documento.subtotal0 || 0),
    subtotal_15: Number(documento.subtotal15 || 0),
    iva: Number(documento.iva || 0),
    servicio: Number(documento.servicio || 0),
    total: Number(documento.total || 0),

    detalles: (orden.detalles || documento.detallesDoc || []).map(toContificoDetalle),
    cobros: (documento.cobros || []).map((c) => ({
      forma_cobro: c.formaCobro,
      monto: Number(c.monto),
    })),
  };
}

/**
 * Transform a Contifico FAC/PRE response back into our internal Documento shape.
 * @param {object} contificoResponse - Raw Contifico API response
 * @returns {object} Internal documento-compatible object
 */
function fromContificoDocumento(contificoResponse) {
  const r = contificoResponse;
  return {
    pos: r.pos,
    fechaEmision: r.fecha_emision,
    tipoDocumento: r.tipo_documento,
    tipoRegistro: r.tipo_registro,
    estado: r.estado,
    electronico: r.electronico,
    descripcion: r.descripcion,
    subtotal0: Number(r.subtotal_0 || 0),
    subtotal15: Number(r.subtotal_15 || 0),
    iva: Number(r.iva || 0),
    servicio: Number(r.servicio || 0),
    total: Number(r.total || 0),
    autorizacionSRI: r.autorizacion || null,
    urlRide: r.url_ride || null,
    urlXml: r.url_xml || null,
    claveAcceso: r.clave_acceso || null,
    cliente: r.cliente
      ? {
          cedula: r.cliente.cedula,
          ruc: r.cliente.ruc,
          razon_social: r.cliente.razon_social,
          tipo: r.cliente.tipo,
          email: r.cliente.email,
        }
      : null,
    detalles: (r.detalles || []).map((d) => ({
      productoId: d.producto_id,
      cantidad: Number(d.cantidad),
      precio: Number(d.precio),
      porcentajeIva: d.porcentaje_iva,
      baseGravable: Number(d.base_gravable || 0),
    })),
    cobros: (r.cobros || []).map((c) => ({
      formaCobro: c.forma_cobro,
      monto: Number(c.monto),
    })),
  };
}

/**
 * Transform an internal Persona / cliente object into Contifico's persona JSON shape.
 * @param {object} persona
 * @returns {object} Contifico persona
 */
function toContificoPersona(persona) {
  if (!persona) return null;
  return {
    cedula: persona.cedula || persona.identificacion || '9999999999',
    ruc: persona.ruc || (persona.cedula ? `${persona.cedula}001` : '9999999999001'),
    razon_social: persona.razon_social || persona.razonSocial || 'CONSUMIDOR FINAL',
    tipo: persona.tipo || 'N',
    email: persona.email || '',
    telefonos: persona.telefonos || '',
    direccion: persona.direccion || '',
    es_extranjero: persona.esExtranjero || persona.es_extranjero || false,
  };
}

/**
 * Transform an internal OrdenDetalle or DocumentoDetalle into a Contifico detalle line.
 */
function toContificoDetalle(detalle) {
  const cantidad = Number(detalle.cantidad || 1);
  const precio = Number(detalle.precio || 0);
  const descPct = Number(detalle.porcentajeDescuento || detalle.porcentaje_descuento || 0);
  const baseGravable = cantidad * precio * (1 - descPct / 100);

  return {
    producto_id: detalle.productoId || detalle.producto_id || '',
    cantidad,
    precio,
    porcentaje_iva: detalle.porcentajeIva !== undefined ? detalle.porcentajeIva : 15,
    porcentaje_descuento: descPct,
    base_cero: detalle.porcentajeIva === 0 ? baseGravable : 0,
    base_gravable: detalle.porcentajeIva !== 0 ? round2(baseGravable) : 0,
    base_no_gravable: 0,
  };
}

// ---------------------------------------------------------------------------
// SRI Ecuador mock fields (demo authorization)
// ---------------------------------------------------------------------------

/**
 * Generate mock SRI authorization fields for a demo factura.
 * In production these are issued by the SRI XML signing infrastructure.
 * @returns {object} { autorizacionSRI, urlRide, urlXml, claveAcceso }
 */
function generateSriMock() {
  const random = crypto.randomBytes(20).toString('hex').toUpperCase();
  const timestamp = Date.now();
  const claveAcceso = `${SRI_MOCK_PREFIX}${timestamp}${random}`.slice(0, 49);
  const autorizacion = crypto.randomBytes(18).toString('hex').toUpperCase();

  return {
    autorizacionSRI: autorizacion,
    claveAcceso,
    urlRide: `https://demo.pos-mesita.ec/ride/${claveAcceso}`,
    urlXml: `https://demo.pos-mesita.ec/xml/${claveAcceso}`,
  };
}

// ---------------------------------------------------------------------------
// Live Contifico forwarding (disabled until CONTIFICO_ENABLED=true)
// ---------------------------------------------------------------------------

/**
 * Forward a documento to the real Contifico API.
 * Only called when env.CONTIFICO_ENABLED === true.
 * @param {object} contificoPayload - Output of toContificoDocumento()
 * @returns {Promise<object>} Contifico response document
 */
async function forwardToContifico(contificoPayload) {
  if (!env.CONTIFICO_ENABLED) {
    throw new Error('Contifico forwarding is disabled (CONTIFICO_ENABLED=false).');
  }
  if (!env.CONTIFICO_TOKEN) {
    throw new Error('CONTIFICO_TOKEN is not set.');
  }

  const url = `${env.CONTIFICO_BASE_URL}/documento/`;
  logger.info({ event: 'CONTIFICO_FORWARD', url, tipo: contificoPayload.tipo_documento });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.CONTIFICO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(contificoPayload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Contifico API error ${resp.status}: ${body.slice(0, 300)}`);
  }

  return resp.json();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  toContificoDocumento,
  fromContificoDocumento,
  toContificoPersona,
  toContificoDetalle,
  generateSriMock,
  forwardToContifico,
};
