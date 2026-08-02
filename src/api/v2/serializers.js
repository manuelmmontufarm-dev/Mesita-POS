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

/**
 * SANDBOX-VERIFIED 2026-07-06 (contract O7): on an `EF` cobro the server
 * OVERWRITES whatever `numero_comprobante` the client sent with the literal
 * "Efectivo". Reference reconciliation is therefore IMPOSSIBLE for cash, and
 * the app must never blind-retry an EF cobro. Applied on read as well as on
 * write so cobros created through the v1 POS UI report the same value.
 */
function numeroComprobante(cobro) {
  if (cobro.formaCobro === 'EF') return 'Efectivo';
  return cobro.referencia || undefined;
}

function serializeCobro(cobro) {
  const comprobante = numeroComprobante(cobro);
  return {
    id: cobro.id,
    forma_cobro: cobro.formaCobro,
    monto: n(cobro.monto),
    fecha: ddmmyyyy(cobro.createdAt),
    ...(cobro.procesador ? { tipo_ping: cobro.procesador } : {}),
    ...(syntheticLote(cobro) !== undefined ? { lote: syntheticLote(cobro) } : {}),
    ...(comprobante ? { numero_comprobante: comprobante } : {}),
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

  // SANDBOX-VERIFIED (contract O3/O7): the document carries a live `saldo`
  // that decrements with every cobro and reaches 0 when the PRE is fully
  // paid. Computed in integer cents — never float arithmetic on money.
  // A stale read hides the cobros, so it must report the pre-cobro saldo too.
  const totalCents = Math.round(n(doc.total) * 100);
  const paidCents = stale
    ? 0
    : (doc.cobros || []).reduce((sum, c) => sum + Math.round(n(c.monto) * 100), 0);
  const saldo = Math.max(0, totalCents - paidCents) / 100;

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
    referencia: doc.referencia ?? '',
    adicional1: doc.adicional1 ?? '',
    adicional2: doc.adicional2 ?? '',
    subtotal_0: n(doc.subtotal0),
    subtotal_12: n(doc.subtotal15), // official wire name — see module docblock
    iva: n(doc.iva),
    servicio: n(doc.servicio),
    total: n(doc.total),
    saldo,
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

function serializeProducto(producto) {
  return {
    id: producto.id,
    codigo: producto.codigo || '',
    nombre: producto.nombre,
    descripcion: producto.descripcion || '',
    pvp1: n(producto.precio),
    categoria_id: producto.categoriaId || null,
    categoria_nombre: producto.categoria?.nombre || null,
    porcentaje_iva: Number(producto.porcentajeIva ?? 0),
    estado: producto.disponible === false ? 'I' : 'A',
    fecha_modificacion: producto.updatedAt
      ? new Date(producto.updatedAt).toISOString()
      : null,
  };
}

module.exports = {
  serializeDocumento,
  serializeCobro,
  serializePersona,
  serializeProducto,
  ddmmyyyy,
};
