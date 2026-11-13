/* js/admin.js — server-authenticated admin workspace */

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  const SESSION_KEY = "im_admin_authenticated";
  const AUDIT_KEY = "im_admin_audit_log";
  const adminApi = async (route, options = {}) => {
    const response = await fetch(`${window.IM_API_BASE}/api${route}`, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${sessionStorage.getItem("im_admin_api_token") || ""}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Admin API request failed (${response.status}) at ${route}.`);
    return data;
  };
  const adminViews = {
    overview: { title: "Admin dashboard", panels: ["admin-overview"] },
    users: { title: "User management", panels: ["admin-students"] },
    companies: { title: "Company access requests", panels: ["admin-company-requests", "admin-company-list"] },
    internships: { title: "Internship management & approvals", panels: ["admin-add-internship", "admin-listings", "admin-company-review"] },
    recruitment: { title: "Applications & recruitment", panels: ["admin-recruitment"] },
    recommendations: { title: "AI recommendations", panels: ["admin-recommendations"] },
    assessments: { title: "Assessments & interviews", panels: ["admin-assessments"] },
    reports: { title: "Reports & analytics", panels: ["admin-analytics"] },
    notifications: { title: "Student support inbox", panels: ["admin-support"] },
    roles: { title: "Roles & permissions", panels: ["admin-governance"] },
    audit: { title: "Audit logs & settings", panels: ["admin-audit", "admin-account"] }
  };
  function selectAdminView(viewName) {
    const view = adminViews[viewName] || adminViews.overview;
    const allPanels = ["admin-overview", "admin-account", "admin-add-internship", "admin-listings", "admin-company-review", "admin-company-requests", "admin-company-list", "admin-students", "admin-analytics", "admin-recruitment", "admin-assessments", "admin-recommendations", "admin-support", "admin-audit", "admin-governance"];
    allPanels.forEach((id) => { const panel = document.getElementById(id); if (panel) panel.style.display = "none"; });
    view.panels.forEach((id) => { const panel = document.getElementById(id); if (panel) panel.style.display = ""; });
    const note = document.getElementById("admin-module-note");
    note.hidden = !view.note;
    note.textContent = view.note || "";
    document.getElementById("admin-page-title").textContent = view.title;
    document.querySelectorAll("[data-admin-view]").forEach((link) => {
      const active = link.getAttribute("data-admin-view") === viewName;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    if (viewName === "notifications") { renderSupportInbox(); renderPasswordResetRequests(); }
    if (viewName === "internships") renderCompanyReviewQueue();
    if (viewName === "companies") renderCompanyAccounts();
    if (viewName === "users") renderAdminServerStudents();
    if (viewName === "recruitment") renderAdminServerStudents();
    if (viewName === "assessments") { renderAssessmentReviewQueue(); }
  }
  async function renderAssessmentReviewQueue() {
    const list = document.getElementById("admin-assessment-review-list");
    if (!list) return;
    list.innerHTML = '<p class="hint">Loading submitted assessments…</p>';
    try {
      const data = await adminApi("/admin/assessments");
      const items = data.items || [];
      const overviewRequests = document.getElementById("admin-assessment-overview-requests");
      if (overviewRequests) overviewRequests.innerHTML = items.length ? `<ul class="admin-record-list">${items.slice(0, 4).map((item) => `<li><strong>${App.escapeHtml(item.title)}</strong><span>${App.escapeHtml(item.companyName)} · ${App.escapeHtml(item.status === "rejected" ? "Resubmitted" : "Pending review")}</span></li>`).join("")}</ul><p class="hint">${items.length} assessment${items.length === 1 ? "" : "s"} need review.</p>` : '<p class="hint">No company assessments are waiting for approval.</p>';
      list.innerHTML = items.length ? items.map((item) => `<article class="company-review-card" data-assessment-review="${App.escapeHtml(item.id)}"><div class="company-review-card__head"><div><span class="company-status-badge is-active">Pending approval</span><h3>${App.escapeHtml(item.title)}</h3><p>${App.escapeHtml(item.companyName)} · ${App.escapeHtml(item.roleTitle)} · ${App.escapeHtml(item.category)} · ${App.escapeHtml(item.difficulty)}</p></div><strong>${item.durationMinutes} min · ${item.totalMarks} marks</strong></div><p>${item.questions.length} questions · ${item.questions.map((question) => App.escapeHtml(question.type)).join(", ")}</p><details><summary>Review question content</summary>${item.questions.map((question, index) => `<section><strong>Q${index + 1} · ${App.escapeHtml(question.type)} · ${question.marks} marks</strong><p>${App.escapeHtml(question.prompt)}</p>${question.options?.length ? `<ol type="A">${question.options.map((option) => `<li>${App.escapeHtml(option)}</li>`).join("")}</ol>` : ""}</section>`).join("")}</details><div class="company-review-card__actions"><input type="text" maxlength="500" data-assessment-note placeholder="Required when rejecting" aria-label="Feedback for company"><button type="button" class="btn btn--primary btn--sm" data-assessment-decision="approve">Approve &amp; assign to applicants</button><button type="button" class="btn btn--ghost btn--sm" data-assessment-decision="reject">Reject with feedback</button></div></article>`).join("") : '<div class="admin-panel-note">No company assessments are waiting for approval.</div>';
      list.querySelectorAll("[data-assessment-decision]").forEach((button) => button.addEventListener("click", async () => {
        const card = button.closest("[data-assessment-review]");
        if (!card) return;
        const decision = button.dataset.assessmentDecision;
        const noteField = card.querySelector("[data-assessment-note]");
        const note = noteField?.value.trim() || "";
        if (decision === "reject" && !note) { App.toast("Add feedback so the company knows what to change.", "error"); noteField?.focus(); return; }
        const actionButtons = [...card.querySelectorAll("[data-assessment-decision]")];
        const originalLabel = button.textContent;
        actionButtons.forEach((action) => { action.disabled = true; });
        button.textContent = decision === "reject" ? "Rejecting…" : "Approving…";
        try {
          await adminApi(`/admin/assessments/${encodeURIComponent(card.dataset.assessmentReview)}/review`, { method: "PATCH", body: JSON.stringify({ decision, note }) });
          App.toast(decision === "approve" ? "Assessment approved for eligible applicants." : "Assessment rejected. Feedback is visible in the company workspace.");
          await renderAssessmentReviewQueue();
        } catch (error) {
          App.toast(error.message, "error");
          actionButtons.forEach((action) => { action.disabled = false; });
          button.textContent = originalLabel;
        }
      }));
    } catch (error) {
      const message = error.message.includes("404") || error.message.includes("Admin API request failed")
        ? `${error.message} The running server may be older than the assessment approval feature. Stop it with Ctrl+C in its terminal, then run npm start from the server folder.`
        : error.message;
      list.innerHTML = `<p class="hint">${App.escapeHtml(message)}</p>`;
      const overviewRequests = document.getElementById("admin-assessment-overview-requests");
      if (overviewRequests) overviewRequests.innerHTML = `<p class="hint">${App.escapeHtml(message)}</p>`;
    }
  }
  async function renderCompanyReviewQueue() {
    const list = document.getElementById("admin-company-review-list");
    if (!list) return;
    list.innerHTML = '<p class="hint">Loading recruiter submissions…</p>';
    try {
      const data = await adminApi("/admin/company-internships");
      const items = data.items || [];
      list.innerHTML = items.length ? items.map((item) => `<article class="company-review-card" data-review-role="${App.escapeHtml(item.id)}"><div class="company-review-card__head"><div><span class="company-status-badge ${item.status === "rejected" ? "" : "is-active"}">${item.status === "rejected" ? "Resubmitted" : "Pending review"}</span><h3>${App.escapeHtml(item.title)}</h3><p>${App.escapeHtml(item.companyName)} · ${App.escapeHtml(item.companyEmail)} · ${App.escapeHtml(item.postingType || "Internship")}</p></div><strong>${App.escapeHtml(item.location || "Location flexible")}</strong></div><div class="company-review-card__details"><span><b>Sector</b>${App.escapeHtml(item.sector || "—")}</span><span><b>Work mode</b>${App.escapeHtml(item.locationType || "—")}</span><span><b>Compensation</b>${App.escapeHtml(item.salary || item.stipend || "Not listed")}</span><span><b>Openings</b>${App.escapeHtml(item.positions || 1)}</span><span><b>Deadline</b>${App.escapeHtml(item.deadline || "—")}</span><span><b>Eligibility</b>${App.escapeHtml(item.eligibility || "—")}</span></div><p>${App.escapeHtml(item.description || "No role summary provided.")}</p><p><strong>Skills:</strong> ${App.escapeHtml((item.skills || []).join(", ") || "None listed")}</p>${item.responsibilities ? `<details><summary>Responsibilities</summary><p>${App.escapeHtml(item.responsibilities)}</p></details>` : ""}<div class="company-review-card__actions"><input type="text" maxlength="500" data-review-note placeholder="Optional note for recruiter" aria-label="Review note"/><button type="button" class="btn btn--primary btn--sm" data-review-decision="approve">Approve &amp; publish</button><button type="button" class="btn btn--ghost btn--sm" data-review-decision="reject">Request changes</button></div></article>`).join("") : '<div class="admin-panel-note">No recruiter postings are waiting for review.</div>';
      list.querySelectorAll("[data-review-decision]").forEach((button) => button.addEventListener("click", async () => {
        const card = button.closest("[data-review-role]");
        button.disabled = true;
        try { await adminApi(`/admin/company-internships/${encodeURIComponent(card.dataset.reviewRole)}/review`, { method: "PATCH", body: JSON.stringify({ decision: button.dataset.reviewDecision, note: card.querySelector("[data-review-note]").value }) }); App.toast(button.dataset.reviewDecision === "approve" ? "Posting approved and published." : "Posting rejected; the recruiter can edit and resubmit."); renderCompanyReviewQueue(); }
        catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
    } catch (error) { list.innerHTML = `<p class="hint">${App.escapeHtml(error.message)}</p>`; }
  }
  async function renderCompanyAccounts() {
    const requestsList = document.getElementById("admin-company-requests-list");
    const companyBody = document.getElementById("admin-company-tbody");
    if (!requestsList || !companyBody) return;
    requestsList.innerHTML = '<p class="hint">Loading company requests…</p>';
    companyBody.innerHTML = '<tr><td colspan="7">Loading approved companies…</td></tr>';
    try {
      const [requestData, companyData] = await Promise.all([adminApi("/admin/company-requests"), adminApi("/admin/companies")]);
      const requests = requestData.items || [];
      requestsList.innerHTML = requests.length ? requests.map((item) => `<article class="company-access-request" data-company-request="${App.escapeHtml(item.id)}"><div class="company-access-request__head"><div><span class="company-access-state">Pending admin approval</span><h3>${App.escapeHtml(item.name)}</h3><p>${App.escapeHtml(item.contact || "Contact not provided")} · ${App.escapeHtml(item.email)}</p></div><strong>Requested ${App.escapeHtml(App.formatDate(item.requestedAt))}</strong></div><div class="company-access-request__meta"><span><b>Industry</b>${App.escapeHtml(item.industry || "—")}</span><span><b>Location</b>${App.escapeHtml(item.location || "—")}</span><span><b>Website</b>${App.escapeHtml(item.website || "—")}</span></div>${item.about ? `<p>${App.escapeHtml(item.about)}</p>` : ""}<div class="company-access-request__actions"><button type="button" class="btn btn--primary btn--sm" data-company-decision="approve">Approve &amp; add to company list</button><button type="button" class="btn btn--ghost btn--sm" data-company-decision="reject">Reject request</button></div></article>`).join("") : '<div class="admin-panel-note">No pending company registration requests.</div>';
      companyBody.innerHTML = (companyData.items || []).length ? companyData.items.map((company) => `<tr><td>${App.escapeHtml(company.name)}</td><td>${App.escapeHtml(company.contact || "—")}</td><td>${App.escapeHtml(company.email)}</td><td>${App.escapeHtml(company.industry || "—")}</td><td>${App.escapeHtml(company.location || "—")}</td><td>${App.escapeHtml(company.status || "active")}<div class="admin-cell-tags">${Number(company.roleCount)||0} roles · ${Number(company.applicantCount)||0} applicants · ${Number(company.interviewCount)||0} interviews</div></td><td><button class="btn btn--secondary btn--sm" data-company-open="${App.escapeHtml(company.id)}">Open record</button> <button class="btn btn--ghost btn--sm" data-company-status="${App.escapeHtml(company.id)}" data-next-status="${company.status === "suspended" ? "active" : "suspended"}">${company.status === "suspended" ? "Reactivate" : "Suspend"}</button></td></tr>`).join("") : '<tr><td colspan="7">No approved company accounts yet.</td></tr>';
      const stat = document.getElementById("admin-stat-companies"); if (stat) stat.textContent = (companyData.items || []).filter((company) => company.status === "active").length;
      companyBody.querySelectorAll("[data-company-open]").forEach((button) => button.addEventListener("click", () => openAdminCompany(button.dataset.companyOpen)));
      companyBody.querySelectorAll("[data-company-status]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try { await adminApi(`/admin/companies/${encodeURIComponent(button.dataset.companyStatus)}/status`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.nextStatus }) }); App.toast(`Company ${button.dataset.nextStatus === "active" ? "reactivated" : "suspended"}.`); await renderCompanyAccounts(); }
        catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
      requestsList.querySelectorAll("[data-company-decision]").forEach((button) => button.addEventListener("click", async () => {
        const card = button.closest("[data-company-request]");
        const decision = button.dataset.companyDecision;
        if (decision === "reject" && !window.confirm(`Reject the company request from ${card.querySelector("h3").textContent}?`)) return;
        button.disabled = true;
        try { await adminApi(`/admin/company-requests/${encodeURIComponent(card.dataset.companyRequest)}`, { method: "PATCH", body: JSON.stringify({ decision }) }); App.toast(decision === "approve" ? "Company approved and added to the company list." : "Company request rejected."); renderCompanyAccounts(); }
        catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
    } catch (error) { requestsList.innerHTML = `<p class="hint">${App.escapeHtml(error.message)}</p>`; companyBody.innerHTML = `<tr><td colspan="7">${App.escapeHtml(error.message)}</td></tr>`; }
  }
  const adminCompanyDialog = document.getElementById("admin-company-dialog");
  document.getElementById("admin-company-dialog-close")?.addEventListener("click", () => adminCompanyDialog.close());
  async function showCvFile(blob, fileName) {
    const isPdf = blob.type === "application/pdf" || /\.pdf$/i.test(fileName || "");
    cvFrame.hidden = false; cvFrame.style.display = "";
    cvFrame.removeAttribute("src"); cvFrame.removeAttribute("srcdoc"); cvFrame.removeAttribute("sandbox");
    if (isPdf) cvFrame.src = activeCvUrl;
    else await window.InternMatchDocxPreview.show(blob, cvFrame);
  }
  async function openServerStudentCv(student) {
    const response = await fetch(`${window.IM_API_BASE}/api/admin/students/${encodeURIComponent(student.id)}/cv`, { headers: { authorization: `Bearer ${sessionStorage.getItem("im_admin_api_token") || ""}` } });
    if (!response.ok) { const message = await response.json().catch(()=>({})); throw new Error(message.error || `CV request failed (${response.status}).`); }
    if (activeCvUrl) URL.revokeObjectURL(activeCvUrl);
    const blob = await response.blob();
    activeCvUrl = URL.createObjectURL(blob);
    const fileName = decodeURIComponent((response.headers.get("content-disposition") || "").match(/filename\*=UTF-8''([^;]+)/i)?.[1] || "student-resume.docx");
    await showCvFile(blob, fileName);
    activeCvEmail = student.email || ""; activeCvStudentId = student.id;
    document.getElementById("admin-cv-dialog-title").textContent = `${student.name || "Student"} · CV`;
    showCvReviewState(student.cvReview || null); cvDialog.showModal();
  }
  async function openBrowserStudentCv(email, name) {
    if (!window.ResumeVault) throw new Error("Browser CV storage is unavailable on this device.");
    const record = await ResumeVault.get(email);
    if (!record?.file) throw new Error("No browser-stored CV is available. The student must enable admin CV access in this browser.");
    if (activeCvUrl) URL.revokeObjectURL(activeCvUrl);
    activeCvUrl = URL.createObjectURL(record.file);
    await showCvFile(record.file, record.name || "student-resume.docx");
    activeCvEmail = email;
    activeCvStudentId = "";
    document.getElementById("admin-cv-dialog-title").textContent = `${record.name || name || "Student"} · CV`;
    showCvReviewState(Store.readBlob(`im_cv_review_${email}`, null));
    logAdminAction("Opened browser-stored student CV", email);
    renderAuditLog();
    cvDialog.showModal();
  }
  async function openAdminCompany(id) {
    const content = document.getElementById("admin-company-dialog-content");
    content.innerHTML = '<p class="hint">Loading company record…</p>';
    adminCompanyDialog.showModal();
    try {
      const data = await adminApi(`/admin/companies/${encodeURIComponent(id)}`);
      const c = data.company || {};
      document.getElementById("admin-company-dialog-title").textContent = c.name || "Company details";
      const safe = (v) => App.escapeHtml(v == null || v === "" ? "—" : String(v));
      const detail = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
      const roles = data.roles || [], apps = data.applications || [], meetings = data.interviews || [], assessments = data.assessments || [];
      content.innerHTML = `<section class="admin-record-section"><h4>Company profile</h4><dl class="admin-profile-grid">${detail("Work email", safe(c.email))}${detail("Contact", safe(c.contact))}${detail("Industry", safe(c.industry))}${detail("Location", safe(c.location))}${detail("Website", c.website ? `<a href="${safe(c.website)}" target="_blank" rel="noopener noreferrer">Open website ↗</a>` : "—")}${detail("Account status", safe(c.status))}${detail("About", safe(c.about))}</dl></section><section class="admin-record-section"><h4>Opportunity listings · ${roles.length}</h4>${roles.length ? `<ul class="admin-record-list">${roles.map(r=>`<li><strong>${safe(r.title)}</strong> · ${safe(r.status)} · ${safe(r.location)}<small>${safe(r.sector)} · ${safe((r.skills||[]).join(", "))}</small></li>`).join("")}</ul>` : "No listings"}</section><section class="admin-record-section"><h4>Applicants · ${apps.length}</h4>${apps.length ? `<ul class="admin-record-list">${apps.map(a=>`<li><strong>${safe(a.student?.name||"Student")}</strong> · ${safe(a.student?.email)} · ${safe(a.internshipTitle)} · ${safe(a.status)}<small>Skills: ${safe((a.student?.skills||[]).join(", "))} · Applied ${safe(a.appliedAt||a.appliedOn)}</small>${a.student?.cvUploaded?`<button type="button" class="btn btn--secondary btn--sm" data-company-applicant-cv="${safe(a.student.id)}" data-student-email="${safe(a.student.email)}" data-student-name="${safe(a.student.name)}" style="margin-top:6px">Open uploaded CV</button>`:""}</li>`).join("")}</ul>` : "No applicants"}</section><section class="admin-record-section"><h4>Interviews · ${meetings.length}</h4>${meetings.length ? `<ul class="admin-record-list">${meetings.map(m=>`<li><strong>${safe(m.studentName||m.studentEmail||"Candidate")}</strong> · ${safe(m.title||m.type||"Interview")} · ${safe(m.status)}<small>${safe(m.scheduledAt||m.date)} · ${safe(m.meetingLink||m.location)}</small></li>`).join("")}</ul>` : "No interviews"}</section><section class="admin-record-section"><h4>Assessments · ${assessments.length}</h4>${assessments.length ? `<ul class="admin-record-list">${assessments.map(a=>`<li><strong>${safe(a.title)}</strong> · ${safe(a.status)} · ${Number(a.questions?.length)||0} questions</li>`).join("")}</ul>` : "No assessments"}</section>`;
      content.querySelectorAll("[data-company-applicant-cv]").forEach((button) => button.addEventListener("click", async () => { button.disabled = true; try { await openServerStudentCv({ id: button.dataset.companyApplicantCv, email: button.dataset.studentEmail, name: button.dataset.studentName, cvReview: (apps.find(a=>a.student?.id===button.dataset.companyApplicantCv)?.student?.cvReview) }); } catch(error) { App.toast(error.message,"error"); } finally { button.disabled = false; } }));
    } catch (error) { content.innerHTML = `<p class="hint">${App.escapeHtml(error.message)}</p>`; }
  }
  async function renderSupportInbox() {
    const container = document.getElementById("admin-support-list");
    if (!container) return;
    container.innerHTML = '<p class="hint">Loading student messages…</p>';
    try {
      const data = await adminApi("/admin/support-messages");
      const items = data.items || [];
      container.innerHTML = items.length ? items.map((item) => `
        <article class="support-ticket" data-support-ticket="${App.escapeHtml(item.id)}">
          <div class="support-ticket__head"><strong>${App.escapeHtml(item.subject)}</strong><span class="pill pill--muted">${App.escapeHtml(item.status)}</span></div>
          <div class="support-ticket__meta">${App.escapeHtml(item.senderRole === "admin" ? "Sent by admin to" : "From")} ${App.escapeHtml(item.studentName)} · ${App.escapeHtml(item.studentEmail)} · ${App.escapeHtml(item.category)} · ${App.escapeHtml(App.formatDate(item.createdAt))}</div>
          <p class="support-ticket__message">${App.escapeHtml(item.message)}</p>
          ${item.senderRole === "admin" ? (item.reply ? `<div class="support-ticket__meta">Student reply: ${App.escapeHtml(item.reply)}</div>` : "") : `<div class="support-ticket__controls">
            <div class="field"><label>Status</label><select data-support-status><option${item.status === "Open" ? " selected" : ""}>Open</option><option${item.status === "In progress" ? " selected" : ""}>In progress</option><option${item.status === "Resolved" ? " selected" : ""}>Resolved</option></select></div>
            <div class="field"><label>Reply to student</label><textarea data-support-reply maxlength="2000" rows="3" placeholder="Write a helpful reply…">${App.escapeHtml(item.reply || "")}</textarea></div>
            <button type="button" class="btn btn--primary btn--sm" data-support-save>Save reply</button>
          </div>`}
          ${item.repliedAt ? `<div class="support-ticket__meta">Last reply · ${App.escapeHtml(App.formatDate(item.repliedAt))}</div>` : ""}
        </article>`).join("") : '<div class="admin-panel-note">No student support requests yet. Student messages will appear here.</div>';
      container.querySelectorAll("[data-support-save]").forEach((button) => button.addEventListener("click", async () => {
        const ticket = button.closest("[data-support-ticket]");
        button.disabled = true;
        try {
          await adminApi(`/admin/support-messages/${encodeURIComponent(ticket.dataset.supportTicket)}`, { method: "PATCH", body: JSON.stringify({ status: ticket.querySelector("[data-support-status]").value, reply: ticket.querySelector("[data-support-reply]").value }) });
          App.toast("Support reply saved.");
          renderSupportInbox();
        } catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
    } catch (error) { container.innerHTML = `<p class="hint">${App.escapeHtml(error.message)}</p>`; }
  }
  async function renderPasswordResetRequests() {
    const container = document.getElementById("admin-reset-list");
    if (!container) return;
    container.innerHTML = '<p class="hint">Loading reset requests…</p>';
    try {
      const data = await adminApi("/admin/password-reset-requests");
      const requests = (data.items || []).filter((item) => item.status === "Pending");
      container.innerHTML = requests.length ? requests.map((item) => `<article class="admin-reset-request" data-reset-id="${App.escapeHtml(item.id)}"><div><strong>${App.escapeHtml(item.email)}</strong><span>${item.role === "company" ? "Recruiter / company" : "Student"} · Requested ${App.escapeHtml(App.formatDate(item.requestedAt))}</span></div><label class="admin-reset-request__password">Temporary password<input type="password" minlength="8" maxlength="256" autocomplete="new-password" placeholder="At least 8 characters" required /></label><button class="btn btn--primary btn--sm" type="button" data-reset-password>Set password</button></article>`).join("") : '<div class="admin-panel-note">No pending password reset requests.</div>';
      container.querySelectorAll("[data-reset-password]").forEach((button) => button.addEventListener("click", async () => {
        const card = button.closest("[data-reset-id]");
        const password = card.querySelector("input").value;
        if (password.length < 8) return App.toast("Enter a temporary password with at least 8 characters.", "error");
        button.disabled = true;
        try { await adminApi(`/admin/password-reset-requests/${encodeURIComponent(card.dataset.resetId)}`, { method: "PATCH", body: JSON.stringify({ temporaryPassword: password }) }); App.toast("Password reset. Share the temporary password through the user’s verified contact channel."); renderPasswordResetRequests(); }
        catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
    } catch (error) { container.innerHTML = `<p class="hint">${App.escapeHtml(error.message)}</p>`; }
  }
  async function loadSupportStudents() {
    const select = document.getElementById("admin-message-student");
    try {
      const data = await adminApi("/admin/students");
      const students = (data.items || []).filter((student) => !/demo company/i.test(student.name || ""));
      select.innerHTML = students.length ? '<option value="">Select a student…</option>' + students.map((student) => `<option value="${App.escapeHtml(student.id)}">${App.escapeHtml(student.name)} · ${App.escapeHtml(student.email)}</option>`).join("") : '<option value="">No students found</option>';
    } catch (error) { select.innerHTML = `<option value="">${App.escapeHtml(error.message)}</option>`; }
  }
  function renderServerRecruitment(students) {
    const applications = students.flatMap((student) => (student.applications || []).map((application) => ({ student, application })));
    const appStat = document.getElementById("admin-stat-applications");
    if (appStat) appStat.textContent = applications.length;
    const stages = ["Applied", "Under Review", "Shortlisted", "Assessment", "Interview", "Offered", "Selected", "Rejected", "Withdrawn"];
    const stageCounts = stages.map((stage) => ({ label: stage, count: applications.filter(({ application }) => (application.status || "Applied") === stage).length }));
    const maxStage = Math.max(1, ...stageCounts.map((stage) => stage.count));
    const pipeline = document.getElementById("admin-overview-pipeline");
    if (pipeline) pipeline.innerHTML = stageCounts.map((stage) => `<div class="admin-mini-chart__row"><span>${stage.label}</span><span class="admin-mini-chart__track"><span class="admin-mini-chart__bar" style="display:block;width:${Math.round((stage.count / maxStage) * 100)}%"></span></span><strong class="admin-mini-chart__value">${stage.count}</strong></div>`).join("");
    const table = document.getElementById("admin-recruitment-tbody");
    if (!table) return;
    const rows = applications.slice().sort((a, b) => new Date(b.application.appliedAt || 0) - new Date(a.application.appliedAt || 0));
    table.innerHTML = rows.length ? rows.map(({ student, application }) => {
      const history = Array.isArray(application.history) ? application.history : [];
      const historyText = history.map((entry) => `${App.escapeHtml(entry.status || "Applied")} · ${App.escapeHtml(App.formatDate(entry.at || entry.on || entry.date))}`).join(" → ");
      return `<tr><td>${App.escapeHtml(student.name || student.email)}</td><td>${App.escapeHtml(application.internshipTitle || application.internshipId)}</td><td>${App.escapeHtml(application.companyName || "—")}</td><td><strong>${App.escapeHtml(application.status || "Applied")}</strong>${historyText ? `<small class="admin-cell-tags">${historyText}</small>` : ""}</td><td>${App.escapeHtml(application.appliedAt ? App.formatDate(application.appliedAt) : "—")}</td></tr>`;
    }).join("") : '<tr><td colspan="5">No applications recorded yet.</td></tr>';
  }
  async function renderAdminServerStudents() {
    const body = document.getElementById("admin-server-student-tbody");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6">Loading registered students…</td></tr>';
    try {
      const { items = [] } = await adminApi("/admin/students");
      window.__adminServerStudents = items;
      renderServerRecruitment(items);
      const pendingCount = items.filter((s) => s.cvUploaded && s.cvReview?.status !== "Approved").length;
      const pendingStat = document.getElementById("admin-stat-pending-cvs");
      if (pendingStat) pendingStat.textContent = pendingCount;
      body.innerHTML = items.length ? items.map((student) => {
        let cvBadge = '<span class="pill pill--muted">No CV uploaded</span>';
        if (student.cvUploaded) {
          if (student.cvReview?.status === "Approved") {
            cvBadge = '<span class="pill pill--primary" style="background:#059669;color:#fff;">Approved ✓</span><div class="admin-cell-tags" style="color:#059669;">Eligible for company sharing</div>';
          } else if (student.cvReview?.status === "Needs changes") {
            cvBadge = '<span class="pill pill--danger">Needs changes ⚠️</span><div class="admin-cell-tags">Company sharing blocked</div>';
          } else {
            cvBadge = '<span class="pill pill--warning" style="background:#ea580c;color:#fff;">Pending Approval ⏳</span><div class="admin-cell-tags" style="color:#ea580c;font-weight:600;">Action required</div>';
          }
        }
        return `<tr>
          <td><div class="admin-student-table-identity">${renderAdminStudentPhoto(student.profile?.photo, student.name || "Student")}<span><strong>${App.escapeHtml(student.name || "Student")}</strong><small class="admin-cell-tags">${App.escapeHtml(student.email || "")}</small></span></div></td>
          <td>${App.escapeHtml([student.degree, student.course, student.college].filter(Boolean).join(" · ") || "Not provided")}</td>
          <td>${App.escapeHtml((student.skills || []).join(", ") || "Not provided")}</td>
          <td>${(student.applications || []).length}</td>
          <td>${cvBadge}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn--secondary btn--sm" data-server-student="${App.escapeHtml(student.id)}">Open record</button>
            ${student.cvUploaded && student.adminCvShared ? `<button type="button" class="btn btn--primary btn--sm" data-quick-cv="${App.escapeHtml(student.id)}" data-student-email="${App.escapeHtml(student.email)}" data-student-name="${App.escapeHtml(student.name)}">${student.cvReview?.status === "Approved" ? "View CV" : "Review &amp; Approve CV"}</button>` : student.cvUploaded ? '<span class="admin-cell-tags">Admin review permission not granted</span>' : ""}
          </td>
        </tr>`;
      }).join("") : '<tr><td colspan="6">No registered student accounts found on the server.</td></tr>';
      body.querySelectorAll("[data-server-student]").forEach((button) => button.addEventListener("click", () => openAdminServerStudent(button.dataset.serverStudent)));
      body.querySelectorAll("[data-quick-cv]").forEach((button) => button.addEventListener("click", async () => {
        const student = (window.__adminServerStudents || []).find((s) => s.id === button.dataset.quickCv);
        if (!student) return;
        button.disabled = true;
        try {
          await openServerStudentCv({ id: student.id, email: student.email, name: student.name, cvReview: student.cvReview });
        } catch (error) {
          App.toast(error.message, "error");
        } finally {
          button.disabled = false;
        }
      }));
      const stat = document.getElementById("admin-stat-students"); if (stat) stat.textContent = items.length;
    } catch (error) { body.innerHTML = `<tr><td colspan="6">${App.escapeHtml(error.message)}</td></tr>`; }
  }
  function renderAdminStudentPhoto(photo, name) {
    const safePhoto = typeof photo === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(photo) ? App.escapeHtml(photo) : "";
    const initials = String(name || "Student").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "S";
    return `<span class="admin-student-record__avatar" aria-hidden="true">${safePhoto ? `<img src="${safePhoto}" alt="" />` : App.escapeHtml(initials)}</span>`;
  }
  function openAdminServerStudent(id) {
    const student = (window.__adminServerStudents || []).find((item) => item.id === id);
    if (!student) return;
    const profile = student.profile || {};
    const body = document.getElementById("admin-student-dialog-content");
    const safe = (v) => App.escapeHtml(v == null || v === "" ? "—" : String(v));
    const detail = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    const apps = student.applications || [];
    const projects = profile.projects || [];
    const studentName = student.name || profile.fullName || "Student";
    const studentInitials = studentName.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "S";
    const applicationMarkup = apps.length ? `<ul class="admin-record-list">${apps.map((application) => {
      const history = Array.isArray(application.history) ? application.history : [];
      const historyMarkup = history.length ? `<small>Status history: ${history.map((entry) => `${safe(entry.status || "Applied")} · ${safe(entry.at || entry.on || entry.date)}`).join(" → ")}</small>` : "<small>No status changes recorded yet.</small>";
      return `<li><strong>${safe(application.internshipTitle || application.title || application.internshipId)}</strong> · ${safe(application.companyName || application.org)} · <b>${safe(application.status || "Applied")}</b><small>Applied ${safe(application.appliedAt || application.appliedOn)}</small>${historyMarkup}</li>`;
    }).join("")}</ul>` : "No applications recorded";
    const cvAccessMarkup = `<section class="admin-record-section"><h4>CV access &amp; review</h4><dl class="admin-profile-grid">${detail("CV uploaded to server", student.cvUploaded ? "Yes" : "No")}${detail("Student permission for admin", student.adminCvShared ? "Allowed" : "Not allowed")}${detail("Admin review", safe(student.cvReview?.status || "Not reviewed"))}</dl>${student.cvUploaded && student.adminCvShared ? `<button type="button" class="btn btn--secondary btn--sm" data-open-server-cv="${safe(student.id)}" data-student-email="${safe(student.email)}" data-student-name="${safe(student.name)}">Open uploaded CV</button>` : student.cvUploaded ? `<p class="hint">The server CV is private from admins until the student enables admin review permission.</p><button type="button" class="btn btn--ghost btn--sm" data-open-browser-cv="${safe(student.email)}" data-student-name="${safe(student.name)}">Open browser-stored CV</button>` : `<button type="button" class="btn btn--ghost btn--sm" data-open-browser-cv="${safe(student.email)}" data-student-name="${safe(student.name)}">Open browser-stored CV</button><p class="hint" style="margin-top:8px;">Browser-only CV access works only in this browser after the student enables it.</p>`}</section>`;
    const sections = `<section class="admin-record-section"><h4>Account &amp; academic details</h4><dl class="admin-profile-grid">${detail("Email",safe(student.email))}${detail("Mobile",safe(profile.mobileNumber))}${detail("Degree",safe(student.degree))}${detail("Course",safe(student.course))}${detail("College",safe(student.college))}${detail("Academic year",safe(student.year))}${detail("Graduation year",safe(student.graduationYear))}${detail("Location",safe(student.location))}${detail("Created",safe(student.createdAt))}${detail("Profile visible to active companies",student.profileVisible?"Yes":"No")}${detail("CV sharing enabled",student.cvShared?"Yes":"No")}</dl></section><section class="admin-record-section"><h4>Profile, skills &amp; goals</h4><dl class="admin-profile-grid">${detail("Headline",safe(profile.headline))}${detail("Introduction",safe(profile.summary))}${detail("Skills",safe((student.skills||[]).join(", ")))}${detail("Interests",safe((student.interests||[]).join(", ")))}${detail("Preferred sector",safe(profile.preferredSector))}${detail("Preferred location",safe(profile.preferredLocation))}${detail("Preferences",safe(profile.preferences))}</dl></section><section class="admin-record-section"><h4>Professional links</h4><dl class="admin-profile-grid">${[ ["LinkedIn",profile.linkedIn], ["GitHub",profile.github], ["Portfolio",profile.portfolio] ].map(([label,url])=>detail(label, /^https?:\/\//i.test(url||"")?`<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">Open link ↗</a>`:"—")).join("")}</dl></section><section class="admin-record-section"><h4>Projects · ${projects.length}</h4>${projects.length?`<ul class="admin-record-list">${projects.map(p=>`<li><strong>${safe(p.title||p.name)}</strong> · ${safe(p.technologies||p.skills)}<small>${safe(p.description)}</small></li>`).join("")}</ul>`:"No projects recorded"}</section><section class="admin-record-section"><h4>Applications &amp; status history</h4>${applicationMarkup}<p>Saved opportunity IDs: ${safe((student.savedIds||[]).join(", ")||"None")}</p></section><section class="admin-record-section"><h4>Interview practice scores</h4>${(student.interviewScores||[]).length?`<ul class="admin-record-list">${student.interviewScores.map(s=>`<li><strong>${safe(s.category)}</strong> · ${safe(s.score)}/${safe(s.total)} (${Math.round(Number(s.score)/Number(s.total)*100)}%) · ${safe(s.date)}</li>`).join("")}</ul>`:"No server-synced practice scores"}</section>${cvAccessMarkup}`;
    const companyCvReviews = Array.isArray(student.companyCvReviews) ? student.companyCvReviews : [];
    const companyCvReviewsMarkup = `<section class="admin-record-section"><h4>Company CV reviews · ${companyCvReviews.length}</h4>${companyCvReviews.length ? `<ul class="admin-record-list">${companyCvReviews.map((review) => `<li><strong>${safe(review.companyName)} · ${safe(review.status)}</strong><small>${review.reviewedAt ? `Reviewed ${safe(App.formatDate(review.reviewedAt))}` : "Review date unavailable"}${review.note ? ` · Feedback: ${safe(review.note)}` : ""}</small></li>`).join("")}</ul>` : "No company CV reviews have been submitted."}</section>`;
    const summaryMarkup = `<section class="admin-student-record__summary">${renderAdminStudentPhoto(profile.photo, studentName)}<div class="admin-student-record__identity"><strong>${safe(studentName)}</strong><span>${safe([student.degree, student.course].filter(Boolean).join(" · ") || "Student profile")} · ${safe(student.college || "College not added")}</span><span>${safe(student.email)}</span></div><div class="admin-student-record__stats"><span>${student.profileVisible ? "Profile visible" : "Profile private"}</span><span>${student.adminCvShared ? "Admin CV permission on" : "Admin CV permission off"}</span><span>${apps.length} application${apps.length === 1 ? "" : "s"}</span></div></section>`;
    body.innerHTML = summaryMarkup + sections + companyCvReviewsMarkup;
    body.querySelector("[data-open-server-cv]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try {
        await openServerStudentCv({ id, email: button.dataset.studentEmail, name: button.dataset.studentName, cvReview: student.cvReview });
      } catch (error) { App.toast(error.message,"error"); }
      finally { button.disabled = false; }
    });
    body.querySelector("[data-open-browser-cv]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { await openBrowserStudentCv(button.dataset.openBrowserCv || student.email, button.dataset.studentName || student.name); }
      catch (error) { App.toast(error.message, "error"); }
      finally { button.disabled = false; }
    });
    studentDialogTitle.textContent = student.name || "Student details";
    studentDialog.showModal();
  }
  const readAuditLog = () => {
    try { const items = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); return Array.isArray(items) ? items : []; }
    catch (_) { return []; }
  };
  function renderAuditLog() {
    const entries = readAuditLog();
    const markup = entries.length ? entries.slice(0, 20).map((entry) => `<li><strong>${App.escapeHtml(entry.action)}</strong>${entry.target ? ` · ${App.escapeHtml(entry.target)}` : ""}<small>${App.escapeHtml(new Date(entry.at).toLocaleString())}</small></li>`).join("") : "<li>No admin actions recorded in this browser yet.</li>";
    const audit = document.getElementById("admin-audit-list");
    const recent = document.getElementById("admin-recent-activity");
    if (audit) audit.innerHTML = markup;
    if (recent) recent.innerHTML = markup;
  }
  function logAdminAction(action, target = "") {
    const entries = readAuditLog();
    entries.unshift({ action, target, at: new Date().toISOString() });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(0, 100)));
  }
  const showAdminPanel = () => {
    panel.style.display = "";
    document.getElementById("admin-loading").hidden = true;
    selectAdminView("overview");
    renderAll();
  };

  document.getElementById("admin-logout").addEventListener("click", (e) => {
    e.preventDefault();
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem("im_admin_api_token");
    window.location.href = "login.html?role=admin";
  });

  const form = document.getElementById("admin-form");
  const formTitle = document.getElementById("admin-form-title");
  const resetBtn = document.getElementById("admin-form-reset");
  const tbody = document.getElementById("admin-internship-tbody");
  const studentTbody = document.getElementById("admin-student-tbody");
  const studentDialog = document.getElementById("admin-student-dialog");
  const studentDialogTitle = document.getElementById("admin-student-dialog-title");
  const studentDialogContent = document.getElementById("admin-student-dialog-content");
  const cvDialog = document.getElementById("admin-cv-dialog");
  const cvFrame = document.getElementById("admin-cv-frame");
  let activeCvUrl = "";
  let activeCvEmail = "";
  let activeCvStudentId = "";
  const cvReviewStatus = document.getElementById("admin-cv-review-status");
  const cvReviewNote = document.getElementById("admin-cv-review-note");
  function showCvReviewState(review) {
    const status = review?.status || "Not reviewed";
    cvReviewStatus.textContent = review?.reviewedAt ? `${status} · ${App.formatDate(review.reviewedAt)}` : status;
    cvReviewStatus.className = status === "Approved" ? "is-approved" : status === "Needs changes" ? "is-needs-changes" : "";
    cvReviewNote.value = review?.note || "";
    const statusValue = studentDialogContent.querySelector("[data-cv-review-status]");
    if (statusValue) statusValue.textContent = status;
  }
  async function saveCvReview(status) {
    if (!activeCvEmail) return;
    let review = { status, note: cvReviewNote.value.trim(), reviewedAt: new Date().toISOString(), reviewer: "Admin" };
    if (activeCvStudentId) {
      try {
        const result = await adminApi(`/admin/students/${encodeURIComponent(activeCvStudentId)}/cv-review`, { method: "PATCH", body: JSON.stringify({ status, note: cvReviewNote.value.trim() }) });
        review = result.cvReview || review;
        const student = (window.__adminServerStudents || []).find((item) => item.id === activeCvStudentId);
        if (student) {
          student.cvReview = review;
          if (status !== "Approved") student.cvShared = false;
        }
        await renderAdminServerStudents();
      } catch (error) { App.toast(error.message, "error"); return; }
    }
    Store.writeBlob(`im_cv_review_${activeCvEmail}`, review);
    logAdminAction(status === "Approved" ? "Approved student CV" : "Requested student CV changes", activeCvEmail);
    renderAuditLog();
    showCvReviewState(review);
    App.toast(status === "Approved" ? "CV approved! Student can now upload/share their CV with companies." : "CV marked as needing changes. Company access remains blocked.");
  }
  document.getElementById("admin-cv-approve").addEventListener("click", () => saveCvReview("Approved"));
  document.getElementById("admin-cv-request-changes").addEventListener("click", () => saveCvReview("Needs changes"));
  document.getElementById("admin-cv-dialog-close").addEventListener("click", () => cvDialog.close());
  cvDialog.addEventListener("close", () => {
    cvFrame.removeAttribute("src");
    cvFrame.removeAttribute("srcdoc"); cvFrame.removeAttribute("sandbox");
    cvFrame.hidden = false; cvFrame.style.display = "";
    if (activeCvUrl) URL.revokeObjectURL(activeCvUrl);
    activeCvUrl = "";
    activeCvEmail = "";
    activeCvStudentId = "";
  });
  document.getElementById("admin-student-dialog-close").addEventListener("click", () => studentDialog.close());
  studentDialog.addEventListener("click", (event) => {
    if (event.target === studentDialog) studentDialog.close();
  });

  function resetForm() {
    form.reset();
    form.elements["id"].value = "";
    formTitle.textContent = "Add a new internship";
  }

  function fillFormForEdit(internship) {
    form.elements["id"].value = internship.id;
    form.elements["title"].value = internship.title;
    form.elements["org"].value = internship.org;
    form.elements["sector"].value = internship.sector;
    form.elements["location"].value = internship.location;
    form.elements["locationType"].value = internship.locationType;
    form.elements["duration"].value = internship.duration;
    form.elements["durationMonths"].value = internship.durationMonths;
    form.elements["deadline"].value = internship.deadline;
    form.elements["skills"].value = (internship.skills || []).join(", ");
    form.elements["eligibility"].value = internship.eligibility;
    form.elements["description"].value = internship.description;
    form.elements["stipend"].value = internship.stipend || "";
    formTitle.textContent = `Edit: ${internship.title}`;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = form.elements["id"].value;
    const data = {
      title: form.elements["title"].value.trim(),
      org: form.elements["org"].value.trim(),
      sector: form.elements["sector"].value,
      location: form.elements["location"].value.trim(),
      locationType: form.elements["locationType"].value,
      duration: form.elements["duration"].value.trim(),
      durationMonths: parseInt(form.elements["durationMonths"].value, 10),
      deadline: form.elements["deadline"].value,
      skills: form.elements["skills"].value.split(",").map((s) => s.trim()).filter(Boolean),
      eligibility: form.elements["eligibility"].value.trim(),
      description: form.elements["description"].value.trim(),
      stipend: form.elements["stipend"].value.trim()
    };
    if (id) {
      Store.updateInternship(id, data);
      logAdminAction("Updated internship listing", data.title);
      App.toast("Internship updated.");
    } else {
      Store.addInternship(data);
      logAdminAction("Added internship listing", data.title);
      App.toast("Internship added.");
    }
    resetForm();
    renderAll();
  });

  resetBtn.addEventListener("click", resetForm);

  function renderInternshipTable() {
    const all = Store.getAllInternships();
    tbody.innerHTML = all.map((i) => `
      <tr>
        <td>${App.escapeHtml(i.title)}</td>
        <td>${App.escapeHtml(i.org)}</td>
        <td>${App.escapeHtml(i.sector)}</td>
        <td>${App.escapeHtml(i.location)}</td>
        <td>${App.formatDate(i.deadline)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn--ghost btn--sm" data-edit="${i.id}">Edit</button>
          <button class="btn btn--ghost btn--sm" data-delete="${i.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const internship = Store.getInternshipById(btn.getAttribute("data-edit"));
        if (internship) fillFormForEdit(internship);
      });
    });
    tbody.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Delete this internship listing?")) return;
        const item = Store.getInternshipById(btn.getAttribute("data-delete"));
        Store.deleteInternship(btn.getAttribute("data-delete"));
        logAdminAction("Deleted internship listing", item ? item.title : btn.getAttribute("data-delete"));
        App.toast("Internship deleted.");
        renderAll();
      });
    });

    document.getElementById("admin-stat-internships").textContent = all.length;
  }

  function renderStudentTable() {
    const users = Store.getAllUsers();
    const studentDetails = new Map();
    studentTbody.innerHTML = users.map((u) => {
      const profile = Store.getProfile(u.email);
      const apps = Store.getApplications(u.email);
      const fullName = profile.fullName || u.name;
      const skills = Array.isArray(profile.skills) ? profile.skills : [];
      const interests = Array.isArray(profile.interests) ? profile.interests : [];
      const projects = Array.isArray(profile.projects) ? profile.projects : [];
      const education = [profile.degree, profile.course].filter(Boolean).join(" · ");
      const year = profile.academicYear ? `${profile.academicYear}${profile.academicYear === "1" ? "st" : profile.academicYear === "2" ? "nd" : profile.academicYear === "3" ? "rd" : "th"} year` : "Year not provided";
      const history = Store.readBlob(`im_interview_history_${u.email}`, []);
      const interviewHistory = Array.isArray(history) ? history : [];
      const savedIds = Store.getSavedIds(u.email);
      const ats = Store.readBlob(`im_profile_ats_${u.email}`, null);
      const cvReview = Store.readBlob(`im_cv_review_${u.email}`, null);
      const skillProgress = Store.getSkillProgress(u.email);
      const learnedSkills = Object.keys(skillProgress).filter((skill) => skillProgress[skill]);
      const selectedSkillTarget = Store.readBlob(`im_skill_target_${u.email}`, "all");
      const customSkillTarget = Store.readBlob(`im_skill_target_custom_${u.email}`, "");
      const safeLink = (url, label) => /^https?:\/\//i.test(url || "") ? `<a href="${App.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : "Not provided";
      const detail = (label, value) => `<div><dt>${label}</dt><dd>${value || "Not provided"}</dd></div>`;
      const projectMarkup = projects.length ? projects.map((project) => `<article class="admin-student-project"><strong>${App.escapeHtml(project.title || "Untitled project")}</strong>${project.technologies ? `<span>${App.escapeHtml(project.technologies)}</span>` : ""}${project.description ? `<p>${App.escapeHtml(project.description)}</p>` : ""}${project.url ? `<p>${safeLink(project.url, "Open project")}</p>` : ""}</article>`).join("") : "No projects added";
      const applicationMarkup = apps.length ? apps.map((application) => {
        const internship = Store.getInternshipById(application.internshipId);
        const statusHistory = Array.isArray(application.history) ? application.history : [];
        const historyText = statusHistory.map((item) => `${item.status} · ${App.formatDate(item.on)}`).join(" → ");
        return `<li><strong>${App.escapeHtml(internship ? internship.title : application.internshipId)}</strong>${internship ? ` · ${App.escapeHtml(internship.org)}` : ""} — ${App.escapeHtml(application.status || "Applied")} · Applied ${App.formatDate(application.appliedOn)}${historyText ? `<small>${App.escapeHtml(historyText)}</small>` : ""}</li>`;
      }).join("") : "No applications yet";
      const savedMarkup = savedIds.length ? savedIds.map((id) => Store.getInternshipById(id)).filter(Boolean).map((item) => `${item.title} · ${item.org}`).map(App.escapeHtml).join(", ") : "No saved internships";
      const scoredInterviews = interviewHistory.filter((entry) => entry.type === "quiz" && Number(entry.total) > 0);
      const interviewMarkup = interviewHistory.length ? interviewHistory.map((entry) => {
        const result = entry.type === "quiz" ? `${entry.score}/${entry.total} · ${Math.round((Number(entry.score) / Number(entry.total)) * 100)}%` : `${entry.total || 0} responses`;
        return `<li>${App.escapeHtml(entry.category || "Practice session")} — ${App.escapeHtml(result)} · ${App.formatDate(entry.date)}</li>`;
      }).join("") : "No interview practice sessions";
      const topMatches = Recommendation.rankAll(profile, Store.getAllInternships()).slice(0, 3).map((internship) => `<li>${App.escapeHtml(internship.title)} · ${App.escapeHtml(internship.org)} — ${internship.match.score}%</li>`).join("") || "No recommendations available";
      const achievementNames = [
        ["Profile complete", Store.profileCompletion(profile) === 100],
        ["First application", apps.length > 0],
        ["Bookmark collector", savedIds.length >= 5],
        ["Shortlisted", apps.some((application) => ["Shortlisted", "Selected"].includes(application.status))],
        ["Interview ready", interviewHistory.length >= 3],
        ["Skill builder", skills.length >= 5],
        ["Project builder", projects.length > 0]
      ];
      const achievementMarkup = achievementNames.map(([name, earned]) => `<span class="admin-achievement ${earned ? "is-earned" : ""}">${earned ? "✓" : "○"} ${name}</span>`).join(" ");
      const profileCompletion = Store.profileCompletion(profile);
      const studentInitials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "S";
      const recordMarkup = `
        <section class="admin-student-record__summary">${renderAdminStudentPhoto(profile.photo, fullName)}<div class="admin-student-record__identity"><strong>${App.escapeHtml(fullName)}</strong><span>${App.escapeHtml(education || "Student profile")} · ${App.escapeHtml(profile.college || "College not added")}</span><span>${App.escapeHtml(u.email)}</span></div><div class="admin-student-record__stats"><span>${profileCompletion}% complete</span><span>${apps.length} application${apps.length === 1 ? "" : "s"}</span><span>${skills.length} skills</span></div></section>
        <nav class="admin-student-detail-nav" aria-label="Student detail sections">
          <a class="is-active" href="#student-account">Overview &amp; contact</a><a href="#student-intro">Introduction</a><a href="#student-academic">Academic details</a><a href="#student-skills">Skills &amp; preferences</a><a href="#student-links">Professional links</a><a href="#student-projects">Projects</a><a href="#student-resume">Resume &amp; ATS</a><a href="#student-roadmap">Skill development</a><a href="#student-matches">Recommendations</a><a href="#student-interviews">Interview scores</a><a href="#student-achievements">Achievements</a><a href="#student-saved">Saved internships</a><a href="#student-applications">Applications</a>
        </nav>
        <div class="admin-student-detail-sections">
          <section class="admin-record-section" id="student-account"><h4>Overview &amp; contact</h4><dl class="admin-profile-grid">${detail("Email", App.escapeHtml(u.email))}${detail("Mobile", App.escapeHtml(profile.mobileNumber))}${detail("Account created", App.escapeHtml(u.createdOn ? App.formatDate(u.createdOn) : "Not available"))}${detail("Profile completion", `${profileCompletion}%`)}${detail("Profile photo", profile.photo ? "Added in this browser" : "Not added")}</dl></section>
          <section class="admin-record-section" id="student-intro"><h4>Professional introduction</h4><dl class="admin-profile-grid">${detail("Headline", App.escapeHtml(profile.headline))}${detail("Summary", App.escapeHtml(profile.summary))}</dl></section>
          <section class="admin-record-section" id="student-academic"><h4>Academic details</h4><dl class="admin-profile-grid">${detail("College / university", App.escapeHtml(profile.college || u.college))}${detail("Degree", App.escapeHtml(profile.degree))}${detail("Course / branch", App.escapeHtml(profile.course))}${detail("Academic year", App.escapeHtml(year))}${detail("Graduation year", App.escapeHtml(profile.graduationYear))}${detail("CGPA / percentage", App.escapeHtml(profile.cgpa))}</dl></section>
          <section class="admin-record-section" id="student-skills"><h4>Skills, interests &amp; preferences</h4><dl class="admin-profile-grid">${detail("Skills", App.escapeHtml(skills.join(", ")))}${detail("Interests", App.escapeHtml(interests.join(", ")))}${detail("Preferred sector", App.escapeHtml(profile.preferredSector))}${detail("Preferred location", App.escapeHtml(profile.preferredLocation))}${detail("Preferred duration", App.escapeHtml(profile.preferredDuration ? `${profile.preferredDuration} months` : "No preference"))}</dl></section>
          <section class="admin-record-section" id="student-links"><h4>Professional links</h4><dl class="admin-profile-grid">${detail("LinkedIn", safeLink(profile.linkedIn, "Open LinkedIn"))}${detail("GitHub", safeLink(profile.github, "Open GitHub"))}${detail("Portfolio", safeLink(profile.portfolio, "Open portfolio"))}</dl></section>
          <section class="admin-record-section" id="student-projects"><h4>Projects &amp; portfolio</h4>${projectMarkup}</section>
          <section class="admin-record-section" id="student-resume"><h4>Resume &amp; ATS readiness</h4><dl class="admin-profile-grid">${detail("Resume filename", App.escapeHtml(profile.resumeFileName || "No filename saved"))}${detail("Latest ATS score", ats && Number.isFinite(Number(ats.score)) ? `${Number(ats.score)}% · ${App.escapeHtml(ats.role || "Target role not saved")}` : "No ATS score saved")}${detail("ATS check date", ats && ats.checkedAt ? App.escapeHtml(App.formatDate(ats.checkedAt)) : "Not checked")}${detail("CV review", `<span data-cv-review-status>${App.escapeHtml(cvReview?.status || "Not reviewed")}</span>`)}</dl><button type="button" class="btn btn--secondary btn--sm" data-open-student-cv="${App.escapeHtml(u.email)}">Open shared CV</button><p class="hint" style="margin-top:8px;">The student must enable admin access in Resume Analyzer first. Opening and review decisions are recorded in the local activity log.</p></section>
          <section class="admin-record-section" id="student-roadmap"><h4>Skill development</h4><dl class="admin-profile-grid">${detail("Selected roadmap", App.escapeHtml(selectedSkillTarget === "other" ? customSkillTarget || "Other role" : selectedSkillTarget === "all" ? "All opportunities" : selectedSkillTarget))}${detail("Skills marked learned", App.escapeHtml(learnedSkills.join(", ") || "None marked yet"))}</dl></section>
          <section class="admin-record-section" id="student-matches"><h4>Top profile matches</h4><ul class="admin-record-list">${topMatches}</ul></section>
          <section class="admin-record-section" id="student-interviews"><h4>Interview practice scores</h4><ul class="admin-record-list">${interviewMarkup}</ul></section>
          <section class="admin-record-section" id="student-achievements"><h4>Achievements</h4><div class="admin-achievements">${achievementMarkup}</div></section>
          <section class="admin-record-section" id="student-saved"><h4>Saved internships</h4><p>${App.escapeHtml(savedMarkup)}</p></section>
          <section class="admin-record-section" id="student-applications"><h4>Applications &amp; status history</h4><ul class="admin-record-list">${applicationMarkup}</ul></section>
        </div>`;
      studentDetails.set(u.email, { name: fullName, markup: recordMarkup });
      return `
        <tr>
          <td><button type="button" class="admin-student-open" data-view-student="${App.escapeHtml(u.email)}">${App.escapeHtml(fullName)}</button><div class="admin-cell-tags">${App.escapeHtml(u.email)}</div><div class="admin-cell-tags">Profile ${profileCompletion}% complete</div></td>
          <td>${App.escapeHtml(education || "Program not provided")}<div class="admin-cell-tags">${App.escapeHtml(profile.college || u.college || "College not provided")} · ${App.escapeHtml(year)}</div></td>
          <td><div class="admin-cell-tags"><strong>Skills:</strong> ${App.escapeHtml(skills.join(", ") || "Not provided")}<br><strong>Interests:</strong> ${App.escapeHtml(interests.join(", ") || "Not provided")}</div></td>
          <td><div class="admin-cell-tags">${App.escapeHtml([profile.preferredSector, profile.preferredLocation, profile.preferredDuration ? `${profile.preferredDuration} months` : ""].filter(Boolean).join(" · ") || "No preferences set")}</div></td>
          <td>${apps.length}</td>
        </tr>
      `;
    }).join("");
    studentTbody.querySelectorAll("[data-view-student]").forEach((button) => button.addEventListener("click", () => {
      const record = studentDetails.get(button.getAttribute("data-view-student"));
      if (!record) return;
      studentDialogTitle.textContent = record.name;
      studentDialogContent.innerHTML = record.markup;
      studentDialogContent.querySelectorAll(".admin-student-detail-nav a").forEach((link) => link.addEventListener("click", () => {
        studentDialogContent.querySelectorAll(".admin-student-detail-nav a").forEach((item) => item.classList.remove("is-active"));
        link.classList.add("is-active");
      }));
      studentDialogContent.querySelectorAll("[data-open-student-cv]").forEach((button) => button.addEventListener("click", async () => {
        const email = button.getAttribute("data-open-student-cv");
        if (!window.ResumeVault) { App.toast("CV storage is unavailable in this browser.", "error"); return; }
        try {
          const record = await ResumeVault.get(email);
          if (!record || !record.file) { App.toast("This student has not enabled admin CV access on this browser."); return; }
          if (activeCvUrl) URL.revokeObjectURL(activeCvUrl);
          activeCvUrl = URL.createObjectURL(record.file);
          await showCvFile(record.file, record.name || "student-resume.docx");
          activeCvEmail = email;
          document.getElementById("admin-cv-dialog-title").textContent = `${record.name || "Student"} · CV`;
          showCvReviewState(Store.readBlob(`im_cv_review_${email}`, null));
          logAdminAction("Opened student CV", email);
          renderAuditLog();
          cvDialog.showModal();
        } catch (_) { App.toast("Could not open the saved CV from this browser.", "error"); }
      }));
      studentDialog.showModal();
    }));
    document.getElementById("admin-stat-students").textContent = users.length;

    const totalApps = users.reduce((sum, u) => sum + Store.getApplications(u.email).length, 0);
    document.getElementById("admin-stat-applications").textContent = totalApps;
  }

  function renderControlCenter() {
    const users = Store.getAllUsers();
    const internships = Store.getAllInternships();
    const applications = users.flatMap((user) => Store.getApplications(user.email).map((application) => ({ user, application })));
    const companies = new Set(internships.map((item) => (item.org || "").trim().toLowerCase()).filter(Boolean));
    const recommendationRows = [];
    const assessmentRows = [];
    let quizCount = 0;
    let scoreTotal = 0;
    let scoreMax = 0;
    let interviewCount = 0;
    let upcomingInterviewCount = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    users.forEach((user) => {
      const profile = Store.getProfile(user.email);
      const name = profile.fullName || user.name || user.email;
      const top = Recommendation.rankAll(profile, internships)[0];
      if (top) recommendationRows.push({ name, item: top });
      const history = Store.readBlob(`im_interview_history_${user.email}`, []);
      (Array.isArray(history) ? history : []).filter((entry) => entry.type === "quiz").forEach((entry) => {
        const total = Number(entry.total) || 0;
        const score = Number(entry.score) || 0;
        quizCount += 1; scoreTotal += score; scoreMax += total;
        assessmentRows.push({ name, entry, score, total });
      });
      const reminders = Store.readBlob(`im_calendar_reminders_${user.email}`, []);
      (Array.isArray(reminders) ? reminders : []).forEach((reminder) => {
        if (!/interview|group discussion|\bGD\b/i.test(reminder.title || "")) return;
        interviewCount += 1;
        const date = new Date(`${reminder.date || ""}T00:00:00`);
        if (!Number.isNaN(date.getTime()) && date >= today) upcomingInterviewCount += 1;
      });
    });

    document.getElementById("admin-stat-companies").textContent = companies.size;
    document.getElementById("admin-stat-interviews").textContent = interviewCount;
    document.getElementById("admin-stat-assessments").textContent = quizCount;
    document.getElementById("admin-assessment-attempts").textContent = quizCount;
    document.getElementById("admin-assessment-average").textContent = scoreMax ? `${Math.round((scoreTotal / scoreMax) * 100)}%` : "—";
    document.getElementById("admin-upcoming-interviews").textContent = upcomingInterviewCount;

    const stages = ["Applied", "Shortlisted", "Assessment", "Interview", "Offered", "Selected"];
    const stageCounts = stages.map((stage) => ({ label: stage, count: applications.filter(({ application }) => (application.status || "Applied").toLowerCase().includes(stage.toLowerCase())).length }));
    const maxStage = Math.max(1, ...stageCounts.map((stage) => stage.count));
    document.getElementById("admin-overview-pipeline").innerHTML = stageCounts.map((stage) => `<div class="admin-mini-chart__row"><span>${stage.label}</span><span class="admin-mini-chart__track"><span class="admin-mini-chart__bar" style="display:block;width:${Math.round((stage.count / maxStage) * 100)}%"></span></span><strong class="admin-mini-chart__value">${stage.count}</strong></div>`).join("");
    const sectorCounts = {};
    internships.forEach((item) => { const sector = item.sector || "Other"; sectorCounts[sector] = (sectorCounts[sector] || 0) + 1; });
    const sectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxSector = Math.max(1, ...sectors.map((entry) => entry[1]));
    document.getElementById("admin-overview-sectors").innerHTML = sectors.length ? sectors.map(([label, count]) => `<div class="admin-mini-chart__row"><span title="${App.escapeHtml(label)}">${App.escapeHtml(label)}</span><span class="admin-mini-chart__track"><span class="admin-mini-chart__bar" style="display:block;width:${Math.round((count / maxSector) * 100)}%"></span></span><strong class="admin-mini-chart__value">${count}</strong></div>`).join("") : "<p class=\"hint\">No internship listings yet.</p>";

    const recruitmentRows = applications.slice().sort((a, b) => new Date(b.application.appliedOn) - new Date(a.application.appliedOn));
    document.getElementById("admin-recruitment-tbody").innerHTML = recruitmentRows.length ? recruitmentRows.map(({ user, application }) => {
      const profile = Store.getProfile(user.email);
      const item = Store.getInternshipById(application.internshipId);
      return `<tr><td>${App.escapeHtml(profile.fullName || user.name || user.email)}</td><td>${App.escapeHtml(item ? item.title : application.internshipId)}</td><td>${App.escapeHtml(item ? item.org : "Listing removed")}</td><td>${App.escapeHtml(application.status || "Applied")}</td><td>${App.escapeHtml(application.appliedOn ? App.formatDate(application.appliedOn) : "—")}</td></tr>`;
    }).join("") : `<tr><td colspan="5">No applications recorded yet.</td></tr>`;

    assessmentRows.sort((a, b) => new Date(b.entry.date) - new Date(a.entry.date));
    document.getElementById("admin-assessment-tbody").innerHTML = assessmentRows.length ? assessmentRows.slice(0, 30).map(({ name, entry, score, total }) => `<tr><td>${App.escapeHtml(name)}</td><td>${App.escapeHtml(entry.category || "Practice quiz")}</td><td>${score}/${total}${total ? ` · ${Math.round((score / total) * 100)}%` : ""}</td><td>${App.escapeHtml(entry.date ? App.formatDate(entry.date) : "—")}</td></tr>`).join("") : `<tr><td colspan="4">No quiz attempts found.</td></tr>`;
    document.getElementById("admin-recommendation-tbody").innerHTML = recommendationRows.length ? recommendationRows.slice(0, 30).map(({ name, item }) => `<tr><td>${App.escapeHtml(name)}</td><td>${App.escapeHtml(item.title)}</td><td>${App.escapeHtml(item.org)}</td><td><strong>${item.match.score}%</strong></td><td>${App.escapeHtml(item.match.matchedSkills.join(", ") || "No direct skill overlap")}</td></tr>`).join("") : `<tr><td colspan="5">Add students and opportunities to generate demo matches.</td></tr>`;

    const soon = internships.filter((item) => {
      if (!item.deadline) return false;
      const days = Math.ceil((new Date(`${item.deadline}T00:00:00`) - today) / 86400000);
      return days >= 0 && days <= 7;
    });
    const alerts = [];
    if (!users.length) alerts.push("No student accounts are registered in this browser yet.");
    if (!companies.size) alerts.push("No companies are represented in the internship catalogue.");
    if (soon.length) alerts.push(`${soon.length} internship listing${soon.length === 1 ? " has" : "s have"} a deadline within 7 days.`);
    document.getElementById("admin-alert-list").innerHTML = alerts.length ? alerts.map((item) => `<li>${App.escapeHtml(item)}</li>`).join("") : "<li>No urgent platform items based on the available demo data.</li>";
    renderAuditLog();
  }

  function renderAll() {
    renderInternshipTable();
    renderStudentTable();
    renderAdminServerStudents();
    renderCompanyAccounts();
    if (window.AdminAnalytics) window.AdminAnalytics.render();
    renderControlCenter();
  }

  document.getElementById("admin-clear-audit").addEventListener("click", () => {
    localStorage.removeItem(AUDIT_KEY);
    renderAuditLog();
    App.toast("Local demo activity log cleared.");
  });
  document.getElementById("admin-support-refresh").addEventListener("click", renderSupportInbox);
  document.getElementById("admin-reset-refresh")?.addEventListener("click", renderPasswordResetRequests);
  document.getElementById("admin-company-review-refresh")?.addEventListener("click", renderCompanyReviewQueue);
  document.getElementById("admin-assessments-refresh")?.addEventListener("click", renderAssessmentReviewQueue);
  document.getElementById("admin-open-assessments")?.addEventListener("click", () => { selectAdminView("assessments"); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.getElementById("admin-company-requests-refresh")?.addEventListener("click", renderCompanyAccounts);
  document.getElementById("admin-server-students-refresh")?.addEventListener("click", renderAdminServerStudents);
  document.getElementById("admin-send-student-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await adminApi("/admin/support-messages", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      App.toast("Message sent to the student.");
      await renderSupportInbox();
      await loadSupportStudents();
    } catch (error) { App.toast(error.message, "error"); }
    finally { button.disabled = false; }
  });
  loadSupportStudents();

  document.querySelectorAll("[data-admin-view]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    selectAdminView(link.getAttribute("data-admin-view"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  if (sessionStorage.getItem(SESSION_KEY) === "true" && sessionStorage.getItem("im_admin_api_token")) {
    adminApi("/admin/students").then(() => { showAdminPanel(); renderAssessmentReviewQueue(); }).catch(() => {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem("im_admin_api_token");
      window.location.replace("login.html?role=admin");
    });
  } else window.location.replace("login.html?role=admin");

  window.AdminShared = { renderAll };
});
