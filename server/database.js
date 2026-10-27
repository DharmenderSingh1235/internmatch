/* server/database.js — Relational SQLite & JSON persistence layer */
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const jsonFile = path.join(dataDir, "portal-data.json");
const sqliteFile = path.join(dataDir, "portal.sqlite");

let sqliteDb = null;

try {
  const { DatabaseSync } = require("node:sqlite");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  sqliteDb = new DatabaseSync(sqliteFile);
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
  `);
}

function syncCollectionToSqlite(name, items) {
  if (!sqliteDb || !Array.isArray(items)) return;
  try {
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
  } catch (err) {
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

module.exports = {
  isSqliteAvailable: () => !!sqliteDb,
  getSqliteDb: () => sqliteDb,
  syncCollectionToSqlite,
  recordAuditToSqlite
};
