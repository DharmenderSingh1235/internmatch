/* js/dashboard.js — dashboard.html
   Hero banner, topbar search/notifications/avatar menu, stat cards,
   skill-match donut, recommendations, skill-demand chart, recent
   applications, and the learning-path roadmap. */

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("dashboard-root");
  if (!root) return;
  const user = Store.getCurrentUser();
  if (!user) { window.location.replace("login.html?role=student"); return; }
  if (user.role === "company") { window.location.replace("company-dashboard.html"); return; }
  if (user.role === "admin") { window.location.replace("admin.html"); return; }

  const profile = Store.getProfile(user.email);
  const applications = Store.getApplications(user.email);
  const savedIds = Store.getSavedIds(user.email);
  const ranked = Recommendation.rankAll(profile, Store.getAllInternships());
  const firstName = (profile.fullName || user.name || "there").split(" ")[0];

  const cvReview = Store.readBlob(`im_cv_review_${user.email}`, null);
  const cvReviewBanner = document.querySelector(".cv-review-banner");
  if (cvReviewBanner) {
    const statusEl = document.getElementById("dashboard-cv-review-status");
    const messageEl = document.getElementById("dashboard-cv-review-message");
    const actionEl = document.getElementById("dashboard-cv-review-action");
    if (cvReview?.status) {
      statusEl.textContent = cvReview.status;
      const when = cvReview.reviewedAt ? ` · ${App.formatDate(cvReview.reviewedAt)}` : "";
      const note = cvReview.note ? ` Feedback: ${cvReview.note}` : "";
      messageEl.textContent = `${cvReview.status === "Approved" ? "Your CV was approved by the admin" : "The admin requested changes to your CV"}${when}.${note}`;
      cvReviewBanner.classList.add(cvReview.status === "Approved" ? "is-approved" : "is-needs-changes");
      actionEl.textContent = cvReview.status === "Approved" ? "View profile" : "Update CV";
      actionEl.href = cvReview.status === "Approved" ? "profile.html" : "resume-analyzer.html";
    }
  }

  const internshipsById = {};
  Store.getAllInternships().forEach((i) => (internshipsById[i.id] = i));
  const events = [];
  applications.forEach((a) => {
    (a.history || []).forEach((h) => {
      const internship = internshipsById[a.internshipId];
      events.push({
        on: h.on,
        status: h.status,
        internshipId: a.internshipId,
        text: h.status === "Applied"
          ? `Applied to ${internship ? internship.title : "an internship"}`
          : `${internship ? internship.title : "An internship"} — ${h.status}`
      });
    });
  });
  events.sort((a, b) => new Date(b.on) - new Date(a.on));

  // ---------- Deadline reminder banner ----------

  const DISMISS_KEY = "im_dismissed_deadline_banner";
  const banner = document.getElementById("deadline-banner");
  if (!sessionStorage.getItem(DISMISS_KEY)) {
    const tracked = Store.readBlob(`im_calendar_${user.email}`, {});
    const watchIds = new Set([...savedIds, ...Object.keys(tracked).filter((id) => tracked[id].status !== "Completed")]);
    const soon = [...watchIds]
      .map((id) => internshipsById[id])
      .filter(Boolean)
      .map((i) => Object.assign({ days: App.daysUntil(i.deadline) }, i))
      .filter((i) => i.days !== null && i.days >= 0 && i.days <= 5)
      .sort((a, b) => a.days - b.days);

    if (soon.length) {
      const first = soon[0];
      const text = soon.length === 1
        ? `${first.title} at ${first.org} is due ${first.days === 0 ? "today" : `in ${first.days} day${first.days === 1 ? "" : "s"}`}.`
        : `${soon.length} internships you're tracking have deadlines in the next 5 days — soonest is ${first.title} (${first.days === 0 ? "today" : `${first.days}d`}).`;
      document.getElementById("deadline-banner-text").textContent = text;
      banner.style.display = "";
    }
  }
  document.getElementById("deadline-banner-dismiss").addEventListener("click", () => {
    banner.style.display = "none";
    sessionStorage.setItem(DISMISS_KEY, "1");
  });

  // ---------- Topbar: greeting, role, search, notifications, menu ----------

  document.getElementById("hero-greeting").textContent = `Hello, ${firstName}! 👋`;

  const roleParts = [profile.degree, profile.course].filter(Boolean);
  document.getElementById("topbar-user-role").textContent = roleParts.length ? roleParts.join(" ") : "Student account";

  const searchInput = document.getElementById("dash-search");
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      window.location.href = `internships.html?q=${encodeURIComponent(searchInput.value.trim())}`;
    }
  });

  const underReview = applications.filter((a) => a.status === "Under Review" || a.status === "Shortlisted").length;
  const notifBadge = document.getElementById("notif-badge");
  if (underReview > 0) {
    notifBadge.textContent = underReview;
    notifBadge.style.display = "";
  }
  const notifMenu = document.getElementById("notif-menu");
  const notifList = document.getElementById("notif-menu-list");
  const notifEvents = events.filter((e) => e.status !== "Applied").slice(0, 6);
  notifList.innerHTML = notifEvents.length
    ? notifEvents.map((e) => `
        <a class="notif-menu__item" href="internship-details.html?id=${e.internshipId}">
          ${App.escapeHtml(e.text)}
          <span class="notif-menu__item-date">${App.formatDate(e.on)}</span>
        </a>
      `).join("")
    : `<p class="notif-menu__empty">No status updates yet — check back once your applications start moving.</p>`;

  const userToggle = document.getElementById("topbar-user-toggle");
  const userMenu = document.getElementById("topbar-menu");

  document.getElementById("notif-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    notifMenu.classList.toggle("notif-menu--open");
    userMenu.classList.remove("topbar-menu--open");
  });
  userToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    userMenu.classList.toggle("topbar-menu--open");
    notifMenu.classList.remove("notif-menu--open");
  });
  document.addEventListener("click", () => {
    notifMenu.classList.remove("notif-menu--open");
    userMenu.classList.remove("topbar-menu--open");
  });

  // ---------- Hero: profile completion + skill-match donut ----------

  const completion = Store.profileCompletion(profile);
  document.getElementById("stat-completion").textContent = `${completion}%`;
  document.getElementById("completion-fill").style.width = `${completion}%`;

  const topForDonut = ranked.slice(0, 5);
  const matchedSet = new Set();
  const missingSet = new Set();
  topForDonut.forEach((i) => {
    (i.match.matchedSkills || []).forEach((s) => matchedSet.add(s));
    (i.match.missingSkills || []).forEach((s) => missingSet.add(s));
  });
  const requiredAnywhere = new Set([...matchedSet, ...missingSet]);
  const otherCount = profile.skills.filter((s) => !requiredAnywhere.has(s)).length;
  const matchedCount = matchedSet.size;
  const missingCount = missingSet.size;
  const donutTotal = matchedCount + missingCount;
  const donutPct = donutTotal ? Math.round((matchedCount / donutTotal) * 100) : 0;

  document.getElementById("skill-donut-center").textContent = `${donutPct}%`;
  document.getElementById("skill-donut-legend").innerHTML = `
    <li><span class="dot dot--matched"></span> Matched skills (${matchedCount})</li>
    <li><span class="dot dot--missing"></span> Missing skills (${missingCount})</li>
    <li><span class="dot dot--other"></span> Other skills (${otherCount})</li>
  `;

  const donutEl = document.getElementById("skillDonutChart");
  if (donutEl && window.Chart) {
    new Chart(donutEl, {
      type: "doughnut",
      data: {
        labels: ["Matched", "Missing", "Other"],
        datasets: [{
          data: [matchedCount, missingCount, otherCount],
          backgroundColor: ["#1a7f37", "#2a5bd7", "#c9cfdd"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: false,
        cutout: "72%",
        plugins: { legend: { display: false }, tooltip: { enabled: true } }
      }
    });
  }

  // ---------- Stat cards ----------

  const strongMatches = ranked.filter((i) => i.match.score >= 70).length;
  document.getElementById("stat-recommended").textContent = strongMatches;
  document.getElementById("stat-applied").textContent = applications.filter((a) => a.status !== "Withdrawn").length;
  document.getElementById("stat-shortlisted").textContent = applications.filter((a) => a.status === "Shortlisted" || a.status === "Selected").length;
  document.getElementById("stat-saved").textContent = savedIds.length;

  // ---------- Top recommendations (mini cards) ----------

  const LOGO_COLORS = ["#2a5bd7", "#1a7f37", "#7c5cff", "#c8790f", "#0f9aa8", "#c0392b"];
  function logoColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return LOGO_COLORS[hash % LOGO_COLORS.length];
  }
  function orgInitials(org) {
    const parts = org.trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
  }
  function matchTier(score) {
    if (score >= 75) return "high";
    if (score >= 50) return "mid";
    return "low";
  }

  function renderRecMiniCard(i) {
    const saved = Store.isSaved(user.email, i.id);
    return `
      <article class="rec-mini-card">
        <div class="rec-mini-card__logo" style="background:${logoColor(i.org)}">${App.escapeHtml(orgInitials(i.org))}</div>
        <div class="rec-mini-card__body">
          <div class="rec-mini-card__top">
            <div>
              <h3 class="int-card__title">${App.escapeHtml(i.title)}</h3>
              <p class="int-card__org">${App.escapeHtml(i.org)}</p>
            </div>
            <div class="match-badge match-badge--${matchTier(i.match.score)}">${i.match.score}% <span>match score</span></div>
          </div>
          <div class="int-card__meta">
            <span class="pill pill--muted">${App.escapeHtml(i.locationType)}</span>
            <span class="pill pill--muted">${App.escapeHtml(i.duration)}</span>
            ${i.stipend ? `<span class="pill pill--muted">${App.escapeHtml(i.stipend)}</span>` : ""}
          </div>
          <div class="int-card__meta">
            ${i.skills.slice(0, 4).map((s) => `<span class="pill ${i.match.matchedSkills.includes(s) ? "pill--matched" : ""}">${App.escapeHtml(s)}</span>`).join("")}
          </div>
          <div class="rec-mini-card__footer">
            <a class="btn btn--primary btn--sm" href="internship-details.html?id=${i.id}">View details</a>
            <button class="bookmark-btn" data-save-id="${i.id}" aria-pressed="${saved}" aria-label="Save internship" title="${saved ? "Saved" : "Save"}">${saved ? "★" : "☆"}</button>
          </div>
        </div>
      </article>
    `;
  }

  const recWrap = document.getElementById("dashboard-recommended");
  recWrap.innerHTML = App.skeletonCards(2, "rec-mini-card");
  const topRecs = ranked.slice(0, 4);
  setTimeout(() => {
    recWrap.innerHTML = topRecs.length
      ? topRecs.map(renderRecMiniCard).join("")
      : `<p class="empty-state">Add a few skills to your profile to see recommendations here.</p>`;
    recWrap.querySelectorAll("[data-save-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nowSaved = Store.toggleSaved(user.email, btn.getAttribute("data-save-id"));
        btn.textContent = nowSaved ? "★" : "☆";
        btn.setAttribute("aria-pressed", nowSaved);
        App.toast(nowSaved ? "Saved to your list." : "Removed from saved.");
      });
    });
  }, 220);

  // ---------- Skill demand chart ----------

  const chartEl = document.getElementById("skillMatchChart");
  if (chartEl && window.Chart) {
    const topPool = ranked.slice(0, 8);
    const freq = {};
    topPool.forEach((i) => {
      (i.skills || []).forEach((s) => (freq[s] = (freq[s] || 0) + 1));
    });
    const topSkills = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const have = new Set(profile.skills.map((s) => s.toLowerCase()));

    new Chart(chartEl, {
      type: "bar",
      data: {
        labels: topSkills.map(([s]) => s),
        datasets: [
          {
            label: "Demand across top matches",
            data: topSkills.map(([, c]) => Math.round((c / topPool.length) * 100)),
            backgroundColor: "#c9cfdd",
            borderRadius: 6,
            maxBarThickness: 22
          },
          {
            label: "You have it",
            data: topSkills.map(([s]) => (have.has(s.toLowerCase()) ? 100 : 0)),
            backgroundColor: "#2a5bd7",
            borderRadius: 6,
            maxBarThickness: 22
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } } }
      }
    });
  }

  // ---------- Recent applications ----------

  const activityList = document.getElementById("recent-activity");
  activityList.innerHTML = events.slice(0, 5).map((e) => `
    <li class="activity-list__item">
      <span>${App.escapeHtml(e.text)}</span>
      <span class="activity-list__date">${App.formatDate(e.on)}</span>
    </li>
  `).join("") || `<li class="activity-list__item"><span class="hint">No applications yet — browse internships to get started.</span></li>`;

  // ---------- Recommended learning path ----------

  const pathEl = document.getElementById("suggested-skills");
  const freq2 = {};
  ranked.slice(0, 10).forEach((i) => {
    (i.match.missingSkills || []).forEach((s) => (freq2[s] = (freq2[s] || 0) + 1));
  });
  const topSkills2 = Object.entries(freq2).sort((a, b) => b[1] - a[1]).slice(0, 4);
  pathEl.innerHTML = topSkills2.length
    ? topSkills2.map(([skill, count]) => `
        <li class="learning-path__item">
          <span class="learning-path__num"></span>
          <span>
            <strong>Learn ${App.escapeHtml(skill)}</strong>
            <div class="hint">Requested in ${count} of your top matches</div>
          </span>
        </li>
      `).join("")
    : `<li class="learning-path__item"><span class="hint">You're covering the skills asked for across your top matches.</span></li>`;

  // ---------- Recently viewed ----------

  const recentlyViewedEl = document.getElementById("recently-viewed-list");
  const recentIds = Store.getRecentlyViewed(user.email);
  const recentInternships = recentIds.map((id) => internshipsById[id]).filter(Boolean).slice(0, 5);
  recentlyViewedEl.innerHTML = recentInternships.length
    ? recentInternships.map((i) => `
        <a class="recently-viewed-row" href="internship-details.html?id=${i.id}">
          <span class="recently-viewed-row__title">${App.escapeHtml(i.title)}</span>
          <span class="hint">${App.escapeHtml(i.org)}</span>
        </a>
      `).join("")
    : `<p class="hint">Internships you open will show up here for quick access.</p>`;
});
