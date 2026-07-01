'use strict';

/**
 * Normalizers for Contifico-shaped request bodies -> the field names the POS
 * services already understand. Lets the compatibility surface accept exactly
 * what a client would POST to Contifico.
 */

const { FORMA_COBRO_FROM_CONTIFICO } = require('../config/constants');

function normalizeCobroInput(c = {}) {
  if (!c) return c;
  return {
    forma_cobro: FORMA_COBRO_FROM_CONTIFICO[c.forma_cobro] || c.forma_cobro,
    monto: c.monto,
    // Contifico carries the tip in `monto_propina`; the POS uses `propina`.
    propina: c.propina !== undefined ? c.propina : c.monto_propina,
    procesador: c.procesador || c.tipo_ping || null,
    detalle: c.detalle || null,
    referencia: c.referencia || c.numero_comprobante || null,
  };
}

/**
 * Normalize a Contifico documento POST/PUT body.
 * Accepts `subtotal_12` (Contifico's published key) as an alias for
 * `subtotal_15`, and translates cobro forma_cobro codes.
 */
function normalizeDocumentoInput(body = {}) {
  const out = { ...body };
  if (out.subtotal_15 === undefined && out.subtotal_12 !== undefined) {
    out.subtotal_15 = out.subtotal_12;
  }
  if (Array.isArray(out.cobros)) {
    out.cobros = out.cobros.map(normalizeCobroInput);
  }
  return out;
}

function normalizePersonaInput(body = {}) {
  return {
    cedula: body.cedula || null,
    ruc: body.ruc || null,
    razon_social: body.razon_social,
    tipo: body.tipo || 'N',
    email: body.email || null,
    telefonos: body.telefonos || null,
    direccion: body.direccion || null,
    es_extranjero: body.es_extranjero || false,
  };
}

module.exports = { normalizeCobroInput, normalizeDocumentoInput, normalizePersonaInput };
