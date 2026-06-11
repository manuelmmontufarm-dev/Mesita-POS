-- AlterTable: add comensales (diners count) to ordenes
ALTER TABLE "ordenes" ADD COLUMN "comensales" INTEGER NOT NULL DEFAULT 0;
