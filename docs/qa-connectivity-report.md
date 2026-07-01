# QA — App ↔ POS connectivity, loading & "Cuentas cerradas" (2026-07-01)

Testing rubric (success criteria):
1. A precuenta item shows on the app quickly and bug-free.
2. After paying on the app, the POS clearly shows the table paid and ready to reset.
3. "Cuentas cerradas" accurately shows: payment method, factura (SRI) data if applicable,
   total paid, how many payments of how much, and propina.
4. Math is correct across splits, multiple payments and tips.

## Bugs found & fixed

### Loading / redirect (reported by user)
- **BUG L1 — visible "Redirigiendo a Mesita POS v2…" hop.** `public/index.html` was a
  redirect stub (`<meta http-equiv="refresh">` + `location.replace('/pos-v2.html')`).
  **Fix:** `index.html` now serves the v2 app directly at `/` (no redirect).
- **BUG L2 — cold-start blocked the shell.** The Express DB-init gate ran before
  `express.static` and for every path, so static assets (HTML/CSS/JS) waited on the
  Postgres/platform bootstrap. **Fix:** static is served first; the DB gate is scoped to
  API paths only. First paint no longer waits on the DB.
- Note: the v2 dashboard compiles 8 `.jsx` files in-browser via Babel Standalone — the
  largest remaining load cost. Precompiling to plain JS in a build step is the next win
  (out of scope here).

### Cuentas cerradas — root cause: API field-name mismatch (`store-api.jsx › loadClosedDocs`)
The loader read Prisma camelCase names while the API returns snake_case, so several
fields were silently `undefined`:
- **BUG H1 — FAC shown as "Nota de venta".** Read `row.tipoDocumento` → always NV.
  Fix: `row.tipo_documento`.
- **BUG H2 — Subtotal $0.00.** Read `row.subtotal15`. Fix: `row.subtotal_0 + row.subtotal_15`.
- **BUG H3 — client "Consumidor Final" always.** Read `row.persona`. Fix: `row.cliente`.
- **BUG H4 — payment method always "Tarjeta".** Read `c.formaCobro`. Fix: `c.forma_cobro`
  (+ `EF/TC/TD/TR/CH` mapping and readable labels).
- **BUG H5 — propina never shown.** `c.propina` was not mapped into payments.
  Fix: carry `tip` per payment; show per-payment propina + a propina total.
- **BUG H6 — SRI factura data never shown.** `autorizacion` was hardcoded `null`.
  Fix: map `autorizacion`, `clave_acceso`, `url_ride`, `url_xml` and render a
  "Datos de factura (SRI)" block with RIDE/XML links.
- **BUG H7 — all docs showed the same time.** Read `row.createdAt` (undefined).
  Fix: `row.created_at`.
- **Enhancement:** the detail modal now shows "Total cuenta / Propina / Total cobrado",
  and a "N pagos · Cobrado $X · Propina $Y" summary.

### Payment math (root cause in the app: `mesita-app` `sync.ts`)
- **BUG M1 — servicio dropped.** The app hardcoded `servicio = 0` when posting the
  documento, so the 10% service charge vanished from the POS record.
- **BUG M2 — propina dropped.** The cobro had no `propina`; the tip was folded into
  `total`, so the tip was invisible on the POS.
- **BUG M3 — totals did not reconcile.** `total` included tip+service while the
  breakdown did not → e.g. total $55.16 vs subtotal+iva+servicio $45.31 (a $9.85 gap).
- **Fix (mesita-app):** post `subtotal_15`, `iva`, `servicio` from the authoritative
  payment breakdown; the documento `total` is the bill (subtotal+iva+servicio) and the
  tip travels on the cobro as `propina`. Result: `total == sum(cobro.monto)` and propina
  is separate — the POS "cuenta cerrada" reconciles.

## Verified
- Loading: `GET /` returns the app HTML directly (200, no redirect); static assets do not
  hit the DB gate.
- Cuentas cerradas (UI): split payment ($30 = $24 + $3.60 + $2.40; propina $3; total
  cobrado $33; two payments Efectivo/Tarjeta with per-payment propina) and a factura
  ($49.25 bill, propina $5.91, total cobrado $55.16) render with correct client, FAC
  label, reconciling totals, payment count summary, and SRI data (autorización, clave,
  RIDE/XML).
