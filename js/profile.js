/* js/profile.js — profile.html */

document.addEventListener("DOMContentLoaded", () => {
  const user = Store.getCurrentUser();
  if (!user) return;

  const form = document.getElementById("profile-form");
  if (!form) return;

  const skillsInput = document.getElementById("skills-input");
  const skillsTags = document.getElementById("skills-tags");
  const interestsInput = document.getElementById("interests-input");
  const interestsTags = document.getElementById("interests-tags");
  const completionBar = document.getElementById("completion-bar");
  const completionLabel = document.getElementById("completion-label");
  const photoUpload = document.getElementById("photo-upload");
  const photoPreview = document.getElementById("profile-preview-avatar");
  const photoRemoveBtn = document.getElementById("photo-remove-btn");
  const projectList = document.getElementById("profile-project-list");
  const saveStatus = document.getElementById("profile-save-status");

  let profile = Store.getProfile(user.email);

  function renderTags(container, list, onRemove) {
    container.innerHTML = list.map((tag, idx) => `
      <span class="tag-chip">${App.escapeHtml(tag)}
        <button type="button" class="tag-chip__remove" data-idx="${idx}" aria-label="Remove ${App.escapeHtml(tag)}">&times;</button>
      </span>
    `).join("");
    container.querySelectorAll(".tag-chip__remove").forEach((btn) => {
      btn.addEventListener("click", () => onRemove(parseInt(btn.getAttribute("data-idx"), 10)));
    });
  }

  function refreshTagLists() {
    renderTags(skillsTags, profile.skills, (idx) => {
      profile.skills.splice(idx, 1);
      refreshTagLists();
    });
    renderTags(interestsTags, profile.interests, (idx) => {
      profile.interests.splice(idx, 1);
      refreshTagLists();
    });
    updateCompletion();
    renderAchievements();
  }

  function addTag(input, list) {
    const value = input.value.trim().replace(/,$/, "");
    if (!value) return;
    if (!list.some((t) => t.toLowerCase() === value.toLowerCase())) {
      list.push(value);
    }
    input.value = "";
    refreshTagLists();
  }

  function wireTagInput(input, list) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(input, list);
      }
    });
    input.addEventListener("blur", () => addTag(input, list));
  }

  function updateCompletion() {
    const pct = Store.profileCompletion(profile);
    if (completionBar) completionBar.style.width = `${pct}%`;
    if (completionLabel) completionLabel.textContent = `${pct}% complete`;
    const completionValue = document.getElementById("profile-completion-value");
    const completionRing = document.getElementById("profile-completion-ring");
    if (completionValue) completionValue.textContent = `${pct}%`;
    if (completionRing) {
      completionRing.style.setProperty("--profile-progress", `${pct}%`);
      completionRing.setAttribute("aria-label", `Profile completion ${pct} percent`);
    }
    updateProfileInsights();
  }

  function updateProfileInsights() {
    const value = (id) => (document.getElementById(id)?.value || "").trim();
    document.getElementById("profile-insight-skills").textContent = String(profile.skills.length);
    document.getElementById("profile-insight-projects").textContent = String((profile.projects || []).length);
    document.getElementById("profile-insight-applications").textContent = String(Store.getApplications(user.email).filter((application) => application.status !== "Withdrawn").length);
    const history = Store.readBlob(`im_interview_history_${user.email}`, []);
    document.getElementById("profile-insight-tests").textContent = String(history.filter((entry) => entry.type === "quiz").length);
    renderProfileAtsSummary();

    const checklist = [
      ["p-headline", "Add a career headline", "p-headline", !!value("p-headline")],
      ["p-summary", "Write a short professional summary", "p-summary", !!value("p-summary")],
      ["skills-input", "Add at least one relevant skill", "skills-input", profile.skills.length > 0],
      ["project-title", "Add a project to your portfolio", "profile-projects-card", (profile.projects || []).length > 0],
      ["p-college", "Add your education details", "p-college", !!value("p-college") && !!value("p-degree")]
    ].filter(([, , , complete]) => !complete);
    const list = document.getElementById("profile-checklist");
    list.innerHTML = checklist.length ? checklist.map(([, label, target]) => `<li><a href="#${target}"><span class="profile-checklist__icon" aria-hidden="true">＋</span>${App.escapeHtml(label)}</a></li>`).join("") : `<li><span class="profile-checklist__icon" aria-hidden="true">✓</span>Core profile details are complete.</li>`;
  }

  function renderProfileAtsSummary() {
    const target = document.getElementById("profile-ats-summary");
    if (!target) return;
    const reviewTarget = document.getElementById("profile-cv-review");
    const cvReview = Store.readBlob(`im_cv_review_${user.email}`, null);
    if (reviewTarget) {
      if (!cvReview?.status) {
        reviewTarget.innerHTML = `<span aria-hidden="true">▤</span><span><strong>CV review</strong><br>No admin review yet. You can share a CV from Resume Analyzer.</span>`;
      } else {
        const reviewedDate = cvReview.reviewedAt ? App.formatDate(cvReview.reviewedAt) : "";
        const message = cvReview.status === "Approved" ? "Your CV has been approved." : "Your CV needs changes.";
        const note = cvReview.note ? `<br>${App.escapeHtml(cvReview.note)}` : "";
        reviewTarget.innerHTML = `<span aria-hidden="true">${cvReview.status === "Approved" ? "✓" : "!"}</span><span><strong>CV review · ${App.escapeHtml(cvReview.status)}</strong><br>${message}${reviewedDate ? ` · ${App.escapeHtml(reviewedDate)}` : ""}${note}</span>`;
      }
    }
    const companyReviewTarget = document.getElementById("profile-company-cv-reviews");
    if (companyReviewTarget) {
      const reviews = Store.readBlob(`im_company_cv_reviews_${user.email}`, []);
      companyReviewTarget.innerHTML = reviews.length
        ? reviews.slice().sort((a, b) => Date.parse(b.reviewedAt || 0) - Date.parse(a.reviewedAt || 0)).map((review) => `<article class="profile-company-cv-review"><div class="profile-company-cv-review__head"><strong>${App.escapeHtml(review.companyName || "Company")}</strong><span class="profile-company-cv-review__status">${App.escapeHtml(review.status)}</span></div><span>${review.status === "Approved" ? "Your CV was approved by this company." : "This company requested CV changes."}${review.reviewedAt ? ` · ${App.escapeHtml(App.formatDate(review.reviewedAt))}` : ""}</span>${review.note ? `<p style="margin:6px 0 0;">${App.escapeHtml(review.note)}</p>` : ""}</article>`).join("")
        : `<div class="profile-cv-review"><span aria-hidden="true">✉</span><span><strong>Company CV feedback</strong><br>Company review decisions and change requests will appear here.</span></div>`;
    }
    const result = Store.readBlob(`im_profile_ats_${user.email}`, null);
    const validScore = Number.isFinite(Number(result?.score)) && result?.score !== "";
    if (!validScore) {
      target.innerHTML = `<div class="profile-ats-summary__details"><strong>CV ATS score</strong><span>Run a role-specific CV check to see your latest score here.</span></div><a class="btn btn--ghost btn--sm" href="resume-analyzer.html">Check CV</a>`;
      return;
    }
    const checkedAt = result.checkedAt ? new Date(result.checkedAt) : null;
    const date = checkedAt && Number.isFinite(checkedAt.getTime()) ? checkedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Saved in this browser";
    target.innerHTML = `<div class="profile-ats-summary__score" aria-label="ATS score ${Number(result.score)} percent">${Number(result.score)}%</div><div class="profile-ats-summary__details"><strong>Latest CV ATS score</strong><span>${App.escapeHtml(result.role || "Selected internship")} · ${App.escapeHtml(date)}</span></div><a class="btn btn--ghost btn--sm" href="resume-analyzer.html">Update</a>`;
  }

  window.addEventListener("storage", (event) => {
    if (event.key === `im_cv_review_${user.email}`) renderProfileAtsSummary();
  });

  function safeHttpUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) { return ""; }
  }

  function renderProfilePreview() {
    const name = document.getElementById("p-fullname").value.trim() || user.name || "Your name";
    const headline = document.getElementById("p-headline").value.trim();
    const summary = document.getElementById("p-summary").value.trim();
    document.getElementById("profile-preview-name").textContent = name;
    document.getElementById("profile-preview-headline").textContent = headline || "Add a headline to introduce your goals";
    document.getElementById("profile-preview-summary").textContent = summary || "Write a short summary about your studies, interests, and the kind of internship you’re looking for.";
    document.getElementById("summary-char-count").textContent = String(summary.length);
    const avatar = document.getElementById("profile-preview-avatar");
    avatar.innerHTML = profile.photo ? `<img src="${App.escapeHtml(profile.photo)}" alt="" />` : App.escapeHtml(App.initials(name));
    const meta = [
      ["◆", document.getElementById("p-course").value.trim() || document.getElementById("p-degree").value],
      ["⌂", document.getElementById("p-college").value.trim()],
      ["▣", document.getElementById("p-gradyear").value ? `Graduating ${document.getElementById("p-gradyear").value}` : ""],
      ["⌖", document.getElementById("p-location").value.trim()]
    ].filter(([, value]) => value);
    document.getElementById("profile-preview-meta").innerHTML = meta.map(([icon, value]) => `<span><span aria-hidden="true">${icon}</span>${App.escapeHtml(value)}</span>`).join("");
    const links = [
      ["LinkedIn", document.getElementById("p-linkedin").value],
      ["GitHub", document.getElementById("p-github").value],
      ["Portfolio", document.getElementById("p-portfolio").value]
    ].map(([label, value]) => [label, safeHttpUrl(value)]).filter(([, url]) => url);
    document.getElementById("profile-preview-links").innerHTML = links.map(([label, url]) => `<a class="btn btn--ghost btn--sm" href="${App.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`).join("");
  }

  function renderPhotoPreview() {
    photoPreview.innerHTML = profile.photo
      ? `<img src="${App.escapeHtml(profile.photo)}" alt="" class="avatar__img" />`
      : App.escapeHtml(App.initials(profile.fullName || user.name));
    photoRemoveBtn.style.display = profile.photo ? "" : "none";
    renderProfilePreview();
  }

  function resizeImageFile(file, maxSize) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read that image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("That doesn't look like a valid image."));
        image.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  photoUpload.addEventListener("change", async () => {
    const file = photoUpload.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      App.toast("Choose a JPG or PNG image.", "error");
      photoUpload.value = "";
      return;
    }
    try {
      profile.photo = await resizeImageFile(file, 480);
      Store.saveProfile(user.email, { photo: profile.photo });
      renderPhotoPreview();
      App.toast("Profile photo updated.");
    } catch (error) {
      App.toast(error.message || "Couldn't process that image.", "error");
    }
    photoUpload.value = "";
  });

  photoRemoveBtn.addEventListener("click", () => {
    profile.photo = "";
    Store.saveProfile(user.email, { photo: "" });
    renderPhotoPreview();
    App.toast("Profile photo removed.");
  });

  function renderProjects() {
    profile.projects = Array.isArray(profile.projects) ? profile.projects : [];
    projectList.innerHTML = profile.projects.length ? profile.projects.map((project, index) => `
      <article class="profile-project">
        <div class="profile-project__top"><div><strong>${App.escapeHtml(project.title)}</strong>${project.technologies ? `<p class="hint">${App.escapeHtml(project.technologies)}</p>` : ""}</div><button type="button" class="btn btn--ghost btn--sm" data-remove-project="${index}" aria-label="Remove ${App.escapeHtml(project.title)}">Remove</button></div>
        ${project.description ? `<p>${App.escapeHtml(project.description)}</p>` : ""}
        ${safeHttpUrl(project.url) ? `<p><a href="${App.escapeHtml(safeHttpUrl(project.url))}" target="_blank" rel="noopener noreferrer">View project ↗</a></p>` : ""}
      </article>
    `).join("") : `<p class="hint">No projects added yet. A class project, personal build, or research project is a good start.</p>`;
    projectList.querySelectorAll("[data-remove-project]").forEach((button) => button.addEventListener("click", () => {
      profile.projects.splice(Number(button.dataset.removeProject), 1);
      Store.saveProfile(user.email, { projects: profile.projects });
      renderProjects();
      updateCompletion();
      renderAchievements();
      App.toast("Project removed.");
    }));
  }

  function renderAchievements() {
    const wrap = document.getElementById("achievements-wrap");
    const applications = Store.getApplications(user.email);
    const savedIds = Store.getSavedIds(user.email);
    const interviewHistory = Store.readBlob(`im_interview_history_${user.email}`, []);
    const completion = Store.profileCompletion(profile);

    const badges = [
      {
        icon: "✅",
        name: "Profile complete",
        detail: "Fill in every profile field",
        earned: completion === 100
      },
      {
        icon: "🚀",
        name: "First application",
        detail: "Apply to one internship",
        earned: applications.length >= 1
      },
      {
        icon: "🔖",
        name: "Bookmark collector",
        detail: "Save 5 internships",
        earned: savedIds.length >= 5
      },
      {
        icon: "🎯",
        name: "Shortlisted",
        detail: "Get shortlisted or selected for an internship",
        earned: applications.some((a) => a.status === "Shortlisted" || a.status === "Selected")
      },
      {
        icon: "🎓",
        name: "Interview ready",
        detail: "Complete 3 interview-prep sessions",
        earned: interviewHistory.length >= 3
      },
      {
        icon: "🧩",
        name: "Skill builder",
        detail: "List 5 or more skills on your profile",
        earned: profile.skills.length >= 5
      },
      {
        icon: "🛠️",
        name: "Project builder",
        detail: "Add a project to your portfolio",
        earned: Array.isArray(profile.projects) && profile.projects.length > 0
      }
    ];

    wrap.innerHTML = badges.map((b) => `
      <div class="badge-chip ${b.earned ? "badge-chip--earned" : ""}" title="${App.escapeHtml(b.detail)}">
        <span class="badge-chip__icon">${b.icon}</span>
        <span class="badge-chip__name">${App.escapeHtml(b.name)}</span>
      </div>
    `).join("");
  }

  function renderInterviewScores() {
    const target = document.getElementById("interview-score-summary");
    if (!target) return;
    const history = Store.readBlob(`im_interview_history_${user.email}`, []);
    const scored = history.filter((entry) => entry.type === "quiz" && Number(entry.total) > 0 && Number.isFinite(Number(entry.score)));
    if (!scored.length) {
      target.innerHTML = `<div class="score-empty"><div><strong>No practice scores yet</strong><p class="hint" style="margin:4px 0 0;">Complete a quiz to see your best result and recent progress here.</p></div><a class="btn btn--secondary btn--sm" href="interview-prep.html">Start a practice quiz</a></div>`;
      return;
    }
    const latest = scored[0];
    const bestEntry = scored.reduce((best, entry) => Number(entry.score) / Number(entry.total) > Number(best.score) / Number(best.total) ? entry : best, scored[0]);
    const percentOf = (entry) => Math.round((Number(entry.score) / Number(entry.total)) * 100);
    target.innerHTML = `
      <div class="score-overview">
        <div class="score-metric"><span class="score-metric__label">Personal best</span><strong class="score-metric__value">${percentOf(bestEntry)}%</strong><span class="score-metric__detail">${App.escapeHtml(bestEntry.category || "Practice quiz")}</span><div class="score-metric__bar" role="progressbar" aria-label="Best score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentOf(bestEntry)}"><span style="width:${percentOf(bestEntry)}%"></span></div></div>
        <div class="score-metric"><span class="score-metric__label">Latest attempt</span><strong class="score-metric__value">${percentOf(latest)}%</strong><span class="score-metric__detail">${App.escapeHtml(latest.category || "Practice quiz")} · ${Number(latest.score)}/${Number(latest.total)} correct</span><div class="score-metric__bar" role="progressbar" aria-label="Latest test score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentOf(latest)}"><span style="width:${percentOf(latest)}%"></span></div></div>
      </div>
      <h3 style="margin:0;">Recent attempts</h3>
      <div class="score-history">${scored.slice(0, 5).map((entry, index) => `
        <div class="score-history-item"><div><span class="score-history-item__category">${App.escapeHtml(entry.category || "Practice quiz")}${index === 0 ? ` <span class="pill pill--muted">Latest</span>` : ""}</span><span class="score-history-item__date">${App.formatDate(entry.date)}</span></div><div class="score-history-item__result"><span class="score-history-item__percent">${percentOf(entry)}%</span><span class="score-history-item__fraction">${Number(entry.score)}/${Number(entry.total)} correct</span></div></div>
      `).join("")}</div>
      <p class="hint" style="margin:14px 0 0;">For learning progress only. These are not official employer assessments or hiring decisions.</p>
    `;
  }

  async function renderAssessmentTracker() {
    const target = document.getElementById("profile-assessment-tracker");
    if (!target) return;
    const token = sessionStorage.getItem("im_student_api_token");
    if (!token) {
      target.innerHTML = `<div class="assessment-tracker-empty"><strong>Sign in to view company assessment results</strong><p>Your marks and recruiter review status are linked to your student account.</p><a class="btn btn--secondary btn--sm" href="login.html?role=student">Sign in</a></div>`;
      return;
    }
    target.innerHTML = '<p class="hint">Loading your assessments…</p>';
    try {
      const response = await fetch(`${window.IM_API_BASE}/api/student/assessment-tracker`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          const apiUrl = new URL(window.IM_API_BASE);
          const isLocalApi = ["localhost", "127.0.0.1"].includes(apiUrl.hostname);
          const guidance = isLocalApi
            ? "Stop the old API process using port 3002, then run npm start from this project's server folder. Confirm /api/health reports studentAssessmentTracker: true."
            : "This deployed API is older than the profile page. Redeploy the backend with the current server/server.js; restarting a local API will not update this host. Confirm /api/health reports studentAssessmentTracker: true.";
          throw new Error(`The API at ${apiUrl.origin} does not have the assessment tracker route. ${guidance}`);
        }
        throw new Error(data.error || `Could not load assessments (${response.status}).`);
      }
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        target.innerHTML = `<div class="assessment-tracker-empty"><strong>No company assessments yet</strong><p>When a company assigns an approved test to one of your applications, it will appear here with its marks and review status.</p><a class="btn btn--secondary btn--sm" href="interview-prep.html">Open interview prep</a></div>`;
        return;
      }
      target.innerHTML = `<div class="assessment-tracker-summary"><span><strong>${items.filter((item) => item.result).length}</strong> submitted</span><span><strong>${items.filter((item) => item.result?.status === "Reviewed").length}</strong> recruiter reviewed</span><span><strong>${items.filter((item) => item.available).length}</strong> available</span></div><div class="assessment-tracker-list">${items.map((item) => {
        const result = item.result;
        const final = !!result && ["Scored", "Reviewed"].includes(result.status);
        const score = result ? Number(result.score) || 0 : 0;
        const total = result ? Number(result.totalMarks) || Number(item.totalMarks) || 0 : Number(item.totalMarks) || 0;
        const percent = total ? Math.max(0, Math.min(100, Math.round(score / total * 100))) : 0;
        const state = result ? (final ? (result.status === "Reviewed" ? "Recruiter reviewed" : "Auto-scored") : "Awaiting recruiter review") : (item.available ? "Available" : "Not open");
        const date = result?.submittedAt ? App.formatDate(result.submittedAt) : item.endAt ? `Due ${App.formatDate(item.endAt)}` : "No deadline set";
        const marks = result ? `${score} / ${total} marks${final ? ` · ${percent}%` : " · provisional"}` : `${total} marks available`;
        return `<article class="assessment-tracker-item"><div class="assessment-tracker-item__main"><div class="assessment-tracker-item__title"><div><h3>${App.escapeHtml(item.title || "Company assessment")}</h3><p>${App.escapeHtml(item.companyName || "Company")} · ${App.escapeHtml(item.roleTitle || "Internship")}</p></div><span class="assessment-tracker-status ${final ? "is-complete" : result ? "is-pending" : ""}">${App.escapeHtml(state)}</span></div><div class="assessment-tracker-meta"><span>${App.escapeHtml(item.category || "Assessment")}</span><span>${App.escapeHtml(item.difficulty || "")}</span><span>${Number(item.durationMinutes) || 0} min</span><span>${App.escapeHtml(date)}</span></div>${result ? `<div class="assessment-tracker-marks"><strong>${App.escapeHtml(marks)}</strong>${final ? `<span>${result.passed ? "Pass" : "Below passing mark"} · Passing mark ${Number(item.passingMarks) || 0}</span>` : `<span>Written or coding answers are awaiting recruiter review. Final marks may change.</span>`}<div class="assessment-tracker-bar" role="progressbar" aria-label="${final ? "Final assessment score" : "Current auto-scored marks"}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div></div>` : ""}</div>${!result ? `<a class="btn btn--secondary btn--sm" href="interview-prep.html">${item.available ? "Take assessment" : "View details"}</a>` : ""}</article>`;
      }).join("")}</div>`;
    } catch (error) {
      target.innerHTML = `<div class="assessment-tracker-empty"><strong>Assessment results unavailable</strong><p>${App.escapeHtml(error.message)}</p></div>`;
    }
  }

  function syncInterviewScores() {
    const token = sessionStorage.getItem("im_student_api_token");
    if (!token) return;
    const scores = Store.readBlob(`im_interview_history_${user.email}`, []).filter((entry) => entry.type === "quiz" && Number(entry.total) > 0 && Number.isFinite(Number(entry.score))).slice(0, 20).map((entry) => ({ category: entry.category, score: Number(entry.score), total: Number(entry.total), date: entry.date }));
    fetch(`${window.IM_API_BASE}/api/student/interview-scores`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ scores }) }).catch(() => {});
  }

  async function hydrateServerProfile() {
    const token = sessionStorage.getItem("im_student_api_token");
    if (!token || user.role !== "student") return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${window.IM_API_BASE}/api/student/profile`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Profile sync failed (${response.status}).`);

      const localProfile = Store.getProfile(user.email);
      const mergedProfile = { ...(data.profile || {}) };
      Object.entries(localProfile).forEach(([key, value]) => {
        const hasValue = Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim() !== "" : value != null;
        if (hasValue || key === "photo") mergedProfile[key] = value;
      });
      profile = Object.assign(Store.getProfile(user.email), mergedProfile);
      Store.writeBlob(`im_profile_${user.email}`, profile);
      if (data.cvReview) Store.writeBlob(`im_cv_review_${user.email}`, data.cvReview);
      Store.writeBlob(`im_company_cv_reviews_${user.email}`, Array.isArray(data.companyCvReviews) ? data.companyCvReviews : []);

      const localHistory = Store.readBlob(`im_interview_history_${user.email}`, []);
      const history = [...localHistory];
      const known = new Set(history.filter((entry) => entry.type === "quiz").map((entry) => `${entry.category}|${entry.score}|${entry.total}|${entry.date}`));
      (Array.isArray(data.interviewScores) ? data.interviewScores : []).forEach((entry) => {
        const key = `${entry.category}|${entry.score}|${entry.total}|${entry.date}`;
        if (!known.has(key)) history.push({ ...entry, type: "quiz" });
      });
      history.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
      Store.writeBlob(`im_interview_history_${user.email}`, history.slice(0, 100));

      fillForm();
      renderAchievements();
      renderInterviewScores();
      renderAssessmentTracker();
      renderProfileAtsSummary();
      syncInterviewScores();

      const saveController = new AbortController();
      const saveTimeout = setTimeout(() => saveController.abort(), 8000);
      try {
        const saveResponse = await fetch(`${window.IM_API_BASE}/api/student/profile`, {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          // Server CV-sharing preferences are independent of profile edits; do not infer consent from browser storage.
          body: JSON.stringify({ profile }),
          signal: saveController.signal
        });
        if (!saveResponse.ok) throw new Error(`Profile sync failed (${saveResponse.status}).`);
      } finally { clearTimeout(saveTimeout); }

      saveStatus.textContent = "Profile and practice scores synced with your student account.";
    } catch (error) {
      if (error.name !== "AbortError") console.warn("Student profile could not sync with the server:", error.message);
      saveStatus.textContent = "Showing your saved profile from this browser; server sync is unavailable right now.";
    } finally {
      clearTimeout(timeout);
    }
  }

  function fillForm() {
    profile.projects = Array.isArray(profile.projects) ? profile.projects : [];
    document.getElementById("p-fullname").value = profile.fullName || "";
    document.getElementById("p-headline").value = profile.headline || "";
    document.getElementById("p-summary").value = profile.summary || "";
    document.getElementById("p-linkedin").value = profile.linkedIn || "";
    document.getElementById("p-github").value = profile.github || "";
    document.getElementById("p-portfolio").value = profile.portfolio || "";
    document.getElementById("p-college").value = profile.college || "";
    document.getElementById("p-degree").value = profile.degree || "";
    document.getElementById("p-course").value = profile.course || "";
    document.getElementById("p-year").value = profile.academicYear || "";
    document.getElementById("p-gradyear").value = profile.graduationYear || "";
    document.getElementById("p-cgpa").value = profile.cgpa || "";
    document.getElementById("p-mobile").value = profile.mobileNumber || "";
    document.getElementById("p-sector").value = profile.preferredSector || "";
    document.getElementById("p-location").value = profile.preferredLocation || "";
    document.getElementById("p-duration").value = profile.preferredDuration || "";
    renderPhotoPreview();
    refreshTagLists();
    renderProjects();
    renderProfilePreview();
  }

  wireTagInput(skillsInput, profile.skills);
  wireTagInput(interestsInput, profile.interests);

  ["p-fullname", "p-headline", "p-summary", "p-linkedin", "p-github", "p-portfolio", "p-course", "p-college", "p-gradyear", "p-location", "p-degree"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      renderProfilePreview();
      if (id === "p-headline" || id === "p-summary") updateCompletion();
    });
    document.getElementById(id).addEventListener("change", renderProfilePreview);
  });

  document.getElementById("add-project").addEventListener("click", () => {
    const titleInput = document.getElementById("project-title");
    const techInput = document.getElementById("project-tech");
    const urlInput = document.getElementById("project-link");
    const descriptionInput = document.getElementById("project-description");
    const title = titleInput.value.trim();
    const urlValue = urlInput.value.trim();
    if (!title) { App.toast("Enter a project name first.", "error"); titleInput.focus(); return; }
    if (urlValue && !safeHttpUrl(urlValue)) { App.toast("Use a valid http or https project link.", "error"); urlInput.focus(); return; }
    profile.projects.push({ title, technologies: techInput.value.trim(), url: safeHttpUrl(urlValue), description: descriptionInput.value.trim() });
    Store.saveProfile(user.email, { projects: profile.projects });
    [titleInput, techInput, urlInput, descriptionInput].forEach((input) => { input.value = ""; });
    renderProjects();
    updateCompletion();
    renderAchievements();
    App.toast("Project added to your profile.");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    profile.fullName = document.getElementById("p-fullname").value.trim();
    profile.headline = document.getElementById("p-headline").value.trim();
    profile.summary = document.getElementById("p-summary").value.trim();
    profile.linkedIn = document.getElementById("p-linkedin").value.trim();
    profile.github = document.getElementById("p-github").value.trim();
    profile.portfolio = document.getElementById("p-portfolio").value.trim();
    for (const [label, value, inputId] of [
      ["LinkedIn", profile.linkedIn, "p-linkedin"],
      ["GitHub", profile.github, "p-github"],
      ["Portfolio", profile.portfolio, "p-portfolio"]
    ]) {
      if (value && !safeHttpUrl(value)) {
        App.toast(`${label} must be a valid http or https link.`, "error");
        document.getElementById(inputId).focus();
        return;
      }
    }
    profile.college = document.getElementById("p-college").value.trim();
    profile.degree = document.getElementById("p-degree").value;
    profile.course = document.getElementById("p-course").value.trim();
    profile.academicYear = document.getElementById("p-year").value;
    profile.graduationYear = document.getElementById("p-gradyear").value;
    profile.cgpa = document.getElementById("p-cgpa").value.trim();
    profile.mobileNumber = document.getElementById("p-mobile").value.trim();
    if (profile.mobileNumber && !/^\+?[0-9\s().-]{7,24}$/.test(profile.mobileNumber)) {
      App.toast("Enter a valid mobile number, including country code if needed.", "error");
      document.getElementById("p-mobile").focus();
      return;
    }
    profile.preferredSector = document.getElementById("p-sector").value;
    profile.preferredLocation = document.getElementById("p-location").value.trim();
    profile.preferredDuration = document.getElementById("p-duration").value;

    Store.saveProfile(user.email, profile);
    updateCompletion();
    renderAchievements();
    renderProfilePreview();
    saveStatus.textContent = `Saved just now · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    App.toast("Profile saved.");
  });

  const resumeBtn = document.getElementById("btn-open-resume-builder");
  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => {
      let modal = document.getElementById("resume-builder-modal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "resume-builder-modal";
        modal.className = "modal-backdrop";
        modal.setAttribute("role", "dialog");
        modal.innerHTML = `
          <div class="modal-window modal-window--wide">
            <div class="modal-header">
              <div>
                <span class="pill pill--primary" style="font-size:0.75rem;">1-Click ATS Builder</span>
                <h2 style="margin:4px 0 0;font-size:1.3rem;">Standard ATS Resume</h2>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <button type="button" class="btn btn--primary btn--sm" id="rb-print-btn">🖨️ Print / Save PDF</button>
                <button type="button" class="btn btn--ghost btn--sm" id="rb-copy-btn">📋 Copy Text</button>
                <button type="button" class="btn btn--ghost btn--sm" id="rb-close-btn" aria-label="Close modal">✕</button>
              </div>
            </div>
            <div class="modal-body">
              <div id="resume-print-area" class="resume-paper"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;color:var(--color-muted);">
              <span>Formatted to pass Applicant Tracking Systems (ATS) with standard single-column layout.</span>
              <button type="button" class="btn btn--ghost btn--sm" id="rb-close-btn2">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector("#rb-close-btn").addEventListener("click", () => { modal.style.display = "none"; });
        modal.querySelector("#rb-close-btn2").addEventListener("click", () => { modal.style.display = "none"; });
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

        modal.querySelector("#rb-print-btn").addEventListener("click", () => {
          window.print();
        });

        modal.querySelector("#rb-copy-btn").addEventListener("click", () => {
          const area = modal.querySelector("#resume-print-area");
          navigator.clipboard.writeText(area.innerText).then(() => App.toast("ATS resume text copied to clipboard!"))
            .catch(() => App.toast("Unable to copy", "error"));
        });
      }

      const area = modal.querySelector("#resume-print-area");
      const name = profile.fullName || user.name || "Student Name";
      const headline = profile.headline || `${profile.degree || "B.Tech"} Student in ${profile.course || "Computer Science"}`;
      const contacts = [
        user.email,
        profile.mobileNumber,
        profile.preferredLocation,
        profile.linkedIn ? "LinkedIn: " + profile.linkedIn : "",
        profile.github ? "GitHub: " + profile.github : "",
        profile.portfolio ? "Portfolio: " + profile.portfolio : ""
      ].filter(Boolean);

      const skills = (profile.skills || []).join(", ") || "Python, JavaScript, Data Structures, Problem Solving, Web Development";
      const interests = (profile.interests || []).join(", ");
      const projects = (profile.projects || []).map((p) => {
        const title = typeof p === "string" ? p : p.title || "Project";
        const desc = typeof p === "object" && p.desc ? p.desc : "";
        const tech = typeof p === "object" && p.tech ? `Technologies: ${p.tech}` : "";
        return `
          <div class="resume-entry">
            <div class="resume-entry-head"><span>${App.escapeHtml(title)}</span></div>
            ${tech ? `<div class="resume-entry-sub"><span>${App.escapeHtml(tech)}</span></div>` : ""}
            ${desc ? `<p style="margin:2px 0 0;">${App.escapeHtml(desc)}</p>` : ""}
          </div>
        `;
      }).join("");

      area.innerHTML = `
        <h1>${App.escapeHtml(name)}</h1>
        <div class="resume-subtitle">${App.escapeHtml(headline)}</div>
        <div class="resume-contacts">${contacts.map((c) => `<span>${App.escapeHtml(c)}</span>`).join(" &bull; ")}</div>

        ${profile.summary ? `
          <div class="resume-section-title">Professional Summary</div>
          <p>${App.escapeHtml(profile.summary)}</p>
        ` : ""}

        <div class="resume-section-title">Education</div>
        <div class="resume-entry">
          <div class="resume-entry-head">
            <span>${App.escapeHtml(profile.college || "University / College")}</span>
            <span>${App.escapeHtml(profile.graduationYear ? "Expected " + profile.graduationYear : "")}</span>
          </div>
          <div class="resume-entry-sub">
            <span>${App.escapeHtml((profile.degree || "Degree") + (profile.course ? " in " + profile.course : ""))}</span>
            <span>${profile.cgpa ? "CGPA / Percentage: " + App.escapeHtml(profile.cgpa) : (profile.academicYear ? "Year " + App.escapeHtml(profile.academicYear) : "")}</span>
          </div>
        </div>

        <div class="resume-section-title">Technical Skills &amp; Competencies</div>
        <div class="resume-skills-block">
          <p style="margin:0;"><strong>Core Skills:</strong> ${App.escapeHtml(skills)}</p>
          ${interests ? `<p style="margin:4px 0 0;"><strong>Areas of Interest:</strong> ${App.escapeHtml(interests)}</p>` : ""}
        </div>

        ${projects ? `
          <div class="resume-section-title">Academic &amp; Key Projects</div>
          ${projects}
        ` : ""}

        <div class="resume-section-title">Internship Preferences</div>
        <p style="margin:0;"><strong>Target Sector:</strong> ${App.escapeHtml(profile.preferredSector || "Software Development")} &bull; <strong>Preferred Location:</strong> ${App.escapeHtml(profile.preferredLocation || "Flexible")} &bull; <strong>Duration:</strong> ${App.escapeHtml(profile.preferredDuration || "3-6 months")}</p>
      `;

      modal.style.display = "flex";
    });
  }

  fillForm();
  renderAchievements();
  renderInterviewScores();
  renderAssessmentTracker();
  document.getElementById("profile-assessments-refresh")?.addEventListener("click", renderAssessmentTracker);
  hydrateServerProfile();
});
