/* js/recommendation-page.js — recommendations.html */

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("recommendations-list");
  if (!list) return;
  const user = Store.getCurrentUser();
  if (!user) return;

  const refreshBtn = document.getElementById("refresh-recs-btn");

  function matchTier(score) {
    if (score >= 75) return "high";
    if (score >= 50) return "mid";
    return "low";
  }

  function wireSaveButtons(container, onChange) {
    container.querySelectorAll("[data-save-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nowSaved = Store.toggleSaved(user.email, btn.getAttribute("data-save-id"));
        App.toast(nowSaved ? "Saved to your list." : "Removed from saved.");
        if (onChange) onChange();
      });
    });
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

  function render() {
    const profile = Store.getProfile(user.email);
    const ranked = Recommendation.rankAll(profile, Store.getAllInternships());

    if (!ranked.length) {
      list.innerHTML = `<p class="empty-state">No internships in the catalogue yet.</p>`;
      return;
    }

    list.innerHTML = ranked.map((i) => {
      const saved = Store.isSaved(user.email, i.id);
      return `
        <article class="rec-card">
          <div class="rec-card__top">
            <div>
              <h3 class="int-card__title">${App.escapeHtml(i.title)}</h3>
              <p class="int-card__org">${App.escapeHtml(i.org)} &middot; ${App.escapeHtml(i.location)}</p>
            </div>
            <div class="detail-match-badge detail-match-badge--sm match-badge--${matchTier(i.match.score)}">${i.match.score}%<span>match</span></div>
          </div>
          <div class="int-card__meta">
            <span class="pill">${App.escapeHtml(i.sector)}</span>
            <span class="pill pill--muted">${App.escapeHtml(i.duration)}</span>
          </div>
          <div class="rec-card__bars">
            ${scoreBar("Skills", i.match.breakdown.skills)}
            ${scoreBar("Interests", i.match.breakdown.interest)}
          </div>
          <p class="hint">${App.escapeHtml(i.match.explanation)}</p>
          <div class="int-card__footer">
            <span class="deadline">Apply by ${App.formatDate(i.deadline)}</span>
            <div style="display:flex; gap:8px;">
              <button class="btn btn--ghost btn--sm btn--save" data-save-id="${i.id}" aria-pressed="${saved}">${saved ? "Saved ✓" : "Save"}</button>
              <a class="btn btn--secondary btn--sm" href="internship-details.html?id=${i.id}">View details</a>
            </div>
          </div>
        </article>
      `;
    }).join("");

    wireSaveButtons(list, render);
  }

  refreshBtn.addEventListener("click", () => {
    render();
    App.toast("Recommendations refreshed.");
  });

  render();
});
