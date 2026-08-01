# cPanel troubleshooting

## `CLIENT_URL must use https (got http://localhost:5173)`

The API is not reading your production URLs. The localhost value is only a **fallback** when `CLIENT_URL` is missing.

**Fix (most reliable):** cPanel → Setup Node.js App → your API app → **Edit** → **Environment Variables** → add:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CLIENT_URL` | `https://myqrmenu.simbatech.et` |
| `PUBLIC_APP_URL` | `https://myqrmenu.simbatech.et` |
| `PUBLIC_API_URL` | `https://api.myqrmenu.simbatech.et` |

Then **Save** and **Restart**.

If you use a `.env` file instead:

1. File Manager → **Settings** → enable **Show Hidden Files (dotfiles)**
2. Put `.env` in the **same folder as `app.js`** (application root)
3. Confirm it contains the three URLs above (https, no trailing slash)
4. Restart the app

Also re-upload a freshly built `dist/` after pulling latest code (`npm run build -w server`).

## `@prisma/client did not initialize yet`

Run once on the server (adjust Node version folder if needed):

```bash
source ~/nodevenv/api.myqrmenu.simbatech.et/24/bin/activate
cd ~/api.myqrmenu.simbatech.et
npx prisma generate
npx prisma migrate deploy
```

Ensure `prisma/` (schema + migrations) is uploaded next to `package.json`.

## Startup file

Application startup file must be `app.js` (not `dist/server.js` alone), so `.env` is loaded before boot.
