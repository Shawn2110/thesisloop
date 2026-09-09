import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

const seedRows = [
  ["PLTR", "Breakout", "Momentum leaders", "Volume expansion above the 3 week base while RS remained above 90.", 2.1, "2026-09-04", "open", null, null, null],
  ["NVDA", "Pullback", "RS leaders", "First pullback to the 21 day average after a strong earnings move.", 1.8, "2026-09-06", "open", null, null, null],
  ["CRWD", "Earnings gap", "Gap and hold", "Gap held above the opening range with volume staying above average.", 2.4, "2026-08-31", "open", null, null, null],
  ["META", "Tight base", "RS leaders", "Three tight closes near the high with improving relative strength.", 1.7, "2026-08-18", "closed", 8.2, 1, "Waited for the planned trigger and raised the stop only after confirmation."],
  ["TSLA", "Gap continuation", "Premarket scan", "Large premarket move with enough liquidity to continue after the open.", 2.5, "2026-08-22", "closed", -2.1, 0, "Entered before the opening range was complete."],
  ["ARM", "IPO base", "Momentum leaders", "Base formed above the 50 day average with volume drying up near the pivot.", 2.0, "2026-08-11", "closed", 11.4, 1, "The original trigger and stop were both followed."],
  ["MSFT", "Pullback", "Earnings growth", "Controlled pullback after earnings with support near the prior breakout.", 1.6, "2026-08-05", "closed", 3.1, 1, "Smaller move than expected, but the setup behaved as planned."],
  ["AMD", "Breakout", "Momentum leaders", "Price cleared a six week range but volume was only slightly above average.", 2.2, "2026-07-28", "closed", -1.2, 1, "Stopped out according to plan. The weak volume was the warning."],
] as const;

let initialization: Promise<void> | null = null;

export function getDb() {
  if (!env.DB) throw new Error("The ThesisLoop database is unavailable.");
  return drizzle(env.DB, { schema });
}

export async function ensureDatabase() {
  if (!initialization) initialization = initializeDatabase();
  return initialization;
}

export async function resetDatabase() {
  if (!env.DB) throw new Error("The ThesisLoop database is unavailable.");
  await ensureSchema();
  await env.DB.prepare("DELETE FROM setups").run();
  await insertSeedRows();
}

async function initializeDatabase() {
  await ensureSchema();
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM setups").first<{ count: number }>();
  if (!count?.count) await insertSeedRows();
}

async function ensureSchema() {
  if (!env.DB) throw new Error("The ThesisLoop database is unavailable.");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS setups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      setup TEXT NOT NULL,
      source TEXT NOT NULL,
      thesis TEXT NOT NULL,
      planned_risk REAL NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      return_pct REAL,
      followed_plan INTEGER,
      outcome_note TEXT
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_setups_status_created_at ON setups(status, created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_setups_source ON setups(source)"),
  ]);
}

async function insertSeedRows() {
  const sql = `INSERT INTO setups
    (symbol, setup, source, thesis, planned_risk, created_at, status, return_pct, followed_plan, outcome_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await env.DB.batch(seedRows.map((row) => env.DB.prepare(sql).bind(...row)));
}
