/**
 * The v2 control panel — single-row `config` table (id=1). This is the live,
 * dashboard-toggled source of truth for the autonomous brain: kill switch,
 * paper/live, hard caps, drawdown halt, freshness, and the CCS tunables.
 *
 * Defaults here mirror the "Defaults to ship with" spec. A missing row resolves
 * to these defaults (never throws), so the app is safe before first write.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { config } from "./schema";

export type RunConfig = typeof config.$inferSelect;

export const defaultRunConfig: Omit<RunConfig, "id" | "updatedAt"> = {
  killSwitch: false,
  paperMode: true, // safe default — live is flipped manually
  maxPerPosition: 100,
  maxPerDay: 200,
  maxOpenPositions: 10,
  drawdownHaltPct: 15,
  freshnessCutoffDays: 21,
  cooldownDays: 30,
  cronCadence: "daily",
  lookbackDays: 45,
  wCong: 1,
  wIns: 1,
  kConverge: 1.5,
  minDollarVolume: 5_000_000,
};

/** Resolve the live control-panel config; defaults if the row/table is absent. */
export async function getRunConfig(): Promise<RunConfig> {
  try {
    const rows = await db.select().from(config).where(eq(config.id, 1)).limit(1);
    if (rows.length > 0) return rows[0];
  } catch {
    /* table not migrated yet — fall through to defaults */
  }
  return { id: 1, ...defaultRunConfig, updatedAt: new Date() };
}

/** Upsert a partial patch onto the single config row. */
export async function saveRunConfig(
  patch: Partial<Omit<RunConfig, "id" | "updatedAt">>,
): Promise<RunConfig> {
  const current = await getRunConfig();
  const next = { ...current, ...patch, id: 1, updatedAt: new Date() };
  await db
    .insert(config)
    .values(next)
    .onConflictDoUpdate({ target: config.id, set: { ...patch, updatedAt: new Date() } });
  return next;
}

export const accountFor = (cfg: Pick<RunConfig, "paperMode">) =>
  cfg.paperMode ? "paper" : "live";
