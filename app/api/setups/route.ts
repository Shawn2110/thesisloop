import { desc } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { setups } from "../../../db/schema";

type SetupInput = {
  symbol?: string;
  setup?: string;
  source?: string;
  thesis?: string;
  plannedRisk?: number;
  createdAt?: string;
  status?: "open" | "closed";
  returnPct?: number;
  followedPlan?: boolean;
  outcomeNote?: string;
};

function validate(input: SetupInput) {
  const symbol = input.symbol?.trim().toUpperCase();
  const setup = input.setup?.trim();
  const source = input.source?.trim();
  const thesis = input.thesis?.trim();
  const plannedRisk = Number(input.plannedRisk);
  const createdAt = input.createdAt?.trim();
  const status = input.status === "closed" ? "closed" : "open";

  if (!symbol || !setup || !source || !thesis || !createdAt || !Number.isFinite(plannedRisk) || plannedRisk <= 0) {
    throw new Error("Each record needs a symbol, setup, source, thesis, date and positive planned risk.");
  }
  if (status === "closed" && !Number.isFinite(Number(input.returnPct))) {
    throw new Error("Closed records need a numeric return.");
  }

  return {
    symbol,
    setup,
    source,
    thesis,
    plannedRisk,
    createdAt,
    status,
    returnPct: status === "closed" ? Number(input.returnPct) : null,
    followedPlan: status === "closed" ? Boolean(input.followedPlan) : null,
    outcomeNote: status === "closed" ? input.outcomeNote?.trim() || null : null,
  };
}

export async function GET() {
  try {
    await ensureDatabase();
    const rows = await getDb().select().from(setups).orderBy(desc(setups.createdAt), desc(setups.id));
    return Response.json({ setups: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load setups." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = await request.json() as SetupInput | SetupInput[];
    const values = (Array.isArray(payload) ? payload : [payload]).map(validate);
    if (!values.length || values.length > 500) return Response.json({ error: "Import between 1 and 500 records." }, { status: 400 });
    const rows = await getDb().insert(setups).values(values).returning();
    return Response.json({ setups: rows }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save setups.";
    return Response.json({ error: message }, { status: message.startsWith("Each") || message.startsWith("Closed") ? 400 : 500 });
  }
}
