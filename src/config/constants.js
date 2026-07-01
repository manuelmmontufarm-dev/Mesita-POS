'use strict';

// Ecuador IVA rate — 15% as of 2024 (Law 004, effective Apr 1 2024)
const IVA_RATE = 0.15;
const IVA_PERCENT = 15;

// Service charge (propina de servicio) — standard 10% in Ecuador restaurants
const SERVICE_RATE = 0.10;

// Date format convention: DD/MM/YYYY (Contifico standard)
const DATE_FORMAT = 'DD/MM/YYYY';

// Currency
const CURRENCY = 'USD';

// Document types (Contifico)
const TIPO_DOCUMENTO = {
  PRE: 'PRE',   // Pre-factura (open bill)
  FAC: 'FAC',   // Factura (SRI invoice)
};

// Document states.
// Contifico's full enum is P:pendiente, C:cobrado, G:pagado, A:anulado,
// E:generado, F:facturado. We keep the four the POS drives directly and expose
// G/E so the Contifico-compatibility layer can round-trip every documented state.
const ESTADO_DOCUMENTO = {
  PENDIENTE: 'P',
  COBRADO: 'C',
  PAGADO: 'G',
  GENERADO: 'E',
  ANULADO: 'A',
  FACTURADO: 'F',
};

// Full set of documento estado codes Contifico accepts/returns.
const ESTADO_DOCUMENTO_CONTIFICO = ['P', 'C', 'G', 'A', 'E', 'F'];

// Mesa states
const ESTADO_MESA = {
  LIBRE: 'L',
  OCUPADA: 'O',
  PAGANDO: 'P',
  CERRADA: 'C',
};

// Orden states
const ESTADO_ORDEN = {
  ABIERTA: 'A',
  CERRADA: 'C',
  CANCELADA: 'X',
};

// Payment method codes used internally by the POS.
const FORMA_COBRO = {
  EFECTIVO: 'EF',
  TARJETA_CREDITO: 'TC',
  TARJETA_DEBITO: 'TD',
  TRANSFERENCIA: 'TR',
  CHEQUE: 'CH',
};

// Mapping between the POS internal forma_cobro codes and Contifico's codes.
// Contifico uses CQ for cheque (see documento example in the official guide);
// EF/TC/TD/TR are shared. This lets the compatibility layer translate in both
// directions so a switch to live Contifico needs no data migration.
const FORMA_COBRO_TO_CONTIFICO = {
  EF: 'EF',
  TC: 'TC',
  TD: 'TD',
  TR: 'TR',
  CH: 'CQ',
};

const FORMA_COBRO_FROM_CONTIFICO = {
  EF: 'EF',
  TC: 'TC',
  TD: 'TD',
  TR: 'TR',
  CQ: 'CH',
  CH: 'CH',
};

// MesitaQR session states
const MESITAQR_ESTADO = {
  PENDIENTE: 'pendiente',
  PAGADO: 'pagado',
  EXPIRADO: 'expirado',
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

// SRI Ecuador — mock authorization number format
const SRI_MOCK_PREFIX = 'DEMO';

module.exports = {
  IVA_RATE,
  IVA_PERCENT,
  SERVICE_RATE,
  DATE_FORMAT,
  CURRENCY,
  TIPO_DOCUMENTO,
  ESTADO_DOCUMENTO,
  ESTADO_DOCUMENTO_CONTIFICO,
  ESTADO_MESA,
  ESTADO_ORDEN,
  FORMA_COBRO,
  FORMA_COBRO_TO_CONTIFICO,
  FORMA_COBRO_FROM_CONTIFICO,
  MESITAQR_ESTADO,
  PAGINATION,
  SRI_MOCK_PREFIX,
};
