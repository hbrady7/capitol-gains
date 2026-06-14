import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso", // libSQL driver; works against a local file URL
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "file:./data/local.db" },
});
