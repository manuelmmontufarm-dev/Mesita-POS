# 📋 TODAY.md — Bitácora del proyecto

> **Qué es este archivo:** el registro vivo de *qué se está haciendo ahora* y
> *qué se ha cambiado*, en orden (lo más nuevo arriba). Antes de editar
> cualquier cosa, lee primero la sección **"En qué estamos ahora"**.
> Lo más reciente va con detalle; lo más viejo se resume porque ya importa menos.

---

## ⚙️ REGLA OBLIGATORIA — leer antes de tocar nada

**Cada vez que se hace un cambio (un *edit*) en el proyecto, se registra aquí.**
Cada entrada del registro DEBE decir tres cosas:

1. **QUÉ** se cambió (qué archivo o parte).
2. **POR QUÉ** se cambió (el motivo / problema que resuelve).
3. **QUÉ HACE** ese cambio (el efecto concreto en el sistema).

Flujo de trabajo en cada cambio:
1. Lee **"En qué estamos ahora"** para saber el estado actual.
2. Haz el cambio.
3. Agrega una entrada nueva al **principio** del Registro de cambios (formato abajo).
4. Si cambió "lo que estamos haciendo", actualiza la sección **"En qué estamos ahora"**.

Formato de cada entrada:

```
### AAAA-MM-DD — Título corto del cambio
- **Qué:** archivo(s) o parte afectada.
- **Por qué:** el motivo.
- **Qué hace:** el efecto concreto.
```

---

## 🟢 En qué estamos ahora

- **Estado general:** POS + guest app en Vercel (`mesita-pos.vercel.app`, `mesitademo-two.vercel.app`).
- **Última área trabajada:** UX POS v2 — ítems optimistas con indicador de sync + cierre remoto de mesa (sin pantalla en blanco) + historial de cobros Mesita.
- **Pendiente / próximos pasos:** deploy ambos proyectos y validar E2E mesa 1 con dos teléfonos.
- **Cosas a tener cuidado:** mesas 1–4 arrancan vacías en guest — ítems vienen del POS. El cierre remoto se detecta en el poll (`refreshMesaSession`).

---

## 🗂️ Registro de cambios (lo más nuevo primero)

### 2026-06-30 — POS v2: tap optimista + cierre remoto sin pantalla en blanco
- **Qué:** `public/pos-v2/store-api.jsx` (`addDetalle` optimista con `pendingAdds`, `handleMesaClosedRemotely`/`buildDocFromClose` en `refreshMesaSession`, `loadClosedDocs` en bootstrap, `setOnMesaClosedRemotely`), `public/pos-v2/order.jsx` (spinner/✓ por producto, línea optimista, fallback "Cerrando mesa…" en vez de `return null`), `public/pos-v2/app.jsx` (callback de cierre → vuelve al mapa + toast), `public/pos-v2/pos.css` (estilos de sync/cierre).
- **Por qué:** Al tocar un producto el mesero esperaba la API antes de ver el ítem; y cuando un comensal pagaba por Mesita estando el POS en la pantalla de orden, la orden se cerraba y quedaba una pantalla en blanco (la cuenta tampoco aparecía en Cuentas cerradas).
- **Qué hace:** El producto entra a la precuenta al instante con un spinner que pasa a ✓ cuando confirma en la nube. Cuando el poll detecta que la mesa se cerró remotamente (pago Mesita), construye el documento con el desglose por tarjeta/comensal, lo agrega a Cuentas cerradas, marca la mesa como pagada y devuelve al mesero al mapa de mesas con un aviso. El historial además se rehidrata al iniciar (`GET /documento/?estado=C`).

### 2026-06-30 — Fix POS v2 auth + session nombre en mesa
- **Qué:** `public/pos-v2/auth-gate.jsx`, `store-api.jsx` (init tras login), `mesaSessionService.js` (`nombre` en detalle).
- **Por qué:** POS v2 cargaba bootstrap antes de autenticar; detalles podían mostrarse como "Ítem".
- **Qué hace:** login guest → bootstrap; ítems con nombre correcto en `/mesa/:id/session/`.

### 2026-06-30 — Mesita Admin panel (super-admin demo)
- **Qué:** `public/admin.html`, `public/admin/data.jsx`, `public/admin/app.jsx`, `public/admin/admin.css`.
- **Por qué:** el equipo Mesita necesita ver restaurantes, aprobar registros PENDING, volumen QR y cuentas desde un panel separado del POS de caja.
- **Qué hace:** prototipo funcional reutilizando `pos-v2/pos.css` y `ui.jsx`; accesible en `/admin.html` tras deploy del POS demo.

### 2026-06-30 — Rediseño sync demo + POS v2 frontend
- **Qué:** `mesaSessionService.js`, rutas `GET/POST /mesa/:id/session|reset-demo`, `documentoService` (filtro `orden_id`, cobro idempotente), `public/pos-v2/` + `store-api.jsx`, sync mesita-app (`registerPaymentInPosMesita`, `pull-pos-payments`).
- **Por qué:** glitches: todo aparecía pagado, miles de cobros duplicados, mesa no se reiniciaba — causados por sync bidireccional mal diseñado.
- **Qué hace:** POS es fuente de verdad para ítems; MesitaQR escribe un cobro por pago en el PRE abierto (PATCH, no POST duplicado); poll solo importa cobros de caja; pago total llama `reset-demo` y limpia Redis automáticamente; nuevo UI POS conectado a la API real.

### 2026-06-17 — Fijar la regla de bitácora en CLAUDE.md
- **Qué:** `CLAUDE.md` (nota nueva al inicio que apunta a `TODAY.md`).
- **Por qué:** para que la regla "registrar cada edit" se cumpla de verdad en
  futuras sesiones, debe estar donde Claude la lee automáticamente al abrir el repo.
- **Qué hace:** obliga a leer `TODAY.md` antes de editar y a registrar cada cambio
  con su qué/por qué/qué hace.

### 2026-06-17 — Crear TODAY.md (esta bitácora)
- **Qué:** archivo nuevo `TODAY.md` en la raíz del proyecto.
- **Por qué:** no había un registro vivo y en lenguaje claro de qué se cambia,
  por qué, y qué se está haciendo en el momento. El `production-handoff.md` es
  una foto del estado, no una bitácora; el historial de Git es técnico y en inglés.
- **Qué hace:** centraliza el estado actual + el log de cambios y fija la regla
  de registrar cada edit con su porqué y su efecto.

### 2026-06-17 — Agregar EXPLICACION.md
- **Qué:** archivo nuevo `EXPLICACION.md` (documentación en español sencillo).
- **Por qué:** el dueño quería entender el proyecto sin leer docs técnicas en inglés.
- **Qué hace:** explica en 10 secciones qué es el POS, el flujo de pago QR, los
  webhooks, la estructura del código y cómo probarlo.

### 2026-06-11 — Ajustes de autenticación y experiencia de login
- **Qué:** frontend de auth (`public/`), manejo de sesión.
- **Por qué:** la pantalla de login parpadeaba y el estado de logout no era claro.
- **Qué hace:** transiciones de login más suaves, mantiene visible el "cargando",
  y maneja bien el estado de cerrar sesión.

### 2026-06-11 — Restaurar menú de invitado y multi-restaurante
- **Qué:** rutas públicas, gestión de mesas, soporte multi-restaurante (tenants).
- **Por qué:** estas funciones se habían perdido en una reescritura previa.
- **Qué hace:** vuelve a permitir el menú para invitados, la gestión de mesas y
  que la plataforma maneje varios restaurantes; arregla rutas públicas y el
  arranque de los tests.

### 2026-06-11 — Reescritura limpia de `main.js`
- **Qué:** `public/.../main.js` (JavaScript del frontend).
- **Por qué:** había código duplicado (`renderMenu` repetido) y faltaba manejar
  la expiración de sesión.
- **Qué hace:** elimina duplicados y agrega el manejador `session:expired`.

### 2026-06-11 — Comensales (número de personas por orden)
- **Qué:** modelo `Orden` (campo `comensales`), backend y vista de piso.
- **Por qué:** en Ecuador la pre-cuenta/factura suele mostrar el número de comensales.
- **Qué hace:** guarda el número de personas en el servidor y lo refleja en la
  vista del salón.

### 2026-06-11 — Estado de mesa "Desocupada"
- **Qué:** etiqueta del estado por defecto de la mesa.
- **Por qué:** "Disponible" no era el término usado en la práctica local.
- **Qué hace:** muestra "Desocupada" en lugar de "Disponible" (estado `L`).

### 2026-06-11 — Flujo POS de restaurante real + rediseño de cuentas
- **Qué:** frontend del POS y diseño de precuenta/factura.
- **Por qué:** se quería un flujo realista: mesa → precuenta → cobro → factura,
  acorde a la práctica ecuatoriana.
- **Qué hace:** implementa ese recorrido completo y rediseña los comprobantes.

### 2026-06-10 — Arranque del proyecto y arreglos de despliegue (resumen)
- **Qué:** commit inicial de la API POS + varios fixes de Docker/Prisma/arranque
  y se agregó `CLAUDE.md`.
- **Por qué:** poner el proyecto a correr y que despliegue bien en Railway.
- **Qué hace:** crea la base del proyecto (API, base de datos, Docker) y deja el
  despliegue estable. *(Detalle fino en el historial de Git.)*

---

> Para el detalle técnico de cada commit: `git log` o la pestaña de commits en GitHub.
> Para el estado de infraestructura (URLs, variables, tablas): `docs/production-handoff.md`.
