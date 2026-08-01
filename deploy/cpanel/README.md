# KitchenOS on cPanel

Recommended layout: **one Node.js application** serves the API and the built React SPA on the same HTTPS domain.

## Requirements

| Dependency | Notes |
|---|---|
| Node.js **≥ 20** (22 preferred) | cPanel → Setup Node.js App |
| PostgreSQL | Managed DB, remote Neon/Supabase, or cPanel Postgres |
| Redis | Optional: Upstash, or `ALLOW_INMEMORY_CACHE=1` (single process only) |
| Cloudinary | Required for uploads |
| SMTP | Required for transactional email (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) |

## Deploy steps

1. Upload the **server** app (or full monorepo) to the Node application root, e.g. `~/api.myqrmenu.simbatech.et`.
2. Create a Node.js app in cPanel:
   - Application root: that folder
   - Application URL: your API subdomain
   - Startup file: `app.js`
   - Node version: 20+ (22 preferred; 24 works)
3. **Set environment variables in cPanel UI** (Setup Node.js App → Edit → Environment Variables).  
   Do **not** rely only on uploading `.env` — File Manager often hides/skips dotfiles. Minimum:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB?sslmode=require
JWT_SECRET=at-least-32-random-characters-here
CLIENT_URL=https://myqrmenu.simbatech.et
PUBLIC_APP_URL=https://myqrmenu.simbatech.et
PUBLIC_API_URL=https://api.myqrmenu.simbatech.et
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SMTP_HOST=mail.your-domain.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@your-domain.com
SMTP_PASS=...
SMTP_FROM=KitchenOS <noreply@your-domain.com>
ALLOW_INMEMORY_CACHE=1
ENABLE_LOCAL_DB_BACKUP=false
```

Values must be **https://** (not http://localhost). No trailing slash.

4. In SSH / Terminal, enter the app virtualenv, then generate Prisma + migrate:

```bash
source ~/nodevenv/api.myqrmenu.simbatech.et/24/bin/activate
cd ~/api.myqrmenu.simbatech.et
npm install
npx prisma generate
npx prisma migrate deploy
# If you deploy the monorepo server package:
# npm run build   # or upload a freshly built dist/ from your laptop
```

5. Restart the Node.js app in cPanel.
6. First-time admins (once only):

```bash
NODE_ENV=production ALLOW_PROD_SEED=1 \
  ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  STAFF_ADMIN_EMAIL=... STAFF_ADMIN_PASSWORD=... \
  npm run db:seed -w server
```

7. Cron (recommended — more reliable than in-process jobs under Passenger):

```cron
0 * * * * cd /home/USER/kitchenos && npm run job:subscription-alerts -w server
```

## Frontend build note

For same-origin deploy, leave `VITE_API_URL` **empty** in `client/.env.production` so the bundle calls `/api/v1` on your domain.

If the API is on a subdomain (`https://api.your-domain.com`), set:

```bash
VITE_API_URL=https://api.your-domain.com
```

before `npm run build -w client`, and set `SERVE_CLIENT=0`. Copy `client/dist` into `public_html` and use `deploy/cpanel/.htaccess` for SPA rewrites.

## Health check

- `https://your-domain.com/health`
- `https://your-domain.com/api/v1/health`

## Sharp / native modules

If `sharp` fails to load after deploy, rebuild on the server:

```bash
npm rebuild sharp --workspace=server --foreground-scripts
```
