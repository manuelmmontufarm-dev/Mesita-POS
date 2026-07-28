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

### 2026-07-27 — Guardar confirma la precuenta completa en MySQL
- **Qué:** `public/contifico-lab.html`, `src/api/contifico-lab.js`, pruebas y versión desktop 1.1.0.
- **Por qué:** los cambios por clic no tenían un punto de confirmación visible y el mesero no podía saber cuándo la información ya estaba disponible para el Bridge.
- **Qué hace:** los platos se editan como borrador; `Guardar cambios` reemplaza `factura_detalle` y recalcula `factura_cabecera` dentro de una sola transacción InnoDB. El POS escribe su propia base como Contífico; el Bridge sigue usando exclusivamente `SELECT` con `mesita_ro`.
- **Verificación:** un Guardar confirmó SQL en 49 ms y apareció por el Bridge en Salón en 1,90 s y en el QR en 3,14 s; facturar cerró la cuenta y reabrir creó una precuenta nueva sin cambiar el QR estable de la mesa.

### 2026-07-27 — El POS simulado publica su catálogo de 8 mesas

- El contrato de Verificar Bridge y el `Launcher.exe.config` incluyen la cantidad de mesas configurada por el POS (`POS_SIM_TABLE_COUNT`, 8 por defecto).
- Mesita Caja puede demostrar la misma autodetección de salón que usará con `mapa_mesas` o **Cantidad de mesas App** en Contífico real.

### 2026-07-27 — Launcher.exe.config simulado, descargable y de solo lectura

- La app materializa `~/MesitaPOS/Contifico/Application/Launcher.exe.config` con el mismo `ConexionPos` que lee Mesita Caja.
- **Verificar Bridge** muestra la ruta y permite descargar el archivo.
- Solo incluye `mesita_ro`; las credenciales MySQL con escritura nunca salen del POS.

### 2026-07-27 — Verificar Bridge entrega el contrato completo y solo por loopback

- **Qué:** `src/api/contifico-lab.js`, `public/contifico-lab.html`, `src/app.js` y `tests/contifico-lab-bridge.test.js`.
- **Por qué:** Mesita Caja pedía datos que el POS Lab mostraba a mano, la verificación usaba una query vieja que todavía exigía `MESITA_TABLE:`, y el servidor del Lab escuchaba en toda la red local.
- **Qué hace:** `/lab/bridge-check` entrega un contrato versionado con host/puerto/base/usuario/clave read-only, declara que Launcher/root no aplican, verifica la query vigente de Caja y mantiene el token en el portal Mesita. El Lab ahora escucha solo en `127.0.0.1`; la prueba confirma contrato, candado y paridad de query.

### 2026-07-27 — La app de escritorio tiene el logo del POS

- **Qué:** `desktop/icon.png` (1024px, renderizado del `public/logo.svg` — plato + cubiertos sobre azul Contífico, vía `qlmanage`) + `mac.icon` en `desktop/builder.yml`; electron-builder genera el `.icns`.
- **Por qué:** la app salía con el ícono genérico de Electron.
- **Qué hace:** `Contifico POS Lab.app` se ve como una app de verdad en el Dock/Finder, pineable con su marca.

### 2026-07-27 — Lab: taps INSTANTÁNEOS (UI optimista) + panel "Verificar Bridge" + app de escritorio

- **Qué:**
  - `public/contifico-lab.html` — **UI optimista**: cada tap (elegir mesa, agregar plato, quitar, pre-cuenta, facturar) muta el estado local y pinta AL INSTANTE; el servidor se sincroniza detrás por una **cola secuencial** (sin la cola, dos taps en ráfaga corrían en paralelo y el `/agregar` llegaba antes del commit del `/precuenta` — se perdían platos, verificado y arreglado). El poll de 2.5s no pisa la UI mientras hay ops en vuelo; las líneas sin confirmar se ven atenuadas con ⏳. Medido: tap→UI **2–12ms** (antes 300–800ms), y una ráfaga de 3 taps terminó idéntica en el MySQL (2× Ceviche + Cola, $26.00 en UI y en BD).
  - Botón **🔌 Verificar Bridge** + `GET /lab/bridge-check` (`src/api/contifico-lab.js`): se conecta EXACTAMENTE como el agente de Mesita Caja (`mesita_ro/readonly`), corre su query real, y PRUEBA el candado (un DELETE debe ser denegado). Panel con 4 checks en verde + los datos de conexión listos para el asistente de Mesita Caja (host/puerto/base/usuario/clave). Verificado: 4/4 ✓.
  - **App de escritorio** `desktop/` — `main.cjs` (Electron): arranca el server Express DENTRO de la app (CONTIFICO_LAB=1, puerto 4611 para no chocar con el dev 4090) y abre la pantalla del mesero; `builder.yml` (dir arm64, `asar:false` para que express.static/prisma/mysql2 corran como Node normal; el cliente generado de Prisma vive en el dot-folder `node_modules/.prisma` que electron-builder EXCLUYE aunque se liste en `files` — sin él crashea con "Cannot find module .prisma/client"; el fix real es el paso post-build del script `dist:desktop` que lo copia con `cp -R` al bundle; `productName` SIN acento — con "í" macOS mataba el binario en silencio). Electron/builder como devDependencies (el Dockerfile de Railway hace `--omit=dev`, no llegan a producción). Scripts: `npm run desktop` (dev) y `npm run dist:desktop`.
- **Por qué:** feedback del usuario: los botones se demoraban mucho ("debería ser instantáneo") y quería el POS como app instalable tipo Mesita Caja, con todo lo necesario para verificar la conexión con el puente en un solo lugar.
- **Qué hace:** el POS responde al tap como un POS real, el panel 🔌 deja verificar el puente sin tocar la terminal, y `Contifico POS Lab.app` corre con doble clic (server embebido).

### 2026-07-26 — Contífico Lab: el POS de mesero ahora usa el sistema de diseño del POS

- **Qué:** `public/contifico-lab.html` reescrito para **reusar `/pos-v2/pos.css`** (la paleta Contífico/Siigo azul del POS real) en vez de estilos propios: `.topbar` + `.brand-mark`, `.tcard` para las mesas, `.pcard` para los platos, `.bill/.bill-head/.bill-items/.li/.totals` para la cuenta, `.btn-primary/.btn-ok/.btn-danger-soft`, `.toast` y `.pill-doc PRE` para la secuencia. El único CSS propio que queda es la rejilla de 3 columnas. `src/api/contifico-lab.js`: `/agregar` ahora **incrementa la cantidad** de la línea existente del mismo producto (UPDATE) en vez de insertar una línea nueva — una fila por producto en `factura_detalle`, como el POS real.
- **Por qué:** el usuario quería mantener la simplicidad del lab pero con el look del POS actual, y que "funcione como Contífico".
- **Qué hace:** el lab se ve como una pantalla más del POS (misma tipografía Inter, mismos azules, mismas tarjetas y toasts) sin perder la simplicidad de 3 columnas, y la pre-cuenta acumula cantidades como en el POS. Verificado E2E de nuevo: Mesa 7 → 3× Café pasado en UNA línea (`cantidad=3.00`) → FACTURAR → `001-002-000000002`, `estado=C`, `tipo_sincro=C`, y la mesa **desaparece** de la query del Bridge (`mesita_ro`).

### 2026-07-26 — Contífico Lab: POS de mesero contra el MySQL simulado de Contífico (rama feat/contifico-lab)

- **Qué:** nuevo `src/api/contifico-lab.js` (router Express, gateado por `CONTIFICO_LAB=1`, montado antes del rate-limiter), nueva UI `public/contifico-lab.html` (mesero: grid de 8 mesas + 12 platos con botones de tap rápido + Pre-Cuenta/FACTURAR/Anular), `src/app.js` (montaje + en modo lab tolera arrancar sin `DATABASE_URL`), dep `mysql2`.
- **Por qué:** para hacer pruebas REALISTAS del flujo Bridge de Mesita en una compu de desarrollo: el mesero "juega" en este POS y Mesita solo puede enterarse por el camino real (el agente Bridge leyendo el MySQL con `mesita_ro`, GRANT SELECT). Sin atajos ni conexiones directas POS→widget. El comportamiento replica lo VERIFICADO en la instalación real de Contífico (mesita-app/docs/BRIDGE_FINDINGS.md §2–§6).
- **Qué hace:** cada botón escribe en `pos_contifico` (127.0.0.1:3307, ver mesita-app/scripts/bridge/pos-simulator/) exactamente como el POS de escritorio: Pre-Cuenta = INSERT `factura_cabecera` `tipo='F' estado='P'` con tag `MESITA_TABLE:<mesa>` en `descripcion`; platos = `factura_detalle` + upsert `inventario_producto` + recálculo subtotal/IVA 15%/servicio 10%; **FACTURAR = UPDATE local instantáneo P→C** + `documento` + `autorizacion` (49 dígitos) + fila `forma_pagos` TC + `tipo_sincro='C'` — con lo que el doc **desaparece de la query del Bridge** (la señal de cierre real). Verificado E2E: pre-cuenta visible vía `mesita_ro` → facturar → drop del snapshot + documento `001-002-000000001` + `forma_pagos TC $17.25`. Correr: `CONTIFICO_LAB=1 PORT=4090 node src/app.js` → `http://localhost:4090/contifico-lab.html`. NUNCA activo en Railway (flag env).

### 2026-07-06 — POS: botón Añadir mesa visible + cache-bust en deploy

- **Qué:** `public/pos-v2/floor.jsx`, `pos.css`, `scripts/build-pos-v2.js`, `public/index.html`, `public/pos-v2.html`, bundles `dist/`.
- **Por qué:** producción ya tenía el JS nuevo pero los navegadores seguían sirviendo `floor.js` cacheado (max-age 1h); además el botón quedaba escondido junto a la leyenda en pantallas anchas.
- **Qué hace:** mueve **Añadir mesa** arriba a la derecha del título (imposible de perder); `npm run build:pos-v2` ahora estampa `?v=` en todos los scripts/CSS de `index.html` y `pos-v2.html` para forzar recarga tras cada build.

### 2026-07-06 — Añadir mesas desde el mapa del POS

- **Qué:** `public/pos-v2/floor.jsx`, `store-api.jsx`, `pos.css` y sus bundles de `dist/`; también se limpió y documentó `.env.example`.
- **Por qué:** el mapa del POS no tenía una acción para crear mesas y el ejemplo de entorno contenía marcadores de conflicto y valores que no debían reutilizarse como credenciales/configuración reales.
- **Qué hace:** agrega el botón **Añadir mesa**, un formulario validado de nombre/capacidad/zona, creación por `POST /mesa/`, actualización inmediata del mapa y mensajes de éxito/error. El ejemplo de entorno vuelve a ser seguro y explica las opciones de bootstrap. Verificado en el navegador con una API local simulada, bundles recompilados, 25/25 tests y `npm audit` sin vulnerabilidades.

### 2026-07-06 — Re-tema visual: paleta Contífico/Siigo (azul) en todo el POS

- **Qué:** `public/pos-v2/pos.css` (tokens `:root` + sombras + rgba hardcodeados + topbar), `public/logo.svg`, `public/favicon.svg`, `public/favicon.png`, `public/apple-touch-icon.png` (regenerados en azul), `theme-color` en ambos HTML, `ui.jsx` (QR falso en navy), `dist/` recompilado.
- **Por qué:** Manuel pidió que el POS se vea más suave y lo más parecido posible al POS de Contífico. La paleta se extrajo del CSS de producción de siigo.com/ec (la marca actual de Contífico): azul #009DFF/#007ECC/#EBF7FF, navy #222B45, verde #619B2E, rojo #D42143, ámbar #FFA532, fondos fríos #F3F7F9.
- **Qué hace:** todo el POS pasa de la paleta naranja/crema a la azul/fría de Contífico vía tokens (badges, botones, precios, chips, pantalla de arranque, logo y favicons incluidos); sombras más suaves con tinte navy. La estructura y el layout no cambian. Verificado en preview local: mapa, pantalla de orden y arranque. Suite 25/25.

### 2026-07-06 — Chip DEMO ya no queda debajo del badge de estado (Mesa 12)

- **Qué:** `public/pos-v2/pos.css` (`.tcard .tnm` reserva el carril del badge), `dist/` recompilado.
- **Por qué:** Manuel reportó que en la tarjeta de Mesa 12 el chip "DEMO" quedaba tapado por el badge "Por cobrar" (badge absoluto arriba-derecha; el título corría por debajo).
- **Qué hace:** el título de la tarjeta tiene `padding-right: 96px`, así el nombre + chip nunca invaden la zona del badge (verificado por medición de cajas: 7px de aire en el peor caso "Por cobrar").

### 2026-07-06 — Quality sweep: npm audit a CERO (dependencias muertas fuera)

- **Qué:** `package.json`/`package-lock.json` — se quitaron `uuid` (cero imports en src/tests/scripts) y `crypto` (paquete placeholder de npm deprecado; todos los `require('crypto')` resuelven al builtin de Node, que siempre gana). `npm audit fix` actualizó `form-data` (high) y `js-yaml` (moderate) dentro de sus rangos semver.
- **Por qué:** `npm audit` marcaba 3 vulnerabilidades (1 high). Dos dependencias directas eran peso muerto — una sin un solo uso, otra inerte. Menos superficie de supply-chain, cero cambios de comportamiento.
- **Qué hace:** `npm audit` = **0 vulnerabilidades**; suite **25/25 verde** (el gate DB-antes-de-auth que trababa los tests ya fue arreglado en commits previos). Sin tocar código de producción.

### 2026-07-04 — Fix del mapa de mesas: ya no se re-acomoda al entrar + mesas inactivas fuera

- **Qué:** `public/pos-v2/store-api.jsx` (`refreshMesaSession` + filtro en `loadBootstrap`), `src/api/v1/bootstrap.js` (`activa: true`), `public/pos-v2/data.jsx` (`ZONE_ORDER` + "General"), `tests/bootstrap.test.js` (NUEVO), `dist/` recompilado.
- **Por qué:** Manuel reportó dos glitches en producción: al entrar, las mesas ocupadas "saltaban" de su sección una por una, y aparecían dos "Mesa 1".
- **Qué hace:** (1) el poll de 1.5s re-mapeaba cada mesa pasándole el objeto YA mapeado (`cap`/`zona`) a `mapMesa`, que espera los campos crudos (`capacidad`/`ubicacion`) — cada refresh reseteaba capacidad→4 y zona→"General" y la tarjeta migraba de sección; ahora se pasan los campos crudos y el mapa queda estable (verificado 6s/4 ticks en producción). (2) `/bootstrap/` ahora solo devuelve mesas activas — la "Mesa 1" duplicada era una mesa de prueba desactivada (SebastianArea) que igual se pintaba; fijado con test. Suite 25/25.

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
### 2026-07-27 — Pre-cuentas Contífico sin marcas privadas de Mesita
- **Qué:** POS Lab guarda `Mesa N` directamente en `factura_cabecera.descripcion` y sus lecturas usan `descripcion AS mesa`; se quitó el requisito histórico `MESITA_TABLE:`.
- **Por qué:** la prueba debe demostrar compatibilidad con el esquema/comportamiento de Contífico, no con una etiqueta inventada para el laboratorio.
- **Qué hace:** las pre-cuentas existentes fueron normalizadas y las futuras se crean como filas F/P estándar; Mesita Caja las detecta con la misma consulta de solo lectura que se usa en restaurante.
