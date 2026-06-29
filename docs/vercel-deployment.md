# Deploy POS Mesita on Vercel

## 1. Import project

1. [vercel.com/new](https://vercel.com/new) → Import **Mesita-POS** from GitHub
2. Framework: **Other** (uses `vercel.json` + `api/index.js`)
3. Root directory: `/` (repo root)

## 2. Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Supabase **Transaction pooler** (port **6543**) |
| `API_KEY` | Yes | Same value as `POS_MESITA_API_KEY` in mesita-app |
| `NODE_ENV` | Yes | `production` |
| `APP_BASE_URL` | Yes | Your Vercel URL, e.g. `https://mesita-pos.vercel.app` |
| `MESITAQR_WEBHOOK_SECRET` | Yes | Random secret |
| `RESTAURANT_RUC` | No | Demo defaults |
| `RESTAURANT_RAZON_SOCIAL` | No | Demo defaults |
| `RESTAURANT_DIRECCION` | No | Demo defaults |

### DATABASE_URL example (Supabase)

```
postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Get it from: Supabase → Settings → Database → **Transaction pooler** → URI.

If the Supabase project was paused, **Restore** it first.

## 3. Seed database (once)

From your machine:

```bash
DATABASE_URL="your_supabase_uri_port_5432" npx prisma db push
DATABASE_URL="your_supabase_uri_port_5432" node scripts/seed.js
```

Use port **5432** (session pooler) for migrations/seed; Vercel runtime uses **6543**.

## 4. Update mesita-app

In Vercel (mesitademo):

```
POS_MESITA_API_URL=https://YOUR-POS.vercel.app/sistema/api/v1
POS_MESITA_API_KEY=<same as API_KEY above>
```

## 5. Verify

- App: `https://YOUR-POS.vercel.app`
- Health: `https://YOUR-POS.vercel.app/sistema/api/v1/health/`
- DB health: `https://YOUR-POS.vercel.app/sistema/api/v1/health/db/`
- Swagger: `https://YOUR-POS.vercel.app/sistema/api/v1/docs`

## 6. Turn off Railway (optional)

After Vercel works, pause or delete the Railway service to avoid duplicate deployments.
