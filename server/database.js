/* server/database.js — Relational SQLite & JSON persistence layer */
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const jsonFile = path.join(dataDir, "portal-data.json");
const sqliteFile = path.join(dataDir, "portal.sqlite");

let sqliteDb = null;
let mongoClient = null;
let mongoDb = null;
const MONGO_COLLECTIONS = new Set(["students", "companies", "companyRequests", "internships", "applications", "shortlists", "interviews", "assessments", "assessmentSessions", "assessmentSubmissions", "supportMessages", "passwordResetRequests", "practiceAreas", "audit"]);

try {
  const { DatabaseSync } = require("node:sqlite");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  sqliteDb = new DatabaseSync(sqliteFile);
  sqliteDb.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  initSqliteSchema(sqliteDb);
  console.log("✓ SQLite database initialized at server/data/portal.sqlite");
} catch (e) {
  console.log("ℹ SQLite mode not enabled or flag missing; fallback to JSON storage.");
}

function initSqliteSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      salt TEXT,
      hash TEXT,
      profile TEXT,
      profileVisible INTEGER,
      cvShared INTEGER,
      cvPdf TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      contact TEXT,
      industry TEXT,
      location TEXT,
      website TEXT,
      about TEXT,
      status TEXT,
      salt TEXT,
      hash TEXT,
      approvedAt TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS company_requests (
      id TEXT PRIMARY KEY,
      name TEXT,
      contact TEXT,
      email TEXT,
      industry TEXT,
      location TEXT,
      website TEXT,
      about TEXT,
      status TEXT,
      salt TEXT,
      hash TEXT,
      requestedAt TEXT,
      reviewedAt TEXT,
      reviewedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS internships (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      title TEXT,
      postingType TEXT,
      employmentType TEXT,
      location TEXT,
      duration TEXT,
      durationMonths INTEGER,
      locationType TEXT,
      sector TEXT,
      stipend TEXT,
      salary TEXT,
      positions INTEGER,
      deadline TEXT,
      description TEXT,
      responsibilities TEXT,
      eligibility TEXT,
      skills TEXT,
      status TEXT,
      adminReviewNote TEXT,
      reviewedAt TEXT,
      reviewedBy TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      studentId TEXT,
      companyId TEXT,
      internshipId TEXT,
      internshipTitle TEXT,
      companyName TEXT,
      status TEXT,
      appliedAt TEXT,
      history TEXT
    );

    CREATE TABLE IF NOT EXISTS shortlists (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      studentId TEXT,
      note TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      studentId TEXT,
      applicationId TEXT,
      internshipTitle TEXT,
      studentName TEXT,
      type TEXT,
      date TEXT,
      time TEXT,
      mode TEXT,
      details TEXT,
      feedback TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      studentId TEXT,
      subject TEXT,
      category TEXT,
      message TEXT,
      senderRole TEXT,
      status TEXT,
      reply TEXT,
      createdAt TEXT,
      repliedAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id TEXT PRIMARY KEY,
      accountId TEXT,
      role TEXT,
      email TEXT,
      status TEXT,
      requestedAt TEXT,
      resolvedAt TEXT,
      resolvedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actorRole TEXT,
      actorEmail TEXT,
      action TEXT,
      targetId TEXT,
      at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      tokenHash TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      accountId TEXT NOT NULL,
      email TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expiresAt);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_account ON auth_sessions(accountId);
  `);
}

function putSession(tokenHash, session) {
  if (!sqliteDb) return false;
  try {
    sqliteDb.prepare(`INSERT OR REPLACE INTO auth_sessions (tokenHash, role, accountId, email, expiresAt) VALUES (?, ?, ?, ?, ?)`)
      .run(tokenHash, session.role, session.id, session.email, session.expiresAt);
    return true;
  } catch (err) { console.error("[SQLite session save error]:", err.message); return false; }
}

function getSession(tokenHash) {
  if (!sqliteDb) return null;
  try {
    const row = sqliteDb.prepare(`SELECT role, accountId AS id, email, expiresAt FROM auth_sessions WHERE tokenHash = ? AND expiresAt > ?`).get(tokenHash, Date.now());
    return row || null;
  } catch (err) { console.error("[SQLite session read error]:", err.message); return null; }
}

function deleteSession(tokenHash) {
  if (!sqliteDb) return false;
  try { sqliteDb.prepare(`DELETE FROM auth_sessions WHERE tokenHash = ?`).run(tokenHash); return true; }
  catch (err) { console.error("[SQLite session delete error]:", err.message); return false; }
}

function deleteSessionsForAccount(accountId) {
  if (!sqliteDb) return false;
  try { sqliteDb.prepare(`DELETE FROM auth_sessions WHERE accountId = ?`).run(accountId); return true; }
  catch (err) { console.error("[SQLite session revoke error]:", err.message); return false; }
}

function deleteExpiredSessions() {
  if (!sqliteDb) return;
  try { sqliteDb.prepare(`DELETE FROM auth_sessions WHERE expiresAt <= ?`).run(Date.now()); }
  catch (err) { console.error("[SQLite session cleanup error]:", err.message); }
}

function syncCollectionToSqlite(name, items) {
  if (!sqliteDb || !Array.isArray(items)) return;
  try {
    sqliteDb.exec("BEGIN IMMEDIATE");
    if (name === "students") {
      sqliteDb.exec("DELETE FROM students");
      const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO students VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const s of items) {
        stmt.run(s.id, s.name, s.email, s.salt || null, s.hash || null, JSON.stringify(s.profile || {}), s.profileVisible ? 1 : 0, s.cvShared ? 1 : 0, s.cvPdf ? JSON.stringify(s.cvPdf) : null, s.createdAt || null, s.consentUpdatedAt || null);
      }
    } else if (name === "companies") {
      sqliteDb.exec("DELETE FROM companies");
      const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO companies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const c of items) {
        stmt.run(c.id, c.name, c.email, c.contact || null, c.industry || null, c.location || null, c.website || null, c.about || null, c.status, c.salt || null, c.hash || null, c.approvedAt || null, c.createdAt || null);
      }
    } else if (name === "companyRequests") {
      sqliteDb.exec("DELETE FROM company_requests");
      const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO company_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of items) {
        stmt.run(r.id, r.name, r.contact || null, r.email, r.industry || null, r.location || null, r.website || null, r.about || null, r.status, r.salt || null, r.hash || null, r.requestedAt || null, r.reviewedAt || null, r.reviewedBy || null);
      }
    } else if (name === "internships") {
      sqliteDb.exec("DELETE FROM internships");
      const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO internships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const i of items) {
        stmt.run(i.id, i.companyId || null, i.title, i.postingType || "Internship", i.employmentType || null, i.location || null, i.duration || null, i.durationMonths || 0, i.locationType || null, i.sector || null, i.stipend || null, i.salary || null, i.positions || 1, i.deadline || null, i.description || null, i.responsibilities || null, i.eligibility || null, JSON.stringify(i.skills || []), i.status, i.adminReviewNote || null, i.reviewedAt || null, i.reviewedBy || null, i.createdAt || null);
      }
    } else if (name === "applications") {
      sqliteDb.exec("DELETE FROM applications");
      const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const a of items) {
        stmt.run(a.id, a.studentId, a.companyId || null, a.internshipId, a.internshipTitle || null, a.companyName || null, a.status, a.appliedAt, JSON.stringify(a.history || []));
      }
    } else if (name === "interviews") {
      sqliteDb.exec("DELETE FROM interviews");
      const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO interviews VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const inv of items) {
        stmt.run(inv.id, inv.companyId || null, inv.studentId || null, inv.applicationId || null, inv.internshipTitle || null, inv.studentName || null, inv.type || "Interview", inv.date || null, inv.time || null, inv.mode || "Online", inv.details || null, inv.feedback ? JSON.stringify(inv.feedback) : null, inv.createdAt || null);
      }
    }
    sqliteDb.exec("COMMIT");
  } catch (err) {
    try { sqliteDb.exec("ROLLBACK"); } catch (_) {}
    console.error(`[SQLite sync error for ${name}]:`, err.message);
  }
}

function recordAuditToSqlite(entry) {
  if (!sqliteDb) return;
  try {
    const stmt = sqliteDb.prepare(`INSERT INTO audit_logs (actorRole, actorEmail, action, targetId, at) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(entry.actorRole || "system", entry.actorEmail || "system", entry.action || "", entry.targetId || null, entry.at || new Date().toISOString());
  } catch (err) {
    console.error("[SQLite audit insert error]:", err.message);
  }
}

async function connectMongo() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) return false;
  let MongoClient;
  try { ({ MongoClient } = require("mongodb")); }
  catch (_) { throw new Error("MongoDB is configured but the Node driver is missing. Run npm install in the server folder."); }
  mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 20 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(process.env.MONGODB_DB || undefined);
  await mongoDb.collection("portal_students").createIndex({ "payload.email": 1 }, { unique: true, sparse: true });
  await mongoDb.collection("portal_companies").createIndex({ "payload.email": 1 }, { unique: true, sparse: true });
  await mongoDb.collection("portal_companyRequests").createIndex({ "payload.email": 1 }, { unique: true, partialFilterExpression: { "payload.status": "Pending" } });
  await mongoDb.collection("portal_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await mongoDb.collection("portal_sessions").createIndex({ accountId: 1 });
  console.log(`✓ MongoDB connected${process.env.MONGODB_DB ? ` (${process.env.MONGODB_DB})` : ""}`);
  return true;
}

async function loadMongoCollection(name) {
  if (!mongoDb || !MONGO_COLLECTIONS.has(name)) return null;
  const docs = await mongoDb.collection(`portal_${name}`).find({}, { projection: { payload: 1 } }).toArray();
  return docs.map((doc) => doc.payload).filter((item) => item && typeof item === "object");
}

async function syncMongoCollection(name, previous, items) {
  if (!mongoDb || !MONGO_COLLECTIONS.has(name) || !Array.isArray(items)) return;
  const collection = mongoDb.collection(`portal_${name}`);
  const before = new Map((previous || []).filter((item) => item?.id).map((item) => [String(item.id), JSON.stringify(item)]));
  const after = new Map(items.filter((item) => item?.id).map((item) => [String(item.id), item]));
  const operations = [];
  for (const [id, item] of after) {
    if (before.get(id) !== JSON.stringify(item)) operations.push({ replaceOne: { filter: { _id: id }, replacement: { _id: id, payload: item }, upsert: true } });
  }
  for (const id of before.keys()) if (!after.has(id)) operations.push({ deleteOne: { filter: { _id: id } } });
  if (operations.length) await collection.bulkWrite(operations, { ordered: false });
}

async function appendMongoAudit(entry) {
  if (!mongoDb) return;
  await mongoDb.collection("portal_audit_events").insertOne({ ...entry, at: entry.at || new Date().toISOString() });
}

async function isMongoInitialized() {
  if (!mongoDb) return false;
  return !!(await mongoDb.collection("portal_meta").findOne({ _id: "portal_initialized" }));
}
async function markMongoInitialized() {
  if (mongoDb) await mongoDb.collection("portal_meta").updateOne({ _id: "portal_initialized" }, { $set: { initializedAt: new Date().toISOString(), schemaVersion: 1 } }, { upsert: true });
}

function mongoSessionStore() {
  if (!mongoDb) return null;
  const sessions = mongoDb.collection("portal_sessions");
  return {
    async put(tokenHash, session) { await sessions.updateOne({ _id: tokenHash }, { $set: { ...session, accountId: session.id, expiresAt: new Date(session.expiresAt), expiresAtMs: session.expiresAt } }, { upsert: true }); },
    async get(tokenHash) {
      const item = await sessions.findOne({ _id: tokenHash, expiresAtMs: { $gt: Date.now() } });
      return item ? { role: item.role, id: item.accountId, email: item.email, expiresAt: item.expiresAtMs } : null;
    },
    async delete(tokenHash) { await sessions.deleteOne({ _id: tokenHash }); },
    async deleteForAccount(accountId) { await sessions.deleteMany({ accountId }); },
    async prune() { await sessions.deleteMany({ expiresAtMs: { $lte: Date.now() } }); }
  };
}

async function closeDatabase() {
  if (mongoClient) await mongoClient.close();
  if (sqliteDb) { try { sqliteDb.close(); } catch (_) {} }
}

module.exports = {
  connectMongo,
  loadMongoCollection,
  syncMongoCollection,
  appendMongoAudit,
  isMongoInitialized,
  markMongoInitialized,
  mongoSessionStore,
  closeDatabase,
  isMongoAvailable: () => !!mongoDb,
  isSqliteAvailable: () => !!sqliteDb,
  getSqliteDb: () => sqliteDb,
  syncCollectionToSqlite,
  recordAuditToSqlite,
  putSession,
  getSession,
  deleteSession,
  deleteSessionsForAccount,
  deleteExpiredSessions
};
