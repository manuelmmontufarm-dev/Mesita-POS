# MesitaQR — Integration Plan
## From Demo to Production: Architecture, Data Flows, and Implementation Phases

> **Purpose of this document:** Single source of truth for what we are building, how every piece communicates, and what to implement in each phase. Each phase ends with a concrete functionality check before moving on. The prompts at the end of each section are ready to paste into Claude Code or a similar assistant.

---

## 1. What We Are Building (Final State)

MesitaQR is a **QR pay-at-table layer on top of the restaurant's existing POS**. The POS (Contífico) owns the order and the electronic invoice (SRI). MesitaQR owns the payment UX and the card charge.

### The 4 actors

| Actor | Interface | Auth |
|---|---|---|
| **Guest** (diner at table) | `/pay/[token]` — QR scan | None (public) |
| **Owner / Manager** | `/dashboard/owner/...` | NextAuth session |
| **Server / Staff** | Dashboard companion view | NextAuth session |
| **Super Admin** (PagaYa team) | `/admin/...` | NextAuth + admin role |

### The invariants that never change

1. **Contífico is the source of truth for items and prices.** Never recompute totals from BillItems when `posTotal` is present on the Bill.
2. **Contífico issues the SRI factura, not us.** We call `/cobro/`, Contífico converts PRE → FAC automatically when cobros sum equals the document total.
3. **Polling, not webhooks.** Contífico has no webhooks. Build everything for idempotent re-ingestion.
4. **Kushki charge is synchronous and authoritative.** If Kushki approves, the Payment is recorded in our DB immediately. POS confirmation is best-effort after that — it never voids an approved charge.
5. **The demo path (Redis + POS Mesita) stays intact for marketing.** Real restaurant tables use the Postgres path exclusively.

---

## 2. Database Model (Final Shape)

The schema is essentially complete. Below is the authoritative description of every table and the fields that matter for the integration.

### `Restaurant`
Stores one row per restaurant tenant.

```
id               — UUID primary key
name             — display name
slug             — URL-safe slug for dashboard routing
status           — PENDING | ACTIVE | SUSPENDED
invoiceMode      — DISABLED | MANUAL | POS
                   POS = Contífico auto-cobros
                   MANUAL = companion page, staff confirms manually
                   DISABLED = no POS integration

-- Contífico integration (all null when invoiceMode != POS)
posProvider      — "CONTIFICO" (extensible to "SIIGO", "PRACTICIS")
posApiKeyEnc     — AES-256 encrypted Contífico API key (never plaintext in DB)
posEnvironment   — "SANDBOX" | "PRODUCTION"
posTableField    — which field in the Contífico document carries the table name
                   (e.g. "descripcion" — configurable per restaurant)
posPaymentMethod — "TC" (tarjeta/card) | "EF" (efectivo/cash)
                   sent as forma_cobro in the cobro call

-- Kushki integration
paymentsEnabled  — true once Kushki keys are configured
kushkiPublicKey  — from Kushki dashboard (encrypted in DB)
kushkiPrivateKey — from Kushki dashboard (encrypted in DB)

-- SRI / fiscal
ruc, razonSocial, nombreComercial, direccionMatriz, etc.
```

### `Table`
One row per physical table in the restaurant.

```
id             — UUID primary key
name           — display name (e.g. "Mesa 5")
token          — unique UUID → encoded in the QR sticker → never changes
restaurantId   — FK to Restaurant

posExternalId  — THE MAPPING BRIDGE
                 This must equal the table identifier as it appears in Contífico
                 documents (via the posTableField). If Contífico uses "Mesa 5"
                 in the `descripcion` field, posExternalId = "Mesa 5".
                 Without this, the ingest cron cannot match documents to tables.
```

### `Bill`
One row per open precuenta. Keyed on `posDocumentId` to prevent duplicates.

```
id             — UUID primary key
tableId        — FK to Table
restaurantId   — FK to Restaurant
status         — UNPAID | PARTIALLY_PAID | FULLY_PAID | REFUNDED

-- POS source of truth amounts (D-07)
-- These come from Contífico and are NEVER recomputed from BillItems.
posDocumentId  — Contífico document ID (@unique → idempotent ingestion)
posToken       — Contífico internal `pos` UUID (REQUIRED for cobro calls)
posSubtotal    — Decimal from Contífico (base without IVA)
posIva         — Decimal from Contífico
posPropina     — Decimal from Contífico (service charge)
posTotal       — Decimal from Contífico (the authoritative total)

-- SRI $50 rule
invoiceRecipientPaymentId — ID of the Payment whose guest provided tax data
                            (first Payment with usable identificacion wins;
                            only that guest's data goes on the Contífico factura)
```

### `BillItem`
Line items mirrored from Contífico `detalles`. Not authoritative for totals.

```
id           — UUID primary key
billId       — FK to Bill
restaurantId — FK to Restaurant
name         — from Contífico (producto_nombre or nombre_manual)
price        — unit price from Contífico
quantity     — from Contífico
isPaid       — true once this item has been covered by a Payment
```

### `Payment`
One row per successful Kushki transaction.

```
id                    — UUID primary key
billId                — FK to Bill
restaurantId          — FK to Restaurant
guestSessionId        — FK to BillGuestSession (nullable)
status                — COMPLETED | FAILED | REFUNDED
amount                — total charged (includes voluntary tip)
voluntaryTip          — tip portion (so net bill payment = amount - voluntaryTip)
kushkiTransactionId   — Kushki ticket number (for refunds + webhook reconciliation)
idempotencyKey        — UUID, client-generated, prevents double-charge on retry
splitMode             — FULL | EQUAL | BY_ITEM

-- Guest tax data (for SRI factura when total > $50)
guestIdentificacion   — cédula / RUC / passport number
guestEmail
guestNombre
guestTipo             — CEDULA | RUC | PASAPORTE | CONSUMIDOR_FINAL

-- POS confirmation tracking
posRegisteredAt       — timestamp when we successfully called Contífico /cobro/
posRegistrationNote   — error message if cobro failed (for manual companion reconciliation)
```

### `BillGuestSession`
Tracks each person who joined the pay page (multi-device collaboration).

```
id          — UUID primary key
billId      — FK to Bill
label       — P1, P2, P3... (assigned sequentially per bill)
displayName — name the guest typed in
colorHue    — HSL hue for their avatar color
status      — SELECTING | REVIEWING | IN_PAYMENT | PAID | LEFT
```

### `BillItemClaim`
Records which guest claimed which item in BY_ITEM split mode.

```
billItemId     — FK to BillItem
guestSessionId — FK to BillGuestSession
units          — fractional units claimed (1.0 = full item, 0.5 = half)
status         — ACTIVE | PAID | RELEASED
```

---

## 3. Communication Map (All Channels)

### Channel 1 — Guest Phone → PagaYa (public, no auth)

```
GET  /api/guest/bill/[token]
     → Finds Table by token → finds open Bill → returns items, breakdown,
       remainingBalance, payments. Reads posTotal as authoritative.

GET  /api/guest/table-session/[token]
POST /api/guest/table-session/[token]
     → Join or create a BillGuestSession (P1, P2, P3...)
     → Returns session label, color, other active guests

GET  /api/guest/table-session/[token]/events   (SSE)
     → Streams state changes to the guest's phone
     → Polls DB every 1 second, pushes `event: state` when version changes
     → Sends `event: ping` every 15s to keep connection alive
     → Guest UI re-renders instantly on each push (items, claims, payments)

POST /api/bills/[billId]/pay
     → The payment endpoint (see Flow 2 below for full step-by-step)
```

### Channel 2 — PagaYa → Kushki (payment processor)

```
→ Synchronous at payment time:
   chargeCard(kushkiToken, amount) → { approved, ticketNumber, errorText }
   If approved: record Payment in DB, call Contífico cobro.
   If declined: throw, return 402 to guest, nothing written to DB.

← Async webhook (secondary):
   POST /api/webhooks/kushki
   Kushki pushes HMAC-signed events for async failures and chargebacks.
   We look up Payment by kushkiTransactionId, update status if FAILED.
   Returns 500 on DB error so Kushki retries.
```

### Channel 3 — PagaYa → Contífico (production POS)

```
Auth: AUTHORIZATION: {posApiKeyEnc decrypted} header on every request.
Base URL: https://api.contifico.com/sistema/api/v1/

Ingest (cron):
  GET /documento/?tipo_documento=PRE
  → Returns all open prefacturas (estado: P)
  → We match each via posTableField → Table.posExternalId
  → Upsert Bill + BillItems, store posDocumentId + posToken + pos* totals

Freshness pre-check (at payment time, before Kushki charge):
  GET /documento/{posDocumentId}/
  → Check estado: if C/F/A → bill already closed in POS → return 400 to guest
  → Transport error → fail-open (don't block the guest)

Guest SRI data (if total > $50 and guest provides tax info):
  GET /persona/?identificacion={cedula}
  → Look up existing cliente
  POST /persona/   (if not found)
  → Create new persona (tipo, identificacion, razon_social, email, es_cliente)
  PUT /documento/{posDocumentId}/
  → Attach cliente_id to the document so Contífico uses it on the factura

Payment registration (after Kushki approves):
  POST /documento/{posDocumentId}/cobro/
  Body: { forma_cobro: "TC", monto: partialAmount, fecha: today,
          tipo_ping: "CREDITO", lote: "001", pos: posToken }
  → Contífico records the cobro
  → When sum(cobros) == document.total → Contífico auto-emits FAC (SRI invoice)
  → 409 response = already paid/factured → treat as success (idempotent)
```

### Channel 4 — PagaYa → POS Mesita (demo/pilot only)

```
Auth: Authorization: Token {POS_MESITA_API_KEY} (single global key, env var)
Base URL: https://mesita-pos.vercel.app/sistema/api/v1

This channel is ONLY used by the demo tables (token="demo", mesa-1 through mesa-4).
Real restaurant tables NEVER use this channel.

Used for: syncing demo table state, registering demo payments.
Not relevant for production restaurant integration.
```

### Channel 5 — Owner/Admin Dashboard → PagaYa (authenticated)

```
All requests require a valid NextAuth session with OWNER or MANAGER role.

GET  /api/dashboard              → live panel data (all tables + bill status)
GET  /api/bills                  → bill list with filters
GET  /api/bills/[id]             → single bill detail
GET  /api/tables                 → table list
POST /api/tables                 → create table
PUT  /api/tables/[id]            → edit table (including posExternalId mapping)
GET  /api/menu/categories        → menu categories
POST /api/menu/categories        → create category
GET  /api/menu/items             → menu items
POST /api/menu/items             → create item
GET  /api/staff                  → staff accounts
POST /api/staff                  → create staff user
GET  /api/payments/[id]/refund   → initiate Kushki refund
GET  /api/reports/payments       → payment history
GET  /api/reports/propinas       → tip reports
GET  /api/restaurant/[id]        → restaurant settings
PUT  /api/restaurant/[id]        → update settings
PUT  /api/restaurant/[id]/integrations  → save Contífico + Kushki keys
POST /api/pos-companion/payments → manually confirm a POS cobro (MANUAL mode)
GET  /api/pos/ingest             → Vercel Cron trigger (also callable manually)
```

---

## 4. The Three Critical Flows

### Flow A — POS Items Appearing on the Guest Screen

This is triggered by the waiter adding items in Contífico, not by the guest.

```
Step 1: Waiter adds item to Table 5 in Contífico POS
         (creates or updates a PRE document)

Step 2: Vercel Cron fires → GET /api/pos/ingest
         (every 1 minute minimum on Vercel free tier)
         Alternatively: when guest opens the pay page, trigger an immediate
         one-time sync via /api/guest/bill/[token]/refresh (see Phase 3)

Step 3: ContificoAdapter.pullOrders()
         → GET /documento/?tipo_documento=PRE
         → Iterates all open PRE documents
         → For each: reads doc[posTableField] → matches Table.posExternalId
         → If Bill exists for posDocumentId → syncBillItems()
              UPDATE bill SET posTotal, posIva, posSubtotal, posPropina
              UPSERT bill_items by name (update qty/price if changed)
         → If no Bill yet → createBillWithItems()
              INSERT bill with posDocumentId, posToken, pos* totals
              INSERT bill_items

Step 4: Guest's SSE connection detects version change (DB changed)
         → pushes `event: state` to the phone
         → Guest screen re-renders with the new items — no refresh needed

Lag: ~1 minute (cron interval). Reduced to ~0s on first QR scan if we trigger
     an immediate sync in the bill fetch endpoint.
```

### Flow B — Guest Pays with MesitaQR (the core flow)

```
Step 1: Guest taps "Pagar $X"
         POST /api/bills/[billId]/pay with:
           { amount, kushkiToken, tableToken, splitMode,
             selectedItemIds?, equalSplitPeople?,
             voluntaryTipAmount, checkoutMode, guestData? }

Step 2: Server validates
         - tableToken → Table → restaurantId (no fake table tokens)
         - Bill exists and belongs to this Table and Restaurant
         - Bill is not already FULLY_PAID or REFUNDED
         - Amount is within ±$0.01 of server-computed expected amount

Step 3: Freshness pre-check (if invoiceMode === "POS")
         GET /documento/{posDocumentId}/ in Contífico
         - If PRE is closed (estado: C/F/A) → 400 "Bill already closed in POS"
         - If PRE not found → 400 "Bill unavailable"
         - Transport error → fail-open (charge anyway, log POS_PRECHECK_FAILED)

Step 4: SRI $50 guard
         If posTotal > 50 AND this split would close the bill
         AND no invoiceRecipientPaymentId yet AND no usable guestData
         → throw InvoiceDataRequiredError → 422 to guest → show invoice form

Step 5: Kushki charge
         chargeCard({ kushkiToken, amount, voluntaryTip }) → { approved, ticketNumber }
         If declined → throw → 402 to guest. Nothing written to DB.

Step 6: DB atomic transaction (only if Kushki approved)
         INSERT payments (amount, tip, ticketNumber, idempotencyKey, guestData, splitMode)
         If BY_ITEM: UPDATE bill_items SET isPaid=true WHERE id IN selectedItemIds
         If BY_ITEM last payment: amount is reconciled to posTotal - sum(previous cobros)
         UPDATE bill SET status = PARTIALLY_PAID | FULLY_PAID
         If first payment with usable guestData: SET invoiceRecipientPaymentId = this payment

Step 7: Contífico cobro (best-effort, never blocks or voids the charge)
         If invoiceMode === "POS":
           a. If guestData and this payment is invoiceRecipient:
              GET/POST /persona/ → get or create cliente
              PUT /documento/{posDocumentId}/ → attach cliente_id
           b. POST /documento/{posDocumentId}/cobro/
              { forma_cobro: "TC", monto: thisPartialAmount,
                fecha: today, tipo_ping: "CREDITO", lote: "001", pos: posToken }
           On failure → log POS_COBRO_FAILED severity:CRITICAL
                      → store error in payment.posRegistrationNote
                      → companion page shows it for manual reconciliation

Step 8: When sum(cobros) === posTotal in Contífico (Contífico side, automatic)
         PRE document → FAC document
         SRI electronic invoice issued to guest (or CONSUMIDOR_FINAL)
         Our DB already has bill.status = FULLY_PAID from Step 6

Step 9: Response to guest
         { billId, status: "FULLY_PAID", paymentId, amountCharged }
         Guest sees success screen with receipt
```

### Flow C — Dashboard Live Updates

```
Owner has /dashboard/owner/panel open in browser
  │
  Frontend polls GET /api/dashboard every 5 seconds
  │
  /api/dashboard queries:
    SELECT tables + their active bills + completed payments
    Returns: [{ tableId, tableName, billId, billStatus,
                posTotal, paidAmount, remainingBalance,
                guestCount, lastPaymentAt }]
  │
  UI renders table grid:
    "Sin cuenta"          — no open bill
    "Cuenta abierta"      — UNPAID, shows total
    "Pagando parcialmente"— PARTIALLY_PAID, shows paid/remaining
    "Pagado"              — FULLY_PAID, shows total paid
  │
  When guest pays → DB updates in Step 6 (above)
  → Within 5 seconds the owner sees the updated status
  → No websockets needed — 5s polling is imperceptible for a dashboard

Cron updates (POS items added by waiter):
  → Reflected in dashboard within ~1 minute (cron interval)
```

---

## 5. What Happens to the Precuenta in Every Scenario

| Scenario | MesitaQR action | Contífico result |
|---|---|---|
| Guest pays full bill | One cobro for posTotal | PRE → FAC immediately |
| 2 guests split equally | Two cobros, each posTotal/2 | Stays PRE after first, FAC after second |
| 3 guests by item | Three cobros, each for their items | Stays PRE until last items paid → FAC |
| Waiter adds item mid-payment | Cron re-ingests updated PRE, BillItems updated | posTotal increases, guest sees updated total |
| Waiter voids order in Contífico | PRE deleted → cron sees it gone → logs POS_DOC_UNMAPPED | Bill stays in DB as UNPAID (manual cleanup needed) |
| Cash payment at counter | Cobro added directly in Contífico → PRE → FAC | Our cron sees PRE is gone, Bill marked FULLY_PAID |
| Kushki charge succeeds, cobro fails | Payment recorded in DB, bill shows FULLY_PAID | PRE stays open in Contífico — companion page shows alert for manual cobro |

---

## 6. Implementation Phases

Each phase is self-contained. Complete the functionality check before moving to the next phase.

### Phase completion standard (apply to every phase)

When a phase is finished, update that phase's **Completion Record** block (directly under the phase prompt). Do not mark a phase **COMPLETE** until functionality checks pass in production (or a documented local equivalent).

Every completion record must include:

| Field | What to write |
|---|---|
| **Status** | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| **Completed** | ISO date (e.g. `2026-06-30`) |
| **What was done** | Bullets of *actual* work shipped — not the plan restated |
| **Verification evidence** | Commands run, endpoints hit, pass/fail |
| **Deviations from plan** | What differed from this doc and why |
| **Code shipped** | Git commit hash(es) on `main` |
| **Carry-forward** | Concrete recommendations for the *next* phase only |

After updating the completion record, add a short **Recommendations for Phase N+1** subsection if Phase N surfaced anything that changes how Phase N+1 should be executed.

---

### Phase 0 — Real Database Connection

**What:** Connect the Postgres database to Vercel. Run migrations. Verify the schema is live.

**Why:** Nothing in the production path works without a real DB. The demo still runs on Redis, but every other feature depends on Postgres.

**What to do:**
1. Provision a Postgres database (Supabase, Neon, or Railway).
2. Set `DATABASE_URL` (PgBouncer transaction-mode, port 6543, `?pgbouncer=true`) and `DIRECT_URL` (direct port 5432) in Vercel environment variables.
3. Run `npx prisma migrate deploy` against the DIRECT_URL.
4. Run `npx prisma db seed` if a seed script exists.
5. Verify the Vercel deployment can reach the DB (check Vercel logs for Prisma connection errors).

**Functionality check:**
- `GET /api/admin/restaurants` with valid `ADMIN_SECRET` (header, Bearer, or `admin_secret` cookie) returns JSON array — **not** `500` (empty array is fine; `401` without secret is also correct)
- `POST /api/auth/register` creates a user and restaurant (status `PENDING`) in the DB
- `GET /api/guest/bill/demo` returns bill JSON after `npm run db:seed:minimal` (not `TABLE_NOT_FOUND`)
- `GET /dashboard/owner/panel` loads without crashing when logged in (empty state is fine)
- `/admin/login` sets admin cookie and `/admin` loads restaurant list

**Prompt for this phase:**
```
We need to connect the real Postgres database to this Next.js app (mesita-app).
The schema is in prisma/schema.prisma and the migration files are in prisma/migrations/.
The Prisma datasource uses two env vars: DATABASE_URL (PgBouncer transaction-mode pooler,
port 6543, must include ?pgbouncer=true) and DIRECT_URL (direct connection, port 5432).

Steps needed:
1. Verify prisma/schema.prisma has `directUrl = env("DIRECT_URL")` in the datasource block.
2. Check that prisma/migrations/ has a single consolidated migration that represents
   the full schema (look for 20260629000000_scale_and_merge or similar).
3. Run `npx prisma migrate deploy` and confirm it succeeds.
4. Add a minimal seed script (prisma/seed.ts) that creates one test Restaurant with
   status ACTIVE and invoiceMode DISABLED, and one OWNER user for that restaurant.
5. Test the connection by hitting GET /api/admin/restaurants and confirming it returns
   JSON (even empty array) with no 500.

Do not touch any demo code (src/lib/demo-*, src/app/api/demo/*, Redis config).
Do not change any existing migration files — only run deploy.
```

#### Phase 0 — Completion Record

| Field | Value |
|---|---|
| **Status** | `COMPLETE` |
| **Completed** | `2026-06-30` |
| **Code shipped** | `019bcf0` — `fix(phase0): admin login, minimal seed, slug on register, plan completion record` |

**What was done:**
- Vercel project **mesitademo**: all Phase 0 env vars set (`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_*`, `ADMIN_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `POS_MESITA_*`); production redeployed.
- Vercel project **mesita-pos**: already had `DATABASE_URL`, `API_KEY`, `APP_BASE_URL`, `MESITAQR_WEBHOOK_SECRET`, `PLATFORM_BOOTSTRAPPED` — no changes needed.
- **Admin auth:** `/admin/login` + `POST /api/admin/session` (httpOnly cookie); middleware guards `/admin/*` and `/api/admin/*`.
- **Register:** creates `Restaurant.slug` on signup.
- **Seed:** `SEED_MODE=minimal` via `npm run db:seed:minimal` (Mesita Demo, `token=demo`, owner `owner@mesita.demo`).
- **Schema:** `PaymentStatus.PENDING` restored in Prisma to match DB enum.
- **CI:** workflow triggers on `main` (was `master` only).
- **Migrations:** DB was bootstrapped earlier via `prisma/supabase_deploy.sql` (now **deprecated**); baselined all 17 Prisma migrations with `prisma migrate resolve --applied` per migration, then `migrate status` → up to date.
- **Local Prisma:** `.env` with pooler URLs (gitignored); `DIRECT_URL` uses Supabase **session pooler** `:5432` because `db.[ref].supabase.co` did not resolve on this network.

**Verification evidence (production `mesitademo-two.vercel.app`, 2026-06-30):**

| Check | Result |
|---|---|
| `GET /api/guest/bill/demo` | `200`, `success: true`, bill items present |
| `GET /api/admin/restaurants` + `x-admin-secret` | `200`, restaurant list JSON |
| `GET /api/admin/restaurants` (no auth) | `401` |
| `POST /api/auth/register` | `201`, user + `restaurantId` returned |
| `npm run db:seed:minimal` | Exit 0 |
| `npx prisma migrate status` | "Database schema is up to date" |

**Deviations from plan:**
- Plan said `DIRECT_URL` → `db.[ref].supabase.co:5432`; **session pooler** `:5432` worked instead (`aws-1-us-east-2.pooler.supabase.com`).
- Plan implied `migrate deploy` on empty DB; production DB already had schema from SQL script → **baseline** required before deploy.
- Plan said "single consolidated migration"; repo has **17 incremental** migrations — fine after baseline.
- Functionality check originally said admin endpoint returns `[]` without auth; **correct behavior is `401`** without `ADMIN_SECRET`.

**Carry-forward → Phase 1:**
- Use `/admin/login` (not manual cookie injection) to activate `PENDING` restaurants.
- New registrations get `slug` automatically — wire dashboard routing to use it where applicable.
- Delete stray test restaurants/users from Phase 0 smoke tests in Supabase when convenient.
- Phase 1 `posExternalId` UI is **required** before Phase 2 ingest — seed already demonstrates pattern (`posExternalId: "12"` on demo table).
- Do **not** run `npm run db:seed` (full) on production — only `db:seed:minimal`.
- Push code before testing `/admin/login` on Vercel (was local-only until this commit).

---

### Phase 1 — Restaurant Onboarding & Table Setup

**What:** An owner can register, configure their restaurant, add tables, and download QR codes. No POS integration yet — just the basic setup.

**Why:** Before any POS polling or payments can work, we need at least one restaurant in the DB with correctly configured tables, including `posExternalId` set for each table.

#### Recommendations for Phase 1 (from Phase 0)

These adjust the Phase 1 prompt based on what Phase 0 actually surfaced:

1. **Admin activation first.** Every new owner from `/register` is `PENDING`. Before testing owner flows, log in at `/admin/login` and set the restaurant to `ACTIVE`.
2. **`slug` already exists on register.** Phase 1 should *display* slug on configuracion and use it in any share links — do not add another slug-creation path.
3. **`posExternalId` is the highest-risk field.** Seed uses `"12"` for demo table; real tables need a visible "Nombre en el POS" field on mesas — validate with a manual test table before Contífico work.
4. **Separate demo from production mentally.** `Mesita Demo` / `token=demo` is seeded; real restaurant tables use UUID tokens from `POST /api/tables`.
5. **Smoke-test with a fresh registration**, not only `owner@mesita.demo` — confirms the full register → admin activate → login → mesas path.
6. **Keep `invoiceMode` DISABLED** for Phase 1 test restaurants; POS fields can be filled in UI but ingest is Phase 2+.

**What to do:**
1. Owner registers at `/register` → creates account with role OWNER.
2. Super admin activates the restaurant at `/admin`.
3. Owner visits `/dashboard/owner/configuracion` → fills in restaurant name, RUC, contact info.
4. Owner visits `/dashboard/owner/mesas` → creates tables, sets `posExternalId` for each to match the table name in Contífico (e.g. "Mesa 1", "Mesa 2").
5. Owner downloads/prints QR codes from the table management page.
6. Owner visits `/dashboard/owner/personal` → creates SERVER accounts for staff.

**Critical detail:** The `posExternalId` field on each table must exactly match the value that appears in the Contífico document's `posTableField` (e.g. if `posTableField = "descripcion"` and Contífico puts "Mesa 5" in the description, then `posExternalId = "Mesa 5"`). There must be UI to set this.

**Functionality check:**
- Owner can log in and see their dashboard.
- Tables page shows created tables with their QR tokens.
- Each table has a `posExternalId` set.
- QR code for a table resolves to `/pay/[token]` and shows "No hay cuenta abierta" (no bill yet — correct).
- Admin panel at `/admin` shows the restaurant as ACTIVE.

**Prompt for this phase:**
```
We need to make the restaurant setup flow fully functional in mesita-app.
This includes: table creation with posExternalId, QR code display, and the
configuracion page for restaurant settings.

Context:
- Table model has `posExternalId String?` — this must equal the table name as it
  appears in Contífico documents. Without this the ingest cron cannot map documents
  to tables.
- The tables page is at src/app/dashboard/owner/mesas/page.tsx
- The settings page is at src/app/dashboard/owner/configuracion/page.tsx
- QR codes use the table token (Table.token UUID)

Work needed:
1. In the table creation/edit form (mesas page), add a "Nombre en el POS" input
   that writes to `posExternalId`. Label it clearly: "Debe coincidir exactamente
   con el nombre de la mesa en Contífico". Make it required when invoiceMode === "POS".
2. In the table list, show the posExternalId value next to each table name.
3. Verify the QR code component generates a URL using the table token and the
   canonical demo URL pattern. For real tables: /pay/[token].
4. In configuracion, ensure the posTableField setting is exposed (which Contífico
   document field carries the table name — default: "descripcion").
5. Write a quick test: create a Table via POST /api/tables with posExternalId="Mesa 5",
   then GET /api/tables and confirm posExternalId is returned.

Do not change the demo path. Do not touch src/lib/demo-* files.
```

---

### Phase 2 — POS Ingestion (Contífico → PagaYa DB)

**What:** The Vercel Cron job polls Contífico for open PRE documents and creates/updates Bills and BillItems in our DB.

**Why:** This is the bridge between the POS and the guest pay screen. Without it, guests scan the QR and see "no hay cuenta" even when the waiter has already created the order in Contífico.

**How the ingest works (already built, needs to be wired and tested):**
- `GET /api/pos/ingest` → `ContificoAdapter.pullOrders()` → `ingestRestaurantOrders()`
- Keyed on `Bill.posDocumentId` (@unique) — idempotent, safe to run any time
- Matches documents to tables via `posTableField` → `Table.posExternalId`
- Creates Bill with posDocumentId, posToken, pos* totals
- Upserts BillItems by name (handles waiter adding/removing items)

**What to do:**
1. Configure a restaurant with `invoiceMode = "POS"`, `posProvider = "CONTIFICO"`, and a real Contífico API key (encrypted via the configuracion page).
2. Set `CRON_SECRET` env var in Vercel.
3. Confirm `vercel.json` has the cron job definition: `{ "path": "/api/pos/ingest", "schedule": "* * * * *" }` (every minute — note: Vercel Pro required for 1-min cron; Hobby tier minimum is 1 hour).
4. Test the ingest manually: `curl -H "Authorization: Bearer {CRON_SECRET}" https://yourapp.vercel.app/api/pos/ingest`
5. Create a PRE in Contífico for Table 1. Run the ingest. Verify a Bill + BillItems appear in the DB.
6. Add an **on-QR-scan refresh**: in `GET /api/guest/bill/[token]`, after fetching the bill, trigger a lightweight background refresh from Contífico for that restaurant. This makes item data fresh the moment the guest opens the page, without waiting for the cron.

**Functionality check:**
- Create a PRE in Contífico with 2 items for a mapped table.
- Hit the ingest endpoint manually.
- Check the DB: `SELECT * FROM bills WHERE "posDocumentId" = '...'` — should have a row.
- Check `SELECT * FROM bill_items WHERE "billId" = '...'` — should have 2 rows.
- Scan the QR → guest screen shows the 2 items with correct prices.
- Add a 3rd item in Contífico, run ingest again → guest screen shows 3 items.

**Prompt for this phase:**
```
We need to make the POS ingestion pipeline work end-to-end in mesita-app.

The ingestion code is already written:
- Cron handler: src/app/api/pos/ingest/route.ts
- Contífico adapter: src/modules/pos/adapters/contifico.adapter.ts
- Ingest use case: src/modules/pos/application/ingest-orders.ts
- DB repository: src/modules/pos/adapters/prisma/pos-order.repository.ts

What needs to happen:
1. In src/app/api/guest/bill/[token]/route.ts, after successfully fetching the
   bill from DB, add a background POS sync: if the table's restaurant has
   invoiceMode === "POS" and a posApiKeyEnc, call ingestRestaurantOrders() for
   just that restaurant (not await — fire-and-forget so it doesn't slow the
   guest response). This gives fresh data on every QR scan without waiting for cron.

2. In vercel.json, confirm or add the cron entry:
   { "crons": [{ "path": "/api/pos/ingest", "schedule": "*/1 * * * *" }] }
   Note: 1-minute cron requires Vercel Pro. On Hobby, use "0 * * * *" (hourly)
   and rely on the on-scan refresh from step 1 for freshness.

3. Write a manual test script at scripts/test-ingest.ts that:
   a. Reads CRON_SECRET and the app URL from env
   b. Calls GET /api/pos/ingest with the auth header
   c. Prints the response (created, updated, skipped, errored per restaurant)
   Run it with: npx ts-node scripts/test-ingest.ts

4. Add a health-check response to the ingest endpoint: include a timestamp,
   how many restaurants were processed, and any per-restaurant errors.
   Do not change the core ingest logic — only the response shape.

Do not touch demo tables or Redis code.
```

---

### Phase 3 — Guest Pay Screen (Production Path)

**What:** The guest scans a real table QR, sees the live bill from Contífico, and can interact with it (select items, choose split mode). No payment yet — just the display and selection layer.

**Why:** The demo path (`/pay/demo`) uses Redis and fake items. The production path (`/pay/[token]`) must read from Postgres and show real Contífico items.

**What to do:**
1. Ensure `GET /api/guest/bill/[token]` returns the correct shape for a real table (it uses Prisma, not Redis — this should already work once Phase 2 is done).
2. Ensure `GET /api/guest/table-session/[token]` and the SSE endpoint work for real tables.
3. The guest page at `src/app/pay/[token]/page.tsx` should already handle the production path — verify it doesn't accidentally call demo APIs.
4. Test multi-device: open the same QR on two phones → both should see each other's name and item selections in real time (via SSE polling DB every 1s).
5. Verify the "no hay cuenta abierta" state shows correctly when the table has no open bill.
6. Verify the bill totals shown come from `posTotal` / `posSubtotal` / `posIva` (not recomputed from items).

**Functionality check:**
- Open the real table QR on one phone → see items from the Contífico PRE.
- Open the same QR on a second phone → both phones see each other.
- On phone 1: claim two items in BY_ITEM mode → phone 2 sees them claimed immediately.
- Total shown matches exactly what Contífico shows for that document.
- Waiter adds an item in Contífico → after ingest (or on-scan refresh) → item appears on both phones.

**Prompt for this phase:**
```
We need to verify and harden the guest pay page production path in mesita-app.

The guest pay page is at src/app/pay/[token]/page.tsx (and components in src/app/pay/).
The demo path uses tokens starting with "demo" and calls /api/demo/* routes.
The production path uses real UUID tokens and calls /api/guest/* routes.

Work needed:
1. In src/app/pay/[token]/page.tsx, confirm the routing logic:
   - if token === "demo" or starts with "demo/" → use demo path (keep as-is)
   - otherwise → use production path (/api/guest/bill/[token])
   If this routing is already correct, document it with a comment. If not, fix it.

2. In the production path, verify that the bill display:
   - Shows items from BillItem rows (from Contífico via ingest)
   - Shows posTotal as the authoritative total (NOT sum of item prices)
   - Shows posIva and posPropina as received from Contífico
   - Shows remainingBalance correctly (posTotal minus sum of completed payments)

3. Verify the SSE connection for production tables:
   /api/guest/table-session/[token]/events must work for real tokens.
   The getTableSessionState() function (src/modules/guest-session/) must read
   from Postgres, not Redis.

4. Test the "no bill" state: if Table exists but has no open Bill, the page
   should show a friendly waiting screen ("Tu mesa está lista. En breve
   el mesero registrará tu orden.") — not a crash or generic 404.

5. Test the "TABLE_NOT_FOUND" state: if the token doesn't match any Table
   in the DB, show a clear "QR no válido o mesa inactiva" message.

Do not modify the demo path. Do not touch src/lib/demo-* or /api/demo/* routes.
```

---

### Phase 4 — Payment Processing (Kushki + Contífico Cobros)

**What:** The guest can actually pay. Kushki charges the card, the DB records the payment, and Contífico receives the cobro. This closes the loop.

**Why:** This is the product. Everything before was setup; this is where money moves.

**What to do:**
1. Configure Kushki keys for the restaurant (public + private, encrypted in DB).
2. Test with Kushki sandbox tokens first.
3. Run through the full payment flow: guest pays full bill → verify Payment row in DB → verify cobro in Contífico → verify PRE becomes FAC.
4. Test partial payment (BY_ITEM): two guests each pay for their items → verify two Payment rows → verify two cobros in Contífico → verify PRE becomes FAC after second payment.
5. Test equal split: two guests each pay half → verify two Payment rows → verify PRE becomes FAC.
6. Test the $50 rule: bill > $50, last payer has no guest data → should get invoice form.
7. Test cobro failure recovery: if Contífico is down, payment should still succeed (logged as POS_COBRO_FAILED, visible on companion page).
8. Test idempotency: submitting the same payment twice with the same idempotencyKey → second call returns 200 with alreadyProcessed: true, no double charge.

**Functionality check:**
- Pay a full bill with a Kushki test card.
- Check DB: `SELECT * FROM payments WHERE "billId" = '...'` → one row with status COMPLETED.
- Check DB: `SELECT status FROM bills WHERE id = '...'` → FULLY_PAID.
- Check Contífico: the PRE document should have one cobro and be closed (FAC).
- Guest sees success screen with amountCharged matching what was charged.
- Dashboard shows table as "Pagado".

**Prompt for this phase:**
```
We need to test and harden the full payment flow in mesita-app.

The payment endpoint is at src/app/api/bills/[billId]/pay/route.ts.
The payment processing logic is at src/modules/payments/application/process-payment.ts.
The Contífico cobro call is inside ContificoAdapter.confirmPayment() in
src/modules/pos/adapters/contifico.adapter.ts.

Work needed:
1. Write an integration test script at scripts/test-payment-flow.ts that:
   a. Finds a restaurant with invoiceMode=POS and an open Bill in the DB
   b. Calls POST /api/bills/{billId}/pay with a Kushki sandbox token
      (use the test token from Kushki docs — it always approves)
   c. Verifies the response: { billId, status: "FULLY_PAID", paymentId, amountCharged }
   d. Queries the DB and confirms: Payment row exists, Bill status = FULLY_PAID
   e. Queries Contífico and confirms: cobro exists on the document
   Run with: npx ts-node scripts/test-payment-flow.ts

2. Verify the last-payment reconciliation logic in the pay route:
   When a BY_ITEM payment covers the last unpaid items, the amount charged must be
   posTotal - sum(previous cobros net amounts) — not the item-derived sum.
   This ensures Contífico's cobros sum exactly to posTotal and PRE→FAC triggers.
   The logic is in route.ts around the "closesBill" check. Confirm it is correct.

3. Verify POS_COBRO_FAILED logging:
   In process-payment.ts, when adapter.confirmPayment() fails, confirm the error is
   logged as JSON with event="POS_COBRO_FAILED" and the posRegistrationNote is
   written to the Payment row. This is what the companion page reads.

4. Verify idempotency:
   Call the payment endpoint twice with the same idempotencyKey.
   Second call must return { alreadyProcessed: true } with HTTP 200.
   Confirm only one Payment row exists in the DB.
   Confirm Kushki was only charged once (check ticketNumbers).

Do not modify the demo payment flow (chargeDemoCard path).
```

---

### Phase 5 — Dashboard Panel (Live Table Grid)

**What:** The owner's dashboard panel shows all tables, their current bill status, and payment progress in near-real-time (5-second polling).

**Why:** The owner needs operational visibility. Without this, they're flying blind.

**What to do:**
1. Ensure `GET /api/dashboard` returns the correct data shape: all tables for the restaurant, each with bill status, totals, guest count.
2. The panel page at `/dashboard/owner/panel` should poll this endpoint every 5 seconds and re-render the table grid.
3. Each table card should show a clear visual state: no bill, open bill (with amount), partially paid (with progress bar), fully paid.
4. Clicking a table card should show a detail drawer: items, individual payments, guest sessions.
5. The panel should work without a full page reload when a guest pays.

**Functionality check:**
- Open the panel on a desktop.
- Have a guest pay on their phone.
- Within 5 seconds, the owner's panel shows the updated status without refresh.
- Table cards are visually distinct for each status.
- Clicking a table shows payment details.

**Prompt for this phase:**
```
We need to make the owner dashboard panel show live table status in mesita-app.

The panel page is at src/app/dashboard/owner/panel/page.tsx.
The dashboard API is at src/app/api/dashboard/route.ts.

Work needed:
1. In GET /api/dashboard, ensure the response includes for each table:
   { tableId, tableName, billId (nullable), billStatus (nullable),
     posTotal (nullable), paidAmount, remainingBalance, guestCount,
     lastPaymentAt (nullable), items: [{ name, quantity, isPaid }] }
   Use the restaurant from the authenticated session. Use Prisma to query
   tables + their most recent non-REFUNDED bill + completed payments.

2. In the panel page, add a useEffect that:
   - Calls GET /api/dashboard on mount
   - Repeats every 5000ms using setInterval
   - Updates state with the response
   - Cleans up the interval on unmount
   Use React state, not React Query, to keep it simple.

3. Render a table grid where each card shows:
   - Table name (large, clear)
   - Status badge: "Sin cuenta" (gray) | "Abierta $X.XX" (amber) |
     "Parcial $paid/$total" (orange) | "Pagada ✓" (green)
   - If PARTIALLY_PAID: a progress bar showing paidAmount/posTotal
   - Guest count (number of active BillGuestSessions)
   - Time of last payment (if any)
   Follow the Server Dashboard rules in CLAUDE.md: compact, dense, scannable.

4. Clicking a table card opens a detail drawer (use a Sheet or Dialog from shadcn)
   showing: item list with isPaid status, payments list with amount/time/splitMode,
   guest sessions with their names.

Do not touch the demo dashboard at /api/demo-dashboard.
```

---

### Phase 6 — Companion Page (Manual Cobro Reconciliation)

**What:** When a cobro fails automatically (or the restaurant uses MANUAL invoice mode), staff can see pending payments and manually confirm them in Contífico.

**Why:** The Contífico cobro is best-effort. If it fails (network, POS down, wrong posToken), the payment is still in our DB but the PRE is not closed. The companion page surfaces these failures so staff can fix them.

**What to do:**
1. The companion page at `/dashboard/owner/companion` shows payments where `posRegisteredAt` is null OR `posRegistrationNote` contains an error.
2. For each such payment, show: bill ID, table name, amount, guest name, error message.
3. Provide a "Reintentar cobro" button that calls `POST /api/pos-companion/payments` with the paymentId → retries the Contífico cobro.
4. If the restaurant uses `invoiceMode: MANUAL`, all payments appear here for manual confirmation.
5. Once manually confirmed, `posRegisteredAt` is set and the payment disappears from the list.

**Functionality check:**
- Simulate a cobro failure: temporarily give the restaurant a wrong Contífico API key, then process a payment.
- The companion page should show the payment with the error.
- Fix the API key, click "Reintentar cobro" → cobro succeeds → item disappears from the list.

**Prompt for this phase:**
```
We need the companion page to surface and resolve failed Contífico cobros in mesita-app.

The companion page is at src/app/dashboard/owner/companion/page.tsx.
The companion API is at src/app/api/pos-companion/payments/route.ts (may need to be created).

Work needed:
1. Create or update GET /api/pos-companion/payments to return:
   Payments for this restaurant where posRegisteredAt IS NULL
   (cobro was never confirmed in Contífico — either failed or MANUAL mode)
   Include: paymentId, billId, tableName, amount, tip, createdAt,
            guestNombre, splitMode, posRegistrationNote (error message)

2. Create POST /api/pos-companion/payments with body { paymentId } to:
   a. Load the Payment + its Bill (for posDocumentId, posToken)
   b. Load the Restaurant (for posApiKeyEnc, posPaymentMethod)
   c. Build ContificoAdapter and call confirmPayment()
   d. On success: UPDATE payments SET posRegisteredAt = NOW()
   e. On failure: UPDATE payments SET posRegistrationNote = errorMessage
   f. Return { success, errorMessage? }

3. In the companion page:
   - On mount and every 30s: fetch the pending payments list
   - Show each as a card with table name, amount, error, and a "Reintentar" button
   - On "Reintentar" click: call the POST endpoint, show toast on success/failure
   - On success: remove the card from the list
   - Show an empty state when no pending cobros: "Todos los cobros están registrados ✓"

4. Add a "Modo manual" section for restaurants with invoiceMode = MANUAL:
   These see ALL payments without posRegisteredAt and can mark them as
   "Confirmado manualmente" — which sets posRegisteredAt but skips the API call.

Auth: requires OWNER or MANAGER session. Check that the authenticated restaurant
matches the payments being accessed.
```

---

### Phase 7 — Receipts, History & Reports

**What:** After payment, guests get a receipt. Owners get payment history and basic reports (daily revenue, tips).

**Why:** Operators need records. Guests expect confirmation.

**What to do:**
1. The receipt drawer on the guest success screen shows: restaurant name, table, date, itemized list (with who paid what), total, tip, payment reference (kushkiTransactionId last 8 chars).
2. The owner's reports page at `/dashboard/owner/estadisticas` shows: daily revenue chart, payment count, average ticket, total tips collected.
3. The payment history at `/dashboard/owner/reembolsos` lists all payments with filter by date/status.
4. Each payment row shows: table, amount, tip, guest name (if provided), payment reference, POS registration status.

**Functionality check:**
- Pay a bill → success screen shows receipt with correct items and totals.
- Owner opens estadisticas → sees today's revenue (including the just-processed payment).
- Owner opens reembolsos → sees the payment with correct details.

**Prompt for this phase:**
```
We need receipts on the guest screen and payment history in the owner dashboard.

Work needed:
1. In the guest pay page success state (src/app/pay/[token]/):
   Show a receipt component with:
   - Restaurant name and table name
   - Date and time of payment
   - Itemized list: name, quantity, unit price, subtotal
     (if BY_ITEM: only show items this guest paid for)
   - Payment reference: last 8 chars of kushkiTransactionId
   - Subtotal (posSubtotal from Bill), IVA (posIva), tip (voluntaryTip), total paid
   - Note: "Tu factura será emitida por [restaurantName]"
   Style: use the iOS Liquid Glass design system from customer.css, not shadcn.

2. In GET /api/reports/payments:
   Return payments for this restaurant filtered by date range (query params: from, to).
   Include: paymentId, tableId, tableName, billId, amount, voluntaryTip, splitMode,
            guestNombre, kushkiTransactionId, posRegisteredAt, createdAt, status

3. In GET /api/reports/propinas:
   Return aggregate tip data: totalTips, averageTip, tipsByDay[]

4. In the estadisticas page (src/app/dashboard/owner/estadisticas/):
   Show for the selected date range:
   - Total revenue (sum of amount - voluntaryTip across COMPLETED payments)
   - Total tips (sum of voluntaryTip)
   - Payment count
   - Average ticket
   - Revenue by day (bar chart using recharts — already in the codebase)
   Use GET /api/reports/payments and /api/reports/propinas as data sources.

Do not create new chart libraries. Use recharts if charts are needed (already installed).
```

---

### Phase 8 — Refunds

**What:** An owner can refund a payment through the dashboard. The refund goes through Kushki and updates the DB.

**Why:** Mistakes happen. A customer was charged twice or the wrong amount. The owner needs to be able to refund without calling Kushki support.

**What to do:**
1. The refunds page at `/dashboard/owner/reembolsos` lists completed payments.
2. Each payment has a "Reembolsar" button (only for COMPLETED status, and only within Kushki's refund window — typically 30 days).
3. Clicking "Reembolsar" shows a confirmation dialog with the amount.
4. On confirm: call `POST /api/payments/[id]/refund` → Kushki refund API → update Payment status to REFUNDED, update Bill status to REFUNDED.
5. Show clear feedback: toast on success, error message on failure.

**Functionality check:**
- Process a payment with a test card.
- Open reembolsos → see the payment.
- Click Reembolsar → confirm → payment shows as REFUNDED.
- Guest (if re-checking) would see bill as REFUNDED.

**Prompt for this phase:**
```
We need to implement refunds through the owner dashboard in mesita-app.

The refund endpoint may be at src/app/api/payments/[id]/refund/route.ts.
The Kushki client is at src/modules/payments/adapters/kushki/client.ts
and has a refundPayment() function.

Work needed:
1. Ensure POST /api/payments/[paymentId]/refund:
   a. Requires OWNER or MANAGER session and verifies the payment belongs
      to the authenticated restaurant
   b. Checks payment.status === "COMPLETED" (cannot refund already-refunded)
   c. Calls kushki.refundPayment({ ticketNumber: payment.kushkiTransactionId, amount })
   d. On Kushki success: UPDATE payments SET status="REFUNDED"
      UPDATE bills SET status="REFUNDED" (if all payments on this bill are refunded)
   e. On Kushki failure: return the error message (do not update DB)
   f. Returns { success, errorMessage? }

2. In the reembolsos page (src/app/dashboard/owner/reembolsos/):
   - List all payments with status COMPLETED for this restaurant
   - Show: table name, amount, tip, date, guest name, payment reference
   - Each row has a "Reembolsar" button (disabled if status != COMPLETED)
   - Clicking opens a confirmation Dialog: "¿Reembolsar $X.XX a [guestNombre]?"
     with Cancel and Confirm buttons
   - On confirm: call POST /api/payments/[id]/refund, show toast
   - On success: update the row status to REFUNDED in the UI
   - On failure: show error toast with the message from Kushki

3. Add a status badge to each payment row:
   COMPLETED (green) | REFUNDED (gray with strikethrough amount) | FAILED (red)

Auth: all endpoints require OWNER or MANAGER session scoped to the restaurant.
Do not allow refunding payments from other restaurants.
```

---

### Phase 9 — Cleanup & Production Hardening

**What:** Remove placeholders, harden the production path, ensure the demo and production paths are cleanly separated, add monitoring.

**Why:** Before onboarding real restaurants, the system needs to be clean and observable.

**What to do:**
1. **Separate demo from production clearly:** Confirm that no real restaurant table ever calls a `/api/demo/*` route. The demo path is only for `token=demo` and `token=demo/mesa-{1..4}`.
2. **Remove placeholder food items** from any code path that serves real restaurant tables. The only items that should appear are from BillItems in the DB (ingested from Contífico).
3. **Add structured logging** for every POS_COBRO_FAILED, POS_INGEST_DOC_ERROR, POS_PRECHECK_FAILED — these should be visible in Vercel logs and queryable.
4. **Add the `posPaymentMethod` toggle** in configuracion (TC = card, EF = cash) — this sets the `forma_cobro` field in the cobro body.
5. **Handle the Contífico `posTableField` configuration** — if Contífico puts the table name in `descripcion`, the restaurant config must say so. The ingest adapter reads `doc[posTableField]`.
6. **Verify the encryption** of posApiKeyEnc and Kushki keys — confirm the decryption at runtime works and no keys are logged in plaintext.
7. **Rate limiting** on `/api/guest/bill/[token]` and `/api/bills/[billId]/pay` — already in place, verify it's active.

**Prompt for this phase:**
```
We need to harden the production path and clean up the separation between
demo and production in mesita-app.

Work needed:
1. Audit every file in src/app/pay/ that isn't inside a /demo/ subfolder.
   Confirm that no code in the production pay path calls /api/demo/* routes.
   If any such calls exist, fix them to use /api/guest/* instead.

2. In GET /api/guest/bill/[token]/route.ts, confirm there is NO fallback to
   demo data or placeholder items. If the DB has no bill for this table,
   return errorResponse("No hay cuenta abierta para esta mesa", 404).
   Do not return seeded food items.

3. In the configuracion page, add a "Método de cobro en POS" selector:
   - "Tarjeta (TC)" — sends forma_cobro: "TC" with tipo_ping: "CREDITO", lote: "001"
   - "Efectivo (EF)" — sends forma_cobro: "EF" with fecha and descripcion
   This writes to restaurant.posPaymentMethod.

4. In ContificoAdapter.confirmPayment(), read the posPaymentMethod from config
   to build the cobro body. Currently hardcoded to "TC" — make it dynamic.

5. Add a health-check page at /dashboard/owner/configuracion that shows:
   - POS connection status: ping Contífico and show green/red
   - Kushki connection status: ping Kushki and show green/red
   - Last successful ingest timestamp
   - Count of bills waiting for cobro (posRegisteredAt IS NULL)

6. Verify in the Vercel logs dashboard that structured JSON logs appear for
   POS_COBRO_FAILED and POS_INGEST_DOC_ERROR events. If not visible, add
   console.error(JSON.stringify({event, ...fields})) calls.

Do not remove or modify any demo path code. Demo must stay working.
```

---

## 7. Open Questions to Resolve Before Starting

These need a decision before implementation, not during:

1. **Vercel plan:** The ingest cron needs to run every minute for timely item display. Vercel Hobby only allows hourly crons. If on Hobby, the on-scan refresh (Phase 3, step 1) becomes critical — it's the only way to get fresh data on QR open. Decision needed: upgrade to Vercel Pro, or accept 60-minute cron + rely on on-scan refresh?

2. **Contífico sandbox vs production:** Each phase should be tested against the Contífico sandbox environment first (`posEnvironment = "SANDBOX"`). The sandbox base URL and auth behavior may differ from production. Confirm with Contífico which endpoint and which test API key to use.

3. **posTableField value:** This is the Contífico document field that carries the table name. The most common value is `descripcion` (the document description). Confirm by looking at a real PRE document in Contífico — what field contains the table name?

4. **Encryption key:** `posApiKeyEnc` stores the Contífico API key AES-256 encrypted. There must be an `ENCRYPTION_KEY` or `POS_ENCRYPTION_KEY` env var for encryption/decryption. Confirm this env var is set in Vercel and the encryption/decryption code is in place.

5. **posToken requirement:** Contífico's cobro endpoint requires a `pos` UUID in the body (the document's `pos` field). Verify this field exists on real PRE documents by inspecting the raw API response. If it doesn't exist, the cobro call must omit it (or use a default).

---

## 8. Quick Reference: Environment Variables Required

```bash
# Database (Postgres via Supabase/Neon/Railway)
DATABASE_URL=postgresql://...?pgbouncer=true    # PgBouncer transaction-mode pooler
DIRECT_URL=postgresql://...                      # Direct connection for migrations

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://yourapp.vercel.app

# Cron security
CRON_SECRET=...                                  # Any random string, sent as Bearer token

# Encryption (for Contífico and Kushki keys stored in DB)
ENCRYPTION_KEY=...                               # 32-byte hex string

# Demo POS (keep for demo tables)
POS_MESITA_API_KEY=...
POS_MESITA_API_URL=https://mesita-pos.vercel.app/sistema/api/v1

# Kushki webhook (async notifications)
KUSHKI_WEBHOOK_SECRET=...

# Admin access
ADMIN_SECRET=...                                 # Used by /api/admin/* routes
```

---

## 9. The Non-Negotiable Rules (From CLAUDE.md)

- Read `TODAY.md` before editing anything. Log every change in `TODAY.md`.
- If a bug is found in a live flow, add a scenario to `src/lib/demo-scenarios.ts` first, confirm it fails, then fix.
- Do not touch Dátil/FacturaJob code — it is legacy slated for removal.
- The POS is the source of truth for items, prices, and totals.
- Never recompute totals when `posTotal` is present on the Bill.
- The last cobro in a BY_ITEM split must be reconciled to `posTotal - sum(previousCobros)` — never item-derived math.
- A failed Contífico cobro must NEVER void the successful Kushki charge.
- Guest CSS (`src/app/pay/customer.css`) uses the iOS Liquid Glass system — do not apply shadcn or Tailwind classes to that screen.
