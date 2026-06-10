# Contifico Compatibility Guide

## Overview

This POS was designed so that connecting it to a real [Contifico](https://contifico.com) account
requires **zero changes to business logic**. The entire adaptation lives in
`src/adapters/contificoAdapter.js`.

---

## The Adapter Swap Strategy

Today the adapter **mocks** Contifico calls (SRI authorization, RIDE/XML URLs). Tomorrow, with
one environment variable change, it **forwards** them:

```
CONTIFICO_ENABLED=true
CONTIFICO_TOKEN=your_real_token_here
CONTIFICO_BASE_URL=https://api.contifico.com/sistema/api/v1
```

The `forwardToContifico()` function in the adapter handles the live call. No service files change.

---

## Field Mapping

| Internal Model | Contifico v2 Field | Notes |
|---|---|---|
| `documento.tipoDocumento` | `tipo_documento` | `PRE` or `FAC` |
| `documento.fechaEmision` | `fecha_emision` | `DD/MM/YYYY` |
| `documento.tipoRegistro` | `tipo_registro` | Always `CLI` |
| `documento.estado` | `estado` | `P/C/A/F` |
| `documento.subtotal15` | `subtotal_15` | Base 15% IVA (Ecuador 2024+) |
| `documento.iva` | `iva` | `subtotal_15 × 0.15` |
| `documento.servicio` | `servicio` | 10% service charge |
| `documento.total` | `total` | Full amount |
| `documento.urlRide` | `url_ride` | PDF receipt URL |
| `documento.urlXml` | `url_xml` | SRI XML URL |
| `documento.autorizacionSRI` | `autorizacion` | SRI authorization number |
| `documento.clienteCedula` | `cliente.cedula` | |
| `documento.clienteRazonSocial` | `cliente.razon_social` | |
| `detalleDoc.productoId` | `detalles[].producto_id` | Contifico product UUID |
| `detalleDoc.cantidad` | `detalles[].cantidad` | |
| `detalleDoc.precio` | `detalles[].precio` | Unit price |
| `detalleDoc.porcentajeIva` | `detalles[].porcentaje_iva` | `15` for IVA-bearing |
| `detalleDoc.baseGravable` | `detalles[].base_gravable` | `cantidad × precio` |
| `cobro.formaCobro` | `cobros[].forma_cobro` | `EF/TC/TD/TR/CH` |
| `cobro.monto` | `cobros[].monto` | |

---

## Persona → Contifico Cliente

The `toContificoPersona()` function maps our Persona model to Contifico's nested `cliente` object:

```js
// Internal
{
  cedula: "0922054366",
  razonSocial: "Juan Pérez",
  email: "juan@example.com"
}

// → Contifico
{
  cedula: "0922054366",
  ruc: "0922054366001",
  razon_social: "Juan Pérez",
  tipo: "N",
  email: "juan@example.com",
  telefonos: "",
  direccion: "",
  es_extranjero: false
}
```

---

## IVA Rate — Ecuador 2024

**15%** (Ley de Régimen Tributario, reformed April 1, 2024 — previously 12%).

Always use `subtotal_15` and `porcentaje_iva: 15`. If you have IVA-exempt items, use `subtotal_0`
and `porcentaje_iva: 0` for those lines.

```
Total = subtotal_0 + subtotal_15 + iva + servicio
iva   = subtotal_15 × 0.15
```

---

## Auth Header

Contifico uses a custom `AUTHORIZATION` header (not `Authorization`). The adapter sends:

```
AUTHORIZATION: Token <CONTIFICO_TOKEN>
```

Our public API uses the same style:

```
Authorization: Token <API_KEY>
```

---

## Enabling Live Contifico

1. Set `CONTIFICO_ENABLED=true` in your `.env`
2. Add your `CONTIFICO_TOKEN` (from Contifico Settings > API)
3. Set `CONTIFICO_BASE_URL=https://api.contifico.com/sistema/api/v1`
4. In `documentoService.js` → `crearDocumento()`, add:

```js
if (env.CONTIFICO_ENABLED && tipoDocumento === TIPO_DOCUMENTO.FAC) {
  const payload = contificoAdapter.toContificoDocumento(orden, doc);
  const resp = await contificoAdapter.forwardToContifico(payload);
  const mapped = contificoAdapter.fromContificoDocumento(resp);
  // update doc with real SRI fields
}
```

That's the **entire swap** — the rest of the codebase is unchanged.

---

## Practisis / Other POS Adapters

The same swap strategy works for Siigo, Practisis, or any other Ecuador POS. Add a new adapter
file under `src/adapters/`, implement the same `toDocumento / fromDocumento` methods, and wire
it via the `CONTIFICO_ENABLED`-style flag.
