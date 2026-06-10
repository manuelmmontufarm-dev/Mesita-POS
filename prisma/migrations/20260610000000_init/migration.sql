-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DOUBLE PRECISION NOT NULL,
    "categoriaId" TEXT,
    "porcentajeIva" INTEGER NOT NULL DEFAULT 15,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 4,
    "estado" TEXT NOT NULL DEFAULT 'L',
    "ubicacion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orden" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'A',
    "descripcion" TEXT,
    "mesero" TEXT,
    "cerradaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenDetalle" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "productoId" TEXT,
    "nombre" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "precio" DOUBLE PRECISION NOT NULL,
    "porcentajeIva" INTEGER NOT NULL DEFAULT 15,
    "porcentajeDescuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "ruc" TEXT,
    "razonSocial" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'N',
    "email" TEXT,
    "telefonos" TEXT,
    "direccion" TEXT,
    "esExtranjero" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT,
    "personaId" TEXT,
    "pos" TEXT,
    "fechaEmision" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'PRE',
    "tipoRegistro" TEXT NOT NULL DEFAULT 'CLI',
    "estado" TEXT NOT NULL DEFAULT 'P',
    "electronico" BOOLEAN NOT NULL DEFAULT true,
    "descripcion" TEXT,
    "subtotal0" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal15" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "servicio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autorizacionSRI" TEXT,
    "claveAcceso" TEXT,
    "urlRide" TEXT,
    "urlXml" TEXT,
    "clienteCedula" TEXT,
    "clienteRuc" TEXT,
    "clienteRazonSocial" TEXT,
    "clienteTipo" TEXT,
    "clienteEmail" TEXT,
    "clienteTelefonos" TEXT,
    "clienteDireccion" TEXT,
    "clienteExtranjero" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoDetalle" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "productoId" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "precio" DOUBLE PRECISION NOT NULL,
    "porcentajeIva" INTEGER NOT NULL DEFAULT 15,
    "porcentajeDescuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseCero" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseGravable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseNoGravable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "formaCobro" TEXT NOT NULL DEFAULT 'EF',
    "monto" DOUBLE PRECISION NOT NULL,
    "referencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "procesado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesitaqrSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "ordenId" TEXT,
    "montoTotal" DOUBLE PRECISION NOT NULL,
    "qrCode" TEXT,
    "qrUrl" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesitaqrSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_cedula_key" ON "Persona"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "MesitaqrSession_sessionId_key" ON "MesitaqrSession"("sessionId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenDetalle" ADD CONSTRAINT "OrdenDetalle_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenDetalle" ADD CONSTRAINT "OrdenDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoDetalle" ADD CONSTRAINT "DocumentoDetalle_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoDetalle" ADD CONSTRAINT "DocumentoDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesitaqrSession" ADD CONSTRAINT "MesitaqrSession_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesitaqrSession" ADD CONSTRAINT "MesitaqrSession_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;
