-- One-shot: add Mesa 12 for MesitaQR demo (run in Supabase SQL Editor if seed already ran).
INSERT INTO "mesas" ("id", "nombre", "capacidad", "estado", "ubicacion", "activa", "createdAt", "updatedAt")
VALUES ('mesa-12', 'Mesa 12', 6, 'L', 'Demo', true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "ubicacion" = EXCLUDED."ubicacion",
  "activa" = true;

-- Copy to tenant_demo if platform bootstrap already ran:
INSERT INTO tenant_demo.mesas ("id", "nombre", "capacidad", "estado", "ubicacion", "activa", "createdAt", "updatedAt")
SELECT "id", "nombre", "capacidad", "estado", "ubicacion", "activa", "createdAt", "updatedAt"
FROM public.mesas WHERE id = 'mesa-12'
ON CONFLICT ("id") DO NOTHING;
