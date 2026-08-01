/**
 * cPanel / Passenger application startup file.
 * Set this as the Node.js App "Application startup file".
 *
 * Loads .env from the application root BEFORE the API boots
 * (cPanel often does not inject vars from a .env file automatically).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

for (const name of [".env", ".env.production", ".env.local"]) {
  const filePath = path.join(appRoot, name);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
  }
}

// Also try cwd (some cPanel setups start with a different working directory).
dotenv.config();

await import("./dist/server.js");
