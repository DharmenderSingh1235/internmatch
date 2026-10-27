/* js/storage.js
   All browser persistence for InternMatch lives behind this one Store object.
   Every other module talks to Store, never to localStorage directly, so a
   real backend could later replace the bodies of these functions without
   touching any calling code. See README.md section 8 for the key schema. */

const Store = (function () {
  const KEYS = {
    users: "im_users",
    currentUser: "im_current_user",
    profile: (email) => `im_profile_${email}`,
    saved: (email) => `im_saved_${email}`,
    applications: (email) => `im_applications_${email}`,
    skillProgress: (email) => `im_skillprogress_${email}`,
    recentlyViewed: (email) => `im_recent_${email}`,
    adminInternships: "im_admin_internships"
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function genId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // Reversible obfuscation only — this is a frontend demo, not real password
  // security. See README.md section 11 (Limitations).
  function obfuscate(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return str;
    }
  }
  function deobfuscate(str) {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return str;
    }
  }

  // ---------- Users / auth ----------

  function getAllUsers() {
    return read(KEYS.users, []);
  }

  function saveAllUsers(users) {
    write(KEYS.users, users);
  }

  function findUserByEmail(email) {
    if (!email) return null;
    const e = email.trim().toLowerCase();
    return getAllUsers().find((u) => u.email.toLowerCase() === e) || null;
  }

  function registerUser({ name, email, password, college, role = "student", companyName = "" }) {
    if (!name || !email || !password) {
      return { ok: false, error: "All fields are required." };
    }
    if (findUserByEmail(email)) {
      return { ok: false, error: "An account with this email already exists." };
    }
    const users = getAllUsers();
    const user = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordDemo: obfuscate(password),
      role: role === "company" ? "company" : "student",
      companyName: role === "company" ? (companyName || name).trim() : "",
      college: college || "",
      createdOn: new Date().toISOString()
    };
    users.push(user);
    saveAllUsers(users);
    setCurrentUser(user.email);
    return { ok: true, user };
  }

  function cacheAuthenticatedUser({ name, email, password, college = "", role = "student", companyName = "" }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return null;
    const users = getAllUsers();
    const index = users.findIndex((item) => item.email.toLowerCase() === normalizedEmail);
    const existing = index >= 0 ? users[index] : {};
    const user = { ...existing, name: name || existing.name || normalizedEmail, email: normalizedEmail, passwordDemo: obfuscate(password || deobfuscate(existing.passwordDemo || "")), college: college || existing.college || "", role, companyName: companyName || existing.companyName || "", createdOn: existing.createdOn || new Date().toISOString() };
    if (index >= 0) users[index] = user; else users.push(user);
    saveAllUsers(users);
    setCurrentUser(normalizedEmail);
    return user;
  }

  function loginUser(email, password) {
    const user = findUserByEmail(email);
    if (!user) return { ok: false, error: "No account found with that email." };
    if (deobfuscate(user.passwordDemo) !== password) {
      return { ok: false, error: "Incorrect password." };
    }
    setCurrentUser(user.email);
    return { ok: true, user };
  }

  function ensureDemoUser() {
    const demoEmail = "demo@internmatch.dev";
    let user = findUserByEmail(demoEmail);
    if (!user) {
      const users = getAllUsers();
      user = {
        name: "Priya Sharma",
        email: demoEmail,
        passwordDemo: obfuscate("demo1234"),
        college: "Sri Venkateswara College of Engineering",
        createdOn: new Date().toISOString()
      };
      users.push(user);
      saveAllUsers(users);
      saveProfile(demoEmail, {
        fullName: "Priya Sharma",
        college: user.college,
        degree: "B.Tech",
        course: "Computer Science",
        academicYear: "3",
        graduationYear: "2027",
        cgpa: "8.4",
        skills: ["Python", "SQL", "JavaScript", "React", "Data Structures"],
        interests: ["Artificial Intelligence", "Cloud Computing", "Software Development"],
        preferredSector: "Software Development",
        preferredLocation: "Bengaluru",
        preferredDuration: "6",
        resumeFileName: ""
      });
    }
    return user;
  }

  function loginDemoUser() {
    const user = ensureDemoUser();
    setCurrentUser(user.email);
    return { ok: true, user };
  }

  function setCurrentUser(email) {
    write(KEYS.currentUser, email);
  }

  function getCurrentUser() {
    const email = read(KEYS.currentUser, null);
    if (!email) return null;
    const user = findUserByEmail(email);
    if (!user) return null;
    return { name: user.name, email: user.email, college: user.college, role: user.role || "student", companyName: user.companyName || "" };
  }

  function logout() {
    localStorage.removeItem(KEYS.currentUser);
  }

  // ---------- Profile ----------

  function defaultProfile() {
    return {
      fullName: "",
      headline: "",
      summary: "",
      college: "",
      degree: "",
      course: "",
      academicYear: "",
      graduationYear: "",
      cgpa: "",
      mobileNumber: "",
      skills: [],
      interests: [],
      projects: [],
      linkedIn: "",
      github: "",
      portfolio: "",
      preferredSector: "",
      preferredLocation: "",
      preferredDuration: "",
      resumeFileName: "",
      photo: ""
    };
  }

  function getProfile(email) {
    if (!email) return defaultProfile();
    return Object.assign(defaultProfile(), read(KEYS.profile(email), {}));
  }

  function saveProfile(email, profile) {
    if (!email) return false;
    const merged = Object.assign(getProfile(email), profile);
    const saved = write(KEYS.profile(email), merged);
    const user = getCurrentUser();
    const token = sessionStorage.getItem("im_student_api_token");
    if (saved && token && user?.email === email && user.role === "student") {
      let consent = { profileVisible: false, cvShared: false };
      try { consent = JSON.parse(localStorage.getItem(`im_company_consent_${email.toLowerCase()}`) || "{}"); } catch (_) { /* Keep sharing disabled. */ }
      fetch("http://127.0.0.1:3002/api/student/profile", { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ profile: merged, profileVisible: consent.profileVisible === true, cvShared: consent.cvShared === true }) }).catch(() => {});
    }
    return saved;
  }

  function profileCompletion(profile) {
    const fields = [
      profile.fullName, profile.college, profile.degree, profile.course,
      profile.academicYear, profile.graduationYear,
      profile.skills && profile.skills.length ? "x" : "",
      profile.interests && profile.interests.length ? "x" : "",
      profile.projects && profile.projects.length ? "x" : "",
      profile.preferredSector, profile.preferredLocation, profile.preferredDuration,
      profile.headline, profile.summary
    ];
    const filled = fields.filter((f) => f && String(f).trim() !== "").length;
    return Math.round((filled / fields.length) * 100);
  }

  // ---------- Internships (base catalogue + admin overrides) ----------

  function defaultAdminState() {
    return { added: [], edited: {}, deleted: [] };
  }

  function getAdminState() {
    return Object.assign(defaultAdminState(), read(KEYS.adminInternships, {}));
  }

  function saveAdminState(state) {
    write(KEYS.adminInternships, state);
  }

  function getAllInternships() {
    const base = (typeof INTERNSHIP_DATA !== "undefined" ? INTERNSHIP_DATA : []).slice();
    const admin = getAdminState();
    const combined = base
      .filter((i) => admin.deleted.indexOf(i.id) === -1)
      .map((i) => (admin.edited[i.id] ? Object.assign({}, i, admin.edited[i.id]) : i));
    admin.added.forEach((i) => {
      if (admin.deleted.indexOf(i.id) === -1) combined.push(i);
    });
    return combined;
  }

  function getInternshipById(id) {
    return getAllInternships().find((i) => i.id === id) || null;
  }

  function addInternship(data) {
    const admin = getAdminState();
    const record = Object.assign({}, data, { id: data.id || genId("int") });
    admin.added.push(record);
    saveAdminState(admin);
    return record;
  }

  function updateInternship(id, patch) {
    const admin = getAdminState();
    const addedIdx = admin.added.findIndex((i) => i.id === id);
    if (addedIdx !== -1) {
      admin.added[addedIdx] = Object.assign({}, admin.added[addedIdx], patch);
    } else {
      admin.edited[id] = Object.assign({}, admin.edited[id] || {}, patch);
    }
    saveAdminState(admin);
  }

  function deleteInternship(id) {
    const admin = getAdminState();
    admin.added = admin.added.filter((i) => i.id !== id);
    if (admin.deleted.indexOf(id) === -1) admin.deleted.push(id);
    saveAdminState(admin);
  }

  // ---------- Saved internships ----------

  function getSavedIds(email) {
    if (!email) return [];
    return read(KEYS.saved(email), []);
  }

  function isSaved(email, id) {
    return getSavedIds(email).indexOf(id) !== -1;
  }

  function toggleSaved(email, id) {
    if (!email) return false;
    const ids = getSavedIds(email);
    const idx = ids.indexOf(id);
    if (idx === -1) {
      ids.push(id);
    } else {
      ids.splice(idx, 1);
    }
    write(KEYS.saved(email), ids);
    return idx === -1; // true if now saved
  }

  // ---------- Applications ----------

  function getApplications(email) {
    if (!email) return [];
    return read(KEYS.applications(email), []);
  }

  function saveApplications(email, apps) {
    write(KEYS.applications(email), apps);
  }

  function hasApplied(email, internshipId) {
    return getApplications(email).some(
      (a) => a.internshipId === internshipId && a.status !== "Withdrawn"
    );
  }

  function applyToInternship(email, internshipId) {
    if (!email) return { ok: false, error: "You must be logged in to apply." };
    if (hasApplied(email, internshipId)) {
      return { ok: false, error: "You've already applied to this internship." };
    }
    const apps = getApplications(email);
    const record = {
      internshipId,
      appliedOn: new Date().toISOString(),
      status: "Applied",
      notes: "",
      history: [{ status: "Applied", on: new Date().toISOString() }]
    };
    apps.push(record);
    saveApplications(email, apps);
    const user = getCurrentUser();
    const token = sessionStorage.getItem("im_student_api_token");
    if (token && user?.email === email && user.role === "student") fetch("http://127.0.0.1:3002/api/student/applications", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ internshipId }) }).catch(() => {});
    return { ok: true, application: record };
  }

  function updateApplicationStatus(email, internshipId, status) {
    const apps = getApplications(email);
    const app = apps.find((a) => a.internshipId === internshipId);
    if (!app) return false;
    app.status = status;
    app.history.push({ status, on: new Date().toISOString() });
    saveApplications(email, apps);
    return true;
  }

  function withdrawApplication(email, internshipId) {
    return updateApplicationStatus(email, internshipId, "Withdrawn");
  }

  function updateApplicationNotes(email, internshipId, notes) {
    const apps = getApplications(email);
    const app = apps.find((a) => a.internshipId === internshipId);
    if (!app) return false;
    app.notes = notes;
    saveApplications(email, apps);
    return true;
  }

  // ---------- Skill progress ----------

  function getSkillProgress(email) {
    if (!email) return {};
    return read(KEYS.skillProgress(email), {});
  }

  function toggleSkillLearned(email, skill) {
    if (!email) return false;
    const progress = getSkillProgress(email);
    progress[skill] = !progress[skill];
    write(KEYS.skillProgress(email), progress);
    return progress[skill];
  }

  // ---------- Recently viewed ----------

  function getRecentlyViewed(email) {
    if (!email) return [];
    return read(KEYS.recentlyViewed(email), []);
  }

  function addRecentlyViewed(email, internshipId) {
    if (!email) return;
    let ids = getRecentlyViewed(email).filter((id) => id !== internshipId);
    ids.unshift(internshipId);
    ids = ids.slice(0, 8);
    write(KEYS.recentlyViewed(email), ids);
  }

  // ---------- Generic blob storage (used by calendar/interview-prep) ----------

  function readBlob(key, fallback) {
    return read(key, fallback);
  }

  function writeBlob(key, value) {
    return write(key, value);
  }

  return {
    KEYS,
    genId,
    registerUser,
    cacheAuthenticatedUser,
    loginUser,
    loginDemoUser,
    getCurrentUser,
    setCurrentUser,
    logout,
    getAllUsers,
    findUserByEmail,
    getProfile,
    saveProfile,
    profileCompletion,
    getAllInternships,
    getInternshipById,
    addInternship,
    updateInternship,
    deleteInternship,
    getSavedIds,
    isSaved,
    toggleSaved,
    getApplications,
    hasApplied,
    applyToInternship,
    updateApplicationStatus,
    withdrawApplication,
    updateApplicationNotes,
    getSkillProgress,
    toggleSkillLearned,
    getRecentlyViewed,
    addRecentlyViewed,
    readBlob,
    writeBlob
  };
})();
