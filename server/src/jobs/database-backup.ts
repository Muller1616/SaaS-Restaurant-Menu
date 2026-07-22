import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";

const execFileAsync = promisify(execFile);

export type BackupResult = {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  method: "pg_dump" | "docker";
  pruned: number;
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureBackupDir() {
  await fs.mkdir(env.backupDir, { recursive: true });
}

async function pruneOldBackups() {
  const retainMs = Math.max(1, env.backupRetainDays) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retainMs;
  let pruned = 0;

  let entries: string[] = [];
  try {
    entries = await fs.readdir(env.backupDir);
  } catch {
    return 0;
  }

  for (const name of entries) {
    if (!name.startsWith("kitchenos-") || !name.endsWith(".sql")) continue;
    const full = path.join(env.backupDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile()) continue;
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(full).catch(() => undefined);
      pruned += 1;
    }
  }
  return pruned;
}

async function tryDockerDump(outPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "exec",
        env.backupDockerContainer,
        "pg_dump",
        "-U",
        env.backupPgUser,
        "-d",
        env.backupPgDatabase,
        "--no-owner",
        "--no-acl",
      ],
      { maxBuffer: 256 * 1024 * 1024 },
    );
    await fs.writeFile(outPath, stdout, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function tryPgDump(outPath: string): Promise<boolean> {
  try {
    await execFileAsync(
      "pg_dump",
      [env.databaseUrl, "--no-owner", "--no-acl", "-f", outPath],
      { maxBuffer: 256 * 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

/** §6.3 — create a local SQL dump and prune old files. */
export async function runDatabaseBackup(): Promise<BackupResult> {
  await ensureBackupDir();
  const fileName = `kitchenos-${stamp()}.sql`;
  const filePath = path.join(env.backupDir, fileName);

  let method: "pg_dump" | "docker" | null = null;
  if (await tryDockerDump(filePath)) {
    method = "docker";
  } else if (await tryPgDump(filePath)) {
    method = "pg_dump";
  } else {
    throw new AppError(
      500,
      "Database backup failed. Ensure pg_dump is available or the configured Docker Postgres container is running.",
    );
  }

  const stat = await fs.stat(filePath);
  const pruned = await pruneOldBackups();

  return {
    fileName,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
    method,
    pruned,
  };
}

export async function listDatabaseBackups() {
  await ensureBackupDir();
  const entries = await fs.readdir(env.backupDir);
  const files = [];

  for (const name of entries) {
    if (!name.startsWith("kitchenos-") || !name.endsWith(".sql")) continue;
    const full = path.join(env.backupDir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile()) continue;
    files.push({
      fileName: name,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
    });
  }

  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return files;
}

/** True when no backup exists within the configured interval. */
export async function shouldRunAutomaticBackup() {
  const files = await listDatabaseBackups();
  if (files.length === 0) return true;
  const latest = new Date(files[0]!.createdAt).getTime();
  const intervalMs = Math.max(1, env.backupIntervalHours) * 60 * 60 * 1000;
  return Date.now() - latest >= intervalMs;
}
