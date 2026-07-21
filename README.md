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

Optional Mailhog / SMTP: set `SMTP_*` in `server/.env` (see `.env.example`).

## Accounts (seed)

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@kitchenos.local` | `Admin@12345` |
| Staff admin | `staff@kitchenos.local` | `Staff@12345` |
| Tenant | From registration approval | Temp password in admin modal + email |

## What is included

### Public & auth
- Landing, registration (device payment proof for paid plans), public menu
- URLs: `/r/:tenant/:branch` (canonical) · `/menu/...` alias
- Tenant / admin login, remember me, forgot/reset password, forced change password
- CSRF double-submit + Origin/Referer checks on mutating API calls

### Tenant
- Branches (plan limits), menu (categories/items, soft-delete, WebP uploads)
- QR download / print / regenerate · **Custom QR** (colors + logo) on Basic+
- Subscription (trial, renew, cancel + 30-day retention), payments, inbox, settings/logo
- **Analytics** (Basic 7-day / Full 30-day + hour chart) when plan allows
- Global subscription status banners

### Admin
- Dashboard, approvals, tenants, **branches**, subscriptions (+ **history**), payments (CSV)
- Plans (edit = Super Admin), announcements (ALL_ACTIVE / SELECTED), activity log
- RBAC: `SUPER_ADMIN` vs `ADMIN` (plans, delete tenant, ops jobs)
- Jobs: subscription alerts, retention purge, DB backup (`server/backups/`)

### Billing lifecycle
- **TRIAL** 14 days on approval → Free stays ACTIVE forever · Paid continues with payment months
- Near-expiry emails (7 / 3 / 1) + expired · cancel retention purge after 30 days

## Useful commands

```bash
npm run job:subscription-alerts -w server
npm run job:db-backup -w server
```

## Key URLs

| Page | URL |
|---|---|
| Landing | http://localhost:5173/ |
| Register | http://localhost:5173/register |
| Admin | http://localhost:5173/admin/login |
| Tenant | http://localhost:5173/tenant/login |
| Public menu | http://localhost:5173/r/:tenant/:branch |

## Defaults

| Topic | Choice |
|---|---|
| Free plan | Still requires admin approval |
| Images | Device upload only (no URL fields) |
| Storage | Local `uploads/` + Sharp → WebP |
| Analytics | Implemented per plan feature flag |
| TRIAL | 14 days on approval (FR-6.1) |
