# RAILWAY DEPLOYMENT GUIDE — 404 Coffee Backend

## Railway Pricing (Verified September 2026)

| Plan | Monthly Fee | Included Usage | No Credit Card? |
|------|-------------|----------------|-----------------|
| **Free Trial** | $0 | $5 one-time credit (30 days) | ✅ Yes |
| **Free** | $0 | $1/month ongoing | Yes (after trial) |
| **Hobby** | $5 | $5/month included | Requires card |

**Free Trial** is the practical starting point: $5 in credits lasting 30 days, no card required. A small Express + PostgreSQL app typically costs ~$2-4/month, so the trial covers 1-2 months of continuous running. After the trial, the **Free** plan gives $1/month — enough for a minimal always-on service without a database, or a few hours/day with one.

**PostgreSQL** on Railway is a usage-based service (not a separate paid add-on). It consumes from your plan's included credits. A small 256 MB database costs ~$1-2/month.

**WebSocket support:** Full — no special config needed. Railway does not sleep or cold-start services on the Hobby plan. On the Free plan, services can be paused after inactivity.

## Prerequisites

1. GitHub repo: `https://github.com/ahmrf125ertg/404-coffee-backend`
2. Railway account: [railway.com](https://railway.com) (sign up for free Trial)

## Step 1: Create Railway Project

1. Go to [railway.com](https://railway.com) → **Login** → sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select `ahmrf125ertg/404-coffee-backend`
4. Railway detects the `Dockerfile` and `railway.toml` automatically

## Step 2: Add PostgreSQL Database

1. In your project dashboard → **New** → **Database** → **PostgreSQL**
2. Railway provisions a PostgreSQL instance and injects `DATABASE_URL` into your service automatically
3. No manual connection string copying needed — Railway wires it via environment variable

## Step 3: Set Environment Variables

Go to your service → **Variables** tab → add:

```bash
# JWT — Generate strong secrets:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64-char-random-hex>
JWT_REFRESH_SECRET=<64-char-random-hex>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Server (Railway injects PORT automatically, but set NODE_ENV)
NODE_ENV=production

# CORS (your frontend URL, comma-separated for multiple)
CORS_ORIGINS=https://your-frontend.up.railway.app

# AI Chat (optional)
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_MODEL=deepseek-chat
```

**Variables Railway injects automatically:**
- `DATABASE_URL` — from the PostgreSQL plugin
- `PORT` — set to the container's listen port (our server reads `process.env.PORT`)

**Do NOT set `PORT` manually** — Railway handles this.

## Step 4: Deploy

1. Railway auto-deploys on every push to `master`
2. The Dockerfile runs: `npm ci --omit=dev` → `prisma generate` → `prisma migrate deploy` → `node src/server.js`
3. First deploy takes ~2-3 minutes
4. Check **Deployments** tab for build logs and status

## Step 5: Seed Default Data

After first successful deploy:

1. Go to your service → **Settings** → **Networking** → **Generate Domain** (get your public URL)
2. Run the seed command:
   ```bash
   # Via Railway CLI (if installed):
   railway run node prisma/seed.js

   # Or use the Railway shell:
   # Go to Service → Settings → Deploy → invoke "node prisma/seed.js"
   ```

Or add a one-off deployment command in the Railway dashboard.

## Step 6: Verify

```bash
# Health check
curl https://<your-service>.up.railway.app/api/health
# Expected: {"success":true,"message":"404 Coffee API is running"}

# Login
curl -X POST https://<your-service>.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"root123"}'
# Expected: {"success":true,"data":{"auth":{"access_token":"..."},...}}

# Swagger docs
# Open in browser: https://<your-service>.up.railway.app/api/docs
```

## Required Environment Variables

| Variable | Required | Source | Description |
|----------|----------|--------|-------------|
| `DATABASE_URL` | Yes | Auto from PostgreSQL plugin | PostgreSQL connection string |
| `PORT` | Yes | Auto by Railway | Container port (do not set manually) |
| `JWT_SECRET` | Yes | Manual | 64-char random hex for access tokens |
| `JWT_REFRESH_SECRET` | Yes | Manual | 64-char random hex for refresh tokens |
| `JWT_EXPIRES_IN` | No | Manual (default: `1h`) | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | No | Manual (default: `7d`) | Refresh token expiry |
| `NODE_ENV` | No | Manual (default: `development`) | Set to `production` |
| `CORS_ORIGINS` | No | Manual (default: `*`) | Comma-separated allowed origins |
| `DEEPSEEK_API_KEY` | No | Manual | For AI chat feature |
| `DEEPSEEK_MODEL` | No | Manual (default: `deepseek-chat`) | AI model name |

## Railway-Specific Notes

### No Sleep/Cold-Start on Hobby
Railway's Hobby plan ($5/mo) keeps services always-on. No spin-down, no cold starts. This is a significant advantage over Render's free tier (15-min spin-down).

### WebSocket Support
Railway supports WebSocket connections natively. No special configuration needed — Socket.IO works out of the box.

### Database Persistence
Railway PostgreSQL databases persist as long as the project exists. No 30-day expiry like Render's free tier.

### Auto-Deploy from Git
Railway re-deploys on every push to `master`. The Dockerfile runs `prisma migrate deploy` before starting the server, so schema changes are applied automatically.

### Free Plan Limitations
- $1/month included usage — a small app with PostgreSQL may exceed this
- Services can be paused after inactivity on the Free plan
- No custom domains on Free plan
- 1 project, 3 services max

### Cost Estimate
A typical Express + PostgreSQL app on Railway:
- **Hobby plan ($5/mo):** ~$2-4/month total (app + database) — fits within $5 included credits
- **Free plan ($0):** May work if usage stays under $1/month — tight with a database

## Production Checklist

- [ ] Generate strong JWT secrets (not defaults)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGINS` for your frontend domain
- [ ] Seed default data: `node prisma/seed.js`
- [ ] Test health endpoint
- [ ] Test login with Admin/root123
- [ ] Verify WebSocket connection

## Alternative: Render

If you prefer Render (free tier, no credit card), see [RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md). The repo includes `render.yaml` for one-click Render Blueprint deploy. Note Render's free tier has a 15-min spin-down and 30-day database expiry.

## Backend URL

After deployment:
```
https://<your-service>.up.railway.app
```

API base: `https://<your-service>.up.railway.app/api`
Swagger docs: `https://<your-service>.up.railway.app/api/docs`
