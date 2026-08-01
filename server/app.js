/**
 * cPanel / Passenger application startup file.
 * Set this as the Node.js App "Application startup file".
 *
 * Prerequisites:
 *   1. npm ci (from repo root or this package)
 *   2. npm run build -w server && npm run build -w client
 *   3. npx prisma migrate deploy (in server/)
 *   4. Production env vars configured (see ../.env.example)
 */
import "./dist/server.js";
