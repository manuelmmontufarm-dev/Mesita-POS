-- Contifico's free-text fields carry Mesita's stable table/order identifiers.
ALTER TABLE IF EXISTS public."documentos"
  ADD COLUMN IF NOT EXISTS "referencia" TEXT,
  ADD COLUMN IF NOT EXISTS "adicional1" TEXT,
  ADD COLUMN IF NOT EXISTS "adicional2" TEXT;

-- Tenant schemas are created dynamically, outside Prisma's static schema.
-- Upgrade every existing tenant as well; platformService applies the same
-- additive DDL when a new tenant schema is bootstrapped.
DO $$
DECLARE
  tenant_schema TEXT;
BEGIN
  FOR tenant_schema IN
    SELECT nspname
    FROM pg_namespace
    WHERE left(nspname, 7) = 'tenant_'
  LOOP
    EXECUTE format(
      'ALTER TABLE IF EXISTS %I."documentos" ADD COLUMN IF NOT EXISTS "referencia" TEXT, ADD COLUMN IF NOT EXISTS "adicional1" TEXT, ADD COLUMN IF NOT EXISTS "adicional2" TEXT',
      tenant_schema
    );
  END LOOP;
END
$$;
