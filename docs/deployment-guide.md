# Deployment Guide — GitHub + Supabase + Railway

This guide walks you through deploying `pos-mesita-demo` from scratch.
No prior GitHub or Railway experience needed.

---

## What You'll Set Up

| Service | Purpose | Cost |
|---|---|---|
| **GitHub** | Stores your code | Free |
| **Supabase** | PostgreSQL database | Free tier |
| **Railway** | Runs your API server | Free hobby tier |

---

## Part 1 — GitHub: Create the Repository

### 1.1 Create a GitHub Account (if you don't have one)

Go to https://github.com and sign up. Confirm your email.

---

### 1.2 Create the Repository

1. Go to https://github.com/new
2. Fill in:
   - **Repository name:** `pos-mesita-demo`
   - **Visibility:** Private (recommended) or Public
   - Leave everything else unchecked
3. Click **Create repository**

GitHub will show you a page with empty-repo instructions. Leave it open.

---

### 1.3 Get a Personal Access Token (PAT)

You need a token to push code from your computer without typing your password every time.

1. Go to https://github.com/settings/tokens/new
2. In **Note**, type: `pos-mesita-demo deploy`
3. In **Expiration**, choose `90 days` (or No expiration for convenience)
4. Under **Select scopes**, check the box for **`repo`** (this gives full access to your repos)
5. Scroll down → click **Generate token**
6. **Copy the token immediately** — you will never see it again

It looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Save it somewhere safe (password manager, notes app).

---

### 1.4 Push the Code

Open your terminal, navigate to the `pos-mesita-demo` folder, and run:

```bash
cd pos-mesita-demo

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/pos-mesita-demo.git
git push -u origin main
```

When Git asks for your **username**, enter your GitHub username.  
When Git asks for your **password**, paste the token you copied above (not your GitHub account password).

After this, refresh your GitHub repo page — you should see all the files.

---

## Part 2 — Supabase: Set Up the Database

### 2.1 Create a Supabase Account

1. Go to https://supabase.com
2. Click **Start your project** → sign in with GitHub (easiest)

---

### 2.2 Create a New Project

1. Click **New project**
2. Fill in:
   - **Name:** `pos-mesita-demo`
   - **Database Password:** choose a strong password and **write it down**
   - **Region:** choose the closest to you (e.g., South America (São Paulo) for Ecuador)
3. Click **Create new project** and wait ~2 minutes

---

### 2.3 Get Your Database Connection String

1. In your Supabase project, click **Settings** (gear icon, left sidebar)
2. Click **Database**
3. Scroll down to **Connection string**
4. Click the **URI** tab
5. Copy the string — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the password you chose in step 2.2

This is your `DATABASE_URL`. Save it.

---

## Part 3 — Railway: Deploy the API

### 3.1 Create a Railway Account

1. Go to https://railway.app
2. Click **Start a New Project**
3. Sign in with GitHub (click **Login with GitHub** → **Authorize Railway**)

---

### 3.2 Create a New Project

1. After logging in, click **New Project**
2. Select **Deploy from GitHub repo**
3. If prompted, click **Configure GitHub App** → authorize Railway to access your repos
4. Select `pos-mesita-demo` from the list
5. Railway will start reading your `Dockerfile` — wait a few seconds

---

### 3.3 Add Environment Variables

Before the first deploy succeeds, you need to add your secrets.

1. Click on the **service** (the box that appeared in your project)
2. Click the **Variables** tab
3. Add these one by one (click **+ New Variable** for each):

| Variable Name | Value |
|---|---|
| `DATABASE_URL` | Your Supabase connection string from Part 2 |
| `API_KEY` | A random secret you choose (e.g., `mysecretkey123` — pick something harder) |
| `NODE_ENV` | `production` |
| `MESITAQR_WEBHOOK_SECRET` | Another random secret (e.g., `webhooksecret456`) |
| `APP_BASE_URL` | Leave empty for now — you'll fill this in after first deploy |

4. After adding all variables, click **Deploy** (or Railway may redeploy automatically)

---

### 3.4 Get Your Public URL

1. Click the **Settings** tab on your service
2. Under **Networking**, click **Generate Domain**
3. Railway will give you a URL like `pos-mesita-demo.up.railway.app`
4. Copy it

Now go back to **Variables** and update:

| Variable Name | Value |
|---|---|
| `APP_BASE_URL` | `https://pos-mesita-demo.up.railway.app` |

Railway will redeploy automatically.

---

### 3.5 Check the Deploy Logs

1. Click the **Deployments** tab
2. Click the latest deployment to see logs
3. A successful deploy looks like:

```
Running migrations...
All migrations completed successfully.
🚀 Server running on port 3000
✅ Database connected
```

If you see errors, the most common causes are:
- `DATABASE_URL` missing or typo → double-check the Supabase connection string
- `prisma migrate deploy` failing → the database password may have special characters that need URL-encoding (replace `@` with `%40`, `#` with `%23`, etc.)

---

## Part 4 — Seed the Database

The seed script loads your menu items, tables, and a demo customer.

Run this from your local machine (with Node.js installed):

```bash
cd pos-mesita-demo
DATABASE_URL="your_supabase_connection_string" node scripts/seed.js
```

On Windows (Command Prompt):
```cmd
set DATABASE_URL=your_supabase_connection_string
node scripts/seed.js
```

You should see:
```
✅ Seeded 4 categories
✅ Seeded 12 products
✅ Seeded 10 mesas
✅ Seeded 1 demo persona
🌱 Seed complete
```

---

## Part 5 — Test Your Deployment

Replace the values below with your actual Railway URL and API key.

```bash
export URL=https://pos-mesita-demo.up.railway.app
export KEY=mysecretkey123

# Health check (no auth needed)
curl $URL/sistema/api/v1/health/

# Should return: {"status":"ok","timestamp":"...","database":"connected"}

# List mesas
curl $URL/sistema/api/v1/mesa/ \
  -H "Authorization: Token $KEY"

# Open Swagger UI in your browser
# https://pos-mesita-demo.up.railway.app/sistema/api/v1/docs
```

---

## Part 6 — Auto-Deploy on Push

Every time you push to the `main` branch, Railway will automatically redeploy.

```bash
# Make a change, then:
git add .
git commit -m "Update something"
git push
```

Railway picks it up within seconds.

---

## Troubleshooting

**"Unauthorized" on all API calls**
→ Make sure you're sending `Authorization: Token YOUR_API_KEY` (capital T, space before the token value).

**"Database connection failed"**
→ Check `DATABASE_URL` in Railway Variables. Make sure the Supabase password is correct and special characters are URL-encoded.

**Railway build fails with "npm ci" error**
→ Check that `package-lock.json` was committed. Run `npm install` locally, commit the lock file, push again.

**QR codes not loading**
→ Make sure `APP_BASE_URL` is set correctly in Railway Variables (no trailing slash, starts with `https://`).

**"Migration not found" error**
→ The migration file at `prisma/migrations/20260610000000_init/migration.sql` must be committed. Check your git status.

---

## Summary of Secrets

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → URI |
| `API_KEY` | You choose — any strong random string |
| `MESITAQR_WEBHOOK_SECRET` | You choose — any strong random string |
| `APP_BASE_URL` | Railway → Settings → Networking → your domain |
| `NODE_ENV` | Always `production` on Railway |

---

## Optional: Connect Real MesitaQR (Paga Ya)

Once you have real Paga Ya credentials, add these to Railway Variables:

```
MESITAQR_API_KEY=your_real_paga_ya_api_key
MESITAQR_BASE_URL=https://api.pagaya.ec  (or whatever they provide)
```

The mock mode switches off automatically when `MESITAQR_API_KEY` is present.

---

## Optional: Connect Real Contifico

```
CONTIFICO_ENABLED=true
CONTIFICO_TOKEN=your_contifico_api_token
CONTIFICO_BASE_URL=https://api.contifico.com/sistema/api/v1
```

See [contifico-compatibility.md](contifico-compatibility.md) for the full swap guide.
