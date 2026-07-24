# KitchenOS — QR Restaurant Menu SaaS

Multi-tenant QR restaurant menu platform (SRS v1.0).

## Structure

```
client/   React + TypeScript + Vite + Tailwind
server/   Node.js + Express + Prisma + PostgreSQL + Redis
```

## Local setup

```bash
npm run db:up          # Postgres + Redis + Mailpit
npm install
cp .env.example server/.env   # then edit secrets
npm run db:migrate -w server  # interactive migrate (dev only)
npm run db:seed -w server
npm run dev:server            # http://localhost:4000
npm run dev:client            # http://localhost:5173
```

Optional Mailpit UI: http://localhost:8025

## Accounts (local seed)

Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` (and optional `STAFF_*`) in `server/.env` before seeding.
Dev seed does **not** invent passwords when those vars are unset.

| Role | Notes |
|---|---|
| Super admin | From `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Staff admin | From `STAFF_ADMIN_EMAIL` / `STAFF_ADMIN_PASSWORD` |
| Tenant | Activation credentials are email-only after approval |

## Production deploy (Vercel + Render)

### API (Render)

1. Use `render.yaml` or create a Web Service from `server/Dockerfile`.
2. Attach **PostgreSQL** and **Redis** (`REDIS_URL` is required in production).
3. Attach a **persistent disk** for `uploads/`.
4. Release command is baked into the Docker image: `prisma migrate deploy` then `node dist/server.js`.
5. Required env (HTTPS origins, no localhost):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres with TLS (`sslmode=require`) |
| `REDIS_URL` | Shared cache + rate limits |
| `JWT_SECRET` | ≥32 chars, not a placeholder |
| `CLIENT_URL` / `PUBLIC_APP_URL` | Vercel HTTPS origin |
| `PUBLIC_API_URL` | This API’s HTTPS origin (absolute media URLs) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Real mail provider |

Optional first-time admin bootstrap (never on every deploy):

```bash
NODE_ENV=production ALLOW_PROD_SEED=1 \
  ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  STAFF_ADMIN_EMAIL=... STAFF_ADMIN_PASSWORD=... \
  npm run db:seed -w server
```

Password hashes are **not** reset on re-seed unless `SEED_RESET_ADMIN_PASSWORDS=1`.

### Frontend (Vercel)

1. Root directory: `client` (or monorepo filter).
2. Set `VITE_API_URL=https://YOUR-API.onrender.com` (HTTPS, no trailing slash).
3. Production builds **fail** if `VITE_API_URL` is missing, localhost, or a placeholder.

### Production migrate (never use `db:migrate` against prod)

```bash
npm run db:migrate:deploy
```

## Useful commands

```bash
npm run build
npm run db:migrate:deploy
npm run job:subscription-alerts -w server
npm run job:db-backup -w server
```

## Key URLs (local)

| Page | URL |
|---|---|
| Landing | http://localhost:5173/ |
| Register | http://localhost:5173/register |
| Admin | http://localhost:5173/admin/login |
| Tenant | http://localhost:5173/tenant/login |
| Public menu | http://localhost:5173/r/:publicQrId |
