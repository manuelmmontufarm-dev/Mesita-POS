# Contifico Compatibility Guide

This POS exposes **two** API surfaces:

| Surface | Base path | Shape | Consumers |
|---|---|---|---|
| **Native POS API** | `/sistema/api/v1` | POS-native (`{count,results}` envelopes, camelCase-ish, `Authorization: Token <key>`, `PATCH` updates) | The MesitaQR/PagaYa app today (`mesita-app`) |
| **Contifico-compat surface** | `/contifico/sistema/api/v1` | **Byte-for-byte Contifico** (bare arrays, string decimals, `DD/MM/YYYY`, raw-key auth, Contifico verbs) | A migration target; swap to live Contifico with a base-URL change |

The compat surface is **additive** — the native API is unchanged, so nothing that
consumes it breaks. Both surfaces read/write the **same database** via the shared
services (`documentoService`, `catalogoService`), so there is no data migration.

Goal: develop and test against `/contifico/sistema/api/v1` exactly as you would
against `https://api.contifico.com/sistema/api/v1`, then flip the base URL + auth
to go live.

---

## Contifico-compat surface

Reference: the official Contifico guide — <http://contifico.github.io>.

### Conventions reproduced
- **Auth:** the API key is sent **raw** in the header: `Authorization: <APIKEY>` (no
  `Token`/`Bearer` scheme word). `Bearer <session>` and `Token <key>` are also accepted.
- **Envelopes:** list endpoints return a **bare JSON array** (not `{count,results}`).
- **Types:** monetary totals are **strings** with 2 decimals (`"17.00"`); line-item
  `cantidad`/`precio`/bases are **numbers**; dates are `DD/MM/YYYY`; absent values are
  explicit `null`.
- **Verbs:** `PUT` for documento/persona updates; `PATCH` for producto; `POST/GET/DELETE`
  for `documento/{id}/cobro/`.

### Endpoints implemented

| Method | Path | Notes |
|---|---|---|
| `GET` | `/registro/documento/` | List documentos (bare array) |
| `GET` | `/documento/{id}/` | Single documento |
| `POST` | `/documento/` | Create `PRE`/`FAC` |
| `PUT` | `/documento/` | Update (id in body: `estado`, cobro) |
| `GET/POST` | `/documento/{id}/cobro/` | List / add payment |
| `DELETE` | `/documento/{id}/cobro/{cobroId}/` | Remove payment |
| `PUT` | `/documento/{id}/sri/` | **Emit SRI electronic invoice** (mock signing) |
| `GET` | `/documento/{id}/retencion/` | Empty (no withholding modelled) |
| `GET/POST/PUT` | `/persona/` (+ `/{id}/`) | Clients; `PUT` updates by body id |
| `GET/POST` | `/producto/` (+ `/{id}/`) | Catalog; `pvp1`/`estado`/`tipo` fields |
| `PATCH` | `/producto/{id}/` | Update producto |
| `GET` | `/producto/{id}/stock/` | Bodega stock (see limitations) |
| `GET` | `/categoria/` | Product categories |
| `GET` | `/health/` | Unauthenticated |

### Estado codes
Full Contifico set is surfaced: `P` pendiente, `C` cobrado, `G` pagado, `A` anulado,
`E` generado, `F` facturado.

### forma_cobro mapping
Internal `EF/TC/TD/TR/CH` ↔ Contifico `EF/TC/TD/TR/CQ` (cheque is `CQ` in Contifico).
Translated automatically in both directions.

---

## Deliberate limitations (same as a Contifico account without add-ons)

These are **intentional** — the response shape is identical to Contifico, but the
values reflect modules the restaurant POS does not run:

- **ICE / IRBPNR:** always `null`/`"0.00"` on detalle lines (no such products).
- **Inventory** (`bodega`, `variante`, `marca`, `movimiento-inventario`, `guía`):
  `GET` returns `[]`; `producto/{id}/stock/` reports a single logical bodega with
  `cantidad: null` (stock not tracked).
- **Contabilidad** and **banco**: `GET` returns `[]`.
- **`documento` number / `secuencial`:** synthesized deterministically in Contifico's
  `NNN-NNN-NNNNNNNNN` format from the row id (stable, but not an SRI-assigned sequence).
- **SRI signing** (`/documento/{id}/sri/`): local mock authorization/RIDE/XML. This is
  the single swap point for real SRI submission.
- **`vendedor`, `caja`, cheque/tarjeta metadata:** present in the response with
  Contifico's default `null`.

---

## Field notes / things to verify before cutover

- **`subtotal_15` vs `subtotal_12`.** Ecuador is at 15% IVA (2024), so the POS uses
  `subtotal_15`. Contifico's published examples still show `subtotal_12`. The compat
  surface emits **both** keys with the same value by default. Set
  `CONTIFICO_STRICT_SUBTOTAL=1` (and optionally `CONTIFICO_SUBTOTAL_KEY`) to emit only
  one. **Confirm the exact key against a live Contifico sandbox before switching.**
- **Detalle `producto_id`.** Contifico requires a real product id per line. The app
  currently sends restaurant line items by `nombre`; that mapping must be resolved on
  the app side for the live switch.

---

## Live adapter (`src/adapters/contificoAdapter.js`)

For forwarding POS documents to the real Contifico API (not wired into business logic
by default):

```
CONTIFICO_ENABLED=true
CONTIFICO_TOKEN=your_real_api_key
CONTIFICO_BASE_URL=https://api.contifico.com/sistema/api/v1
```

- `forwardToContifico(payload)` → `POST /documento/` with the **raw** `Authorization`
  header (Contifico style).
- `emitSriOnContifico(id)` → `PUT /documento/{id}/sri/`.

---

## Contract tests

`tests/contifico-compat.test.js` asserts the compat surface returns byte-for-byte
Contifico shapes (bare arrays, string decimals, verbs, auth, forma_cobro mapping,
SRI issuance). Run: `npm test`.
