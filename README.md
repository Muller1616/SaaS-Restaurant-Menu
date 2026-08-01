# KitchenOS — QR Restaurant Menu SaaS

Multi-tenant QR restaurant menu platform (SRS v1.0).

## Structure

```
client/   React + TypeScript + Vite + Tailwind
server/   Node.js + Express + Prisma + PostgreSQL (+ optional Redis)
deploy/   cPanel Apache helpers and deploy notes
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

## Production deploy (cPanel)

See **[deploy/cpanel/README.md](deploy/cpanel/README.md)** for the full runbook.

### Quick path (same domain)

1. Create a Node.js app (Node ≥ 20). Startup file: `server/app.js`.
2. Set production env vars (`NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`, `PUBLIC_APP_URL`, `PUBLIC_API_URL`, Cloudinary, mail).
3. For single-app hosting set `SERVE_CLIENT=1` and leave client `VITE_API_URL` empty.
4. Without Redis on the host: `ALLOW_INMEMORY_CACHE=1` (one Node process only). Prefer Upstash/`REDIS_URL` when available.
5. Without TLS on cPanel Postgres: `ALLOW_INSECURE_DB=1`.
6. Build and migrate:

```bash
npm ci
npm run build
npm run db:migrate:deploy
```

7. Restart the Node app. Health: `/health`.

Required production env (HTTPS origins, no localhost placeholders):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (`sslmode=require`, or `ALLOW_INSECURE_DB=1`) |
| `REDIS_URL` or `ALLOW_INMEMORY_CACHE=1` | Cache + rate limits |
| `JWT_SECRET` | ≥32 chars, not a placeholder |
| `CLIENT_URL` / `PUBLIC_APP_URL` / `PUBLIC_API_URL` | Public HTTPS origin(s) |
| `CLOUDINARY_*` | Image hosting |
| `SMTP_*` | Transactional email (SMTP only) |
| `SERVE_CLIENT` | `1` when Express should serve `client/dist` |

Optional first-time admin bootstrap (never on every deploy):

```bash
NODE_ENV=production ALLOW_PROD_SEED=1 \
  ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  STAFF_ADMIN_EMAIL=... STAFF_ADMIN_PASSWORD=... \
  npm run db:seed -w server
```

Password hashes are **not** reset on re-seed unless `SEED_RESET_ADMIN_PASSWORDS=1`.

### Production migrate (never use `db:migrate` against prod)

```bash
npm run db:migrate:deploy
```

## Useful commands

```bash
npm run build
npm run start:cpanel
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
