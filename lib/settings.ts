/** Resolve the live config: strategy.config defaults merged with DB overrides. */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./schema";
import { defaultConfig, type StrategyConfig } from "../strategy.config";

/** Deep-merge persisted overrides on top of defaults (one resolved config). */
export async function getConfig(): Promise<StrategyConfig> {
  try {
    const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (rows.length === 0) return defaultConfig;
    const saved = rows[0].config as Partial<StrategyConfig>;
    return mergeConfig(defaultConfig, saved);
  } catch {
    // DB not migrated yet / unavailable — fall back to safe defaults.
    return defaultConfig;
  }
}

export async function saveConfig(patch: Partial<StrategyConfig>): Promise<StrategyConfig> {
  const current = await getConfig();
  const next = mergeConfig(current, patch);
  await db
    .insert(settings)
    .values({ id: 1, config: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.id, set: { config: next, updatedAt: new Date() } });
  return next;
}

export function mergeConfig(base: StrategyConfig, over: Partial<StrategyConfig>): StrategyConfig {
  return {
    ...base,
    ...over,
    sizing: { ...base.sizing, ...(over.sizing ?? {}) },
    caps: { ...base.caps, ...(over.caps ?? {}) },
    freshness: { ...base.freshness, ...(over.freshness ?? {}) },
    exits: { ...base.exits, ...(over.exits ?? {}) },
    source: { ...base.source, ...(over.source ?? {}) },
    membersToFollow: over.membersToFollow ?? base.membersToFollow,
  };
}
