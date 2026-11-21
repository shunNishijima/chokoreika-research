// DB 接続。DATABASE_URL があれば PostgreSQL（Cloud SQL）、なければ PGlite（手元・テスト用）。
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export async function createDb(opts: { url?: string; dataDir?: string; memory?: boolean }): Promise<{ db: Db; close: () => Promise<void> }> {
  if (opts.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: opts.url, max: 5 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    return { db, close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(opts.memory ? undefined : opts.dataDir ?? ".data/pglite");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  // PGlite と node-postgres の drizzle は同じ問い合わせ API を持つため、型を揃えて扱う
  return { db: db as unknown as Db, close: () => client.close() };
}
