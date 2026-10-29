/* js/applications.js — applications.html */

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("applications-list");
  if (!list) return;
  const user = Store.getCurrentUser();
  if (!user) return;

  const search = document.getElementById("app-search");
  const statusFilter = document.getElementById("app-status-filter");
  const countEl = document.getElementById("app-count");
  const internshipsById = {};
  Store.getAllInternships().forEach((i) => (internshipsById[i.id] = i));

  const STATUS_CLASS = {
    Applied: "status-applied",
    "Under Review": "status-review",
    Shortlisted: "status-shortlisted",
    Interview: "status-interview",
    Selected: "status-selected",
    Rejected: "status-rejected",
    Withdrawn: "status-withdrawn"
  };

  const openNotes = new Set();
  let scheduledInterviews = [];
  let serverApplications = [];

  function render() {
    const q = (search.value || "").trim().toLowerCase();
    const statusQ = statusFilter.value;
    let apps = Store.getApplications(user.email)
      .map((a) => {
        const serverApplication = serverApplications.find((item) => item.internshipId === a.internshipId);
        return Object.assign({}, a, serverApplication ? { status: serverApplication.status, appliedOn: serverApplication.appliedAt || a.appliedOn } : {}, { internship: internshipsById[a.internshipId] });
      })
      .filter((a) => a.internship);

    if (q) {
      apps = apps.filter((a) => `${a.internship.title} ${a.internship.org}`.toLowerCase().includes(q));
    }
    if (statusQ) {
      apps = apps.filter((a) => a.status === statusQ);
    }
    apps.sort((a, b) => new Date(b.appliedOn) - new Date(a.appliedOn));

    countEl.textContent = `${apps.length} application${apps.length === 1 ? "" : "s"}`;

    list.innerHTML = apps.length ? apps.map((a) => {
      const isOpen = openNotes.has(a.internship.id);
      const hasNote = a.notes && a.notes.trim();
      const scheduledInterview = scheduledInterviews.find((interview) => interview.internshipId === a.internship.id);
      return `
      <div class="app-row">
        <div class="app-row__main">
          <div>
            <h3 class="app-row__title">${App.escapeHtml(a.internship.title)}</h3>
            <p class="app-row__org">${App.escapeHtml(a.internship.org)} &middot; ${App.escapeHtml(a.internship.location)}</p>
            <p class="hint">Applied ${App.formatDate(a.appliedOn)}</p>
          </div>
          <div class="app-row__right">
            <span class="status-badge ${STATUS_CLASS[a.status] || ""}">${App.escapeHtml(a.status)}</span>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              ${scheduledInterview ? `<button class="btn btn--primary btn--sm" data-join-call="${App.escapeHtml(scheduledInterview.id)}" data-role-title="${App.escapeHtml(a.internship.title)}" data-org="${App.escapeHtml(a.internship.org)}">📹 Join Video Call</button>` : ""}
              <a class="btn btn--ghost btn--sm" href="internship-details.html?id=${a.internship.id}">View</a>
              <button class="btn btn--ghost btn--sm" data-toggle-notes="${a.internship.id}">${isOpen ? "Hide notes" : hasNote ? "Edit notes ✓" : "Add notes"}</button>
              ${a.status !== "Withdrawn" ? `<button class="btn btn--ghost btn--sm" data-withdraw="${a.internship.id}">Withdraw</button>` : ""}
            </div>
          </div>
        </div>
        ${isOpen ? `
          <div class="app-row__notes">
            <textarea data-notes-for="${a.internship.id}" rows="3" placeholder="Private notes — interviewer names, prep reminders, follow-up dates…">${App.escapeHtml(a.notes || "")}</textarea>
            <button class="btn btn--secondary btn--sm" data-save-notes="${a.internship.id}">Save note</button>
          </div>
        ` : ""}
      </div>
    `;
    }).join("") : `<p class="empty-state">No applications match here yet. <a href="internships.html">Find an internship to apply to</a>.</p>`;

    list.querySelectorAll("[data-join-call]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-join-call");
        const roleTitle = btn.getAttribute("data-role-title");
        const org = btn.getAttribute("data-org");
        const profile = Store.getProfile(user.email);
        InterviewRoom.start({
          role: "student",
          interviewId: id,
          candidateName: profile?.fullName || user.name || "Student",
          companyName: org || "Recruiter",
          roleTitle: roleTitle || "Internship Role",
          apiToken: sessionStorage.getItem("im_student_api_token"),
          onEnd: () => {
            App.toast("Left interview room.");
          }
        });
      });
    });

    list.querySelectorAll("[data-withdraw]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Withdraw this application? This can't be undone.")) return;
        Store.withdrawApplication(user.email, btn.getAttribute("data-withdraw"));
        App.toast("Application withdrawn.");
        render();
      });
    });

    list.querySelectorAll("[data-toggle-notes]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-toggle-notes");
        if (openNotes.has(id)) openNotes.delete(id);
        else openNotes.add(id);
        render();
      });
    });

    list.querySelectorAll("[data-save-notes]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-save-notes");
        const textarea = list.querySelector(`[data-notes-for="${id}"]`);
        Store.updateApplicationNotes(user.email, id, textarea.value);
        App.toast("Note saved.");
        openNotes.delete(id);
        render();
      });
    });
  }

  search.addEventListener("input", render);
  statusFilter.addEventListener("change", render);
  render();

  const token = sessionStorage.getItem("im_student_api_token");
  if (token) {
    fetch(`${window.IM_API_BASE}/api/student/interviews`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { scheduledInterviews = data?.items || []; render(); })
      .catch(() => {});
    fetch(`${window.IM_API_BASE}/api/student/applications`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { serverApplications = data?.items || []; render(); })
      .catch(() => {});
  }
});
