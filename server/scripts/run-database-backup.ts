import "dotenv/config";
import { runDatabaseBackup } from "../src/jobs/database-backup.js";

const result = await runDatabaseBackup();
console.log("[db-backup]", result);
