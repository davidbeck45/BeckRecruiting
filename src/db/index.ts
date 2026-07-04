import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = readFileSync(join(here, "schema.sql"), "utf-8");
db.exec(schema);

export function nowIso(): string {
  return new Date().toISOString();
}
