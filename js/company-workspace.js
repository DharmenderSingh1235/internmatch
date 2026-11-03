/* Server-backed Company workspace. Company data is shared through the API. */
document.addEventListener("DOMContentLoaded", async () => {
  const user = Store.getCurrentUser();
  const token = sessionStorage.getItem("im_company_api_token");
  if (!user || user.role !== "company" || !token) {
    window.location.replace("login.html?role=company");
    return;
  }
  const api = async (route, options = {}) => {
    const response = await fetch(`${window.IM_API_BASE}/api${route}`, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Company API request failed (${response.status}) at ${route}. If this is a new feature route, restart the server folder's API with npm start.`);
    return data;
  };
  const esc = (value) => App.escapeHtml(String(value == null ? "" : value));
  const dateLabel = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const statusOptions = ["Applied", "Shortlisted", "Assessment", "Interview", "Offered", "Rejected"];
  let company, internships = [], applicants = [], schedules = [], assessments = [], assessmentLoadError = "";
  const alertError = (error) => App.toast(error.message || "Could not complete that action.", "error");
  function setApiConnection(connected, detail = "Local API · port 3002") {
    const badge = document.getElementById("settings-api-indicator");
    const dot = document.getElementById("settings-api-dot");
    const state = document.getElementById("settings-api-state");
    const topBadge = document.querySelector(".company-api-pill");
    if (badge) { badge.textContent = connected ? "Connected" : "Offline"; badge.classList.toggle("is-online", connected); badge.classList.toggle("is-offline", !connected); }
    if (dot) { dot.classList.toggle("is-online", connected); dot.classList.toggle("is-offline", !connected); }
    if (state) state.textContent = connected ? "API connection is active" : "Could not reach the API";
    const detailNode = document.getElementById("settings-api-detail"); if (detailNode) detailNode.textContent = detail;
    if (topBadge) { topBadge.textContent = connected ? "API connected" : "API offline"; topBadge.classList.toggle("is-online", connected); }
  }
  async function checkApiConnection() {
    const button = document.getElementById("settings-api-check");
    if (button) { button.disabled = true; button.textContent = "Checking…"; }
    try {
      const response = await fetch(`${window.IM_API_BASE}/api/health`, { cache: "no-store" });
      if (!response.ok) throw new Error("API health check failed");
      setApiConnection(true);
      return true;
    } catch (_) { setApiConnection(false, "Start the API with npm start in the server folder"); return false; }
    finally { if (button) { button.disabled = false; button.textContent = "Check connection"; } }
  }

  function renderRoleCard(role, compact = false) {
    const count = applicants.filter((item) => item.internshipId === role.id).length;
    const active = role.status === "active";
    const statusLabel = ({ active: "Approved · live", paused: "Paused", pending_approval: "Pending admin review", rejected: "Changes requested" })[role.status] || role.status;
    return `<article class="company-role-card"><div class="company-role-main"><div><span class="company-status-badge ${active ? "is-active" : ""}">${esc(statusLabel)}</span><h3>${esc(role.title)}</h3><p>${esc(role.postingType || "Internship")} · ${esc(role.location || "Location flexible")} · ${esc(role.duration || role.employmentType || "Duration not set")}${role.stipend ? ` · ${esc(role.stipend)}` : role.salary ? ` · ${esc(role.salary)}` : ""}</p>${role.adminReviewNote ? `<p class="company-role-description">Admin note: ${esc(role.adminReviewNote)}</p>` : ""}${!compact && role.description ? `<p class="company-role-description">${esc(role.description)}</p>` : ""}<div class="candidate-tags">${(role.skills || []).map((skill) => `<span class="candidate-tag">${esc(skill)}</span>`).join("")}</div></div><div class="company-role-side"><strong>${count}</strong><small>applicants</small><small>Deadline ${esc(dateLabel(role.deadline))}</small></div></div>${compact ? "" : `<div class="company-role-actions"><button class="btn btn--ghost btn--sm" type="button" data-edit-role="${esc(role.id)}">Edit</button>${active || role.status === "paused" ? `<button class="btn btn--ghost btn--sm" type="button" data-toggle-role="${esc(role.id)}">${active ? "Pause listing" : "Reopen listing"}</button>` : ""}<button class="btn btn--ghost btn--sm company-danger" type="button" data-delete-role="${esc(role.id)}">Delete</button></div>`}</article>`;
  }
  function renderApplicants(target, items) {
    if (!target) return;
    target.innerHTML = items.length ? items.map((item) => {
      const student = item.student;
      const candidateName = student?.name || "Profile not shared";
      const scores = (student?.interviewScores || []).filter((entry) => Number(entry.total) > 0 && Number.isFinite(Number(entry.score)));
      const best = scores.reduce((value, entry) => Math.max(value, Math.round(Number(entry.score) / Number(entry.total) * 100)), 0);
      const cvStatus = student?.cvAvailableToCompany
        ? "CV ready to open"
        : student?.cvUploaded && !student?.adminCvApproved
        ? "Awaiting admin CV approval"
        : student?.cvShared
        ? "Permission on · CV file missing"
        : "CV not shared";
      return `<tr><td><div class="company-applicant-identity"><span class="company-applicant-avatar">${esc(candidateName.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase())}</span><span><strong>${esc(candidateName)}</strong>${student ? `<small class="company-table-sub">${esc(student.email || "")}</small><small class="company-table-sub">${esc((student.skills || []).slice(0, 5).join(" · ") || "Skills not added")}</small>` : `<small class="company-table-sub">Student account unavailable</small>`}</span></div>${student ? `<span class="company-applicant-actions"><button type="button" class="btn btn--ghost btn--sm" data-view-applicant="${esc(student.id)}">View profile</button>${student.cvAvailableToCompany ? `<button type="button" class="btn btn--ghost btn--sm" data-view-applicant-cv="${esc(student.id)}">Open shared CV</button>` : `<small>${cvStatus}</small>`}</span>` : ""}</td><td><strong>${esc(item.internshipTitle)}</strong></td><td>${esc(dateLabel(item.appliedAt?.slice(0, 10)))}</td><td>${student ? `<span class="company-profile-access-pill">Profile shared</span><small class="company-table-sub">${cvStatus}</small>${scores.length ? `<small class="company-table-sub">Practice best: ${best}% · ${scores.length} quiz${scores.length === 1 ? "" : "zes"}</small>` : `<small class="company-table-sub">No practice scores</small>`}` : "—"}</td><td><select class="company-status-select" data-applicant-status="${esc(item.id)}" aria-label="Recruitment stage for ${esc(candidateName)}">${statusOptions.map((status) => `<option${item.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></td><td><button type="button" class="btn btn--ghost btn--sm company-danger" data-reject-application="${esc(item.id)}" ${item.status === "Rejected" ? "disabled" : ""}>${item.status === "Rejected" ? "Rejected" : "Reject"}</button></td></tr>`;
    }).join("") : `<tr><td colspan="6"><div class="company-empty">No applications for this company yet.</div></td></tr>`;
  }
  function renderSchedule(item) {
    const isPast = item.date < new Date().toISOString().slice(0, 10);
    const isOnline = /online|video|virtual/i.test(item.mode || "Online");
    const feedbackBadge = item.feedback ? `<p class="company-muted" style="color:var(--color-success);font-weight:600;margin-top:4px;">✓ Evaluated: ${esc(item.feedback.decision === "offer" ? "Recommended Offer" : item.feedback.decision === "reject" ? "Rejected" : "Next Round")}</p>` : "";
    return `<article class="company-schedule-card${isPast ? " is-past" : ""}"><div class="company-schedule-date"><strong>${esc(item.date.slice(8, 10))}</strong><span>${esc(new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { month: "short" }))}</span></div><div class="company-schedule-copy"><span class="company-schedule-kind">${esc(isPast ? "Completed" : "Upcoming")} · ${esc(item.type)}</span><h3>${esc(item.studentName)}</h3><p>${esc(item.internshipTitle || "Candidate meeting")} · ${esc(item.time || "Time TBD")} · ${esc(item.mode || "Online")}</p>${item.details ? `<p class="company-muted">${esc(item.details)}</p>` : ""}${feedbackBadge}</div><div class="company-schedule-actions">${!isPast ? `${isOnline ? `<button type="button" class="btn btn--primary btn--sm" data-start-call="${esc(item.id)}">📹 Start Video Call</button>` : ""}<button type="button" class="btn btn--ghost btn--sm" data-add-calendar="${esc(item.id)}">Add to calendar</button>` : ""}<button type="button" class="btn btn--ghost btn--sm company-danger" data-delete-schedule="${esc(item.id)}">Remove</button></div></article>`;
  }
  function addAssessmentQuestion(question = null) {
    const questions = document.getElementById("assessment-questions");
    const index = questions.children.length + 1;
    const card = document.createElement("fieldset");
    card.className = "company-form-section company-assessment-question";
    card.innerHTML = `<legend><span>${String(index).padStart(2, "0")}</span> Question <button type="button" class="btn btn--ghost btn--sm" data-remove-assessment-question>Remove</button></legend><div class="company-form-grid"><div class="field"><label>Question type</label><select data-question-type><option>MCQ</option><option>Coding</option><option>Descriptive</option></select></div><div class="field"><label>Marks</label><input type="number" data-question-marks min="1" max="100" value="1" required></div><div class="field company-form-wide"><label>Question prompt</label><textarea data-question-prompt rows="2" required placeholder="Write the question"></textarea></div><div class="field company-form-wide" data-mcq-options><label>Answer choices (four)</label><div class="company-form-grid">${[0,1,2,3].map((i) => `<input data-question-option="${i}" required placeholder="Option ${String.fromCharCode(65+i)}">`).join("")}</div><label>Correct option</label><select data-question-correct><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div><div class="field company-form-wide"><label>Explanation (optional)</label><input data-question-explanation maxlength="1000" placeholder="Shown only to recruiter after the test"></div></div>`;
    questions.append(card);
    if (question) {
      const typeSelect = card.querySelector("[data-question-type]");
      typeSelect.value = question.type;
      typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      card.querySelector("[data-question-marks]").value = question.marks || 1;
      card.querySelector("[data-question-prompt]").value = question.prompt || "";
      card.querySelectorAll("[data-question-option]").forEach((input, optionIndex) => { input.value = question.options?.[optionIndex] || ""; });
      card.querySelector("[data-question-correct]").value = String(question.correctIndex >= 0 ? question.correctIndex : 0);
      card.querySelector("[data-question-explanation]").value = question.explanation || "";
    }
  }
  function renderAssessments() {
    const list = document.getElementById("company-assessment-list");
    if (!list) return;
    document.getElementById("company-assessment-count").textContent = `${assessments.length} assessment${assessments.length === 1 ? "" : "s"}`;
    if (assessmentLoadError) { list.innerHTML = `<div class="company-empty">${esc(assessmentLoadError)} Restart the API from the server folder with <code>npm start</code>, then refresh this page.</div>`; return; }
    list.innerHTML = assessments.length ? assessments.map((item) => `<article class="company-role-card"><div class="company-role-main"><div><span class="company-status-badge ${item.status === "approved" ? "is-active" : ""}">${esc(({ pending_approval: "Pending admin approval", approved: "Approved · available to applicants", rejected: "Changes requested" })[item.status] || item.status)}</span><h3>${esc(item.title)}</h3><p>${esc(item.roleTitle || internships.find((role) => role.id === item.internshipId)?.title || "Role")} · ${esc(item.category)} · ${esc(item.difficulty)} · ${item.durationMinutes} min · ${item.totalMarks} marks</p>${item.adminReviewNote ? `<p class="company-role-description">Admin note: ${esc(item.adminReviewNote)}</p>` : ""}</div><div class="company-role-side"><strong>${item.attempts?.length || 0}</strong><small>submissions</small></div></div>${item.attempts?.length ? `<details><summary>Review candidate submissions</summary><div class="company-assessment-results">${item.attempts.map((attempt) => `<article data-assessment-attempt="${esc(attempt.id)}" data-assessment-id="${esc(item.id)}"><strong>${esc(attempt.studentName || "Student")}</strong><span>${esc(attempt.studentEmail || "")} · ${attempt.score}/${attempt.totalMarks} marks · ${esc(attempt.status)}</span><small>${esc(dateLabel(attempt.submittedAt?.slice(0,10)))}</small>${attempt.writingReview ? `<aside class="assessment-writing-review"><strong>Possible AI-writing signals · heuristic, review only</strong><p>${esc(attempt.writingReview.label || "Limited writing-style review")}</p>${attempt.writingReview.signals?.length ? `<ul>${attempt.writingReview.signals.map((signal) => `<li>${esc(signal)}</li>`).join("")}</ul>` : ""}<small>${esc(attempt.writingReview.method || "Limited text heuristics.")} ${esc(attempt.writingReview.disclaimer || "These clues cannot prove AI use and must not determine hiring by themselves.")}</small></aside>` : ""}<div>${(attempt.answers || []).map((answer) => { const question = item.questions.find((entry) => entry.id === answer.questionId); const response = question?.type === "MCQ" ? (answer.answer == null ? "No answer" : `Option ${String.fromCharCode(65 + answer.answer)} · ${answer.correct ? "Correct" : "Incorrect"}`) : answer.answer || "No response"; return `<p><b>${esc(question?.prompt || "Question")}</b><br>${esc(response)}${question?.type !== "MCQ" && attempt.status !== "Reviewed" ? `<br><label>Marks (max ${question?.marks}) <input type="number" data-review-mark="${esc(question?.id)}" min="0" max="${question?.marks}" value="${answer.marksAwarded || 0}"></label>` : ""}</p>`; }).join("")}</div>${attempt.status === "Needs recruiter review" ? `<button type="button" class="btn btn--primary btn--sm" data-save-assessment-review>Save written-answer scores</button>` : ""}</article>`).join("")}</div></details>` : `<p class="company-muted">No student submissions yet.</p>`}</article>`).join("") : `<div class="company-empty">No company assessments yet. Create one above to send it for admin approval.</div>`;
    list.querySelectorAll("[data-save-assessment-review]").forEach((button) => button.addEventListener("click", async () => {
      const card = button.closest("[data-assessment-attempt]"); const assessment = assessments.find((item) => item.id === card.dataset.assessmentId); const attempt = assessment?.attempts.find((entry) => entry.id === card.dataset.assessmentAttempt); if (!assessment || !attempt) return;
      const marks = Object.fromEntries([...card.querySelectorAll("[data-review-mark]")].map((input) => [input.dataset.reviewMark, Number(input.value) || 0])); button.disabled = true;
      try { await api(`/company/assessments/${encodeURIComponent(assessment.id)}/submissions/${encodeURIComponent(attempt.id)}/review`, { method: "PATCH", body: JSON.stringify({ marks }) }); const refreshed = await api("/company/assessments"); assessments = refreshed.items || []; renderAssessments(); App.toast("Assessment response scores saved."); }
      catch (error) { alertError(error); button.disabled = false; }
    }));
  }
  function updateMeetingPreview() {
    const application = applicants.find((item) => item.id === document.getElementById("schedule-candidate").value);
    const mode = document.getElementById("schedule-mode").value;
    const date = document.getElementById("schedule-date").value;
    const time = document.getElementById("schedule-time").value;
    const details = document.getElementById("schedule-link").value.trim();
    document.getElementById("schedule-preview-type").textContent = document.getElementById("schedule-type").value;
    document.getElementById("schedule-preview-candidate").textContent = application?.student?.name || "Choose a candidate";
    document.getElementById("schedule-preview-role").textContent = application?.internshipTitle || "Candidate's applied role";
    document.getElementById("schedule-preview-date").textContent = date ? dateLabel(date) : "Select a date";
    document.getElementById("schedule-preview-time").textContent = time || "Select a time";
    document.getElementById("schedule-preview-mode").textContent = mode;
    document.getElementById("schedule-preview-location").textContent = details || (mode === "Online" ? "Add a meeting link" : "Add a venue address");
  }
  function downloadCalendarEvent(interview) {
    const start = new Date(`${interview.date}T${interview.time || "09:00"}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const stamp = (date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}00`;
    const escapeIcs = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const description = [interview.internshipTitle, interview.mode, interview.details].filter(Boolean).join("\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InternMatch//Recruiter Calendar//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${escapeIcs(interview.id)}@internmatch.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(`${interview.type}: ${interview.studentName}`)}`, `DESCRIPTION:${escapeIcs(description)}`, "END:VEVENT", "END:VCALENDAR"];
    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `internmatch-meeting-${interview.date}.ics`;
    document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }
  function render() {
    document.getElementById("company-stat-active").textContent = internships.filter((role) => role.status === "active").length;
    document.getElementById("company-stat-applicants").textContent = applicants.length;
    document.getElementById("company-stat-shortlisted").textContent = applicants.filter((item) => ["Shortlisted", "Assessment", "Interview", "Offered"].includes(item.status)).length;
    document.getElementById("company-stat-interviews").textContent = schedules.filter((item) => item.date >= new Date().toISOString().slice(0, 10)).length;
    const overviewRoles = document.getElementById("overview-internship-list");
    overviewRoles.innerHTML = internships.length ? internships.slice(0, 3).map((role) => renderRoleCard(role, true)).join("") : `<div class="company-empty">No internships posted yet. Create your first listing to get started.</div>`;
    renderApplicants(document.getElementById("overview-applicant-list"), applicants.slice(0, 4));
    const upcoming = schedules.filter((item) => item.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date));
    document.getElementById("overview-interview-list").innerHTML = upcoming.length ? upcoming.slice(0, 3).map(renderSchedule).join("") : `<div class="company-empty">No upcoming meetings. Schedule one from a shared student profile.</div>`;
    document.getElementById("internship-list").innerHTML = internships.length ? internships.map((role) => renderRoleCard(role)).join("") : `<div class="company-empty">No listings yet. Use the form above to add an internship.</div>`;
    document.getElementById("internship-count").textContent = `${internships.length} listing${internships.length === 1 ? "" : "s"}`;
    const roleFilter = document.getElementById("applicant-filter");
    const oldRole = roleFilter.value;
    roleFilter.innerHTML = `<option value="all">All internships</option>${internships.map((role) => `<option value="${esc(role.id)}">${esc(role.title)}</option>`).join("")}`;
    roleFilter.value = internships.some((role) => role.id === oldRole) ? oldRole : "all";
    const status = document.getElementById("applicant-status-filter").value;
    const query = document.getElementById("applicant-query").value.trim().toLocaleLowerCase();
    const filtered = applicants.filter((item) => {
      const student = item.student || {};
      const searchable = [student.name, student.email, ...(student.skills || []), item.internshipTitle].join(" ").toLocaleLowerCase();
      return (roleFilter.value === "all" || item.internshipId === roleFilter.value) && (status === "all" || item.status === status) && (!query || searchable.includes(query));
    });
    document.getElementById("applicant-count").textContent = `${filtered.length} applicant${filtered.length === 1 ? "" : "s"}`;
    document.getElementById("applicant-export").disabled = !filtered.length;
    renderApplicants(document.getElementById("applicant-list"), filtered);
    renderPipelineSummary();
    const schedulable = applicants.filter((item) => item.student);
    document.getElementById("schedule-candidate").innerHTML = `<option value="">Select an applicant</option>${schedulable.map((item) => `<option value="${esc(item.id)}">${esc(item.student.name)} · ${esc(item.internshipTitle)}</option>`).join("")}`;
    document.getElementById("schedule-candidate").disabled = !schedulable.length;
    const scheduleSave = document.getElementById("schedule-save"); if (scheduleSave) scheduleSave.disabled = !schedulable.length;
    const upcomingList = document.getElementById("schedule-list");
    document.getElementById("schedule-count").textContent = `${schedules.length} scheduled`;
    upcomingList.innerHTML = schedules.length ? schedules.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")).map(renderSchedule).join("") : `<div class="company-empty">No meetings scheduled yet. Choose one of your applicants to plan the next step.</div>`;
    updateMeetingPreview();
    renderProfileForm();
  }
  function renderPipelineSummary() {
    const summary = document.getElementById("company-pipeline-summary");
    if (!summary) return;
    const stages = ["Applied", "Shortlisted", "Assessment", "Interview", "Offered", "Rejected"];
    const selected = document.getElementById("applicant-status-filter").value;
    const counts = [{ label: "All applicants", value: applicants.length, key: "all" }, ...stages.map((stage) => ({ label: stage, value: applicants.filter((item) => item.status === stage).length, key: stage }))];
    summary.innerHTML = counts.map((item) => `<button type="button" class="company-pipeline-step${selected === item.key ? " is-active" : ""}" data-pipeline-stage="${esc(item.key)}" aria-pressed="${selected === item.key}"><span>${esc(item.label)}</span><strong>${item.value}</strong></button>`).join("");
    summary.querySelectorAll("[data-pipeline-stage]").forEach((button) => button.addEventListener("click", () => {
      const filter = document.getElementById("applicant-status-filter");
      filter.value = filter.value === button.dataset.pipelineStage ? "all" : button.dataset.pipelineStage;
      render();
    }));
  }
  function exportApplicantsCsv() {
    const roleId = document.getElementById("applicant-filter").value;
    const status = document.getElementById("applicant-status-filter").value;
    const query = document.getElementById("applicant-query").value.trim().toLocaleLowerCase();
    const rows = applicants.filter((item) => {
      const student = item.student || {};
      const searchable = [student.name, student.email, ...(student.skills || []), item.internshipTitle].join(" ").toLocaleLowerCase();
      return (roleId === "all" || item.internshipId === roleId) && (status === "all" || item.status === status) && (!query || searchable.includes(query));
    });
    if (!rows.length) return;
    const columns = ["Candidate", "Email", "Internship", "Applied on", "Skills", "Stage"];
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [columns, ...rows.map((item) => [item.student?.name || "Profile not shared", item.student?.email || "", item.internshipTitle, item.appliedAt ? dateLabel(item.appliedAt.slice(0, 10)) : "", (item.student?.skills || []).join("; "), item.status])].map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `internmatch-applicants-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  function renderProfileForm() {
    const values = { "profile-company-name": company?.name || "", "profile-industry": company?.industry || "", "profile-website": company?.website || "", "profile-location": company?.location || "", "profile-contact": company?.contact || "", "profile-about": company?.about || "" };
    Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = value; });
    updateCompanyProfilePreview();
  }
  function updateCompanyProfilePreview() {
    const read = (id) => document.getElementById(id)?.value.trim() || "";
    const name = read("profile-company-name") || "Your company";
    const industry = read("profile-industry") || "Industry";
    const location = read("profile-location") || "Headquarters not added";
    const about = read("profile-about");
    document.getElementById("profile-preview-monogram").textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    document.getElementById("profile-preview-name").textContent = name;
    document.getElementById("profile-preview-industry").textContent = industry;
    document.getElementById("profile-preview-location").textContent = location;
    document.getElementById("profile-preview-about").textContent = about || "Add a short introduction to help candidates learn about your organization.";
    document.getElementById("company-about-count").textContent = String(about.length);
    const websiteLink = document.getElementById("profile-preview-website");
    try {
      const url = new URL(read("profile-website"));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
      websiteLink.href = url.href; websiteLink.hidden = false;
    } catch (_) { websiteLink.hidden = true; websiteLink.removeAttribute("href"); }
    const checks = { name: !!read("profile-company-name"), industry: !!read("profile-industry"), location: !!read("profile-location"), about: !!about };
    Object.entries(checks).forEach(([key, complete]) => document.getElementById(`profile-check-${key}`).classList.toggle("is-done", complete));
    const percent = Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100);
    document.getElementById("company-profile-completeness-label").textContent = `${percent}%`;
    document.getElementById("company-profile-completeness-bar").style.width = `${percent}%`;
  }
  function setPageFromHash() {
    const id = window.location.hash.slice(1) || "overview";
    const valid = ["overview", "internships", "applicants", "assessments", "interviews", "company-profile", "settings"];
    const current = valid.includes(id) ? id : "overview";
    document.querySelectorAll("[data-company-section]").forEach((el) => { el.hidden = el.dataset.companySection !== current; });
    document.querySelectorAll("[data-company-nav]").forEach((link) => { if (link.dataset.companyNav === current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); });
    document.getElementById("company-page-heading").textContent = ({ overview: "Overview", internships: "Internships", applicants: "Applicants", assessments: "Assessments", interviews: "Interviews", "company-profile": "Company profile", settings: "Settings" })[current];
    if (current === "internships" && new URLSearchParams(window.location.search).get("new") === "1") document.getElementById("internship-title").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function fillCompanyIdentity() {
    const companyName = company?.name || user.companyName || user.name;
    ["company-sidebar-name", "settings-account-name"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = companyName; });
    ["company-avatar", "company-avatar-top"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); });
    document.getElementById("settings-account-email").textContent = user.email;
    const settingsAvatar = document.getElementById("settings-account-avatar"); if (settingsAvatar) settingsAvatar.textContent = companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    document.getElementById("profile-email").value = user.email;
    updateOpportunityPreview();
  }
  function updateOpportunityPreview() {
    const read = (id) => document.getElementById(id)?.value.trim() || "";
    const type = read("internship-type") || "Internship";
    const title = read("internship-title") || "Your role title";
    const sector = read("internship-sector") || "Department or sector";
    const location = read("internship-location") || "Location";
    const mode = read("internship-work-mode") || "On-site";
    const compensation = type === "Job" ? read("internship-salary") : read("internship-stipend");
    const deadline = read("internship-deadline");
    const skills = read("internship-skills").split(",").map((skill) => skill.trim()).filter(Boolean);
    const companyName = company?.name || user.companyName || user.name || "Your company";
    document.getElementById("opportunity-preview-monogram").textContent = companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    document.getElementById("opportunity-preview-company").textContent = companyName;
    document.getElementById("opportunity-preview-type").textContent = type;
    document.getElementById("opportunity-preview-title").textContent = title;
    document.getElementById("opportunity-preview-sector").textContent = sector;
    document.getElementById("opportunity-preview-location").textContent = location;
    document.getElementById("opportunity-preview-mode").textContent = mode;
    document.getElementById("opportunity-preview-compensation").textContent = compensation || (type === "Job" ? "Add salary range" : "Add stipend");
    document.getElementById("opportunity-preview-deadline").textContent = deadline ? dateLabel(deadline) : "Set a deadline";
    document.getElementById("opportunity-preview-skills").innerHTML = skills.length ? skills.slice(0, 5).map((skill) => `<span class="candidate-tag">${esc(skill)}</span>`).join("") : '<span class="candidate-tag">Add required skills</span>';
    document.getElementById("role-summary-count").textContent = String(read("internship-description").length);
    const required = [title !== "Your role title", sector !== "Department or sector", location !== "Location", read("internship-eligibility"), skills.length > 0, read("internship-description"), deadline, type === "Job" || !!read("internship-duration")];
    const completed = required.filter(Boolean).length;
    const percent = Math.round(completed / required.length * 100);
    document.getElementById("opportunity-completeness-label").textContent = `${percent}%`;
    document.getElementById("opportunity-completeness-bar").style.width = `${percent}%`;
  }
  function updateMeetingPreview() {
    const application = applicants.find((item) => item.id === document.getElementById("schedule-candidate").value);
    const mode = document.getElementById("schedule-mode").value;
    const date = document.getElementById("schedule-date").value;
    const time = document.getElementById("schedule-time").value;
    const details = document.getElementById("schedule-link").value.trim();
    document.getElementById("schedule-preview-type").textContent = document.getElementById("schedule-type").value;
    document.getElementById("schedule-preview-candidate").textContent = application?.student?.name || "Choose a candidate";
    document.getElementById("schedule-preview-role").textContent = application?.internshipTitle || "Candidate's applied role";
    document.getElementById("schedule-preview-date").textContent = date ? dateLabel(date) : "Select a date";
    document.getElementById("schedule-preview-time").textContent = time || "Select a time";
    document.getElementById("schedule-preview-mode").textContent = mode;
    document.getElementById("schedule-preview-location").textContent = details || (mode === "Online" ? "Add a meeting link" : "Add a venue address");
  }
  function downloadCalendarEvent(interview) {
    const start = new Date(`${interview.date}T${interview.time || "09:00"}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const stamp = (date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}00`;
    const escapeIcs = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const description = [interview.internshipTitle, interview.mode, interview.details].filter(Boolean).join("\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InternMatch//Recruiter Calendar//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${escapeIcs(interview.id)}@internmatch.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(`${interview.type}: ${interview.studentName}`)}`, `DESCRIPTION:${escapeIcs(description)}`, "END:VEVENT", "END:VCALENDAR"];
    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `internmatch-meeting-${interview.date}.ics`;
    document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  try {
    const results = await Promise.all([api("/company/me"), api("/company/internships"), api("/company/applications"), api("/company/interviews")]);
    company = results[0].company; internships = results[1].items; applicants = results[2].items; schedules = results[3].items;
    try { const assessmentData = await api("/company/assessments"); assessments = assessmentData.items || []; }
    catch (error) { assessments = []; assessmentLoadError = error.message; }
    document.getElementById("assessment-role").innerHTML = `<option value="">Choose your role</option>${internships.map((role) => `<option value="${esc(role.id)}">${esc(role.title)} · ${esc(({ active: "Approved", pending_approval: "Pending", rejected: "Needs changes", paused: "Paused" })[role.status] || role.status)}</option>`).join("")}`;
    fillCompanyIdentity(); render(); renderAssessments(); addAssessmentQuestion(); setPageFromHash(); checkApiConnection();
  } catch (error) {
    App.toast(error.message, "error");
    if (error.message.includes("Sign in again") || error.message.includes("inactive")) { sessionStorage.removeItem("im_company_api_token"); Store.logout(); window.location.replace("login.html?role=company"); return; }
    document.getElementById("overview-internship-list").innerHTML = `<div class="company-empty">${esc(error.message)} Start the InternMatch server, then sign in again.</div>`;
    return;
  }

  document.getElementById("internship-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("internship-edit-id").value;
    const body = { postingType: document.getElementById("internship-type").value, title: document.getElementById("internship-title").value.trim(), sector: document.getElementById("internship-sector").value.trim(), location: document.getElementById("internship-location").value.trim(), locationType: document.getElementById("internship-work-mode").value, duration: document.getElementById("internship-duration").value.trim(), stipend: document.getElementById("internship-stipend").value.trim(), salary: document.getElementById("internship-salary").value.trim(), employmentType: document.getElementById("internship-employment").value, positions: Number(document.getElementById("internship-positions").value), deadline: document.getElementById("internship-deadline").value, eligibility: document.getElementById("internship-eligibility").value.trim(), skills: document.getElementById("internship-skills").value.split(",").map((item) => item.trim()).filter(Boolean), description: document.getElementById("internship-description").value.trim(), responsibilities: document.getElementById("internship-responsibilities").value.trim() };
    try {
      const result = await api(id ? `/company/internships/${encodeURIComponent(id)}` : "/company/internships", { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (id) internships = internships.map((role) => role.id === id ? result.role : role); else internships.unshift(result.role);
      event.currentTarget.reset(); document.getElementById("internship-type").dispatchEvent(new Event("change")); document.getElementById("internship-edit-id").value = ""; document.getElementById("internship-form-title").textContent = "Post an opportunity"; document.getElementById("internship-save").textContent = "Submit for admin review"; document.getElementById("internship-cancel").hidden = true; updateOpportunityPreview(); render(); App.toast(id ? "Changes submitted for admin review." : "Posting submitted. It will go live after admin approval.");
    } catch (error) { alertError(error); }
  });
  document.getElementById("internship-cancel").addEventListener("click", () => { document.getElementById("internship-form").reset(); document.getElementById("internship-type").dispatchEvent(new Event("change")); document.getElementById("internship-edit-id").value = ""; document.getElementById("internship-form-title").textContent = "Post an opportunity"; document.getElementById("internship-save").textContent = "Submit for admin review"; document.getElementById("internship-cancel").hidden = true; updateOpportunityPreview(); });
  document.getElementById("internship-form").addEventListener("input", updateOpportunityPreview);
  document.getElementById("internship-form").addEventListener("change", updateOpportunityPreview);
  document.getElementById("internship-type").addEventListener("change", (event) => { const isJob = event.target.value === "Job"; document.getElementById("internship-duration-field").hidden = isJob; document.getElementById("internship-stipend-field").hidden = isJob; document.getElementById("internship-salary-field").hidden = !isJob; document.getElementById("internship-duration").required = !isJob; updateOpportunityPreview(); });
  const candidateDialog = document.getElementById("company-candidate-dialog");
  const cvDialog = document.getElementById("company-cv-dialog");
  document.getElementById("company-candidate-close").addEventListener("click", () => candidateDialog.close());
  document.getElementById("company-cv-close").addEventListener("click", () => {
    document.getElementById("company-cv-frame").removeAttribute("src");
    cvDialog.close();
  });
  document.addEventListener("click", async (event) => {
    const profileButton = event.target.closest("[data-view-applicant]");
    const cvButton = event.target.closest("[data-view-applicant-cv]");
    const cvReviewButton = event.target.closest("[data-cv-review-status]");
    if (profileButton) {
      profileButton.disabled = true;
      try {
        const result = await api(`/company/students/${encodeURIComponent(profileButton.dataset.viewApplicant)}`);
        const student = result.student;
        document.getElementById("company-candidate-title").textContent = student.name;
        const row = (label, value) => `<div><strong>${esc(label)}</strong><span>${esc(value || "Not provided")}</span></div>`;
        const scores = (student.interviewScores || []).filter((entry) => Number(entry.total) > 0 && Number.isFinite(Number(entry.score)));
        const scorePanel = `<section class="company-practice-score-panel"><div class="company-practice-score-panel__heading"><div><span class="company-eyebrow">LEARNING PROGRESS</span><h3>Interview practice scores</h3></div>${scores.length ? `<span class="company-profile-access-pill">${scores.length} quiz${scores.length === 1 ? "" : "zes"}</span>` : ""}</div>${scores.length ? `<div class="company-practice-score-list">${scores.slice(0, 8).map((entry) => `<div><span><strong>${esc(entry.category || "Practice quiz")}</strong><small>${esc(dateLabel(entry.date))}</small></span><b>${Math.round(Number(entry.score) / Number(entry.total) * 100)}% <small>${Number(entry.score)}/${Number(entry.total)}</small></b></div>`).join("")}</div>` : `<p class="company-muted">No interview practice scores have been recorded yet.</p>`}<p class="company-practice-disclaimer">Practice quiz results show learning progress only. They are not official employer assessments or hiring decisions.</p></section>`;
        document.getElementById("company-candidate-details").innerHTML = [row("Email", student.email), row("Mobile", student.mobileNumber), row("Education", [student.degree, student.course].filter(Boolean).join(" · ")), row("College", student.college), row("Graduation", student.graduationYear), row("Location", student.location), row("CGPA", student.cgpa), row("Skills", (student.skills || []).join(", ")), row("Interests", (student.interests || []).join(", ")), row("Introduction", student.experience), row("Projects", (student.projects || []).map((project) => project.name || project.title || "Project").join(", ")), row("LinkedIn", student.linkedIn), row("GitHub", student.github), row("Portfolio", student.portfolio)].join("") + scorePanel;
        candidateDialog.showModal();
      } catch (error) { alertError(error); }
      finally { profileButton.disabled = false; }
    }
    if (cvButton) {
      cvButton.disabled = true;
      try {
        const studentId = cvButton.dataset.viewApplicantCv;
        const result = await api(`/company/students/${encodeURIComponent(studentId)}/cv`);
        cvDialog.dataset.studentId = studentId;
        document.getElementById("company-cv-title").textContent = result.fileName || "Student CV";
        document.getElementById("company-cv-frame").src = `data:application/pdf;base64,${result.data}`;
        document.getElementById("company-cv-review-note").value = result.cvReview?.note || "";
        document.getElementById("company-cv-review-status").textContent = result.cvReview ? `${result.cvReview.status} · ${dateLabel(result.cvReview.reviewedAt?.slice(0, 10))}` : "Not reviewed yet";
        cvDialog.showModal();
      }
      catch (error) { alertError(error); }
      finally { cvButton.disabled = false; }
    }
    if (cvReviewButton) {
      const studentId = cvDialog.dataset.studentId;
      if (!studentId) return;
      cvReviewButton.disabled = true;
      const statusNode = document.getElementById("company-cv-review-status");
      statusNode.textContent = "Saving feedback…";
      try {
        const result = await api(`/company/students/${encodeURIComponent(studentId)}/cv-review`, { method: "PATCH", body: JSON.stringify({ status: cvReviewButton.dataset.cvReviewStatus, note: document.getElementById("company-cv-review-note").value.trim() }) });
        const review = result.cvReview;
        applicants = applicants.map((item) => item.student?.id === studentId ? { ...item, student: { ...item.student, cvReview: review } } : item);
        render();
        statusNode.textContent = `${review.status} · ${dateLabel(review.reviewedAt?.slice(0, 10))}. Feedback is now visible in the student’s profile.`;
        App.toast(review.status === "Approved" ? "CV approved; the student can see the result in their profile." : "CV changes requested; your feedback is in the student’s profile.");
      } catch (error) { statusNode.textContent = error.message; alertError(error); }
      finally { cvReviewButton.disabled = false; }
    }
  });
  document.addEventListener("click", async (event) => {
    const rejectButton = event.target.closest("[data-reject-application]");
    if (rejectButton) {
      const application = applicants.find((item) => item.id === rejectButton.dataset.rejectApplication);
      if (!application || application.status === "Rejected") return;
      const candidateName = application.student?.name || "this applicant";
      if (!confirm(`Reject ${candidateName}'s application for ${application.internshipTitle}?`)) return;
      rejectButton.disabled = true;
      try {
        const result = await api(`/company/applications/${encodeURIComponent(application.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: "Rejected" }) });
        applicants = applicants.map((item) => item.id === application.id ? { ...item, status: result.application.status } : item);
        render();
        App.toast(`Application from ${candidateName} was rejected.`);
      } catch (error) {
        rejectButton.disabled = false;
        alertError(error);
      }
      return;
    }
    const edit = event.target.closest("[data-edit-role]");
    if (edit) { const role = internships.find((item) => item.id === edit.dataset.editRole); if (!role) return; document.getElementById("internship-edit-id").value = role.id; document.getElementById("internship-type").value = role.postingType || "Internship"; document.getElementById("internship-title").value = role.title; document.getElementById("internship-sector").value = role.sector || ""; document.getElementById("internship-location").value = role.location; document.getElementById("internship-work-mode").value = role.locationType || "On-site"; document.getElementById("internship-duration").value = role.duration; document.getElementById("internship-stipend").value = role.stipend || ""; document.getElementById("internship-salary").value = role.salary || ""; document.getElementById("internship-employment").value = role.employmentType || "Internship"; document.getElementById("internship-positions").value = role.positions || 1; document.getElementById("internship-eligibility").value = role.eligibility || ""; document.getElementById("internship-responsibilities").value = role.responsibilities || ""; document.getElementById("internship-deadline").value = role.deadline; document.getElementById("internship-skills").value = role.skills.join(", "); document.getElementById("internship-description").value = role.description || ""; document.getElementById("internship-type").dispatchEvent(new Event("change")); updateOpportunityPreview(); document.getElementById("internship-form-title").textContent = "Edit opportunity"; document.getElementById("internship-save").textContent = "Resubmit for review"; document.getElementById("internship-cancel").hidden = false; window.location.hash = "internships"; document.getElementById("internship-title").focus(); return; }
    const toggle = event.target.closest("[data-toggle-role]");
    if (toggle) { const role = internships.find((item) => item.id === toggle.dataset.toggleRole); if (!role) return; try { const result = await api(`/company/internships/${encodeURIComponent(role.id)}`, { method: "PATCH", body: JSON.stringify({ status: role.status === "active" ? "paused" : "active" }) }); internships = internships.map((item) => item.id === role.id ? result.role : item); render(); } catch (error) { alertError(error); } return; }
    const remove = event.target.closest("[data-delete-role]");
    if (remove) { try { await api(`/company/internships/${encodeURIComponent(remove.dataset.deleteRole)}`, { method: "DELETE" }); internships = internships.filter((item) => item.id !== remove.dataset.deleteRole); render(); } catch (error) { alertError(error); } return; }
    const deleteSchedule = event.target.closest("[data-delete-schedule]");
    if (deleteSchedule) { try { await api(`/company/interviews/${encodeURIComponent(deleteSchedule.dataset.deleteSchedule)}`, { method: "DELETE" }); schedules = schedules.filter((item) => item.id !== deleteSchedule.dataset.deleteSchedule); render(); } catch (error) { alertError(error); } }
    const addCalendar = event.target.closest("[data-add-calendar]");
    if (addCalendar) { const interview = schedules.find((item) => item.id === addCalendar.dataset.addCalendar); if (interview) downloadCalendarEvent(interview); }
    const startCall = event.target.closest("[data-start-call]");
    if (startCall) {
      const interview = schedules.find((item) => item.id === startCall.dataset.startCall);
      if (interview) {
        InterviewRoom.start({
          role: "recruiter",
          interviewId: interview.id,
          candidateName: interview.studentName,
          companyName: company?.name || "Company",
          roleTitle: interview.internshipTitle,
          apiToken: sessionStorage.getItem("im_company_api_token"),
          onEnd: async () => {
            try {
              const res = await api("/company/interviews");
              schedules = res.items || [];
              render();
            } catch (_) {}
          }
        });
      }
    }
  });
  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-applicant-status]"); if (!select) return;
    try { const result = await api(`/company/applications/${encodeURIComponent(select.dataset.applicantStatus)}/status`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); applicants = applicants.map((item) => item.id === result.application.id ? { ...item, status: result.application.status } : item); render(); }
    catch (error) { alertError(error); }
  });
  ["applicant-filter", "applicant-status-filter"].forEach((id) => document.getElementById(id).addEventListener("change", render));
  document.getElementById("applicant-query").addEventListener("input", render);
  document.getElementById("applicant-export").addEventListener("click", exportApplicantsCsv);
  document.getElementById("applicant-clear-filters").addEventListener("click", () => { document.getElementById("applicant-query").value = ""; document.getElementById("applicant-filter").value = "all"; document.getElementById("applicant-status-filter").value = "all"; render(); });
  document.getElementById("schedule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { applicationId: document.getElementById("schedule-candidate").value, type: document.getElementById("schedule-type").value, date: document.getElementById("schedule-date").value, time: document.getElementById("schedule-time").value, mode: document.getElementById("schedule-mode").value, details: [document.getElementById("schedule-link").value.trim(), document.getElementById("schedule-notes").value.trim()].filter(Boolean).join(" · ") };
    const saveButton = document.getElementById("schedule-save"); saveButton.disabled = true;
    try { const result = await api("/company/interviews", { method: "POST", body: JSON.stringify(body) }); schedules.push(result.interview); const applicant = applicants.find((item) => item.id === body.applicationId); if (applicant) applicant.status = "Interview"; render(); event.currentTarget.reset(); updateMeetingPreview(); App.toast("Meeting saved. The selected application moved to Interview."); }
    catch (error) { alertError(error); }
    finally { saveButton.disabled = !applicants.some((item) => item.student); }
  });
  const assessmentSourceInput = document.getElementById("assessment-source-file");
  const assessmentSourceStatus = document.getElementById("assessment-source-status");
  function setAssessmentSourceStatus(message, state = "") {
    assessmentSourceStatus.textContent = message;
    assessmentSourceStatus.classList.toggle("is-error", state === "error");
    assessmentSourceStatus.classList.toggle("is-success", state === "success");
  }
  document.getElementById("assessment-clear-source").addEventListener("click", () => {
    assessmentSourceInput.value = "";
    document.getElementById("assessment-source-consent").checked = false;
    setAssessmentSourceStatus("No file selected. Generated questions are drafts; review and edit every prompt and private answer key before submitting.");
  });
  document.getElementById("assessment-generate-questions").addEventListener("click", async (event) => {
    const file = assessmentSourceInput.files?.[0];
    if (!file) return setAssessmentSourceStatus("Choose a PDF, DOCX, TXT, or MD file first.", "error");
    if (!document.getElementById("assessment-source-consent").checked) return setAssessmentSourceStatus("Confirm you have permission to upload the file for in-memory extraction and send its text to the configured AI provider.", "error");
    if (file.size > 3 * 1024 * 1024) return setAssessmentSourceStatus("That file is over the 3 MB limit.", "error");
    const button = event.currentTarget;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Extracting & generating…";
    setAssessmentSourceStatus("Reading the document and drafting questions. The source file is not saved.");
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      const result = await api("/company/assessments/generate-questions", { method: "POST", body: JSON.stringify({ fileName: file.name, data, count: Number(document.getElementById("assessment-generated-count").value), category: document.getElementById("assessment-category").value, difficulty: document.getElementById("assessment-difficulty").value }) });
      const questionList = document.getElementById("assessment-questions");
      const hasDraftContent = [...questionList.querySelectorAll("[data-question-prompt]")].some((input) => input.value.trim());
      if (hasDraftContent && !confirm("Replace your current assessment questions with the newly generated draft?")) {
        setAssessmentSourceStatus("Draft kept unchanged. Your generated questions were not added.");
        return;
      }
      questionList.innerHTML = "";
      result.questions.forEach((question) => addAssessmentQuestion(question));
      const title = document.getElementById("assessment-title");
      if (!title.value.trim()) title.value = `${file.name.replace(/\.[^.]+$/, "").slice(0, 110)} assessment`;
      const autoPass = Math.ceil(result.questions.reduce((sum, question) => sum + Number(question.marks || 1), 0) * 0.6);
      document.getElementById("assessment-pass").value = autoPass;
      setAssessmentSourceStatus(`${result.questions.length} draft questions generated from ${result.sourceName} (${Number(result.extractedCharacters).toLocaleString()} text characters). Review every question and answer key before submitting for admin approval.`, "success");
    } catch (error) {
      setAssessmentSourceStatus(error.message || "Question generation failed. You can still add questions manually.", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
  document.getElementById("assessment-add-question").addEventListener("click", () => addAssessmentQuestion());
  document.getElementById("assessment-questions").addEventListener("change", (event) => {
    const select = event.target.closest("[data-question-type]"); if (!select) return;
    const options = select.closest(".company-assessment-question").querySelector("[data-mcq-options]"); options.hidden = select.value !== "MCQ";
    options.querySelectorAll("input,select").forEach((control) => { control.required = select.value === "MCQ"; });
  });
  document.getElementById("assessment-questions").addEventListener("click", (event) => {
    if (event.target.closest("[data-remove-assessment-question]")) { event.target.closest(".company-assessment-question").remove(); }
  });
  document.getElementById("assessment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const questions = [...document.querySelectorAll(".company-assessment-question")].map((card) => {
      const type = card.querySelector("[data-question-type]").value;
      return { type, prompt: card.querySelector("[data-question-prompt]").value.trim(), marks: Number(card.querySelector("[data-question-marks]").value) || 1, options: type === "MCQ" ? [...card.querySelectorAll("[data-question-option]")].map((input) => input.value.trim()) : [], correctIndex: type === "MCQ" ? Number(card.querySelector("[data-question-correct]").value) : -1, explanation: card.querySelector("[data-question-explanation]").value.trim() };
    });
    const startLocal = document.getElementById("assessment-start").value, endLocal = document.getElementById("assessment-end").value;
    const body = { title: document.getElementById("assessment-title").value.trim(), internshipId: document.getElementById("assessment-role").value, category: document.getElementById("assessment-category").value, difficulty: document.getElementById("assessment-difficulty").value, durationMinutes: Number(document.getElementById("assessment-duration").value), passingMarks: Number(document.getElementById("assessment-pass").value), startAt: startLocal ? new Date(startLocal).toISOString() : "", endAt: endLocal ? new Date(endLocal).toISOString() : "", questions };
    const button = document.getElementById("assessment-submit"); button.disabled = true;
    try { const result = await api("/company/assessments", { method: "POST", body: JSON.stringify(body) }); assessments.unshift(result.assessment); renderAssessments(); event.currentTarget.reset(); document.getElementById("assessment-questions").innerHTML = ""; addAssessmentQuestion(); App.toast("Assessment submitted for admin approval."); }
    catch (error) { alertError(error); }
    finally { button.disabled = false; }
  });
  const scheduleForm = document.getElementById("schedule-form");
  scheduleForm.addEventListener("input", updateMeetingPreview);
  scheduleForm.addEventListener("change", updateMeetingPreview);
  document.getElementById("schedule-date").min = new Date().toISOString().slice(0, 10);
  document.getElementById("company-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { name: document.getElementById("profile-company-name").value.trim(), industry: document.getElementById("profile-industry").value.trim(), website: document.getElementById("profile-website").value.trim(), location: document.getElementById("profile-location").value.trim(), contact: document.getElementById("profile-contact").value.trim(), about: document.getElementById("profile-about").value.trim() };
    const saveButton = document.getElementById("company-profile-save"); saveButton.disabled = true;
    try { const result = await api("/company/me", { method: "PATCH", body: JSON.stringify(body) }); company = result.company; fillCompanyIdentity(); renderProfileForm(); App.toast("Company profile saved on the server."); }
    catch (error) { alertError(error); }
    finally { saveButton.disabled = false; }
  });
  document.getElementById("company-profile-form").addEventListener("input", updateCompanyProfilePreview);
  document.getElementById("company-profile-form").addEventListener("change", updateCompanyProfilePreview);
  document.getElementById("settings-api-check").addEventListener("click", checkApiConnection);
  ["company-signout", "company-signout-settings"].forEach((id) => document.getElementById(id).addEventListener("click", () => { sessionStorage.removeItem("im_company_api_token"); Store.logout(); window.location.href = "login.html"; }));
  document.querySelectorAll("[data-company-nav][href^='#']").forEach((link) => link.addEventListener("click", () => { window.location.hash = link.getAttribute("href").slice(1); }));
  document.querySelector("[data-company-action='new-internship']")?.addEventListener("click", () => setTimeout(() => document.getElementById("internship-title").focus(), 0));
  window.addEventListener("hashchange", setPageFromHash);
});
