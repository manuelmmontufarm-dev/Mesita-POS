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

// Document states
const ESTADO_DOCUMENTO = {
  PENDIENTE: 'P',
  COBRADO: 'C',
  ANULADO: 'A',
  FACTURADO: 'F',
};

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

// Payment method codes (Contifico forma_cobro)
const FORMA_COBRO = {
  EFECTIVO: 'EF',
  TARJETA_CREDITO: 'TC',
  TARJETA_DEBITO: 'TD',
  TRANSFERENCIA: 'TR',
  CHEQUE: 'CH',
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
  ESTADO_MESA,
  ESTADO_ORDEN,
  FORMA_COBRO,
  MESITAQR_ESTADO,
  PAGINATION,
  SRI_MOCK_PREFIX,
};
