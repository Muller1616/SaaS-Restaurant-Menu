# KitchenOS — QR Restaurant Menu SaaS

Multi-tenant QR restaurant menu platform (SRS v1.0).

## Structure

```
client/   React + TypeScript + Vite + Tailwind
server/   Node.js + Express + Prisma + PostgreSQL
```

## Setup

```bash
npm run db:up
npm install
npm run db:migrate -w server
npm run db:seed -w server
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

Optional local email inbox (Mailpit): `docker compose up -d mailpit`, then open http://localhost:8025. SMTP defaults in `server/.env` (`SMTP_HOST=localhost`, `SMTP_PORT=1025`).

## Accounts (seed)

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@kitchenos.local` | from `ADMIN_PASSWORD` (default `Admin@12345`) |
| Staff admin | `staff@kitchenos.local` | from `STAFF_ADMIN_PASSWORD` (default `Staff@12345`) |
| Tenant | From registration approval | Temp password in admin modal + email |

## Production (Vercel + Render)

1. Deploy **server** on Render (Web Service + PostgreSQL).
2. Deploy **client** on Vercel with `VITE_API_URL=https://YOUR-API.onrender.com`.
3. Set Render `CLIENT_URL` / `PUBLIC_APP_URL` to your Vercel HTTPS origin.
4. Use a real SMTP provider (not localhost) and a strong `JWT_SECRET`.
5. Attach a **persistent disk** on Render for `uploads/` (ephemeral disk loses QR/menu images on restart).

## Useful commands

```bash
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
