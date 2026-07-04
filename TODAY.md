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
- **Última área trabajada:** carga inicial — JSX precompilado (sin Babel en el navegador) + pantalla de arranque con marca (rama `polish-loading`, pendiente de merge por Manuel).
- **Pendiente / próximos pasos:** Manuel revisa el preview de `polish-loading` y decide el merge; después de editar cualquier `.jsx` correr `npm run build:pos-v2` y commitear `dist/`.
- **Cosas a tener cuidado:** mesas 1–4 arrancan vacías en guest — ítems vienen del POS. El cierre remoto se detecta en el poll (`refreshMesaSession`).

---

## 🗂️ Registro de cambios (lo más nuevo primero)

### 2026-07-04 — Carga inicial: JSX precompilado (adiós Babel en el navegador) + pantalla de arranque con marca

- **Qué:** `public/index.html`, `public/pos-v2.html`, `public/pos-v2/auth-gate.jsx`, `public/pos-v2/pos.css` (estilos `.pos-boot`), `scripts/build-pos-v2.js` (NUEVO, `npm run build:pos-v2`), `public/pos-v2/dist/` + `vendor/` (compilados, COMMITEADOS), `vercel.json` (cache headers), `tests/*.test.js` (mock Prisma reparado). Rama `polish-loading` (desde `main`), SIN merge.
- **Por qué:** La primera pantalla era lo más flojo en demos: página blanca → spinner gris genérico, porque el navegador descargaba @babel/standalone (~200 KB desde unpkg) y transpilaba 9 archivos JSX en vivo ANTES de pintar nada. Además `main` traía los tests 23/24 en rojo (el mock de Prisma no cubría el bootstrap de plataforma que añadió `148a8eb`).
- **Qué hace:** (1) Los .jsx se compilan en build local (`npm run build:pos-v2` → `dist/`, 73 KB total) y React/ReactDOM quedan vendored — cero Babel y cero unpkg en producción; todos los scripts van con `defer`, así el HTML pinta al instante. (2) Un shell estático dentro de `#root` muestra el logo Mesita con respiración suave, wordmark "Mesita POS / Consola de caja", barra shimmer naranja→verde sobre crema y copy por etapas ("Preparando la caja…" → "Conectando con Mesita API…") — idéntico al loader de React, así el relevo es invisible; respeta `prefers-reduced-motion`. (3) Assets estáticos con cache 1h + stale-while-revalidate. Tests 24/24 verdes; app verificada en preview local (mapa de mesas OK, consola limpia). **Lighthouse mobile medido:** producción (antes) PERF 31 · FCP 6.5s · LCP 7.4s · TBT 920ms · CLS 0.117 · SI 19.9s → preview `polish-loading` (después) **PERF 89 · FCP/LCP 2.9s · TBT 0ms · CLS 0 · SI 3.3s**.

### 2026-06-30 — POS poll 2500→1500ms (optimización de sync)
- **Qué:** `public/pos-v2/store-api.jsx` (`POLL_MS` 2500→1500).
- **Por qué:** El benchmark de latencia mostró que el mesero tardaba hasta 2.5s en ver en el mapa los cambios remotos (pagos Mesita / cierres). 
- **Qué hace:** El POS refresca las mesas activas cada 1.5s, así el mapa y los cierres remotos se reflejan más rápido sin saturar el API.

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
