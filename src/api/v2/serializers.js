'use strict';

const crypto = require('crypto');

/**
 * v2 wire serializers — frozen contract (contracts/contifico-v2 in mesita-app).
 *
 * THE key translation: internal `subtotal15` → wire `subtotal_12`.
 * The official wire name is subtotal_12 even when the applicable IVA is 15%.
 * v1 (`subtotal_15`) keeps its shape for the internal POS UI; only this v2
 * façade speaks the official contract.
 */

function n(value) {
  return Number(value || 0);
}

function ddmmyyyy(date) {
  return new Date(date).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Guayaquil',
  });
}

/** Deterministic 6-digit lote synthesized per cobro (card-terminal parity). */
function syntheticLote(cobro) {
  if (cobro.procesador == null) return undefined; // EF cobros carry no lote
  const digest = crypto.createHash('sha256').update(String(cobro.id)).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

function serializeCobro(cobro) {
  return {
    id: cobro.id,
    forma_cobro: cobro.formaCobro,
    monto: n(cobro.monto),
    fecha: ddmmyyyy(cobro.createdAt),
    ...(cobro.procesador ? { tipo_ping: cobro.procesador } : {}),
    ...(syntheticLote(cobro) !== undefined ? { lote: syntheticLote(cobro) } : {}),
    ...(cobro.referencia ? { numero_comprobante: cobro.referencia } : {}),
    monto_propina: n(cobro.propina),
  };
}

/**
 * @param {object} doc - internal documento with detallesDoc/cobros includes
 * @param {Map<string,string>} productNames - productoId → nombre
 * @param {object} [opts]
 * @param {boolean} [opts.stale] - delayed-consistency read: hide cobros and
 *   report the pre-cobro estado (fault-profile `stale`)
 */
function serializeDocumento(doc, productNames = new Map(), opts = {}) {
  if (!doc) return null;
  const stale = Boolean(opts.stale);
  const cobros = stale ? [] : (doc.cobros || []).map(serializeCobro);
  const estado = stale && (doc.estado === 'C' || doc.estado === 'F') ? 'P' : doc.estado;

  return {
    id: doc.id,
    pos: doc.pos,
    fecha_emision: doc.fechaEmision,
    tipo_documento: doc.tipoDocumento,
    tipo_registro: doc.tipoRegistro,
    documento: doc.documento || null,
    estado,
    electronico: doc.electronico,
    descripcion: doc.descripcion,
    adicional1: doc.adicional1 ?? '',
    adicional2: doc.adicional2 ?? '',
    subtotal_0: n(doc.subtotal0),
    subtotal_12: n(doc.subtotal15), // official wire name — see module docblock
    iva: n(doc.iva),
    servicio: n(doc.servicio),
    total: n(doc.total),
    autorizacion: doc.autorizacionSRI || null,
    cliente: doc.clienteRazonSocial
      ? {
          cedula: doc.clienteCedula || '',
          ruc: doc.clienteRuc || '',
          razon_social: doc.clienteRazonSocial,
          tipo: doc.clienteTipo || 'N',
          email: doc.clienteEmail || '',
          telefonos: doc.clienteTelefonos || '',
          direccion: doc.clienteDireccion || '',
          es_extranjero: Boolean(doc.clienteExtranjero),
        }
      : null,
    detalles: (doc.detallesDoc || []).map((d) => ({
      id: d.id,
      producto_id: d.productoId,
      // producto_nombre is sandbox-OBSERVED (not in the OpenAPI GET table);
      // the app reads it for item names.
      producto_nombre: productNames.get(d.productoId) || null,
      nombre_manual: null,
      descripcion: null,
      cantidad: n(d.cantidad),
      precio: n(d.precio),
      porcentaje_iva: d.porcentajeIva,
      porcentaje_descuento: n(d.porcentajeDescuento),
      base_cero: n(d.baseCero),
      base_gravable: n(d.baseGravable),
      base_no_gravable: n(d.baseNoGravable),
    })),
    cobros,
  };
}

function serializePersona(persona) {
  return {
    id: persona.id,
    tipo: persona.tipo || 'N',
    cedula: persona.cedula || '',
    ruc: persona.ruc || '',
    razon_social: persona.razonSocial,
    email: persona.email || '',
    telefonos: persona.telefonos || '',
    direccion: persona.direccion || '',
    es_cliente: true,
    es_proveedor: false,
    es_extranjero: Boolean(persona.esExtranjero),
  };
}

module.exports = { serializeDocumento, serializeCobro, serializePersona, ddmmyyyy };
