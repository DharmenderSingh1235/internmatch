/* Student interview schedule and video-call entry. */
document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("student-interviews-list");
  if (!list) return;

  const user = Store.getCurrentUser();
  if (!user) { window.location.replace("login.html?role=student"); return; }
  if (user.role !== "student") { window.location.replace(user.role === "company" ? "company-dashboard.html" : "admin.html"); return; }

  const token = sessionStorage.getItem("im_student_api_token");
  const summary = document.getElementById("interviews-summary");
  const filters = document.querySelectorAll("[data-interview-filter]");
  let interviews = [];
  let filter = "upcoming";

  function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function render() {
    const today = localDateString();
    const visible = interviews
      .filter((item) => filter === "all" || (filter === "past" ? item.date < today : item.date >= today))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")));

    summary.textContent = `${visible.length} ${filter === "all" ? "total" : filter} interview${visible.length === 1 ? "" : "s"}`;
    if (!visible.length) {
      const hasAny = interviews.length > 0;
      const title = hasAny ? `No ${filter} interviews` : "No interviews scheduled yet";
      const copy = hasAny
        ? "Choose another filter to see the rest of your schedule."
        : "When a company schedules an interview for you, it will appear here.";
      list.innerHTML = `<div class="interviews-empty"><span class="interviews-empty__icon" aria-hidden="true">▣</span><div><strong>${title}</strong><p>${copy}</p><a href="applications.html">Review your applications</a></div></div>`;
      return;
    }

    list.innerHTML = visible.map((item) => {
      const date = new Date(`${item.date}T00:00:00`);
      const online = /online|video|virtual/i.test(item.mode || "Online");
      const past = item.date < today;
      return `<article class="interview-card"><div class="interview-card__date"><strong>${App.escapeHtml(date.toLocaleDateString(undefined, { day: "2-digit" }))}</strong><span>${App.escapeHtml(date.toLocaleDateString(undefined, { month: "short" }))}</span><small>${App.escapeHtml(date.toLocaleDateString(undefined, { year: "numeric" }))}</small></div><div class="interview-card__body"><div class="interview-card__labels"><span class="interview-card__type">${App.escapeHtml(item.type || "Interview")}</span><span class="interview-card__state${past ? " is-past" : ""}">${past ? "Completed" : "Scheduled"}</span></div><h3>${App.escapeHtml(item.internshipTitle || "Internship interview")}</h3><p class="interview-card__company">${App.escapeHtml(item.companyName || "Company")}</p><div class="interview-card__meta"><span>${App.escapeHtml(item.time || "Time to be confirmed")}</span><span>${online ? "Online video interview" : "In person"}</span></div>${item.details ? `<p class="interview-card__details">${App.escapeHtml(item.details)}</p>` : ""}</div><div class="interview-card__actions">${!past && online ? `<button type="button" class="btn btn--primary" data-join-interview="${App.escapeHtml(item.id)}">📹 Join Video Call</button>` : !past ? `<span class="interview-card__location">${App.escapeHtml(item.details || "See meeting details")}</span>` : `<span class="interview-card__done">Interview completed</span>`}</div></article>`;
    }).join("");

    list.querySelectorAll("[data-join-interview]").forEach((button) => {
      button.addEventListener("click", () => {
        const interview = visible.find((item) => item.id === button.dataset.joinInterview);
        if (!interview) return;
        InterviewRoom.start({
          role: "student",
          interviewId: interview.id,
          candidateName: Store.getProfile(user.email)?.fullName || user.name || "Student",
          companyName: interview.companyName || "Company",
          roleTitle: interview.internshipTitle || "Internship",
          apiToken: token,
          onEnd: () => App.toast("You left the interview room.")
        });
      });
    });
  }

  async function loadInterviews() {
    const refresh = document.getElementById("interviews-refresh");
    refresh.disabled = true;
    if (!token) {
      summary.textContent = "Sign in to view your interview schedule.";
      list.innerHTML = `<div class="interviews-empty"><span class="interviews-empty__icon" aria-hidden="true">▣</span><div><strong>Sign in to load interviews</strong><p>Your company-scheduled meetings will appear here after you sign in.</p><a href="login.html?role=student">Student sign in</a></div></div>`;
      refresh.disabled = false;
      return;
    }
    summary.textContent = "Loading your schedule…";
    list.innerHTML = `<div class="interviews-empty">Loading your interviews…</div>`;
    try {
      const response = await fetch(`${window.IM_API_BASE}/api/student/interviews`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load your interview schedule.");
      interviews = data.items || [];
      render();
    } catch (error) {
      summary.textContent = "Schedule unavailable";
      list.innerHTML = `<div class="interviews-empty"><span class="interviews-empty__icon" aria-hidden="true">!</span><div><strong>Couldn’t load interviews</strong><p>${App.escapeHtml(error.message)} Make sure the InternMatch server is running, then refresh.</p></div></div>`;
    } finally { refresh.disabled = false; }
  }

  filters.forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.interviewFilter;
    filters.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  }));
  document.getElementById("interviews-refresh").addEventListener("click", loadInterviews);
  loadInterviews();
});
