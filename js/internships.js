/* js/internships.js
   Powers internships.html (catalogue browse/filter/sort) and
   internship-details.html. Also exposes Internships.renderCard(), a shared
   card template used here and by dashboard.js / saved.js. */

const Internships = (function () {
  function renderCard(internship, opts) {
    opts = opts || {};
    const user = Store.getCurrentUser();
    const saved = user && Store.isSaved(user.email, internship.id);
    const matchBadge = opts.match
      ? `<span class="match-badge match-badge--${matchTier(opts.match.score)}">${opts.match.score}% match</span>`
      : "";
    const saveBtn = user
      ? `<button class="btn btn--ghost btn--sm btn--save" data-save-id="${internship.id}" aria-pressed="${saved}">${saved ? "Saved ✓" : "Save"}</button>`
      : "";
    return `
      <article class="int-card">
        <div class="int-card__top">
          <div>
            <h3 class="int-card__title">${App.escapeHtml(internship.title)}</h3>
            <p class="int-card__org">${App.escapeHtml(internship.org)} &middot; ${App.escapeHtml(internship.location)}</p>
          </div>
          ${matchBadge}
        </div>
        <div class="int-card__meta">
          <span class="pill">${App.escapeHtml(internship.sector)}</span>
          <span class="pill pill--muted">${App.escapeHtml(internship.duration)}</span>
          <span class="pill pill--muted">${App.escapeHtml(internship.locationType)}</span>
        </div>
        <p class="int-card__desc">${App.escapeHtml(internship.description)}</p>
        <div class="int-card__footer">
          <span class="deadline">Apply by ${App.formatDate(internship.deadline)}</span>
          <div style="display:flex; gap:8px;">
            ${saveBtn}
            <a class="btn btn--secondary btn--sm" href="internship-details.html?id=${internship.id}">View details</a>
          </div>
        </div>
      </article>
    `;
  }

  function matchTier(score) {
    if (score >= 75) return "high";
    if (score >= 50) return "mid";
    return "low";
  }

  function wireSaveButtons(container, onChange) {
    container.querySelectorAll("[data-save-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const user = Store.getCurrentUser();
        if (!user) {
          window.location.href = "login.html";
          return;
        }
        const nowSaved = Store.toggleSaved(user.email, btn.getAttribute("data-save-id"));
        btn.textContent = nowSaved ? "Saved ✓" : "Save";
        btn.setAttribute("aria-pressed", nowSaved);
        App.toast(nowSaved ? "Saved to your list." : "Removed from saved.");
        if (onChange) onChange();
      });
    });
  }

  async function initBrowsePage() {
    const grid = document.getElementById("internship-grid");
    if (!grid) return;

    const searchInput = document.getElementById("search-input");
    const sectorFilter = document.getElementById("filter-sector");
    const locationFilter = document.getElementById("filter-location");
    const durationFilter = document.getElementById("filter-duration");
    const skillFilter = document.getElementById("filter-skill");
    const sortSelect = document.getElementById("sort-select");
    const clearBtn = document.getElementById("clear-filters");
    const resultsCount = document.getElementById("results-count");

    let all = Store.getAllInternships();
    try {
      const response = await fetch("http://127.0.0.1:3002/api/internships");
      if (response.ok) {
        const payload = await response.json();
        const combined = [...all, ...(payload.items || [])];
        all = combined.filter((item, index) => combined.findIndex((candidate) => candidate.id === item.id) === index);
      }
    } catch (_) { /* The local catalogue remains available without the server. */ }
    const user = Store.getCurrentUser();
    const profile = user ? Store.getProfile(user.email) : null;
    const ranked = profile ? Recommendation.rankAll(profile, all) : all.map((i) => Object.assign({}, i, { match: null }));
    const byId = {};
    ranked.forEach((i) => (byId[i.id] = i));

    function populateSelect(select, values, placeholder) {
      const current = select.value;
      select.innerHTML = `<option value="">${placeholder}</option>` +
        values.map((v) => `<option value="${App.escapeHtml(v)}">${App.escapeHtml(v)}</option>`).join("");
      select.value = current;
    }

    grid.innerHTML = App.skeletonCards(6);

    populateSelect(sectorFilter, [...new Set(all.map((i) => i.sector))].sort(), "All sectors");
    populateSelect(locationFilter, [...new Set(all.map((i) => i.location))].sort(), "All locations");
    populateSelect(skillFilter, [...new Set(all.flatMap((i) => i.skills))].sort(), "Any skill");

    function render() {
      const q = (searchInput.value || "").trim().toLowerCase();
      const sector = sectorFilter.value;
      const location = locationFilter.value;
      const duration = durationFilter.value;
      const skill = skillFilter.value;
      const sort = sortSelect.value;

      let list = ranked.filter((i) => {
        if (q && !(`${i.title} ${i.org} ${i.skills.join(" ")}`.toLowerCase().includes(q))) return false;
        if (sector && i.sector !== sector) return false;
        if (location && i.location !== location) return false;
        if (duration && String(i.durationMonths) !== duration) return false;
        if (skill && !i.skills.includes(skill)) return false;
        return true;
      });

      if (sort === "deadline") {
        list = list.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
      } else {
        list = list.slice().sort((a, b) => (b.match ? b.match.score : 0) - (a.match ? a.match.score : 0));
      }

      resultsCount.textContent = `${list.length} internship${list.length === 1 ? "" : "s"} found`;
      grid.innerHTML = list.map((i) => renderCard(i, { match: i.match })).join("") ||
        `<p class="empty-state">No internships match those filters yet. Try clearing a filter.</p>`;
      wireSaveButtons(grid);
    }

    [searchInput, sectorFilter, locationFilter, durationFilter, skillFilter, sortSelect].forEach((el) => {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    const qParam = App.qs("q");
    if (qParam) searchInput.value = qParam;

    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      sectorFilter.value = "";
      locationFilter.value = "";
      durationFilter.value = "";
      skillFilter.value = "";
      sortSelect.value = "match";
      render();
    });

    setTimeout(render, 220);
  }

  function scoreBar(label, value) {
    return `
      <div class="score-bar-row">
        <span class="score-bar-row__label">${App.escapeHtml(label)}</span>
        <div class="score-bar-track"><div class="score-bar-fill" style="width:${value}%"></div></div>
        <span class="score-bar-row__value">${value}%</span>
      </div>
    `;
  }

  async function initDetailPage() {
    const root = document.getElementById("internship-detail");
    if (!root) return;
    const id = App.qs("id");
    let internship = Store.getInternshipById(id);
    if (!internship) {
      try {
        const response = await fetch("http://127.0.0.1:3002/api/internships");
        if (response.ok) internship = ((await response.json()).items || []).find((item) => item.id === id);
      } catch (_) { /* Keep the local not-found state if the API is unavailable. */ }
    }
    if (!internship) {
      root.innerHTML = `<p class="empty-state">That internship couldn't be found — it may have been removed from the demo catalogue.</p>`;
      return;
    }
    const user = Store.getCurrentUser();
    const profile = user ? Store.getProfile(user.email) : null;
    const match = profile ? Recommendation.score(profile, internship) : null;
    const saved = user && Store.isSaved(user.email, internship.id);
    const applied = user && Store.hasApplied(user.email, internship.id);

    root.innerHTML = `
      <div class="detail-head">
        <div>
          <h1>${App.escapeHtml(internship.title)}</h1>
          <p class="detail-org">${App.escapeHtml(internship.org)} &middot; ${App.escapeHtml(internship.location)} &middot; ${App.escapeHtml(internship.locationType)}</p>
          <div class="int-card__meta" style="margin-top:10px;">
            <span class="pill">${App.escapeHtml(internship.sector)}</span>
            <span class="pill pill--muted">${App.escapeHtml(internship.duration)}</span>
            ${internship.stipend ? `<span class="pill pill--muted">${App.escapeHtml(internship.stipend)}</span>` : ""}
          </div>
        </div>
        ${match ? `<div class="detail-match-badge match-badge--${matchTier(match.score)}">${match.score}%<span>match</span></div>` : ""}
      </div>

      <div class="detail-actions">
        ${user ? `<button class="btn btn--primary" id="detail-apply-btn" ${applied ? "disabled" : ""}>${applied ? "Already applied ✓" : "Apply now"}</button>` : `<a class="btn btn--primary" href="login.html">Log in to apply</a>`}
        ${user ? `<button class="btn btn--ghost" id="detail-save-btn" data-save-id="${internship.id}" aria-pressed="${saved}">${saved ? "Saved ✓" : "Save internship"}</button>` : ""}
        <button class="btn btn--ghost" id="detail-cover-letter-btn">✨ AI Cover Letter</button>
      </div>

      <div class="detail-grid">
        <div>
          <div class="panel">
            <h2 class="mt-0">Description</h2>
            <p>${App.escapeHtml(internship.description)}</p>
            <h3>Eligibility</h3>
            <p>${App.escapeHtml(internship.eligibility)}</p>
            <h3>Required skills</h3>
            <div class="int-card__meta">
              ${internship.skills.map((s) => `<span class="pill ${match && match.matchedSkills.includes(s) ? "pill--matched" : ""}">${App.escapeHtml(s)}</span>`).join("")}
            </div>
            <p class="deadline" style="margin-top:16px;">Application deadline: ${App.formatDate(internship.deadline)}</p>
          </div>
        </div>
        <div>
          ${match ? `
          <div class="panel">
            <h2 class="mt-0">Why this match score?</h2>
            ${scoreBar("Skills (40%)", match.breakdown.skills)}
            ${scoreBar("Interests (25%)", match.breakdown.interest)}
            ${scoreBar("Eligibility (15%)", match.breakdown.eligibility)}
            ${scoreBar("Sector preference (10%)", match.breakdown.sector)}
            ${scoreBar("Location & duration (10%)", match.breakdown.logistics)}
            <p class="hint" style="margin-top:14px;">${App.escapeHtml(match.explanation)}</p>
            <p class="hint">This score reflects fit with the criteria above only — it is not a guarantee of eligibility or selection.</p>
          </div>` : `
          <div class="panel">
            <h2 class="mt-0">Want a match score?</h2>
            <p>Log in and build your profile to see a personalized, explainable match score for this internship.</p>
            <a class="btn btn--primary btn--block" href="login.html">Log in</a>
          </div>`}
        </div>
      </div>
    `;

    document.title = `${internship.title} — InternMatch`;
    if (user) Store.addRecentlyViewed(user.email, internship.id);

    const saveBtn = document.getElementById("detail-save-btn");
    if (saveBtn) {
      wireSaveButtons(root, () => {
        saveBtn.textContent = saveBtn.getAttribute("aria-pressed") === "true" ? "Saved ✓" : "Save internship";
      });
    }
    const applyBtn = document.getElementById("detail-apply-btn");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        const result = Store.applyToInternship(user.email, internship.id);
        if (!result.ok) {
          App.toast(result.error, "error");
          return;
        }
        applyBtn.textContent = "Already applied ✓";
        applyBtn.disabled = true;
        App.toast("Application submitted.");
      });
    }

    const clBtn = document.getElementById("detail-cover-letter-btn");
    if (clBtn) {
      clBtn.addEventListener("click", () => {
        let modal = document.getElementById("cover-letter-modal");
        if (!modal) {
          modal = document.createElement("div");
          modal.id = "cover-letter-modal";
          modal.className = "modal-backdrop";
          modal.setAttribute("role", "dialog");
          modal.innerHTML = `
            <div class="modal-window">
              <div class="modal-header">
                <div>
                  <span class="pill pill--primary" style="font-size:0.75rem;">AI Application Assistant</span>
                  <h2 style="margin:4px 0 0;font-size:1.3rem;">Tailored Cover Letter</h2>
                </div>
                <button type="button" class="btn btn--ghost btn--sm" id="cl-close-btn" aria-label="Close modal">✕</button>
              </div>
              <div class="modal-body">
                <p class="hint" style="margin-top:0;">Generated for <strong>${App.escapeHtml(internship.title)}</strong> at <strong>${App.escapeHtml(internship.org)}</strong>.</p>
                <div id="cl-loading" style="display:none;padding:24px 0;text-align:center;">
                  <div class="cl-spinner"></div>
                  <p class="hint" style="margin-top:10px;">Generating tailored cover letter with AI...</p>
                </div>
                <textarea id="cl-text" rows="12" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:0.92rem;line-height:1.5;padding:12px;border:1px solid var(--color-border);border-radius:10px;resize:vertical;background:var(--color-bg-alt);color:var(--color-text);"></textarea>
              </div>
              <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="display:flex;gap:8px;">
                  <button type="button" class="btn btn--primary btn--sm" id="cl-copy-btn">📋 Copy</button>
                  <button type="button" class="btn btn--ghost btn--sm" id="cl-download-btn">⬇ Download .txt</button>
                </div>
                <button type="button" class="btn btn--ghost btn--sm" id="cl-regenerate-btn">🔄 Regenerate</button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);

          const closeBtn = modal.querySelector("#cl-close-btn");
          closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
          modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

          const copyBtn = modal.querySelector("#cl-copy-btn");
          copyBtn.addEventListener("click", () => {
            const text = modal.querySelector("#cl-text").value;
            navigator.clipboard.writeText(text).then(() => App.toast("Cover letter copied to clipboard!"))
              .catch(() => App.toast("Unable to copy to clipboard", "error"));
          });

          const downloadBtn = modal.querySelector("#cl-download-btn");
          downloadBtn.addEventListener("click", () => {
            const text = modal.querySelector("#cl-text").value;
            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Cover_Letter_${internship.title.replace(/\s+/g, "_")}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            App.toast("Downloaded cover letter.");
          });

          const regenBtn = modal.querySelector("#cl-regenerate-btn");
          regenBtn.addEventListener("click", () => generateLetter());
        }

        async function generateLetter() {
          const loading = modal.querySelector("#cl-loading");
          const textarea = modal.querySelector("#cl-text");
          loading.style.display = "block";
          textarea.style.display = "none";

          const studentData = profile || (user ? { fullName: user.name, email: user.email } : { fullName: "Applicant", degree: "Undergraduate", course: "Computer Science", skills: ["JavaScript", "Python", "Problem Solving"] });

          try {
            const res = await fetch("http://127.0.0.1:3002/api/generate-cover-letter", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ student: studentData, internship })
            });
            const data = await res.json().catch(() => ({}));
            if (data.coverLetter) {
              textarea.value = data.coverLetter;
            } else {
              throw new Error("API unavailable");
            }
          } catch (err) {
            const candidateName = studentData.fullName || studentData.name || "Applicant";
            const skillsStr = (studentData.skills && studentData.skills.length) ? studentData.skills.slice(0, 4).join(", ") : "technical skills and team collaboration";
            textarea.value = `Dear Hiring Team at ${internship.org},\n\nI am writing to express my enthusiastic interest in the ${internship.title} position. As a motivated student with focused skills in ${skillsStr}, I am eager to apply my academic foundation to impactful projects at ${internship.org}.\n\nHaving reviewed the requirements for this role, I am confident that my background in ${(internship.skills || []).slice(0, 3).join(", ") || "this field"} and dedication to continuous learning make me a strong fit for your team. I thrive in collaborative environments and am passionate about contributing measurable value from day one.\n\nThank you for considering my application. I would welcome the opportunity to discuss my qualifications in an interview.\n\nSincerely,\n${candidateName}\n${studentData.email || ""}`;
          } finally {
            loading.style.display = "none";
            textarea.style.display = "block";
          }
        }

        modal.style.display = "flex";
        if (!modal.querySelector("#cl-text").value) {
          generateLetter();
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initBrowsePage();
    initDetailPage();
  });

  return { renderCard, matchTier, wireSaveButtons };
})();
