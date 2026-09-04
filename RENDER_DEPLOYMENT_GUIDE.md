# RENDER DEPLOYMENT GUIDE — 404 Coffee Backend

## Prerequisites

1. GitHub repo: `https://github.com/ahmrf125ertg/404-coffee-backend`
2. Render account (free tier OK)
3. PostgreSQL database (Render managed or external)

## Step 1: Create PostgreSQL Database on Render

1. Go to Render Dashboard → **New** → **PostgreSQL**
2. Name: `coffee-404-db`
3. Plan: **Free** (or Starter for production)
4. Region: closest to your users
5. Note the **Internal Database URL** (format: `postgresql://user:pass@host:5432/dbname`)

## Step 2: Create Web Service

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect GitHub repo: `ahmrf125ertg/404-coffee-backend`
3. Settings:
   - **Name:** `404-coffee-backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `node src/server.js`
   - **Plan:** Free (or Starter)

## Step 3: Environment Variables

Add these in the **Environment** tab:

```bash
# Database (use Render's Internal Database URL for best performance)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# JWT — GENERATE STRONG RANDOM SECRETS!
# Use: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=production

# CORS (your frontend URL)
CORS_ORIGINS=https://your-frontend.onrender.com

# AI (optional)
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_MODEL=deepseek-chat
AI_RATE_LIMIT_WINDOW_MS=60000
AI_RATE_LIMIT_MAX_REQUESTS=10
```

## Step 4: Deploy

1. Click **Create Web Service**
2. Render will auto-deploy from `master` branch
3. First deploy takes ~2-3 minutes

## Step 5: Run Migrations

After first deploy, go to **Shell** tab in Render and run:

```bash
npx prisma migrate deploy
npx prisma db seed
```

Or add to build command:
```
npm install && npx prisma generate && npx prisma migrate deploy
```

## Step 6: Verify

1. Open `https://404-coffee-backend.onrender.com/api/health`
2. Should return: `{"status":"ok","timestamp":"...","uptime":...}`

## Important Notes

### CORS
Update `CORS_ORIGINS` in `.env` with your frontend URL. Multiple origins: comma-separated.

### Database URL
Use Render's **Internal Database URL** (not External) for better performance and no SSL issues.

### Free Tier Limitations
- Service spins down after 15 min inactivity
- First request after spin-down takes ~30s
- 750 hours/month free

### Production Checklist
- [ ] Generate strong JWT secrets (not defaults)
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS for your frontend domain
- [ ] Run `prisma migrate deploy` after schema changes
- [ ] Seed default data: `npx prisma db seed`
- [ ] Test health endpoint
- [ ] Test login with seeded admin

### Backend URL
After deployment, your API base URL will be:
```
https://404-coffee-backend.onrender.com
```

Update your frontend to point to this URL.
