/**
 * Neon serverless Postgres via Drizzle (neon-http).
 *
 * Reads `DATABASE_URL` (a Neon Postgres connection string). Construction is cheap
 * and lazy — neon-http only opens an HTTP connection when a query actually runs —
 * so a missing/placeholder URL won't crash module load at build time. All pages
 * are `force-dynamic` and the data layer catches errors, so the build never needs
 * a live database; runtime does (set DATABASE_URL in Vercel + Actions secrets).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Syntactically-valid placeholder keeps construction from throwing when the env
// var is absent at build time. Any real query will fail loudly without a real URL.
const url =
  process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/capitol_gains";

const sql = neon(url);
export const db = drizzle(sql, { schema });
export { schema };
