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
let requestQueue = Promise.resolve();
let persistenceMode = "json";

try {
  if (fs.existsSync(filename)) state = { ...state, ...JSON.parse(fs.readFileSync(filename, "utf8")) };
} catch (error) { console.error("Could not load company portal data:", error.message); }
state.audit = (state.audit || []).map((entry) => entry.id ? entry : { ...entry, id: `audit-${crypto.randomUUID()}` });
state.assessmentSessions = (state.assessmentSessions || []).map((entry) => entry.id ? entry : {
  ...entry,
  id: `assessment-session-${crypto.createHash("sha256").update(`${entry.assessmentId || ""}:${entry.studentId || ""}`).digest("hex").slice(0, 32)}`
});

function saveJson() {
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

const ready = (async () => {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      database.connectSupabase();
      const initialized = await database.isSupabaseInitialized();
      if (initialized) {
        const cloudState = await database.loadSupabaseCollections(collectionNames);
        for (const name of collectionNames) state[name] = cloudState?.[name] || [];
      } else {
        for (const name of collectionNames) {
          await database.syncSupabaseCollection(name, [], state[name] || []);
        }
        await database.markSupabaseInitialized();
        console.log("✓ Existing local portal records migrated to Supabase Postgres (first configured run)");
      }
      persistenceMode = "supabase";
      return;
    } catch (error) {
      if (process.env.NODE_ENV === "production" || process.env.SUPABASE_REQUIRED === "true") throw error;
      persistenceMode = database.isSqliteAvailable() ? "sqlite-json" : "json";
      console.warn(`⚠ Supabase unavailable (${error.message}). Local development is using ${persistenceMode} storage.`);
      return;
    }
  }
  if (process.env.NODE_ENV === "production" && process.env.SUPABASE_REQUIRED === "true") {
    throw new Error("Supabase is required in production. Configure SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
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
      try {
        await mongoWriteQueue[0]();
      } catch (error) {
        if (persistenceMode === "supabase" && error?.code === "40001") mongoWriteQueue.shift();
        throw error;
      }
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
  else if (persistenceMode === "supabase") enqueueMongoWrite(() => database.syncSupabaseCollection(name, previous, next));
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
  else if (persistenceMode === "supabase") enqueueMongoWrite(() => database.syncSupabaseCollection("audit", previous, next));
  else {
    saveJson();
    if (database.isSqliteAvailable()) database.recordAuditToSqlite(record);
  }
}
async function flush() {
  await drainMongoQueue();
  if (lastMongoError) {
    const error = lastMongoError;
    lastMongoError = null;
    throw error;
  }
}

async function beginRequest() {
  if (persistenceMode !== "supabase") return () => {};
  let releaseTurn;
  const turn = new Promise((resolve) => { releaseTurn = resolve; });
  const previousTurn = requestQueue;
  requestQueue = previousTurn.then(() => turn);
  await previousTurn;
  try {
    await flush();
    const latest = await database.loadSupabaseCollections(collectionNames);
    for (const name of collectionNames) state[name] = latest?.[name] || [];
  } catch (error) {
    releaseTurn();
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseTurn();
  };
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

const durableSessionStore = process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  ? {
      put: (...args) => database.supabaseSessionStore()?.put(...args),
      get: (...args) => database.supabaseSessionStore()?.get(...args),
      delete: (...args) => database.supabaseSessionStore()?.delete(...args),
      deleteForAccount: (...args) => database.supabaseSessionStore()?.deleteForAccount(...args),
      prune: (...args) => database.supabaseSessionStore()?.prune(...args)
    }
  : null;

module.exports = {
  ready,
  flush,
  beginRequest,
  collection,
  update,
  addAudit,
  isSqlite: () => persistenceMode === "sqlite-json",
  storageMode: () => persistenceMode,
  sessionStore: durableSessionStore || sessionStore,
  close: database.closeDatabase
};
