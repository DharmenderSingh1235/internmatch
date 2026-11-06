/* Company candidate search. Student profiles/CVs are returned only after consent. */
document.addEventListener("DOMContentLoaded", async () => {
  const API = `${window.IM_API_BASE}/api/company`;
  const statusEl = document.getElementById("company-api-status");
  const token = sessionStorage.getItem("im_company_api_token");
  const account = Store.getCurrentUser();
  const esc = (value) => App.escapeHtml(String(value == null ? "" : value));
  const initials = (name) => String(name || "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  let shortlistIds = new Set();
  if (!account || account.role !== "company" || !token) { window.location.replace("login.html?role=company"); return; }

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Company API is unavailable.");
    return data;
  }
  function setApiStatus(online, text) { if (!statusEl) return; statusEl.textContent = text; statusEl.classList.toggle("is-online", online); }
  const setCount = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
  async function refreshShortlists() { const data = await api("/shortlists"); shortlistIds = new Set(data.items.map((item) => item.studentId)); }
  function candidateCard(candidate, recommendation) {
    const match = recommendation && recommendation.match;
    const matchedSkills = match ? match.matched_skills : [];
    const missing = match ? match.missing_skills : [];
    const shortlisted = shortlistIds.has(candidate.id);
    const score = match ? `<div class="candidate-score">${esc(match.score)}%<small>skills &amp; criteria</small></div>` : "";
    return `<article class="candidate-card"><div class="candidate-card__top"><div class="candidate-card__identity"><span class="candidate-avatar">${esc(initials(candidate.name))}</span><div><h3>${esc(candidate.name)}</h3><p class="candidate-meta">${esc(candidate.degree)} · ${esc(candidate.course)} · ${candidate.year ? `Year ${esc(candidate.year)} · ` : ""}${esc(candidate.college)} · ${esc(candidate.location || "Location not provided")}</p></div></div>${score}</div><p class="candidate-card__experience">${esc(candidate.experience || "Student has not added a summary yet.")}</p><div class="candidate-tags">${(candidate.skills || []).map((skill) => `<span class="candidate-tag ${match && matchedSkills.includes(skill) ? "candidate-tag--match" : ""}">${esc(skill)}</span>`).join("")}</div>${match ? `<p class="candidate-reason" style="margin-top:10px"><strong>Match details:</strong> ${esc(match.explanation)}${missing.length ? ` · Skills to build: ${missing.map(esc).join(", ")}` : ""}</p>` : ""}<div class="candidate-card__foot"><p class="candidate-reason">${candidate.cvAvailableToCompany ? "CV shared" : candidate.cvShared ? "CV available after application" : "CV not shared"}</p><div class="company-card-actions"><button type="button" class="btn btn--ghost btn--sm" data-profile="${esc(candidate.id)}">View profile</button>${candidate.cvAvailableToCompany ? `<button type="button" class="btn btn--ghost btn--sm" data-cv="${esc(candidate.id)}">Open CV</button>` : ""}${candidate.isApplicant ? `<button type="button" class="btn btn--${shortlisted ? "secondary" : "ghost"} btn--sm" data-shortlist="${esc(candidate.id)}">${shortlisted ? "Shortlisted ✓" : "Shortlist"}</button>` : `<span class="company-muted">Shortlist after application</span>`}</div></div></article>`;
  }
  function ensureProfileDialog() {
    let dialog = document.getElementById("company-student-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog"); dialog.id = "company-student-dialog"; dialog.className = "company-student-dialog";
    dialog.innerHTML = `<div class="company-dialog-head"><div><p class="company-eyebrow">STUDENT PROFILE</p><h2 id="company-student-dialog-title">Candidate</h2></div><button type="button" class="btn btn--ghost btn--sm" data-close-dialog>Close</button></div><div id="company-student-dialog-content"></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (event) => { if (event.target === dialog || event.target.closest("[data-close-dialog]")) dialog.close(); });
    dialog.addEventListener("submit", async (event) => {
      const form = event.target.closest("#company-interview-form"); if (!form) return;
      event.preventDefault(); const studentId = form.dataset.studentId;
      try {
        await api("/interviews", { method: "POST", body: JSON.stringify({ studentId, type: form.elements.type.value, date: form.elements.date.value, time: form.elements.time.value, mode: form.elements.mode.value, details: form.elements.details.value.trim() }) });
        App.toast("Interview scheduled."); dialog.close();
      } catch (error) { App.toast(error.message, "error"); }
    });
    dialog.addEventListener("click", async (event) => {
      const short = event.target.closest("[data-dialog-shortlist]"); if (!short) return;
      const id = short.dataset.dialogShortlist;
      try { await api("/shortlists", { method: "POST", body: JSON.stringify({ studentId: id }) }); await refreshShortlists(); short.textContent = "Shortlisted ✓"; }
      catch (error) { App.toast(error.message, "error"); }
    });
    return dialog;
  }
  async function showProfile(id) {
    const dialog = ensureProfileDialog(); const content = document.getElementById("company-student-dialog-content");
    content.innerHTML = `<div class="company-empty">Loading shared profile…</div>`; dialog.showModal();
    try {
      const data = await api(`/students/${encodeURIComponent(id)}`); const student = data.student;
      document.getElementById("company-student-dialog-title").textContent = student.name;
      const detail = (label, value) => `<div class="company-profile-detail"><dt>${esc(label)}</dt><dd>${esc(value || "Not provided")}</dd></div>`;
      const projects = (student.projects || []).map((project) => `<article class="company-project"><strong>${esc(project.title || "Project")}</strong><p>${esc(project.technologies || "")}</p><p>${esc(project.description || "")}</p>${project.url ? `<a href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">View project ↗</a>` : ""}</article>`).join("") || `<p class="company-muted">No projects shared yet.</p>`;
      content.innerHTML = `<div class="company-profile-grid">${student.isApplicant ? `${detail("Email", student.email)}${detail("Mobile", student.mobileNumber)}` : detail("Contact", "Available after the student applies to one of your postings")}${detail("College", student.college)}${detail("Degree / course", `${student.degree} ${student.course}`)}${detail("Graduation year", student.graduationYear)}${detail("CGPA", student.cgpa)}${detail("Location", student.location)}${detail("Skills", (student.skills || []).join(", "))}${detail("Interests", (student.interests || []).join(", "))}${detail("Summary", student.experience)}</div><section class="company-dialog-section"><h3>Projects &amp; portfolio</h3>${projects}</section><section class="company-dialog-section"><h3>Professional links</h3><div class="company-inline-links">${student.linkedIn ? `<a href="${esc(student.linkedIn)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}${student.github ? `<a href="${esc(student.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` : ""}${student.portfolio ? `<a href="${esc(student.portfolio)}" target="_blank" rel="noopener noreferrer">Portfolio ↗</a>` : ""}</div></section>${student.isApplicant ? `<section class="company-dialog-section"><div class="company-dialog-head"><h3>Schedule an interview</h3>${student.cvAvailableToCompany ? `<button type="button" class="btn btn--secondary btn--sm" data-cv="${esc(student.id)}">Open shared CV</button>` : `<span class="company-muted">CV not shared</span>`}</div><form id="company-interview-form" class="company-form-grid" data-student-id="${esc(student.id)}"><div class="field"><label>Interview type</label><select name="type"><option>Interview</option><option>Group discussion</option><option>Technical assessment</option><option>Online assessment</option></select></div><div class="field"><label>Date</label><input name="date" type="date" required /></div><div class="field"><label>Time</label><input name="time" type="time" required /></div><div class="field"><label>Format</label><select name="mode"><option>Online</option><option>In person</option></select></div><div class="field company-form-wide"><label>Meeting link / notes</label><input name="details" /></div><button class="btn btn--primary company-form-wide" type="submit">Save interview schedule</button></form><button type="button" class="btn btn--ghost" data-dialog-shortlist="${esc(student.id)}">${shortlistIds.has(student.id) ? "Shortlisted ✓" : "Shortlist student"}</button></section>` : `<section class="company-dialog-section"><p class="company-muted">This student has shared a discoverable profile. Contact details and CV access are available after they apply to one of your postings.</p></section>`}`;
    } catch (error) { content.innerHTML = `<div class="company-empty">${esc(error.message)}</div>`; }
  }
  async function openCv(id) {
    try {
      const data = await api(`/students/${encodeURIComponent(id)}/cv`);
      const bytes = Uint8Array.from(atob(data.data), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || "application/pdf" }));
      const dialog = ensureProfileDialog(); const content = document.getElementById("company-student-dialog-content");
      const student = await api(`/students/${encodeURIComponent(id)}`);
      document.getElementById("company-student-dialog-title").textContent = `${student.student.name} · shared CV`;
      content.innerHTML = `<p>The student explicitly shared this resume with active company accounts.</p><a class="btn btn--primary" href="${url}" target="_blank" rel="noopener" download="${esc(data.fileName)}">Open / download ${esc(data.fileName)}</a>`;
      dialog.showModal(); dialog.addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
    } catch (error) { App.toast(error.message, "error"); }
  }
  function renderCards(container, candidates, withMatch) {
    if (!container) return;
    container.innerHTML = candidates.length ? candidates.map((candidate) => candidateCard(candidate, withMatch ? candidate : null)).join("") : `<div class="company-empty">No students have shared their profile yet, or no candidates match these filters.</div>`;
    container.querySelectorAll("[data-shortlist]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.shortlist;
      try { if (shortlistIds.has(id)) await api(`/shortlists/${encodeURIComponent(id)}`, { method: "DELETE" }); else await api("/shortlists", { method: "POST", body: JSON.stringify({ studentId: id }) }); await refreshShortlists();
        const page = document.body.dataset.companyPage; if (page === "recommended") loadRecommendations(); else loadCandidates();
      } catch (error) { App.toast(error.message, "error"); }
    }));
    container.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => showProfile(button.dataset.profile)));
    container.querySelectorAll("[data-cv]").forEach((button) => button.addEventListener("click", () => openCv(button.dataset.cv)));
  }
  async function loadCandidates() {
    const container = document.getElementById("candidate-list"); if (!container) return;
    const params = new URLSearchParams();
    const q = document.getElementById("candidate-query")?.value.trim(); const skill = document.getElementById("candidate-skill")?.value.trim(); const location = document.getElementById("candidate-location")?.value.trim();
    if (q) params.set("q", q); if (skill) params.set("skill", skill); if (location) params.set("location", location);
    container.innerHTML = `<div class="company-empty">Loading student profiles…</div>`;
    try { const data = await api(`/students?${params.toString()}`); setApiStatus(true, "Shared student data connected"); setCount("candidate-result-count", data.total); renderCards(container, data.items, false); }
    catch (error) { setApiStatus(false, "Company service offline"); container.innerHTML = `<div class="company-empty">${esc(error.message)}<br>Start the InternMatch server with <code>cd server; npm start</code>.</div>`; }
  }
  async function loadRecommendations() {
    const container = document.getElementById("recommendation-list"); const select = document.getElementById("internship-select"); if (!container || !select || !select.value) return;
    container.innerHTML = `<div class="company-empty">Ranking student profiles against your role…</div>`;
    try { const data = await api(`/recommendations?internship_id=${encodeURIComponent(select.value)}`); setApiStatus(true, "Shared student data connected"); const reqs = document.getElementById("selected-internship-summary"); if (reqs) reqs.innerHTML = `<strong>${esc(data.internship.title)}</strong> · Required: ${(data.internship.skills || []).map(esc).join(", ")}<br><small>Match signals support human review; they are not hiring decisions.</small>`; renderCards(container, data.items, true); }
    catch (error) { setApiStatus(false, "Company service offline"); container.innerHTML = `<div class="company-empty">${esc(error.message)}</div>`; }
  }
  async function initialize() {
    try { await refreshShortlists(); }
    catch (error) { setApiStatus(false, error.message); return; }
    if (document.body.dataset.companyPage === "find") {
      const form = document.getElementById("candidate-filters"); form?.addEventListener("submit", (event) => { event.preventDefault(); loadCandidates(); });
      document.getElementById("clear-candidate-filters")?.addEventListener("click", () => { form.reset(); loadCandidates(); }); loadCandidates();
    } else if (document.body.dataset.companyPage === "recommended") {
      try { const data = await api("/internships"); const select = document.getElementById("internship-select");
        select.innerHTML = data.items.length ? data.items.map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join("") : `<option value="">No company internships yet</option>`;
        select.disabled = !data.items.length; select.addEventListener("change", loadRecommendations); if (data.items.length) await loadRecommendations(); else document.getElementById("recommendation-list").innerHTML = `<div class="company-empty">Post an internship in your <a href="company-dashboard.html#internships">company workspace</a> to see student matches.</div>`;
      } catch (error) { setApiStatus(false, "Company service offline"); document.getElementById("recommendation-list").innerHTML = `<div class="company-empty">${esc(error.message)}</div>`; }
    }
  }
  await initialize();
});
