'use strict';

/**
 * Serializers that map internal Prisma records to Contifico's exact JSON shapes.
 *
 * Every field Contifico returns is emitted here — including the ones the POS
 * does not track (ICE, IRBPNR, vendedor, caja, bodega, cheque metadata, persona
 * roles). Those are surfaced with Contifico's own default (`null`, `false`,
 * `"0.00"`), which is precisely how Contifico returns them for a simple
 * restaurant document. This gives byte-for-byte response parity without the POS
 * having to model modules it does not use — the same "limitations" as a
 * Contifico account without inventory/accounting add-ons.
 */

const { money, num, ecDate, documentNumber } = require('./format');
const { FORMA_COBRO_TO_CONTIFICO } = require('../config/constants');

// The taxable-base field name. Ecuador moved to 15% IVA in 2024, so the POS
// standardizes on `subtotal_15`. Contifico's published examples still show
// `subtotal_12`. We emit both (same value) so the surface works regardless of
// which the caller reads; set CONTIFICO_STRICT_SUBTOTAL=1 to emit only the
// configured key. Verify the exact key against a live sandbox before cutover.
const SUBTOTAL_KEY = process.env.CONTIFICO_SUBTOTAL_KEY || 'subtotal_15';
const STRICT_SUBTOTAL = process.env.CONTIFICO_STRICT_SUBTOTAL === '1';

function serializeCliente(doc) {
  if (!doc.clienteRazonSocial && !doc.clienteCedula && !doc.clienteRuc) return null;
  return {
    ruc: doc.clienteRuc || '',
    cedula: doc.clienteCedula || '',
    razon_social: doc.clienteRazonSocial || '',
    telefonos: doc.clienteTelefonos || '',
    direccion: doc.clienteDireccion || '',
    tipo: doc.clienteTipo || 'N',
    email: doc.clienteEmail || '',
    es_extranjero: Boolean(doc.clienteExtranjero),
  };
}

function serializeDetalle(d) {
  const porcentajeIva = d.porcentajeIva !== undefined && d.porcentajeIva !== null
    ? d.porcentajeIva
    : null;
  return {
    producto_id: d.productoId || null,
    cantidad: num(d.cantidad),
    precio: num(d.precio),
    porcentaje_iva: porcentajeIva,
    porcentaje_descuento: num(d.porcentajeDescuento),
    base_cero: num(d.baseCero),
    base_gravable: num(d.baseGravable),
    base_no_gravable: num(d.baseNoGravable),
    // ICE / IRBPNR are not modelled by the POS (no such products); Contifico
    // returns these null/0 for standard restaurant items.
    porcentaje_ice: null,
    valor_ice: null,
    irbpnr: '0.00',
  };
}

function serializeCobro(c) {
  return {
    id: c.id,
    forma_cobro: FORMA_COBRO_TO_CONTIFICO[c.formaCobro] || c.formaCobro,
    numero_comprobante: null,
    caja_id: null,
    monto: money(c.monto),
    numero_tarjeta: null,
    fecha: ecDate(c.createdAt),
    nombre_tarjeta: null,
    tipo_banco: null,
    cuenta_bancaria_id: null,
    bin_tarjeta: null,
    monto_propina: c.propina !== undefined && c.propina !== null ? money(c.propina) : null,
    numero_cheque: null,
    fecha_cheque: null,
    tipo_ping: c.procesador || null,
    lote: null,
    // `referencia` is not part of Contifico's cobro object but the POS carries
    // it end-to-end for MesitaQR reconciliation; surfaced as a passthrough.
    referencia: c.referencia || null,
  };
}

/**
 * Serialize a Documento (with detallesDoc[], cobros[], orden included) into the
 * exact Contifico documento JSON.
 */
function serializeDocumento(doc) {
  if (!doc) return null;

  const subtotalBase = money(doc.subtotal15);
  const subtotalFields = STRICT_SUBTOTAL
    ? { [SUBTOTAL_KEY]: subtotalBase }
    : { subtotal_15: subtotalBase, subtotal_12: subtotalBase };

  const total = num(doc.total);
  const paid = (doc.cobros || []).reduce((s, c) => s + num(c.monto), 0);

  return {
    id: doc.id,
    documento: documentNumber(doc.id),
    pos: doc.pos || null,
    tipo_documento: doc.tipoDocumento,
    tipo_registro: doc.tipoRegistro || 'CLI',
    estado: doc.estado,
    electronico: Boolean(doc.electronico),
    descripcion: doc.descripcion || null,

    // Totals (Contifico serializes these as strings)
    subtotal_0: money(doc.subtotal0),
    ...subtotalFields,
    ice: '0.00',
    iva: money(doc.iva),
    servicio: money(doc.servicio),
    total: money(doc.total),
    saldo: money(Math.max(0, total - paid)),

    // SRI electronic-invoice fields (null until a FAC is issued via /sri/)
    autorizacion: doc.autorizacionSRI || null,
    clave_acceso: doc.claveAcceso || null,
    url_ride: doc.urlRide || null,
    url_xml: doc.urlXml || null,

    // Dates
    fecha_emision: ecDate(doc.fechaEmision),
    fecha_creacion: ecDate(doc.createdAt),
    fecha_vencimiento: ecDate(doc.fechaEmision),
    hora_emision: null,

    cliente: serializeCliente(doc),
    detalles: (doc.detallesDoc || []).map(serializeDetalle),
    cobros: (doc.cobros || []).map(serializeCobro),

    // Fields present in Contifico's schema but not driven by the POS. Emitted
    // with Contifico's defaults so the response shape is identical.
    vendedor: null,
    vendedor_id: null,
    vendedor_identificacion: null,
    caja_id: null,
    referencia: null,
    adicional1: '',
    adicional2: '',
    tipo_descuento: null,
    saldo_anticipo: null,
    documento_relacionado_id: null,
    anulado: doc.estado === 'A',
    firmado: Boolean(doc.autorizacionSRI),
    entregado: ['C', 'G', 'F'].includes(doc.estado),
    persona_id: doc.personaId || null,

    // Convenience association (also returned so app-side callers can map the
    // document back to a physical table; harmless superset over Contifico).
    orden_id: doc.ordenId || null,
    orden: doc.orden
      ? {
          id: doc.orden.id,
          estado: doc.orden.estado,
          mesa: doc.orden.mesa
            ? { id: doc.orden.mesa.id, nombre: doc.orden.mesa.nombre }
            : null,
        }
      : null,
  };
}

function serializePersona(p) {
  return {
    id: p.id,
    cedula: p.cedula || '',
    ruc: p.ruc || '',
    razon_social: p.razonSocial,
    nombre_comercial: p.razonSocial,
    tipo: p.tipo || 'N',
    email: p.email || '',
    telefonos: p.telefonos || '',
    direccion: p.direccion || '',
    es_extranjero: Boolean(p.esExtranjero),
    // Contifico role flags. The POS only models customers, so a persona is a
    // client by default and the other roles are false (same as a Contifico
    // persona created without explicit roles).
    es_cliente: true,
    es_vendedor: false,
    es_empleado: false,
    es_proveedor: false,
    es_corporativo: false,
    aplicar_cupo: false,
    porcentaje_descuento: null,
    personaasociada_id: null,
    numero_tarjeta: null,
    placa: null,
    origen: null,
    banco_codigo_id: null,
    tipo_cuenta: null,
    id_categoria: null,
    categoria_nombre: null,
    adicional1_cliente: '',
    adicional2_cliente: '',
    adicional3_cliente: '',
    adicional4_cliente: '',
    adicional1_proveedor: '',
    adicional2_proveedor: '',
    adicional3_proveedor: '',
    adicional4_proveedor: '',
  };
}

function serializeProducto(p) {
  const precio = money(p.precio);
  return {
    id: p.id,
    codigo: p.codigo || null,
    codigo_barra: null,
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    // Contifico: tipo PRO=Producto, SER=Servicio; restaurant dishes are goods.
    tipo: 'PRO',
    tipo_producto: 'SIM',
    porcentaje_iva: p.porcentajeIva !== undefined && p.porcentajeIva !== null ? p.porcentajeIva : null,
    // Contifico exposes up to 4 sale prices; the POS has a single price -> pvp1.
    pvp1: precio,
    pvp2: null,
    pvp3: null,
    pvp4: null,
    pvp_manual: false,
    categoria_id: p.categoriaId || null,
    // estado A=activo / I=inactivo mirrors the POS `disponible` flag.
    estado: p.disponible === false ? 'I' : 'A',
    marca_id: null,
    marca_nombre: null,
    minimo: '0.0',
    // No inventory module -> stock is not tracked (same limitation as a
    // Contifico account without inventory).
    cantidad_stock: null,
    para_pos: true,
    personalizado1: null,
    personalizado2: null,
    fecha_creacion: ecDate(p.createdAt),
    imagen: '',
    variantes: null,
    producto_base_id: null,
    detalle_variantes: [],
  };
}

function serializeCategoria(c) {
  return {
    id: c.id,
    nombre: c.nombre,
    orden: c.orden,
    activa: c.activa,
    fecha_creacion: ecDate(c.createdAt),
  };
}

module.exports = {
  serializeDocumento,
  serializeDetalle,
  serializeCobro,
  serializeCliente,
  serializePersona,
  serializeProducto,
  serializeCategoria,
};
