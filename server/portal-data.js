/* Small persistent store for the local InternMatch portal demo. */
const fs = require("fs");
const path = require("path");
let database = null;
try {
  database = require("./database");
} catch (_) {}

const directory = path.join(__dirname, "data");
const filename = path.join(directory, "portal-data.json");
let state = { companies: [], companyRequests: [], students: [], internships: [], applications: [], shortlists: [], interviews: [], assessments: [], assessmentSessions: [], assessmentSubmissions: [], supportMessages: [], passwordResetRequests: [], audit: [] };

try {
  if (fs.existsSync(filename)) {
    state = { ...state, ...JSON.parse(fs.readFileSync(filename, "utf8")) };
    if (database && database.isSqliteAvailable()) {
      for (const col of ["students", "companies", "companyRequests", "internships", "applications"]) {
        database.syncCollectionToSqlite(col, state[col]);
      }
    }
  }
} catch (error) {
  console.error("Could not load company portal data:", error.message);
}

function save() {
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

function collection(name) { return state[name]; }
function update(name, transform) {
  state[name] = transform(state[name]);
  save();
  if (database && database.isSqliteAvailable()) {
    database.syncCollectionToSqlite(name, state[name]);
  }
  return state[name];
}
function addAudit(entry) {
  const record = { ...entry, at: new Date().toISOString() };
  state.audit.unshift(record);
  state.audit = state.audit.slice(0, 2000);
  save();
  if (database && database.isSqliteAvailable()) {
    database.recordAuditToSqlite(record);
  }
}

module.exports = { collection, update, addAudit, isSqlite: () => (database ? database.isSqliteAvailable() : false) };
