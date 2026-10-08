import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The project root is two levels up from server/src (server → repo root).
const rootDir = path.resolve(__dirname, "../..");
const migrationsDir = path.join(rootDir, "database/migrations");

const db = new pg.Client({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "postgres",
  database: process.env.PG_DATABASE || "smartagri_db",
  connectionString: process.env.DATABASE_URL || undefined,
});

const getApplied = async () => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name      text NOT NULL UNIQUE,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  const { rows } = await db.query("SELECT name FROM schema_migrations");
  return new Set(rows.map((r) => r.name));
};

const run = async () => {
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (!files.length) {
    console.log("No migration files found.");
    await db.end();
    return;
  }

  await db.connect();
  const applied = await getApplied();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✔ already applied  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`▶ applying         ${file}`);
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await db.query("COMMIT");
      ran += 1;
    } catch (error) {
      await db.query("ROLLBACK");
      console.error(`✖ failed           ${file}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  if (ran === 0) console.log("Database is up to date.");
  else console.log(`Applied ${ran} migration${ran === 1 ? "" : "s"}.`);
  await db.end();
};

run().catch((err) => {
  console.error("Migration runner failed:", err.message);
  process.exit(1);
});
