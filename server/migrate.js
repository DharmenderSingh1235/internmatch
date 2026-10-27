/* server/migrate.js — Migrates portal-data.json to portal.sqlite and verifies */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "data");
const jsonFile = path.join(dataDir, "portal-data.json");
const sqliteFile = path.join(dataDir, "portal.sqlite");

console.log("=== InternMatch SQLite Migration Utility ===");
if (!fs.existsSync(jsonFile)) {
  console.error("No portal-data.json found at:", jsonFile);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
const database = require("./database");

if (!database.isSqliteAvailable()) {
  console.error("SQLite is not available. Run with: node --experimental-sqlite migrate.js");
  process.exit(1);
}

console.log("Migrating collections from JSON to SQLite...");
const collections = ["students", "companies", "companyRequests", "internships", "applications"];
for (const col of collections) {
  const count = (data[col] || []).length;
  database.syncCollectionToSqlite(col, data[col] || []);
  console.log(`  ✓ Migrated ${col}: ${count} records`);
}

const db = database.getSqliteDb();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log("\nVerified SQLite Tables created:");
tables.forEach((t) => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get().c;
  console.log(`  - ${t.name}: ${count} rows`);
});

console.log("\nMigration completed successfully. SQLite database is at server/data/portal.sqlite");
