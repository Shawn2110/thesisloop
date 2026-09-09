import { desc } from "drizzle-orm";
import { ensureDatabase, getDb, resetDatabase } from "../../../../db";
import { setups } from "../../../../db/schema";

export async function POST() {
  try {
    await resetDatabase();
    await ensureDatabase();
    const rows = await getDb().select().from(setups).orderBy(desc(setups.createdAt), desc(setups.id));
    return Response.json({ setups: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to restore demo data." }, { status: 500 });
  }
}
