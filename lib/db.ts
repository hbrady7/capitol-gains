/** Local SQLite via Drizzle + libSQL. No external database — a plain file. */
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/local.db";

const globalForDb = globalThis as unknown as { __cgClient?: Client };
const client = globalForDb.__cgClient ?? createClient({ url });
if (process.env.NODE_ENV !== "production") globalForDb.__cgClient = client;

export const db = drizzle(client, { schema });
export { schema };
