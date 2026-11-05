/* Synchronous in-process view of portal data with durable JSON, SQLite, or MongoDB backing. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const database = require("./database");

const directory = path.join(__dirname, "data");
const filename = path.join(directory, "portal-data.json");
const collectionNames = ["companies", "companyRequests", "students", "internships", "applications", "shortlists", "interviews", "assessments", "assessmentSessions", "assessmentSubmissions", "assessmentObserverInvites", "supportMessages", "passwordResetRequests", "practiceAreas", "audit"];
let state = Object.fromEntries(collectionNames.map((name) => [name, []]));
const mongoWriteQueue = [];
let mongoDrain = null;
let lastMongoError = null;
let persistenceMode = "json";

try {
  if (fs.existsSync(filename)) state = { ...state, ...JSON.parse(fs.readFileSync(filename, "utf8")) };
} catch (error) { console.error("Could not load company portal data:", error.message); }
state.audit = (state.audit || []).map((entry) => entry.id ? entry : { ...entry, id: `audit-${crypto.randomUUID()}` });

function saveJson() {
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

const ready = (async () => {
  if (process.env.MONGODB_URI) {
    try {
      await database.connectMongo();
      const initialized = await database.isMongoInitialized();
      if (initialized) {
        for (const name of collectionNames) state[name] = (await database.loadMongoCollection(name)) || [];
      } else {
        for (const name of collectionNames) {
          const previous = [];
          await database.syncMongoCollection(name, previous, state[name] || []);
        }
        await database.markMongoInitialized();
        console.log("✓ Existing local portal records migrated to MongoDB (first configured run)");
      }
      persistenceMode = "mongodb";
      return;
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
      persistenceMode = database.isSqliteAvailable() ? "sqlite-json" : "json";
      if (database.isSqliteAvailable()) {
        for (const name of ["students", "companies", "companyRequests", "internships", "applications"]) database.syncCollectionToSqlite(name, state[name] || []);
      }
      console.warn(`⚠ MongoDB unavailable (${error.message}). Local development is using ${persistenceMode} storage; these writes will not sync to Atlas.`);
    }
    return;
  }
  if (database.isSqliteAvailable()) {
    for (const name of ["students", "companies", "companyRequests", "internships", "applications"]) database.syncCollectionToSqlite(name, state[name] || []);
    persistenceMode = "sqlite-json";
  } else persistenceMode = "json";
})();

function collection(name) { return state[name] || []; }
function drainMongoQueue() {
  if (!mongoDrain) mongoDrain = (async () => {
    while (mongoWriteQueue.length) {
      await mongoWriteQueue[0]();
      mongoWriteQueue.shift();
      lastMongoError = null;
    }
  })().catch((error) => {
    lastMongoError = error;
    console.error("[MongoDB persistence error]:", error.message);
  }).finally(() => { mongoDrain = null; });
  return mongoDrain;
}
function enqueueMongoWrite(task) {
  mongoWriteQueue.push(task);
  void drainMongoQueue();
}
function update(name, transform) {
  const previous = state[name] || [];
  const next = transform(previous);
  state[name] = next;
  if (persistenceMode === "mongodb") enqueueMongoWrite(() => database.syncMongoCollection(name, previous, next));
  else {
    saveJson();
    if (database.isSqliteAvailable()) database.syncCollectionToSqlite(name, state[name]);
  }
  return state[name];
}
function addAudit(entry) {
  const previous = (state.audit || []).slice();
  const record = { ...entry, id: `audit-${crypto.randomUUID()}`, at: new Date().toISOString() };
  const next = [record, ...previous].slice(0, 2000);
  state.audit = next;
  if (persistenceMode === "mongodb") enqueueMongoWrite(() => database.syncMongoCollection("audit", previous, next));
  else {
    saveJson();
    if (database.isSqliteAvailable()) database.recordAuditToSqlite(record);
  }
}
async function flush() {
  await drainMongoQueue();
  if (lastMongoError) throw lastMongoError;
}

const mongoSessions = {
  put: (...args) => database.mongoSessionStore()?.put(...args),
  get: (...args) => database.mongoSessionStore()?.get(...args),
  delete: (...args) => database.mongoSessionStore()?.delete(...args),
  deleteForAccount: (...args) => database.mongoSessionStore()?.deleteForAccount(...args),
  prune: (...args) => database.mongoSessionStore()?.prune(...args)
};
const sqliteSessions = database.isSqliteAvailable() ? {
  put: database.putSession, get: database.getSession, delete: database.deleteSession,
  deleteForAccount: database.deleteSessionsForAccount, prune: database.deleteExpiredSessions
} : null;
const sessionStore = process.env.MONGODB_URI || sqliteSessions ? {
  put: (...args) => (persistenceMode === "mongodb" ? mongoSessions : sqliteSessions)?.put(...args),
  get: (...args) => (persistenceMode === "mongodb" ? mongoSessions : sqliteSessions)?.get(...args),
  delete: (...args) => (persistenceMode === "mongodb" ? mongoSessions : sqliteSessions)?.delete(...args),
  deleteForAccount: (...args) => (persistenceMode === "mongodb" ? mongoSessions : sqliteSessions)?.deleteForAccount(...args),
  prune: (...args) => (persistenceMode === "mongodb" ? mongoSessions : sqliteSessions)?.prune(...args)
} : null;

module.exports = {
  ready,
  flush,
  collection,
  update,
  addAudit,
  isSqlite: () => persistenceMode === "sqlite-json",
  storageMode: () => persistenceMode,
  sessionStore,
  close: database.closeDatabase
};
