/** Tiny key/value helpers over the `meta` table (acks, last-synced, etc.). */
import { inArray } from "drizzle-orm";
import { db } from "./db";
import { meta } from "./schema";

export async function getMeta(keys: string[]): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(meta).where(inArray(meta.key, keys));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db
    .insert(meta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: meta.key, set: { value, updatedAt: new Date() } });
}
