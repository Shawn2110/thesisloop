import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const setups = sqliteTable("setups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  setup: text("setup").notNull(),
  source: text("source").notNull(),
  thesis: text("thesis").notNull(),
  plannedRisk: real("planned_risk").notNull(),
  createdAt: text("created_at").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  returnPct: real("return_pct"),
  followedPlan: integer("followed_plan", { mode: "boolean" }),
  outcomeNote: text("outcome_note"),
}, (table) => [
  index("idx_setups_status_created_at").on(table.status, table.createdAt),
  index("idx_setups_source").on(table.source),
]);
