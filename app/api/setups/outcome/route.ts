import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { setups } from "../../../../db/schema";

export async function PATCH(request: Request) {
  try {
    await ensureDatabase();
    const payload = await request.json() as { id?: number; returnPct?: number; followedPlan?: boolean; outcomeNote?: string };
    const id = Number(payload.id);
    const returnPct = Number(payload.returnPct);
    const outcomeNote = payload.outcomeNote?.trim();
    if (!Number.isInteger(id) || !Number.isFinite(returnPct) || !outcomeNote || typeof payload.followedPlan !== "boolean") {
      return Response.json({ error: "An outcome needs a valid record, return, plan status and note." }, { status: 400 });
    }
    const [updated] = await getDb().update(setups).set({ status: "closed", returnPct, followedPlan: payload.followedPlan, outcomeNote }).where(eq(setups.id, id)).returning();
    if (!updated) return Response.json({ error: "Setup not found." }, { status: 404 });
    return Response.json({ setup: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save the outcome." }, { status: 500 });
  }
}
