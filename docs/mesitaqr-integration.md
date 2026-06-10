# MesitaQR / Paga Ya Integration Guide

## QR Payment Flow — Step by Step

This guide walks through testing the full end-to-end QR payment flow using the demo POS.

---

## Prerequisites

1. API running locally or deployed on Railway
2. API key from `.env` (`API_KEY`)
3. A tool like `curl`, Postman, or the built-in Swagger UI at `/sistema/api/v1/docs`

---

## Step 1 — Create a Mesa

```bash
curl -X POST https://YOUR_URL/sistema/api/v1/mesa/ \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Mesa 5", "capacidad": 4, "ubicacion": "Terraza"}'
```

Save the returned `id` as `MESA_ID`.

---

## Step 2 — Open an Orden

```bash
curl -X POST https://YOUR_URL/sistema/api/v1/orden/ \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mesa_id": "MESA_ID", "descripcion": "Mesa 5 - almuerzo", "mesero": "Carlos"}'
```

Save the returned `id` as `ORDEN_ID`. Mesa estado transitions: `L → O`.

---

## Step 3 — Add Items to the Order

```bash
curl -X POST https://YOUR_URL/sistema/api/v1/orden/ORDEN_ID/detalle/ \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Ceviche Mixto", "cantidad": 2, "precio": 8.50, "porcentaje_iva": 15}'
```

---

## Step 4 — Calculate Totals

```bash
curl https://YOUR_URL/sistema/api/v1/orden/ORDEN_ID/totales/ \
  -H "Authorization: Token YOUR_API_KEY"
```

Response:
```json
{
  "subtotal_0": 0,
  "subtotal_15": 15.45,
  "iva": 2.32,
  "servicio": 1.77,
  "total": 19.54
}
```

---

## Step 5 — Initiate QR Payment

```bash
curl -X POST https://YOUR_URL/sistema/api/v1/mesitaqr/solicitar-pago/ \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mesa_id": "MESA_ID",
    "orden_id": "ORDEN_ID",
    "monto_total": 19.54
  }'
```

Response:
```json
{
  "session_id": "uuid-session",
  "qr_url": "http://YOUR_URL/pay/uuid-session?monto=19.54&mesa=MESA_ID",
  "qr_code": "data:image/png;base64,...",
  "expira_en": "2026-06-10T14:30:00.000Z",
  "monto_total": 19.54,
  "mesa_id": "MESA_ID",
  "orden_id": "ORDEN_ID"
}
```

Mesa estado transitions: `O → P` (Pagando).

---

## Step 6 — Poll Payment Status

```bash
curl https://YOUR_URL/sistema/api/v1/mesitaqr/estado/uuid-session/ \
  -H "Authorization: Token YOUR_API_KEY"
```

Returns `{ "estado": "pendiente" | "pagado" | "expirado" }`.

---

## Step 7 — Simulate Payment via Webhook

In production, Paga Ya calls this automatically. For testing, simulate it:

```bash
SESSION_ID="uuid-session"
SECRET="your-MESITAQR_WEBHOOK_SECRET"
BODY='{"session_id":"'$SESSION_ID'","estado":"pagado","monto_pagado":19.54}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://YOUR_URL/sistema/api/v1/mesitaqr/webhook/ \
  -H "Content-Type: application/json" \
  -H "X-MesitaQR-Signature: $SIG" \
  -d "$BODY"
```

Expected result:
- Session estado → `pagado`
- Mesa estado → `L` (Libre)
- Orden estado → `C` (Cerrada)
- FAC documento auto-created with mock SRI fields (`url_ride`, `url_xml`)

---

## Step 8 — Verify the FAC Documento

```bash
curl "https://YOUR_URL/sistema/api/v1/documento/?tipo_documento=FAC" \
  -H "Authorization: Token YOUR_API_KEY"
```

The new FAC should have:
- `tipo_documento: "FAC"`
- `estado: "F"`
- `url_ride`: mock RIDE URL
- `url_xml`: mock XML URL
- `autorizacion`: mock SRI authorization number

---

## Webhook Signature Verification

All webhooks from MesitaQR use HMAC-SHA256:

```
X-MesitaQR-Signature: HMAC-SHA256(rawBody, MESITAQR_WEBHOOK_SECRET)
```

The signature is hex-encoded. The service verifies it with a constant-time comparison
(`crypto.timingSafeEqual`) to prevent timing attacks.

---

## Mock vs Real Paga Ya API

| Mode | Condition | Behavior |
|---|---|---|
| **Mock** | `MESITAQR_API_KEY` not set | QR generated locally, webhook simulated |
| **Live** | `MESITAQR_API_KEY` set | Real Paga Ya API called; falls back to mock on error |

For the demo, mock mode is sufficient to test the entire flow end-to-end.
