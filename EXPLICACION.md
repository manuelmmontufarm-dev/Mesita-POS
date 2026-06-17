# Explicación del proyecto (en simple)

> Este documento lo escribió Claude para explicar, en lenguaje sencillo, qué es
> este proyecto y cómo funciona. Si los otros archivos (`README.md`, `CLAUDE.md`)
> te parecen muy técnicos, empieza por aquí.

---

## 1. ¿Qué es esto en una frase?

Es el **"cerebro" de un sistema de caja de restaurante (POS)**: un programa que
vive en internet y al que otras apps le hacen preguntas y le dan órdenes, como
*"abre la mesa 5"*, *"agrega 2 cervezas a la cuenta"*, *"cóbrame con un QR"*.

No tiene una pantalla bonita para meseros (eso sería otra app). Esto es solo la
parte de **atrás** (el *backend* / la *API*): recibe pedidos por internet,
guarda todo en una base de datos y responde.

POS = *Point of Sale* = Punto de Venta (la "caja" del restaurante).

---

## 2. ¿Para qué se hizo?

Es una **demo** (una maqueta funcional) para probar dos integraciones:

1. **MesitaQR / Paga Ya** → el sistema de **pago con código QR**. El cliente
   escanea un QR con su teléfono y paga; el restaurante recibe el aviso de que
   "ya está pagado".
2. **Contifico** → un sistema de facturación de Ecuador (un ERP). Este proyecto
   usa **los mismos nombres de campos** que Contifico, de modo que el día que se
   quiera conectar de verdad, casi no hay que cambiar nada (se cambia una sola
   variable de configuración y listo).

O sea: sirve para **probar cómo se cobraría y facturaría** en un restaurante de
Ecuador, sin tener todavía los servicios reales conectados.

---

## 3. Las "piezas" del negocio (el vocabulario)

Todo el sistema gira alrededor de estos conceptos. Piénsalo como un restaurante real:

| Concepto | Qué es en el mundo real | Estados que puede tener |
|---|---|---|
| **Mesa** | Una mesa física del local | `L`=Libre, `O`=Ocupada, `P`=Pagando, `C`=Cerrada |
| **Orden** | La cuenta abierta de una mesa | `A`=Abierta, `C`=Cerrada, `X`=Cancelada |
| **Producto** | Un platillo o bebida del menú | (disponible o no) |
| **Categoría** | Grupo del menú (bebidas, platos fuertes...) | — |
| **Persona** | El cliente (para la factura) | natural o jurídica |
| **Documento** | La cuenta impresa: `PRE`=pre-factura, `FAC`=factura | `P`=Pendiente, `C`=Cobrado, `A`=Anulado, `F`=Facturado |
| **Cobro** | Cómo se pagó (efectivo, tarjeta, QR...) | — |
| **MesitaqrSession** | Una sesión de pago con QR en curso | pendiente, pagado, expirado |

Dos números importantes que el sistema aplica solo:
- **IVA = 15%** (la tasa actual de Ecuador desde abril 2024)
- **Servicio = 10%** (el cargo por servicio)

---

## 4. El flujo completo, paso a paso

Imagina una cena típica. Esto es lo que pasa por dentro:

1. **Llega el cliente y se sienta** → se abre una **Orden** en la **Mesa**.
   La mesa pasa de `Libre` a `Ocupada`.
2. **Pide comida** → se van agregando **productos** a la orden (cada cosa que
   pide es un "detalle" de la orden).
3. **Pide la cuenta** → el sistema calcula los **totales** (suma todo + 15% IVA
   + 10% de servicio).
4. **Va a pagar con QR** → el sistema crea una **sesión de pago** y genera un
   **código QR**. La mesa pasa a `Pagando`.
5. **El cliente escanea y paga** con su teléfono.
6. **Llega la confirmación del pago** (un "webhook", ver abajo). Cuando el
   sistema recibe el aviso de "pagado", automáticamente:
   - marca la sesión como **pagada**,
   - **cierra la orden**,
   - **libera la mesa** (vuelve a `Libre`),
   - y **crea la factura (FAC)** sola, con su cobro registrado.

Todo el paso 6 ocurre automático en cuanto entra la confirmación del pago.

---

## 5. ¿Qué es un "webhook"? (la parte que suele confundir)

Un **webhook** es simplemente *"una llamada que te hace el otro sistema cuando
algo pasa, en lugar de que tú estés preguntando todo el rato"*.

- En vez de que el restaurante pregunte mil veces *"¿ya pagó? ¿ya pagó?"*,
- el sistema de pagos (Paga Ya) **le avisa**: *"oye, la sesión X ya se pagó"*.

Ese aviso entra por la dirección `/mesitaqr/webhook/`. Y como cualquiera
podría intentar mandar un aviso falso de *"ya pagué"*, el sistema **verifica una
firma secreta** (HMAC-SHA256) en cada aviso. Si la firma no coincide, lo
rechaza. Así nadie puede fingir un pago.

> En esta demo el pago está **simulado**: el QR apunta a una página de pago
> propia del proyecto, no al Paga Ya real. Por eso es una demo: prueba todo el
> circuito sin mover dinero de verdad.

---

## 6. ¿Cómo está organizado el código?

El código está separado por responsabilidades, como una cocina con estaciones:

```
src/
├── api/v1/        ← La "ventanilla": recibe las peticiones de internet
│                     (mesa, orden, documento, persona, producto, mesitaqr)
├── services/      ← La "cocina": la lógica de verdad (qué hacer con cada cosa)
├── adapters/      ← Los "traductores": convierten al formato de Contifico/MesitaQR
├── middlewares/   ← Los "guardias": revisan la contraseña, registran errores
├── config/        ← La configuración (IVA, claves, conexión a la base de datos)
└── app.js         ← El interruptor que enciende todo
```

La idea clave: la **lógica** (services) no sabe si está hablando con un sistema
falso o real. Por eso, para pasar de demo a producción, solo se cambia el
**adaptador** y una variable (`CONTIFICO_ENABLED=true`). El resto no se toca.

---

## 7. ¿Con qué está hecho? (la tecnología)

- **Node.js + Express** → el lenguaje y la herramienta para construir la API.
- **Prisma + PostgreSQL** → cómo guarda y consulta los datos (la base de datos
  está en Supabase).
- **Railway** → el servidor en internet donde vive. Cada vez que se sube código
  nuevo a la rama `main`, Railway lo vuelve a publicar solo.
- **Swagger** → una página web automática donde puedes ver y probar todos los
  comandos de la API. Está en `/sistema/api/v1/docs`.

---

## 8. ¿Cómo lo pruebo yo?

**Versión rápida — ya está publicado en internet:**

- App / dashboard: https://pos-mesita-demo-production.up.railway.app
- Documentación interactiva (Swagger): https://pos-mesita-demo-production.up.railway.app/sistema/api/v1/docs

Casi todos los comandos piden una "contraseña" en la cabecera:
`Authorization: Token <API_KEY>`. La clave de demo es `mesita2024secret`.

**Versión local — en tu computadora:**

```bash
npm install            # instala las dependencias
cp .env.example .env   # copia la configuración (luego edítala)
npx prisma generate    # prepara la conexión a la base de datos
npm run dev            # enciende el servidor en http://localhost:3000
```

Para correr las pruebas automáticas (no necesita base de datos):

```bash
npm test
```

---

## 9. Resumen de una línea

> Es la caja registradora "por dentro" de un restaurante de Ecuador: maneja
> mesas, órdenes y facturas, cobra con QR, y está hecha para conectarse con
> Paga Ya y Contifico cambiando casi nada.

---

## 10. ¿Por dónde sigo si quiero entrar al detalle?

- `README.md` → la guía técnica general y cómo desplegarlo.
- `CLAUDE.md` → resumen técnico rápido para retomar el proyecto.
- `docs/mesitaqr-integration.md` → el flujo de pago QR explicado con ejemplos.
- `docs/contifico-compatibility.md` → cómo conectar el Contifico real.
- `docs/api-reference.md` → la lista completa de comandos de la API.
