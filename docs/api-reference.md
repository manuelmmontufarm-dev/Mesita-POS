# API Reference

Base URL: `https://YOUR_RAILWAY_URL/sistema/api/v1/`

Auth: `Authorization: Token <API_KEY>`

All dates use `DD/MM/YYYY` format. Currency: USD. IVA: 15%.

---

## Mesas

### GET /mesa/
List all tables.

Query params: `estado` (L/O/P/C), `result_size`, `result_page`

```json
{ "count": 10, "results": [{ "id": "...", "nombre": "Mesa 1", "estado": "L", ... }] }
```

### GET /mesa/:id/
Table detail + active orden.

### POST /mesa/
```json
{ "nombre": "Mesa 5", "capacidad": 4, "ubicacion": "Terraza" }
```

### PATCH /mesa/:id/
```json
{ "estado": "L" }
```

Estado codes: `L`=Libre, `O`=Ocupada, `P`=Pagando, `C`=Cerrada

---

## Órdenes

### GET /orden/
Query: `mesa_id`, `estado` (A/C/X), `result_size`, `result_page`

### GET /orden/:id/
Full order with `detalles[]`.

### POST /orden/
```json
{ "mesa_id": "uuid", "descripcion": "Mesa 5 cumpleaños", "mesero": "Carlos" }
```

### POST /orden/:id/detalle/
```json
{ "producto_id": "uuid", "nombre": "Ceviche Mixto", "cantidad": 2, "precio": 8.50, "porcentaje_iva": 15 }
```

### DELETE /orden/:id/detalle/:detalleId/

### PATCH /orden/:id/
```json
{ "estado": "C", "descripcion": "updated" }
```

### GET /orden/:id/totales/
Returns `{ subtotal_0, subtotal_15, iva, servicio, total }` with 15% IVA + 10% service.

---

## Documentos (Contifico-compatible)

### GET /documento/
Query: `tipo_documento` (PRE/FAC), `fecha_emision` (DD/MM/YYYY), `persona_identificacion`, `result_size`, `result_page`

### GET /documento/:id/
Full document. FAC documents include `url_ride`, `url_xml`, `autorizacion`.

### POST /documento/
Full Contifico-compatible body:

```json
{
  "pos": "api-token-uuid",
  "fecha_emision": "10/06/2026",
  "tipo_documento": "FAC",
  "tipo_registro": "CLI",
  "estado": "P",
  "electronico": true,
  "descripcion": "FACTURA MESA 5",
  "subtotal_0": 0.00,
  "subtotal_15": 18.26,
  "iva": 2.74,
  "servicio": 2.00,
  "total": 23.00,
  "cliente": {
    "cedula": "0922054366",
    "ruc": "0922054366001",
    "razon_social": "Juan Pérez",
    "tipo": "N",
    "email": "cliente@example.com",
    "telefonos": "0988800001",
    "direccion": "Guayaquil",
    "es_extranjero": false
  },
  "detalles": [
    {
      "producto_id": "PROD_ID",
      "cantidad": 2.00,
      "precio": 8.50,
      "porcentaje_iva": 15,
      "porcentaje_descuento": 0.00,
      "base_cero": 0.00,
      "base_gravable": 17.00,
      "base_no_gravable": 0.00
    }
  ],
  "cobros": [
    { "forma_cobro": "EF", "monto": 23.00 }
  ]
}
```

### PATCH /documento/:id/
```json
{ "estado": "C" }
// or add a cobro:
{ "cobro": { "forma_cobro": "TC", "monto": 10.00 } }
```

---

## Personas

### GET /persona/
Query: `identificacion`, `razon_social`

### POST /persona/
```json
{ "cedula": "0922054366", "razon_social": "Juan Pérez", "email": "juan@example.com" }
```

### PATCH /persona/:id/

---

## Productos

### GET /producto/
Query: `categoria_id`, `nombre`, `disponible`

### POST /producto/
```json
{ "nombre": "Ceviche Mixto", "precio": 8.50, "categoria_id": "uuid", "porcentaje_iva": 15 }
```

### PATCH /producto/:id/

---

## MesitaQR

### POST /mesitaqr/solicitar-pago/
```json
{ "mesa_id": "uuid", "orden_id": "uuid", "monto_total": 23.00 }
```
Returns: `{ session_id, qr_url, qr_code, expira_en, monto_total }`

### GET /mesitaqr/estado/:session_id/
Returns: `{ session_id, estado: "pendiente"|"pagado"|"expirado", paid_at }`

### POST /mesitaqr/webhook/
Called by Paga Ya. Requires `X-MesitaQR-Signature` HMAC header.
```json
{ "session_id": "uuid", "estado": "pagado", "monto_pagado": 23.00 }
```

---

## Error Responses

```json
{ "error": "Unauthorized", "detail": "Missing Authorization header." }
{ "error": "Not Found", "detail": "Record not found." }
{ "error": "Conflict", "detail": "Duplicate unique constraint." }
```

HTTP status codes follow REST conventions: 200/201/400/401/404/409/500.
