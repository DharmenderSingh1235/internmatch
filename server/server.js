/* Server-side AI proxy for InternMatch. API keys stay in server/.env. */
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const INTERNSHIP_DATA = require(path.join(__dirname, "..", "data", "internships.js"));
const COMPANY_CANDIDATES = require("./company-data");
const portalData = require("./portal-data");
const PORT = process.env.PORT || 3002;
const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();
const PROVIDER_CONFIG = {
  openai: { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-4o-mini" },
  gemini: { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-2.0-flash" },
  anthropic: { key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest" }
};
const selected = PROVIDER_CONFIG[PROVIDER];
if (!selected) throw new Error("AI_PROVIDER must be openai, gemini, or anthropic");

const app = express();
app.use(express.json({ limit: "12mb" }));
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({ origin(origin, callback) {
  if (!origin || LOCAL_ORIGIN_RE.test(origin) || (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN)) return callback(null, true);
  return callback(new Error("Not allowed by CORS"));
} }));

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 20;
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_REQUESTS;
}

function systemPrompt() {
  const catalogue = INTERNSHIP_DATA.map(({ title, org, sector, location, locationType, duration, skills, deadline, stipend }) =>
    ({ title, org, sector, location, locationType, duration, skills, deadline, stipend: stipend || "not specified" }));
  return [
    "You are the career-guidance chatbot on InternMatch, a student project prototype (not an official platform).",
    "Only discuss internships in the catalogue below. Every listing is fictional sample data, not a real vacancy.",
    "Never invent internships, companies, stipends, deadlines, or skills. Clearly say when the catalogue does not contain requested information.",
    "Keep answers short, friendly, and grounded. Explain InternMatch match scores as: skills 40%, interests 25%, academic eligibility 15%, sector 10%, location/duration 10%.",
    "CATALOGUE JSON:", JSON.stringify(catalogue)
  ].join("\n");
}

function normalizeHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => item && typeof item.text === "string" && ["user", "assistant"].includes(item.role))
    .slice(-6).map((item) => ({ role: item.role, content: item.text.slice(0, 2000) }));
}

async function callOpenAI(message, history) {
  const messages = [{ role: "system", content: systemPrompt() }, ...normalizeHistory(history), { role: "user", content: message }];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${selected.key}` },
    body: JSON.stringify({ model: selected.model, messages, max_tokens: 450, temperature: 0.4 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${data.error?.message || "request failed"}`);
  return data.choices?.[0]?.message?.content?.trim();
}

async function callGemini(message, history) {
  const contents = [...normalizeHistory(history).map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
    { role: "user", parts: [{ text: message }] }];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected.model)}:generateContent?key=${encodeURIComponent(selected.key)}`;
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt() }] }, contents, generationConfig: { maxOutputTokens: 450, temperature: 0.4 } }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${data.error?.message || "request failed"}`);
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
}

async function callAnthropic(message, history) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": selected.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: selected.model, max_tokens: 450, system: systemPrompt(),
      messages: [...normalizeHistory(history), { role: "user", content: message }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${data.error?.message || "request failed"}`);
  return (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}

const PROVIDER_CALLS = { openai: callOpenAI, gemini: callGemini, anthropic: callAnthropic };
function normalized(value) { return String(value || "").trim().toLowerCase(); }
const sessions = new Map();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const safeEmail = (value) => String(value || "").trim().toLowerCase();
function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function passwordMatches(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const actual = crypto.scryptSync(String(password || ""), record.salt, 64);
  const expected = Buffer.from(record.hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function issueToken(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { role: user.role, id: user.id, email: user.email, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}
function requireRole(role) {
  return (req, res, next) => {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ error: "Sign in again to continue." });
    }
    if (session.role !== role) return res.status(403).json({ error: "This account cannot access that resource." });
    if (role === "company") {
      const company = portalData.collection("companies").find((item) => item.id === session.id);
      if (!company || company.status !== "active") return res.status(403).json({ error: "This company account is inactive. Contact the platform admin." });
    }
    req.session = session;
    next();
  };
}
const adminOnly = requireRole("admin");
const companyOnly = requireRole("company");
const studentOnly = requireRole("student");
function safeCompany(company) {
  const { salt, hash, passwordHash, ...publicFields } = company;
  return publicFields;
}
function safeStudent(student, includeContact = false) {
  const profile = student.profile || {};
  const interviewScores = Array.isArray(student.interviewScores) ? student.interviewScores.slice(0, 20).map((entry) => ({ category: String(entry.category || "Practice quiz").slice(0, 80), score: Number(entry.score), total: Number(entry.total), date: entry.date || "" })).filter((entry) => Number.isFinite(entry.score) && Number.isFinite(entry.total) && entry.total > 0) : [];
  return {
    id: student.id,
    name: profile.fullName || student.name,
    degree: profile.degree || "",
    course: profile.course || "",
    year: Number(profile.academicYear) || 0,
    graduationYear: profile.graduationYear || "",
    college: profile.college || "",
    location: profile.preferredLocation || "",
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    experience: profile.summary || "",
    projects: Array.isArray(profile.projects) ? profile.projects : [],
    linkedIn: profile.linkedIn || "",
    github: profile.github || "",
    portfolio: profile.portfolio || "",
    cgpa: profile.cgpa || "",
    mobileNumber: includeContact ? profile.mobileNumber || "" : undefined,
    email: includeContact ? student.email : undefined,
    available: profile.availability || "Not specified",
    cvShared: !!student.cvShared,
    interviewScores,
    consentUpdatedAt: student.consentUpdatedAt || null
  };
}
function logCompanyAction(req, action, targetId) {
  portalData.addAudit({ actorRole: req.session.role, actorEmail: req.session.email, action, targetId });
}
function publicCandidate(candidate) {
  const { consent, ...profile } = candidate;
  return profile;
}
function candidateMatch(candidate, internship) {
  const required = internship.skills || [];
  const skills = new Set(candidate.skills.map(normalized));
  const matched = required.filter((skill) => skills.has(normalized(skill)));
  const missing = required.filter((skill) => !skills.has(normalized(skill)));
  const skillScore = required.length ? matched.length / required.length : 1;
  const minYear = Number(internship.minAcademicYear) || 0;
  const yearScore = !minYear || candidate.year >= minYear ? 1 : 0;
  const interests = new Set(candidate.interests.map(normalized));
  const tagged = internship.interests || [];
  const interestScore = tagged.length ? tagged.filter((item) => interests.has(normalized(item))).length / tagged.length : 0.5;
  const locationScore = normalized(internship.locationType) === "remote" || normalized(internship.location) === "remote" || normalized(internship.location) === normalized(candidate.location) ? 1 : 0.5;
  const score = Math.round(100 * (0.65 * skillScore + 0.15 * yearScore + 0.15 * interestScore + 0.05 * locationScore));
  const reasons = [];
  if (matched.length) reasons.push(`matches ${matched.slice(0, 4).join(", ")}`);
  if (yearScore) reasons.push(`meets the ${minYear || "listed"}+ year requirement`);
  return { score, matched_skills: matched, missing_skills: missing, explanation: reasons.length ? reasons.join("; ") : "limited overlap with the listed criteria" };
}

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InternMatch AI backend</title><body style="font:16px system-ui;max-width:680px;margin:12vh auto;padding:24px;color:#17233b"><h1>InternMatch AI backend is running</h1><p>This address serves the chatbot API, not the website interface.</p><p>Open <a href="http://127.0.0.1:5500/chatbot.html">chatbot.html through Live Server</a> to use the chatbot. If your Live Server uses another port, use that address instead.</p><p>Backend status: <a href="/api/health">/api/health</a></p></body></html>`);
});
app.get("/api/health", (req, res) => res.json({ ok: true, apiVersion: "2026-10-27-assessment-workflow", assessmentApprovals: true, keyConfigured: !!selected.key, provider: PROVIDER, model: selected.model, catalogueSize: INTERNSHIP_DATA.length, storage: portalData.isSqlite() ? "sqlite" : "json" }));
app.get("/api/internships", (req, res) => {
  const listings = portalData.collection("internships").filter((listing) => String(listing.status).toLowerCase() === "active").map((listing) => {
    const company = portalData.collection("companies").find((item) => item.id === listing.companyId && String(item.status).toLowerCase() === "active");
    if (!company) return null;
    return { ...listing, org: company.name, sector: listing.sector || company.industry || "Other", locationType: listing.locationType || "On-site", duration: listing.duration || listing.employmentType || "", stipend: listing.stipend || listing.salary || "", durationMonths: Number(listing.durationMonths) || parseInt(listing.duration, 10) || 0, eligibility: listing.eligibility || "See company requirements", interests: Array.isArray(listing.interests) ? listing.interests : [] };
  }).filter(Boolean);
  res.json({ items: [...INTERNSHIP_DATA, ...listings] });
});
app.post("/api/auth/admin/login", (req, res) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: "Set ADMIN_PASSWORD in server/.env before using admin management." });
  const actual = Buffer.from(String(req.body?.password || ""));
  const configured = Buffer.from(expected);
  if (actual.length !== configured.length || !crypto.timingSafeEqual(actual, configured)) return res.status(401).json({ error: "Incorrect admin password." });
  const admin = { id: "platform-admin", email: "admin@internmatch.local", role: "admin" };
  res.json({ token: issueToken(admin), user: admin, expiresIn: TOKEN_TTL_MS / 1000 });
});

app.post("/api/auth/student/register", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = safeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!name || !email || password.length < 6 || password.length > 256) return res.status(400).json({ error: "Provide a name, valid email, and a password of at least 6 characters." });
  const students = portalData.collection("students");
  if (students.some((student) => student.email === email) || portalData.collection("companies").some((company) => company.email === email) || portalData.collection("companyRequests").some((request) => request.email === email && request.status === "Pending")) return res.status(409).json({ error: "This email is already registered to an account or pending request. Use a different email." });
  const secret = passwordRecord(password);
  const student = { id: makeId("student"), name, email, ...secret, profile: { fullName: name }, profileVisible: false, cvShared: false, cvPdf: null, createdAt: new Date().toISOString() };
  portalData.update("students", (items) => [...items, student]);
  const { salt, hash, ...publicUser } = student;
  res.status(201).json({ token: issueToken({ ...student, role: "student" }), user: publicUser });
});

app.post("/api/auth/student/login", (req, res) => {
  const email = safeEmail(req.body?.email);
  if (portalData.collection("companies").some((company) => company.email === email)) return res.status(409).json({ error: "This email belongs to a recruiter account. Choose Recruiter / Company on the login page." });
  const student = portalData.collection("students").find((item) => item.email === email);
  if (!student) return res.status(404).json({ error: "No server account found for this email." });
  if (!passwordMatches(req.body?.password, student)) return res.status(401).json({ error: "Incorrect email or password." });
  const { salt, hash, cvPdf, ...publicUser } = student;
  res.json({ token: issueToken({ ...student, role: "student" }), user: publicUser });
});

app.post("/api/auth/company/register", (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 120);
  const contact = String(req.body?.contact || "").trim().slice(0, 120);
  const email = safeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const industry = String(req.body?.industry || "").trim().slice(0, 100);
  const location = String(req.body?.location || "").trim().slice(0, 120);
  const website = String(req.body?.website || "").trim().slice(0, 200);
  if (!name || !contact || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 256 || !industry || !location) return res.status(400).json({ error: "Complete the required company details and use a password of at least 8 characters." });
  if (portalData.collection("companies").some((company) => company.email === email) || portalData.collection("companyRequests").some((request) => request.email === email && request.status === "Pending") || portalData.collection("students").some((student) => student.email === email)) return res.status(409).json({ error: "An account or pending request already uses this email." });
  const request = { id: makeId("company-request"), name, contact, email, industry, location, website, about: "", status: "Pending", ...passwordRecord(password), requestedAt: new Date().toISOString() };
  portalData.update("companyRequests", (items) => [request, ...items]);
  res.status(202).json({ request: safeCompany(request), message: "Company registration request submitted. An admin must approve it before you can sign in." });
});

app.post("/api/auth/company/login", (req, res) => {
  const email = safeEmail(req.body?.email);
  if (portalData.collection("students").some((student) => student.email === email)) return res.status(409).json({ error: "This email belongs to a student account. Use a separate work email for the recruiter account." });
  const company = portalData.collection("companies").find((item) => item.email === email);
  if (!company) {
    const request = portalData.collection("companyRequests").find((item) => item.email === email);
    if (request?.status === "Pending") return res.status(403).json({ error: "Your company registration is awaiting admin approval." });
    if (request?.status === "Rejected") return res.status(403).json({ error: "Your company registration was rejected. Contact the admin for details." });
    return res.status(401).json({ error: "Company account not found. Register first or contact the InternMatch admin." });
  }
  if (!passwordMatches(req.body?.password, company)) return res.status(401).json({ error: "Incorrect email or password." });
  if (company.status !== "active") return res.status(403).json({ error: "This company account is not active. Contact the platform admin." });
  res.json({ token: issueToken({ ...company, role: "company" }), user: safeCompany(company) });
});

app.post("/api/auth/password-reset-requests", (req, res) => {
  const role = String(req.body?.role || "");
  const email = safeEmail(req.body?.email);
  if (!["student", "company"].includes(role) || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid account email and choose Student or Recruiter / Company." });
  const collectionName = role === "company" ? "companies" : "students";
  const account = portalData.collection(collectionName).find((item) => item.email === email);
  if (account) {
    const existing = portalData.collection("passwordResetRequests").find((item) => item.accountId === account.id && item.status === "Pending");
    if (!existing) portalData.update("passwordResetRequests", (items) => [{ id: makeId("reset"), accountId: account.id, role, email, status: "Pending", requestedAt: new Date().toISOString() }, ...items]);
  }
  res.status(202).json({ message: "If this account exists, a password reset request has been sent to the admin for review." });
});

app.get("/api/admin/companies", adminOnly, (req, res) => {
  res.json({ items: portalData.collection("companies").map(safeCompany) });
});
app.get("/api/admin/company-requests", adminOnly, (req, res) => {
  const items = portalData.collection("companyRequests").filter((request) => request.status === "Pending").map((request) => safeCompany(request));
  res.json({ items });
});
app.patch("/api/admin/company-requests/:id", adminOnly, (req, res) => {
  const decision = String(req.body?.decision || "").toLowerCase();
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Choose approve or reject." });
  const request = portalData.collection("companyRequests").find((item) => item.id === req.params.id && item.status === "Pending");
  if (!request) return res.status(404).json({ error: "Pending company request not found." });
  let company = null;
  if (decision === "approve") {
    if (portalData.collection("companies").some((item) => item.email === request.email)) return res.status(409).json({ error: "A company with this email is already in the approved company list." });
    const { id, salt, hash, ...details } = request;
    company = { id: makeId("company"), ...details, status: "active", salt, hash, approvedAt: new Date().toISOString() };
    portalData.update("companies", (items) => [...items, company]);
  }
  const updated = { ...request, status: decision === "approve" ? "Approved" : "Rejected", reviewedAt: new Date().toISOString(), reviewedBy: req.session.email };
  delete updated.salt; delete updated.hash;
  portalData.update("companyRequests", (items) => items.map((item) => item.id === request.id ? updated : item));
  portalData.addAudit({ actorRole: "admin", actorEmail: req.session.email, action: `${decision === "approve" ? "Approved" : "Rejected"} company registration`, targetId: request.id });
  res.json({ request: safeCompany(updated), company: company ? safeCompany(company) : null });
});
app.get("/api/admin/company-internships", adminOnly, (req, res) => {
  const companies = new Map(portalData.collection("companies").map((company) => [company.id, company]));
  const items = portalData.collection("internships").filter((role) => role.companyId && ["pending_approval", "rejected"].includes(String(role.status).toLowerCase())).map((role) => ({ ...role, companyName: companies.get(role.companyId)?.name || "Company", companyEmail: companies.get(role.companyId)?.email || "" }));
  res.json({ items });
});
app.patch("/api/admin/company-internships/:id/review", adminOnly, (req, res) => {
  const decision = String(req.body?.decision || "").toLowerCase();
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Choose approve or reject." });
  const role = portalData.collection("internships").find((item) => item.id === req.params.id && item.companyId);
  if (!role) return res.status(404).json({ error: "Recruiter posting not found." });
  const updated = { ...role, status: decision === "approve" ? "active" : "rejected", adminReviewNote: String(req.body?.note || "").trim().slice(0, 500), reviewedAt: new Date().toISOString(), reviewedBy: req.session.email };
  portalData.update("internships", (items) => items.map((item) => item.id === role.id ? updated : item));
  portalData.addAudit({ actorRole: "admin", actorEmail: req.session.email, action: `${decision === "approve" ? "Approved" : "Rejected"} recruiter posting`, targetId: role.id });
  res.json({ role: updated });
});
app.post("/api/admin/companies", adminOnly, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = safeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 256) return res.status(400).json({ error: "Enter a company name, valid work email, and an initial password of at least 8 characters." });
  if (portalData.collection("companies").some((company) => company.email === email) || portalData.collection("companyRequests").some((request) => request.email === email && request.status === "Pending") || portalData.collection("students").some((student) => student.email === email)) return res.status(409).json({ error: "This email is already registered or has a pending request." });
  const company = { id: makeId("company"), name, email, status: "active", industry: String(req.body?.industry || "").trim(), website: String(req.body?.website || "").trim(), location: String(req.body?.location || "").trim(), ...passwordRecord(password), createdAt: new Date().toISOString() };
  portalData.update("companies", (items) => [...items, company]);
  logCompanyAction(req, "Created company account", company.id);
  res.status(201).json({ company: safeCompany(company) });
});
app.patch("/api/admin/companies/:id/status", adminOnly, (req, res) => {
  const status = String(req.body?.status || "");
  if (!(["active", "suspended"].includes(status))) return res.status(400).json({ error: "Status must be active or suspended." });
  const companies = portalData.collection("companies");
  if (!companies.some((company) => company.id === req.params.id)) return res.status(404).json({ error: "Company account not found." });
  portalData.update("companies", (items) => items.map((company) => company.id === req.params.id ? { ...company, status, updatedAt: new Date().toISOString() } : company));
  logCompanyAction(req, `Set company status to ${status}`, req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/students", adminOnly, (req, res) => {
  const items = portalData.collection("students").map((student) => ({ ...safeStudent(student, true), profileVisible: student.profileVisible, createdAt: student.createdAt }));
  res.json({ items });
});

// Recruiter assessment publishing and admin moderation.
app.get("/api/admin/assessments", adminOnly, (req, res) => {
  const companies = new Map(portalData.collection("companies").map((company) => [company.id, company]));
  const roles = new Map(portalData.collection("internships").map((role) => [role.id, role]));
  const items = portalData.collection("assessments").filter((item) => ["pending_approval", "rejected"].includes(item.status)).map((item) => ({ ...item, questions: item.questions.map(({ correctIndex, explanation, ...question }) => question), companyName: companies.get(item.companyId)?.name || "Company", roleTitle: roles.get(item.internshipId)?.title || "Role" }));
  res.json({ items });
});
app.patch("/api/admin/assessments/:id/review", adminOnly, (req, res) => {
  const decision = String(req.body?.decision || "").toLowerCase();
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Choose approve or reject." });
  const item = portalData.collection("assessments").find((assessment) => assessment.id === req.params.id && ["pending_approval", "rejected"].includes(assessment.status));
  if (!item) return res.status(404).json({ error: "Assessment not found in the review queue." });
  const updated = { ...item, status: decision === "approve" ? "approved" : "rejected", adminReviewNote: String(req.body?.note || "").trim().slice(0, 500), reviewedAt: new Date().toISOString(), reviewedBy: req.session.email };
  portalData.update("assessments", (items) => items.map((entry) => entry.id === item.id ? updated : entry));
  portalData.addAudit({ actorRole: "admin", actorEmail: req.session.email, action: `${decision === "approve" ? "Approved" : "Rejected"} company assessment`, targetId: item.id });
  res.json({ assessment: updated });
});

app.get("/api/admin/support-messages", adminOnly, (req, res) => {
  const students = portalData.collection("students");
  const items = portalData.collection("supportMessages").map((message) => {
    const student = students.find((item) => item.id === message.studentId);
    return { ...message, studentName: student?.profile?.fullName || student?.name || "Student", studentEmail: student?.email || "" };
  });
  res.json({ items });
});
app.get("/api/admin/password-reset-requests", adminOnly, (req, res) => {
  res.json({ items: portalData.collection("passwordResetRequests") });
});
app.patch("/api/admin/password-reset-requests/:id", adminOnly, (req, res) => {
  const password = String(req.body?.temporaryPassword || "");
  if (password.length < 8 || password.length > 256) return res.status(400).json({ error: "Set a temporary password with at least 8 characters." });
  const requests = portalData.collection("passwordResetRequests");
  const request = requests.find((item) => item.id === req.params.id && item.status === "Pending");
  if (!request) return res.status(404).json({ error: "Pending reset request not found." });
  const collectionName = request.role === "company" ? "companies" : "students";
  const account = portalData.collection(collectionName).find((item) => item.id === request.accountId);
  if (!account) return res.status(404).json({ error: "The account no longer exists." });
  const credentials = passwordRecord(password);
  portalData.update(collectionName, (items) => items.map((item) => item.id === account.id ? { ...item, ...credentials, passwordUpdatedAt: new Date().toISOString() } : item));
  for (const [token, session] of sessions.entries()) if (session.id === account.id) sessions.delete(token);
  const updated = { ...request, status: "Resolved", resolvedAt: new Date().toISOString(), resolvedBy: req.session.email };
  portalData.update("passwordResetRequests", (items) => items.map((item) => item.id === request.id ? updated : item));
  portalData.addAudit({ actorRole: "admin", actorEmail: req.session.email, action: "Reset account password", targetId: request.accountId });
  res.json({ request: updated });
});
app.post("/api/admin/support-messages", adminOnly, (req, res) => {
  const studentId = String(req.body?.studentId || "");
  const subject = String(req.body?.subject || "").trim().slice(0, 120);
  const message = String(req.body?.message || "").trim().slice(0, 2000);
  const student = portalData.collection("students").find((item) => item.id === studentId);
  if (!student) return res.status(404).json({ error: "Choose a valid student account." });
  if (!subject || subject.length < 3 || !message || message.length < 10) return res.status(400).json({ error: "Add a subject and a message with at least 10 characters." });
  const notice = { id: `support_${crypto.randomUUID()}`, studentId, subject, category: "Admin message", message, senderRole: "admin", status: "Sent", reply: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  portalData.update("supportMessages", (items) => [notice, ...items]);
  portalData.addAudit({ actorRole: "admin", actorEmail: req.session.email, action: "Sent a direct message to a student", targetId: studentId });
  res.status(201).json({ message: notice });
});
app.patch("/api/admin/support-messages/:id", adminOnly, (req, res) => {
  const status = String(req.body?.status || "Open");
  const reply = String(req.body?.reply || "").trim().slice(0, 2000);
  if (!["Open", "In progress", "Resolved"].includes(status)) return res.status(400).json({ error: "Choose a valid support status." });
  const messages = portalData.collection("supportMessages");
  const message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: "Support message not found." });
  const updated = { ...message, status, reply, repliedAt: reply ? new Date().toISOString() : message.repliedAt || null, updatedAt: new Date().toISOString() };
  portalData.update("supportMessages", (items) => items.map((item) => item.id === message.id ? updated : item));
  portalData.addAudit({ actorRole: "admin", actorEmail: req.session.email, action: `Updated student support request (${status})`, targetId: message.id });
  res.json({ message: updated });
});

app.put("/api/student/profile", studentOnly, (req, res) => {
  const students = portalData.collection("students");
  const student = students.find((item) => item.id === req.session.id);
  if (!student) return res.status(404).json({ error: "Student account not found." });
  const profile = req.body?.profile && typeof req.body.profile === "object" ? req.body.profile : {};
  const { photo, ...shareableProfile } = profile;
  const profileVisible = req.body?.profileVisible === true;
  const cvShared = profileVisible && req.body?.cvShared === true;
  portalData.update("students", (items) => items.map((item) => item.id === student.id ? { ...item, name: String(shareableProfile.fullName || item.name).slice(0, 120), profile: shareableProfile, profileVisible, cvShared, cvPdf: cvShared ? item.cvPdf : null, consentUpdatedAt: new Date().toISOString() } : item));
  res.json({ ok: true, profileVisible, cvShared });
});
app.put("/api/student/interview-scores", studentOnly, (req, res) => {
  if (!Array.isArray(req.body?.scores)) return res.status(400).json({ error: "Provide a list of practice quiz scores." });
  const scores = req.body.scores.slice(0, 20).map((entry) => ({ category: String(entry?.category || "Practice quiz").trim().slice(0, 80), score: Number(entry?.score), total: Number(entry?.total), date: String(entry?.date || "").slice(0, 40) }))
    .filter((entry) => Number.isInteger(entry.score) && Number.isInteger(entry.total) && entry.total > 0 && entry.total <= 100 && entry.score >= 0 && entry.score <= entry.total && Number.isFinite(Date.parse(entry.date)));
  const student = portalData.collection("students").find((item) => item.id === req.session.id);
  if (!student) return res.status(404).json({ error: "Student account not found." });
  student.interviewScores = scores;
  portalData.update("students", (items) => items.map((item) => item.id === student.id ? student : item));
  res.json({ ok: true, count: scores.length });
});
app.post("/api/student/cv", studentOnly, (req, res) => {
  const student = portalData.collection("students").find((item) => item.id === req.session.id);
  if (!student || !student.profileVisible || !student.cvShared) return res.status(403).json({ error: "Enable both company profile and CV sharing before uploading a CV for companies." });
  const fileName = String(req.body?.fileName || "resume.pdf").slice(0, 180);
  const data = String(req.body?.data || "");
  if (!/^application\/pdf$/i.test(String(req.body?.mimeType || "application/pdf")) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length > 10_500_000) return res.status(400).json({ error: "Upload a PDF smaller than 7.5 MB." });
  const bytes = Buffer.from(data, "base64");
  if (bytes.length < 5 || bytes.subarray(0, 5).toString() !== "%PDF-") return res.status(400).json({ error: "The uploaded file is not a valid PDF." });
  portalData.update("students", (items) => items.map((item) => item.id === student.id ? { ...item, cvPdf: { fileName, mimeType: "application/pdf", data, updatedAt: new Date().toISOString() } } : item));
  res.json({ ok: true, fileName });
});
app.delete("/api/student/cv", studentOnly, (req, res) => {
  portalData.update("students", (items) => items.map((item) => item.id === req.session.id ? { ...item, cvPdf: null } : item));
  res.json({ ok: true });
});
app.post("/api/student/applications", studentOnly, (req, res) => {
  const internshipId = String(req.body?.internshipId || "");
  const companyRole = portalData.collection("internships").find((item) => item.id === internshipId && item.status === "active");
  const catalogueRole = INTERNSHIP_DATA.find((item) => item.id === internshipId);
  const role = companyRole || catalogueRole;
  if (!role) return res.status(404).json({ error: "Internship is not available." });
  if (portalData.collection("applications").some((item) => item.studentId === req.session.id && item.internshipId === internshipId)) return res.status(409).json({ error: "You have already applied to this internship." });
  const application = { id: makeId("application"), studentId: req.session.id, companyId: companyRole?.companyId || null, internshipId, internshipTitle: role.title, companyName: companyRole ? portalData.collection("companies").find((item) => item.id === companyRole.companyId)?.name || "Company" : role.org || "InternMatch listing", status: "Applied", appliedAt: new Date().toISOString(), history: [{ status: "Applied", at: new Date().toISOString() }] };
  portalData.update("applications", (items) => [...items, application]);
  res.status(201).json({ application });
});
app.get("/api/student/applications", studentOnly, (req, res) => {
  res.json({ items: portalData.collection("applications").filter((item) => item.studentId === req.session.id) });
});
app.get("/api/student/interviews", studentOnly, (req, res) => {
  const applications = portalData.collection("applications");
  const items = portalData.collection("interviews").filter((item) => item.studentId === req.session.id).map((item) => {
    const { questions, questionSelectionCount, selectedQuestionIds, questionsUpdatedAt, ...publicInterview } = item;
    return {
      ...publicInterview,
      internshipId: applications.find((application) => application.id === item.applicationId)?.internshipId || "",
      companyName: portalData.collection("companies").find((company) => company.id === item.companyId)?.name || "Company"
    };
  });
  res.json({ items });
});
app.get("/api/student/support-messages", studentOnly, (req, res) => {
  res.json({ items: portalData.collection("supportMessages").filter((item) => item.studentId === req.session.id) });
});
app.post("/api/student/support-messages", studentOnly, (req, res) => {
  const subject = String(req.body?.subject || "").trim().slice(0, 120);
  const category = String(req.body?.category || "General help").trim().slice(0, 60);
  const message = String(req.body?.message || "").trim().slice(0, 2000);
  if (!subject || subject.length < 3 || !message || message.length < 10) return res.status(400).json({ error: "Add a subject and a message with at least 10 characters." });
  const ticket = { id: `support_${crypto.randomUUID()}`, studentId: req.session.id, subject, category, message, status: "Open", reply: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  portalData.update("supportMessages", (items) => [ticket, ...items]);
  res.status(201).json({ message: ticket });
});

app.get("/api/company/me", companyOnly, (req, res) => {
  const company = portalData.collection("companies").find((item) => item.id === req.session.id);
  if (!company || company.status !== "active") return res.status(403).json({ error: "Company account is inactive." });
  res.json({ company: safeCompany(company) });
});
app.patch("/api/company/me", companyOnly, (req, res) => {
  const company = portalData.collection("companies").find((item) => item.id === req.session.id && item.status === "active");
  if (!company) return res.status(404).json({ error: "Company account not found." });
  const fields = ["name", "industry", "website", "location", "contact", "about"];
  fields.forEach((field) => { if (req.body?.[field] != null) company[field] = String(req.body[field]).trim().slice(0, field === "about" ? 2000 : 200); });
  portalData.update("companies", (items) => items.map((item) => item.id === company.id ? company : item));
  res.json({ company: safeCompany(company) });
});
app.get("/api/company/applications", companyOnly, (req, res) => {
  const items = portalData.collection("applications").filter((application) => application.companyId === req.session.id).map((application) => {
    const student = portalData.collection("students").find((item) => item.id === application.studentId);
    return { ...application, student: student ? safeStudent(student, true) : null };
  });
  res.json({ items });
});
app.patch("/api/company/applications/:id/status", companyOnly, (req, res) => {
  const allowed = ["Applied", "Shortlisted", "Assessment", "Interview", "Offered", "Rejected"];
  const status = String(req.body?.status || "");
  const application = portalData.collection("applications").find((item) => item.id === req.params.id && item.companyId === req.session.id);
  if (!application) return res.status(404).json({ error: "Application not found." });
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid recruitment status." });
  application.status = status;
  application.history = [...(application.history || []), { status, at: new Date().toISOString() }];
  portalData.update("applications", (items) => items.map((item) => item.id === application.id ? application : item));
  logCompanyAction(req, `Changed application to ${status}`, application.id);
  res.json({ application });
});
app.get("/api/company/students", companyOnly, (req, res) => {
  const q = normalized(req.query.q); const skill = normalized(req.query.skill); const location = normalized(req.query.location);
  const applicantIds = new Set(portalData.collection("applications").filter((application) => application.companyId === req.session.id).map((application) => application.studentId));
  const items = portalData.collection("students").filter((student) => applicantIds.has(student.id)).map((student) => safeStudent(student, true)).filter((student) => {
    const haystack = [student.name, student.course, student.college, student.location, ...student.skills, ...student.interests].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (!skill || student.skills.some((item) => normalized(item).includes(skill))) && (!location || normalized(student.location).includes(location));
  });
  res.json({ items, total: items.length, source: "student-consented profiles" });
});
app.get("/api/company/students/:id", companyOnly, (req, res) => {
  const applied = portalData.collection("applications").some((application) => application.companyId === req.session.id && application.studentId === req.params.id);
  const student = applied && portalData.collection("students").find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student details are available only to the company they applied to." });
  res.json({ student: safeStudent(student, true) });
});
app.get("/api/company/students/:id/cv", companyOnly, (req, res) => {
  const applied = portalData.collection("applications").some((application) => application.companyId === req.session.id && application.studentId === req.params.id);
  const student = applied && portalData.collection("students").find((item) => item.id === req.params.id && item.cvShared && item.cvPdf);
  if (!student) return res.status(404).json({ error: "This student has not shared a CV with companies." });
  logCompanyAction(req, "Opened student-shared CV", student.id);
  res.json({ fileName: student.cvPdf.fileName, mimeType: student.cvPdf.mimeType, data: student.cvPdf.data });
});
app.get("/api/company/shortlists", companyOnly, (req, res) => {
  const applications = portalData.collection("applications");
  const items = portalData.collection("shortlists").filter((item) => item.companyId === req.session.id && applications.some((application) => application.companyId === req.session.id && application.studentId === item.studentId)).map((item) => ({ ...item, student: safeStudent(portalData.collection("students").find((student) => student.id === item.studentId) || {}) }));
  res.json({ items });
});
app.post("/api/company/shortlists", companyOnly, (req, res) => {
  const studentId = String(req.body?.studentId || "");
  const applied = portalData.collection("applications").some((application) => application.companyId === req.session.id && application.studentId === studentId);
  const student = applied && portalData.collection("students").find((item) => item.id === studentId);
  if (!student) return res.status(404).json({ error: "Student profile is unavailable." });
  const entry = { id: makeId("shortlist"), companyId: req.session.id, studentId, note: String(req.body?.note || "").trim().slice(0, 1000), createdAt: new Date().toISOString() };
  portalData.update("shortlists", (items) => items.some((item) => item.companyId === req.session.id && item.studentId === studentId) ? items : [...items, entry]);
  logCompanyAction(req, "Shortlisted student", studentId);
  res.status(201).json({ ok: true });
});
app.delete("/api/company/shortlists/:studentId", companyOnly, (req, res) => {
  portalData.update("shortlists", (items) => items.filter((item) => !(item.companyId === req.session.id && item.studentId === req.params.studentId)));
  res.json({ ok: true });
});
app.get("/api/company/interviews", companyOnly, (req, res) => {
  const applications = portalData.collection("applications");
  res.json({ items: portalData.collection("interviews").filter((item) => item.companyId === req.session.id && applications.some((application) => application.companyId === req.session.id && application.studentId === item.studentId)).map(({ questions, questionSelectionCount, selectedQuestionIds, questionsUpdatedAt, ...item }) => item) });
});
app.post("/api/company/interviews", companyOnly, (req, res) => {
  const applicationId = String(req.body?.applicationId || "");
  const application = portalData.collection("applications").find((item) => item.id === applicationId && item.companyId === req.session.id);
  const studentId = application?.studentId;
  const student = studentId && portalData.collection("students").find((item) => item.id === studentId);
  const date = String(req.body?.date || "");
  const type = String(req.body?.type || "Interview").slice(0, 80);
  if (!student || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Choose one of your applicants and a valid meeting date." });
  const interview = { id: makeId("interview"), companyId: req.session.id, studentId, applicationId, internshipTitle: application.internshipTitle, studentName: student.profile?.fullName || student.name, type, date, time: String(req.body?.time || "").slice(0, 10), mode: String(req.body?.mode || "Online").slice(0, 40), details: String(req.body?.details || "").trim().slice(0, 1000), createdAt: new Date().toISOString() };
  portalData.update("interviews", (items) => [...items, interview]);
  portalData.update("applications", (items) => items.map((item) => item.id === applicationId ? { ...item, status: "Interview", history: [...(item.history || []), { status: "Interview", at: new Date().toISOString() }] } : item));
  logCompanyAction(req, "Scheduled student interview", studentId);
  res.status(201).json({ interview });
});
app.delete("/api/company/interviews/:id", companyOnly, (req, res) => {
  portalData.update("interviews", (items) => items.filter((item) => !(item.companyId === req.session.id && item.id === req.params.id)));
  res.json({ ok: true });
});

app.get("/api/company/assessments", companyOnly, (req, res) => {
  const submissions = portalData.collection("assessmentSubmissions");
  const items = portalData.collection("assessments").filter((item) => item.companyId === req.session.id).map((item) => ({
    ...item,
    questions: item.questions.map(({ correctIndex, explanation, ...question }) => question),
    attempts: submissions.filter((entry) => entry.assessmentId === item.id).map((entry) => {
      const student = portalData.collection("students").find((candidate) => candidate.id === entry.studentId);
      return { ...entry, studentName: student?.profile?.fullName || student?.name || "Student", studentEmail: student?.email || "" };
    })
  }));
  res.json({ items });
});
app.post("/api/company/assessments", companyOnly, (req, res) => {
  const title = String(req.body?.title || "").trim().slice(0, 140);
  const internshipId = String(req.body?.internshipId || "");
  const role = portalData.collection("internships").find((item) => item.id === internshipId && item.companyId === req.session.id);
  const category = ["Coding", "Aptitude", "Technical", "HR", "Custom"].includes(req.body?.category) ? req.body.category : "Technical";
  const difficulty = ["Easy", "Medium", "Hard"].includes(req.body?.difficulty) ? req.body.difficulty : "Medium";
  const durationMinutes = Math.max(5, Math.min(180, Number(req.body?.durationMinutes) || 30));
  const startDate = req.body?.startAt ? new Date(req.body.startAt) : null;
  const endDate = req.body?.endAt ? new Date(req.body.endAt) : null;
  const startAt = startDate && Number.isFinite(startDate.getTime()) ? startDate.toISOString() : "";
  const endAt = endDate && Number.isFinite(endDate.getTime()) ? endDate.toISOString() : "";
  const questions = Array.isArray(req.body?.questions) ? req.body.questions.slice(0, 50).map((question) => {
    const type = ["MCQ", "Coding", "Descriptive"].includes(question?.type) ? question.type : "MCQ";
    return { id: makeId("question"), type, prompt: String(question?.prompt || "").trim().slice(0, 2000), options: type === "MCQ" && Array.isArray(question.options) ? question.options.slice(0, 4).map((option) => String(option || "").trim().slice(0, 500)) : [], correctIndex: type === "MCQ" && question.correctIndex != null && question.correctIndex !== "" ? Number(question.correctIndex) : -1, marks: Math.max(1, Math.min(100, Number(question?.marks) || 1)), explanation: String(question?.explanation || "").trim().slice(0, 1000) };
  }) : [];
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  const passingMarks = Math.max(0, Math.min(totalMarks, Number(req.body?.passingMarks) || 0));
  if (!title || !role || !questions.length || questions.some((question) => !question.prompt || (question.type === "MCQ" && (question.options.length !== 4 || question.options.some((option) => !option) || !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3))) || passingMarks > totalMarks || (req.body?.startAt && !startAt) || (req.body?.endAt && !endAt) || (startAt && endAt && new Date(startAt) >= new Date(endAt))) return res.status(400).json({ error: "Add a title, one of your roles, valid questions, a passing score, and a valid availability window." });
  const assessment = { id: makeId("assessment"), companyId: req.session.id, internshipId, title, category, difficulty, durationMinutes, passingMarks, totalMarks, startAt, endAt, eligible: "Applicants", status: "pending_approval", adminReviewNote: "", questions, createdAt: new Date().toISOString() };
  portalData.update("assessments", (items) => [assessment, ...items]);
  logCompanyAction(req, "Submitted assessment for admin approval", assessment.id);
  res.status(201).json({ assessment: { ...assessment, questions: questions.map(({ correctIndex, explanation, ...question }) => question) } });
});
app.patch("/api/company/assessments/:id/submissions/:submissionId/review", companyOnly, (req, res) => {
  const assessment = portalData.collection("assessments").find((item) => item.id === req.params.id && item.companyId === req.session.id);
  const submission = portalData.collection("assessmentSubmissions").find((item) => item.id === req.params.submissionId && item.assessmentId === req.params.id);
  if (!assessment || !submission) return res.status(404).json({ error: "Submission not found for this company assessment." });
  const awarded = req.body?.marks && typeof req.body.marks === "object" ? req.body.marks : {};
  submission.answers = submission.answers.map((answer) => {
    const question = assessment.questions.find((item) => item.id === answer.questionId);
    if (!question || question.type === "MCQ") return answer;
    const mark = Math.max(0, Math.min(question.marks, Number(awarded[question.id]) || 0));
    return { ...answer, marksAwarded: mark };
  });
  submission.score = submission.answers.reduce((sum, answer) => sum + (Number(answer.marksAwarded) || 0), 0);
  submission.passed = submission.score >= assessment.passingMarks;
  submission.status = "Reviewed";
  submission.reviewedAt = new Date().toISOString();
  portalData.update("assessmentSubmissions", (items) => items.map((item) => item.id === submission.id ? submission : item));
  res.json({ result: { score: submission.score, totalMarks: submission.totalMarks, passed: submission.passed, status: submission.status } });
});

app.get("/api/student/assessments", studentOnly, (req, res) => {
  const applicationRoleIds = new Set(portalData.collection("applications").filter((application) => application.studentId === req.session.id && application.status !== "Rejected").map((application) => application.internshipId));
  const now = Date.now();
  const items = portalData.collection("assessments").filter((item) => item.status === "approved" && applicationRoleIds.has(item.internshipId) && (!item.startAt || new Date(item.startAt).getTime() <= now) && (!item.endAt || new Date(item.endAt).getTime() >= now)).map((item) => {
    const existing = portalData.collection("assessmentSubmissions").find((submission) => submission.assessmentId === item.id && submission.studentId === req.session.id);
    return { id: item.id, title: item.title, category: item.category, difficulty: item.difficulty, durationMinutes: item.durationMinutes, totalMarks: item.totalMarks, passingMarks: item.passingMarks, endAt: item.endAt, companyName: portalData.collection("companies").find((company) => company.id === item.companyId)?.name || "Company", submitted: !!existing, result: existing ? { score: existing.score, totalMarks: existing.totalMarks, passed: existing.passed, submittedAt: existing.submittedAt } : null };
  });
  res.json({ items });
});
app.post("/api/student/assessments/:id/start", studentOnly, (req, res) => {
  const assessment = portalData.collection("assessments").find((item) => item.id === req.params.id && item.status === "approved");
  const eligible = assessment && portalData.collection("applications").some((application) => application.studentId === req.session.id && application.internshipId === assessment.internshipId && application.status !== "Rejected");
  if (!eligible) return res.status(404).json({ error: "Assessment is unavailable for this account." });
  if ((assessment.startAt && Date.now() < new Date(assessment.startAt).getTime()) || (assessment.endAt && Date.now() > new Date(assessment.endAt).getTime())) return res.status(403).json({ error: "This assessment is outside its availability window." });
  if (portalData.collection("assessmentSubmissions").some((submission) => submission.assessmentId === assessment.id && submission.studentId === req.session.id)) return res.status(409).json({ error: "You have already submitted this assessment." });
  let attempt = portalData.collection("assessmentSessions").find((entry) => entry.assessmentId === assessment.id && entry.studentId === req.session.id);
  if (!attempt) {
    attempt = { assessmentId: assessment.id, studentId: req.session.id, startedAt: new Date().toISOString() };
    portalData.update("assessmentSessions", (items) => [...items, attempt]);
  }
  if (Date.now() - new Date(attempt.startedAt).getTime() > assessment.durationMinutes * 60 * 1000) return res.status(403).json({ error: "Your assessment time has expired." });
  const questions = assessment.questions.map(({ correctIndex, explanation, ...question }) => question);
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000));
  res.json({ assessment: { id: assessment.id, title: assessment.title, category: assessment.category, durationMinutes: assessment.durationMinutes, remainingSeconds: Math.max(0, assessment.durationMinutes * 60 - elapsedSeconds), totalMarks: assessment.totalMarks, questions } });
});
app.post("/api/student/assessments/:id/submit", studentOnly, (req, res) => {
  const assessment = portalData.collection("assessments").find((item) => item.id === req.params.id && item.status === "approved");
  const eligible = assessment && portalData.collection("applications").some((application) => application.studentId === req.session.id && application.internshipId === assessment.internshipId && application.status !== "Rejected");
  if (!eligible) return res.status(404).json({ error: "Assessment is unavailable for this account." });
  if ((assessment.startAt && Date.now() < new Date(assessment.startAt).getTime()) || (assessment.endAt && Date.now() > new Date(assessment.endAt).getTime())) return res.status(403).json({ error: "This assessment is outside its availability window." });
  const attempt = portalData.collection("assessmentSessions").find((entry) => entry.assessmentId === assessment.id && entry.studentId === req.session.id);
  if (!attempt) return res.status(403).json({ error: "Start the assessment before submitting answers." });
  if (Date.now() - new Date(attempt.startedAt).getTime() > assessment.durationMinutes * 60 * 1000 + 5000) return res.status(403).json({ error: "Your assessment time has expired." });
  if (portalData.collection("assessmentSubmissions").some((submission) => submission.assessmentId === assessment.id && submission.studentId === req.session.id)) return res.status(409).json({ error: "This assessment has already been submitted." });
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  let score = 0;
  const reviewedAnswers = assessment.questions.map((question) => {
    const answer = answers.find((item) => item.questionId === question.id);
    if (question.type === "MCQ") {
      const selectedIndex = answer?.selectedIndex == null || answer.selectedIndex === "" ? NaN : Number(answer.selectedIndex);
      const correct = Number.isInteger(selectedIndex) && selectedIndex === question.correctIndex;
      if (correct) score += question.marks;
      return { questionId: question.id, answer: Number.isInteger(selectedIndex) ? selectedIndex : null, correct, marksAwarded: correct ? question.marks : 0 };
    }
    return { questionId: question.id, answer: String(answer?.text || "").slice(0, 10000), correct: null, marksAwarded: 0 };
  });
  const rawWritingSignals = Array.isArray(req.body?.writingReview?.signals) ? req.body.writingReview.signals : [];
  const writingSignals = rawWritingSignals.slice(0, 5).map((signal) => String(signal).slice(0, 180));
  const hasReviewableText = reviewedAnswers.some((answer) => typeof answer.answer === "string" && answer.answer.trim().length >= 40);
  const writingReview = assessment.questions.some((question) => question.type !== "MCQ") ? {
    label: !hasReviewableText ? "Not enough written text to review" : writingSignals.length ? "Patterns for human review" : "No listed patterns found",
    signals: writingSignals,
    disclaimer: "Simple writing-style clues are unreliable, can flag human writing, and do not establish AI use or misconduct. Do not use them alone for hiring decisions."
  } : null;
  const submission = { id: makeId("submission"), assessmentId: assessment.id, studentId: req.session.id, answers: reviewedAnswers, writingReview, score, totalMarks: assessment.totalMarks, passed: score >= assessment.passingMarks, submittedAt: new Date().toISOString(), status: assessment.questions.some((question) => question.type !== "MCQ") ? "Needs recruiter review" : "Scored" };
  portalData.update("assessmentSubmissions", (items) => [...items, submission]);
  portalData.update("applications", (items) => items.map((application) => application.studentId === req.session.id && application.internshipId === assessment.internshipId && !["Rejected", "Offered", "Shortlisted"].includes(application.status) ? { ...application, status: "Assessment", history: [...(application.history || []), { status: "Assessment", at: submission.submittedAt }] } : application));
  res.status(201).json({ result: { score, totalMarks: assessment.totalMarks, passed: submission.passed, status: submission.status, submittedAt: submission.submittedAt } });
});

/* Live Voice & Video Interview Room Signaling & Evaluation Feedback */
const callSignals = new Map();
function interviewParticipant(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: "Sign in again to join this interview." });
  }
  if (!["student", "company"].includes(session.role)) return res.status(403).json({ error: "This account cannot join interviews." });
  if (session.role === "company") {
    const company = portalData.collection("companies").find((item) => item.id === session.id && item.status === "active");
    if (!company) return res.status(403).json({ error: "This company account is inactive." });
  }
  const interview = portalData.collection("interviews").find((item) => item.id === req.params.id);
  if (!interview || (session.role === "student" ? interview.studentId !== session.id : interview.companyId !== session.id)) {
    return res.status(404).json({ error: "Interview not found for this account." });
  }
  req.session = session;
  req.interview = interview;
  next();
}

app.post("/api/interviews/:id/signal", interviewParticipant, (req, res) => {
  const roomId = String(req.params.id);
  const { type, data } = req.body || {};
  if (!type || !["offer", "answer", "ice", "chat", "end"].includes(String(type))) return res.status(400).json({ error: "Invalid signal type." });
  if (!callSignals.has(roomId)) callSignals.set(roomId, []);
  const list = callSignals.get(roomId);
  const entry = { id: crypto.randomUUID(), sender: req.session.role === "company" ? "recruiter" : "student", type: String(type), data, at: Date.now() };
  list.push(entry);
  if (list.length > 120) list.shift();
  res.status(201).json({ ok: true, id: entry.id });
});

app.get("/api/interviews/:id/signal", interviewParticipant, (req, res) => {
  const roomId = String(req.params.id);
  const since = Number(req.query.since || 0);
  const list = (callSignals.get(roomId) || []).filter((item) => item.at > since);
  res.json({ signals: list, serverTime: Date.now() });
});

app.post("/api/company/interviews/:id/feedback", companyOnly, (req, res) => {
  const interviewId = req.params.id;
  const interviews = portalData.collection("interviews");
  const interview = interviews.find((item) => item.id === interviewId && item.companyId === req.session.id);
  if (!interview) return res.status(404).json({ error: "Interview record not found." });

  const { technicalScore = 3, problemSolvingScore = 3, communicationScore = 3, notes = "", decision = "next_round" } = req.body || {};
  const feedback = {
    technicalScore: Math.max(1, Math.min(5, Number(technicalScore) || 3)),
    problemSolvingScore: Math.max(1, Math.min(5, Number(problemSolvingScore) || 3)),
    communicationScore: Math.max(1, Math.min(5, Number(communicationScore) || 3)),
    notes: String(notes || "").trim().slice(0, 2000),
    decision: ["offer", "next_round", "reject"].includes(decision) ? decision : "next_round",
    submittedAt: new Date().toISOString()
  };

  interview.feedback = feedback;
  portalData.update("interviews", (items) => items.map((item) => item.id === interview.id ? interview : item));

  // If recruiter decided "offer" or "reject", optionally advance the application stage
  if (interview.applicationId) {
    let nextStage = null;
    if (decision === "offer") nextStage = "Offered";
    else if (decision === "reject") nextStage = "Rejected";

    if (nextStage) {
      portalData.update("applications", (items) => items.map((app) => {
        if (app.id === interview.applicationId && app.companyId === req.session.id) {
          return { ...app, status: nextStage, history: [...(app.history || []), { status: nextStage, at: new Date().toISOString() }] };
        }
        return app;
      }));
    }
  }

  logCompanyAction(req, `Saved interview feedback (${feedback.decision})`, interview.studentId);
  res.json({ ok: true, interview });
});

app.get("/api/interviews/:id/details", (req, res) => {
  const interview = portalData.collection("interviews").find((item) => item.id === req.params.id);
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  res.json({ interview });
});
app.get("/api/company/internships", companyOnly, (req, res) => {
  res.json({ items: portalData.collection("internships").filter((item) => item.companyId === req.session.id) });
});
app.get("/api/company/recommendations", companyOnly, (req, res) => {
  const id = String(req.query.internship_id || "");
  const internship = portalData.collection("internships").find((item) => item.companyId === req.session.id && item.id === id) || INTERNSHIP_DATA.find((item) => item.id === id);
  if (!internship) return res.status(404).json({ error: "Choose one of your internship listings." });
  const applicantIds = new Set(portalData.collection("applications").filter((application) => application.companyId === req.session.id).map((application) => application.studentId));
  const items = portalData.collection("students").filter((student) => applicantIds.has(student.id))
    .map((student) => safeStudent(student))
    .map((candidate) => ({ ...candidate, match: candidateMatch(candidate, internship) }))
    .sort((a, b) => b.match.score - a.match.score);
  res.json({ internship, items, weights: { skills: 65, education_year: 15, interests: 15, location: 5 }, source: "student-consented profiles" });
});
app.post("/api/company/internships", companyOnly, (req, res) => {
  const title = String(req.body?.title || "").trim();
  const skills = Array.isArray(req.body?.skills) ? req.body.skills.map((item) => String(item).trim()).filter(Boolean).slice(0, 30) : [];
  const postingType = ["Internship", "Job"].includes(req.body?.postingType) ? req.body.postingType : "Internship";
  const location = String(req.body?.location || "").trim();
  const sector = String(req.body?.sector || "").trim();
  const deadline = String(req.body?.deadline || "");
  const eligibility = String(req.body?.eligibility || "").trim();
  const description = String(req.body?.description || "").trim();
  const duration = String(req.body?.duration || "").trim();
  if (!title || !skills.length || !location || !sector || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !eligibility || !description || (postingType === "Internship" && !duration)) return res.status(400).json({ error: "Complete the required role, location, sector, duration (for internships), deadline, eligibility, summary, and skills fields." });
  const role = { id: makeId("role"), companyId: req.session.id, title: title.slice(0, 160), postingType, employmentType: String(req.body?.employmentType || "Internship").slice(0, 60), location: location.slice(0, 160), duration: duration.slice(0, 80), durationMonths: parseInt(duration, 10) || 0, locationType: String(req.body?.locationType || "On-site").slice(0, 40), sector: sector.slice(0, 80), stipend: String(req.body?.stipend || "").slice(0, 80), salary: String(req.body?.salary || "").slice(0, 100), positions: Math.max(1, Math.min(999, Number(req.body?.positions) || 1)), deadline: deadline.slice(0, 10), description: description.slice(0, 1500), responsibilities: String(req.body?.responsibilities || "").slice(0, 2000), eligibility: eligibility.slice(0, 500), skills, status: "pending_approval", createdAt: new Date().toISOString() };
  portalData.update("internships", (items) => [...items, role]);
  res.status(201).json({ role });
});
app.patch("/api/company/internships/:id", companyOnly, (req, res) => {
  const role = portalData.collection("internships").find((item) => item.companyId === req.session.id && item.id === req.params.id);
  if (!role) return res.status(404).json({ error: "Internship not found." });
  const fields = ["title", "postingType", "employmentType", "location", "duration", "stipend", "salary", "positions", "deadline", "description", "responsibilities", "eligibility", "sector", "locationType"];
  fields.forEach((field) => { if (req.body?.[field] != null) role[field] = String(req.body[field]).slice(0, ["description", "responsibilities"].includes(field) ? 2000 : 180); });
  if (Array.isArray(req.body?.skills)) role.skills = req.body.skills.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
  const requestedStatus = String(req.body?.status || "");
  if (requestedStatus === "paused" && role.status === "active") {
    role.status = "paused";
  } else {
    role.status = "pending_approval"; role.reviewedAt = null; role.adminReviewNote = "";
  }
  portalData.update("internships", (items) => items.map((item) => item.id === role.id ? role : item));
  res.json({ role });
});
app.delete("/api/company/internships/:id", companyOnly, (req, res) => {
  portalData.update("internships", (items) => items.filter((item) => !(item.companyId === req.session.id && item.id === req.params.id)));
  res.json({ ok: true });
});
async function callLLMDirect(systemInstruction, userPrompt) {
  if (PROVIDER === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected.model)}:generateContent?key=${encodeURIComponent(selected.key)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.5 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${data.error?.message || "request failed"}`);
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  }
  if (PROVIDER === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": selected.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: selected.model,
        max_tokens: 800,
        system: systemInstruction,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${data.error?.message || "request failed"}`);
    return (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  }
  // Default: OpenAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${selected.key}` },
    body: JSON.stringify({
      model: selected.model,
      messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userPrompt }],
      max_tokens: 800,
      temperature: 0.5
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${data.error?.message || "request failed"}`);
  return data.choices?.[0]?.message?.content?.trim();
}

function buildSmartTemplateCoverLetter(student, internship) {
  const candidateName = student?.fullName || student?.name || "Applicant";
  const college = student?.college ? ` at ${student.college}` : "";
  const degree = student?.degree || "undergraduate";
  const course = student?.course || "Technical discipline";
  const skillsList = Array.isArray(student?.skills) && student.skills.length ? student.skills.slice(0, 4).join(", ") : "problem solving, programming, and team collaboration";
  const matchedSkills = Array.isArray(internship?.skills) ? internship.skills.filter((s) => (student?.skills || []).some((sk) => sk.toLowerCase() === s.toLowerCase())) : [];
  const matchedStr = matchedSkills.length ? matchedSkills.join(", ") : skillsList;

  return `Dear Hiring Manager at ${internship.org || "the Team"},

I am writing to express my strong enthusiasm for the ${internship.title || "Internship"} position. As a student pursuing a ${degree} in ${course}${college}, I have developed solid foundational knowledge and hands-on proficiency in ${matchedStr}.

During my academic studies and project coursework, I have focused on building practical, scalable solutions and continuously expanding my technical competencies. Your opening for ${internship.title} aligns directly with my career aspirations in ${internship.sector || "this domain"}. Given ${internship.org}'s reputation for quality and innovation, I am eager to contribute my capabilities in ${matchedSkills.slice(0, 2).join(" and ") || "engineering"} to your team's objectives while learning from your experienced mentors.

I would welcome the opportunity to discuss how my academic background and dedication make me a strong candidate for this internship. Thank you for your time and consideration.

Sincerely,
${candidateName}
${student.mobileNumber ? `Phone: ${student.mobileNumber}` : ""}
${student.email ? `Email: ${student.email}` : ""}`.trim();
}

app.post("/api/generate-cover-letter", async (req, res) => {
  if (isRateLimited(req.ip || req.socket.remoteAddress || "unknown")) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }
  const { student = {}, internship = {} } = req.body || {};
  if (!internship.title) {
    return res.status(400).json({ error: "Internship details are required to generate a cover letter." });
  }

  // If no AI key configured or provider call fails, smoothly fallback to smart template
  if (!selected.key) {
    const fallbackText = buildSmartTemplateCoverLetter(student, internship);
    return res.json({ coverLetter: fallbackText, source: "template" });
  }

  const systemInstruction = "You are an expert career advisor and technical recruiter. Your task is to write a tailored, professional, concise, and persuasive cover letter for an internship applicant. Do not include markdown headers or meta-text. Return only the complete cover letter ready to send.";
  const userPrompt = `Generate a compelling, well-structured cover letter (approx 200-260 words) for the following candidate applying to the listed internship opportunity:

CANDIDATE INFORMATION:
- Name: ${student.fullName || student.name || "Student"}
- Degree & Course: ${student.degree || "Degree"} in ${student.course || "Computer Science"}
- College: ${student.college || "University"}
- Academic Year: Year ${student.academicYear || 2}
- Skills: ${Array.isArray(student.skills) ? student.skills.join(", ") : "Programming, analytical thinking"}
- Summary/Background: ${student.summary || "Motivated student eager to apply academic skills to real-world projects"}
- Relevant Projects: ${Array.isArray(student.projects) ? student.projects.map((p) => p.title || p).join("; ") : "Academic coursework projects"}

INTERNSHIP OPPORTUNITY:
- Role Title: ${internship.title}
- Organization: ${internship.org}
- Sector: ${internship.sector}
- Work Mode: ${internship.locationType || "On-site"} in ${internship.location || "Office"}
- Duration: ${internship.duration || "Internship duration"}
- Required Skills: ${Array.isArray(internship.skills) ? internship.skills.join(", ") : "Listed role skills"}
- Description: ${internship.description || ""}

GUIDELINES:
1. Address to "Dear Hiring Team at ${internship.org},"
2. Paragraph 1: Enthusiastic opening stating the exact role and how candidate's education matches.
3. Paragraph 2: Highlight matching skills and how academic or project experience demonstrates practical readiness.
4. Paragraph 3: Passion for ${internship.org}'s domain, eager desire to learn and contribute value.
5. Professional sign-off: "Sincerely,\n${student.fullName || student.name || "Applicant"}"`;

  try {
    const generated = await callLLMDirect(systemInstruction, userPrompt);
    res.json({ coverLetter: generated || buildSmartTemplateCoverLetter(student, internship), source: "ai" });
  } catch (error) {
    console.error("[/api/generate-cover-letter] AI provider failed, using template:", error.message);
    const fallback = buildSmartTemplateCoverLetter(student, internship);
    res.json({ coverLetter: fallback, source: "template_fallback", note: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  if (isRateLimited(req.ip || req.socket.remoteAddress || "unknown")) return res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." });
  if (!selected.key) return res.status(500).json({ error: `Server is missing the ${PROVIDER.toUpperCase()} API key. See server/.env.example.` });
  const { message, history } = req.body || {};
  if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Missing 'message' string in request body." });
  if (message.length > 2000) return res.status(400).json({ error: "Message too long." });
  try {
    const reply = await PROVIDER_CALLS[PROVIDER](message.trim(), history);
    res.json({ reply: reply || "I couldn't generate a reply for that — try rephrasing." });
  } catch (error) {
    console.error("[/api/chat]", error.message);
    res.status(502).json({ error: "The AI provider could not answer. Check the server configuration and try again." });
  }
});

app.listen(PORT, () => {
  console.log(`InternMatch AI proxy listening on http://localhost:${PORT} (${PROVIDER}/${selected.model})`);
  console.log(`Catalogue grounding: ${INTERNSHIP_DATA.length} internships loaded`);
  console.log(`Persistence mode: ${portalData.isSqlite() ? "SQLite (ACID Relational) + JSON Sync" : "JSON File"}`);
  if (!selected.key) console.warn(`WARNING: ${PROVIDER.toUpperCase()} API key is not set. Configure server/.env.`);
});
