// ─── Schema parity check ─────────────────────────────────────────
// Verifies database/schema.sql (the fresh-install schema) stays in sync
// with the incremental migrations in database/migrations/. A brand-new
// database built from schema.sql must end up identical to one that was
// migrated step by step, so every table / column / CHECK value / index
// introduced by a migration must also exist in schema.sql.
//
// Usage:  node database/check-schema-parity.mjs
//         npm run check:schema
// Exits 0 when in sync, 1 listing every drift it found.
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaPath = join(root, "database", "schema.sql");
const migrationsDir = join(root, "database", "migrations");

const schema = readFileSync(schemaPath, "utf8");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ file: f, sql: readFileSync(join(migrationsDir, f), "utf8") }));

if (!migrations.length) {
  console.error("No migration files found — nothing to compare against.");
  process.exit(1);
}

const problems = [];
const report = (file, msg) => problems.push(`  [${file}] ${msg}`);

// ── SQL helpers (regex literals only — no escape gymnastics) ──────

// name → CREATE TABLE body, parsed in one pass.
function tablesAndBlocks(sql) {
  const map = new Map();
  const re = /\bCREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(sql)) !== null) map.set(m[1], m[2]);
  return map;
}

// Column names declared inside a CREATE TABLE body.
function blockColumns(block) {
  const re = /^\s*(\w+)\s+(?:uuid|text|integer|numeric|boolean|timestamptz|date|jsonb|varchar)\b/gm;
  return [...block.matchAll(re)].map((m) => m[1]);
}

// (table, column) pairs from ALTER TABLE … ADD COLUMN IF NOT EXISTS.
function addedColumns(sql) {
  const re = /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)/g;
  return [...sql.matchAll(re)].map((m) => [m[1], m[2]]);
}

// table → column → allowed values from every `CHECK (col IN (…))`,
// resolving the table from the nearest CREATE TABLE / ALTER TABLE before it.
function checkValueSets(sql) {
  const anchors = [];
  const anchorRe = /\bCREATE TABLE IF NOT EXISTS\s+(\w+)|ALTER TABLE\s+(\w+)/g;
  let a;
  while ((a = anchorRe.exec(sql)) !== null) anchors.push({ at: a.index, table: a[1] || a[2] });

  const sets = new Map();
  const re = /CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const col = m[1];
    let table = null;
    for (const entry of anchors) {
      if (entry.at < m.index) table = entry.table;
      else break;
    }
    if (!table) continue;
    const values = new Set([...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1]));
    if (!sets.has(table)) sets.set(table, new Map());
    const byCol = sets.get(table);
    if (!byCol.has(col)) byCol.set(col, new Set());
    values.forEach((v) => byCol.get(col).add(v));
  }
  return sets;
}

// Every CREATE INDEX / CREATE UNIQUE INDEX name.
function indexNames(sql) {
  const re = /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+(\w+)/g;
  return [...sql.matchAll(re)].map((m) => m[1]);
}

// ── Compare ──────────────────────────────────────────────────────
const schemaBlocks = tablesAndBlocks(schema);
const schemaTables = new Set(schemaBlocks.keys());
const schemaIndexes = new Set(indexNames(schema));
const schemaChecks = checkValueSets(schema);

for (const { file, sql } of migrations) {
  const migBlocks = tablesAndBlocks(sql);

  // Tables
  for (const table of migBlocks.keys()) {
    if (!schemaTables.has(table)) report(file, `missing table in schema.sql: ${table}`);
  }

  // Columns (CREATE TABLE bodies + ALTER TABLE ADD COLUMN)
  for (const [table, block] of migBlocks) {
    const schemaCols = new Set(blockColumns(schemaBlocks.get(table) || ""));
    for (const col of blockColumns(block)) {
      if (!schemaCols.has(col)) report(file, `missing column ${table}.${col} in schema.sql`);
    }
  }
  for (const [table, col] of addedColumns(sql)) {
    const schemaCols = new Set(blockColumns(schemaBlocks.get(table) || ""));
    if (!schemaCols.has(col)) report(file, `missing column ${table}.${col} in schema.sql`);
  }

  // CHECK (… IN …) allowed values — schema must allow at least everything
  // migrations allow for the same table + column.
  for (const [table, byCol] of checkValueSets(sql)) {
    const schemaByCol = schemaChecks.get(table) || new Map();
    for (const [col, values] of byCol) {
      const schemaValues = schemaByCol.get(col) || new Set();
      const missing = [...values].filter((v) => !schemaValues.has(v));
      if (missing.length) {
        report(file, `schema.sql CHECK for ${table}.${col} is missing value${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
      }
    }
  }

  // Indexes
  for (const index of indexNames(sql)) {
    if (!schemaIndexes.has(index)) report(file, `missing index in schema.sql: ${index}`);
  }
}

// ── Result ───────────────────────────────────────────────────────
if (problems.length) {
  console.error(`✖ Schema drift detected (schema.sql vs ${migrations.length} migrations):`);
  problems.forEach((p) => console.error(p));
  console.error("\nFix database/schema.sql to match the migrations, or migrate an existing DB.");
  process.exit(1);
}
console.log(`✓ database/schema.sql is in sync with ${migrations.length} migrations: ${migrations.map((m) => m.file).join(", ")}`);
