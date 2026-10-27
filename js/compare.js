/* js/compare.js — compare.html */

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("compare-search");
  const resultsList = document.getElementById("compare-search-results");
  if (!searchInput || !resultsList) return;

  const user = Store.getCurrentUser();
  const profile = user ? Store.getProfile(user.email) : null;
  const all = Store.getAllInternships();
  const clearBtn = document.getElementById("compare-clear-btn");
  const countEl = document.getElementById("compare-count");
  const tableContainer = document.getElementById("compare-table-container");

  let picks = [];

  function renderResults() {
    const q = (searchInput.value || "").trim().toLowerCase();
    if (!q) {
      resultsList.innerHTML = "";
      return;
    }
    const matches = all
      .filter((i) => `${i.title} ${i.org} ${i.skills.join(" ")}`.toLowerCase().includes(q))
      .slice(0, 8);
    resultsList.innerHTML = matches.length ? matches.map((i) => {
      const already = picks.some((p) => p.id === i.id);
      const full = picks.length >= 3 && !already;
      return `<button type="button" data-pick="${i.id}" ${already || full ? "disabled" : ""}>
        ${App.escapeHtml(i.title)} — ${App.escapeHtml(i.org)}
        ${already ? " (added)" : full ? " (max 3 reached)" : ""}
      </button>`;
    }).join("") : `<button type="button" disabled>No matches found</button>`;

    resultsList.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const internship = all.find((i) => i.id === btn.getAttribute("data-pick"));
        if (internship && picks.length < 3 && !picks.some((p) => p.id === internship.id)) {
          picks.push(internship);
          searchInput.value = "";
          resultsList.innerHTML = "";
          renderTable();
        }
      });
    });
  }

  function skillOverlap(internship) {
    if (!profile || !profile.skills.length) return null;
    const have = new Set(profile.skills.map((s) => s.toLowerCase()));
    const req = internship.skills || [];
    if (!req.length) return 100;
    const matched = req.filter((s) => have.has(s.toLowerCase())).length;
    return Math.round((matched / req.length) * 100);
  }

  function renderTable() {
    countEl.textContent = picks.length ? `${picks.length} of 3 selected` : "";
    if (!picks.length) {
      tableContainer.innerHTML = `<p class="compare-empty">Add at least one internship above to start comparing.</p>`;
      return;
    }

    const rows = [
      ["Organization", (i) => App.escapeHtml(i.org)],
      ["Sector", (i) => App.escapeHtml(i.sector)],
      ["Location", (i) => `${App.escapeHtml(i.location)} (${App.escapeHtml(i.locationType)})`],
      ["Duration", (i) => App.escapeHtml(i.duration)],
      ["Deadline", (i) => App.formatDate(i.deadline)],
      ["Stipend", (i) => App.escapeHtml(i.stipend || "Not specified")],
      ["Required skills", (i) => (i.skills || []).map((s) => App.escapeHtml(s)).join(", ")],
      ["Skill match", (i) => {
        const pct = skillOverlap(i);
        return pct === null ? `<span class="hint">Log in to see this</span>` : `<strong>${pct}%</strong> of required skills`;
      }]
    ];

    tableContainer.innerHTML = `
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th class="compare-row-label"></th>
              ${picks.map((i) => `
                <td class="compare-col-head">
                  ${App.escapeHtml(i.title)}
                  <br><button type="button" class="compare-remove" data-remove="${i.id}">Remove</button>
                </td>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(([label, fn]) => `
              <tr>
                <th class="compare-row-label">${label}</th>
                ${picks.map((i) => `<td>${fn(i)}</td>`).join("")}
              </tr>
            `).join("")}
            <tr>
              <th class="compare-row-label"></th>
              ${picks.map((i) => `<td><a class="btn btn--secondary btn--sm" href="internship-details.html?id=${i.id}">View details</a></td>`).join("")}
            </tr>
          </tbody>
        </table>
      </div>
    `;

    tableContainer.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        picks = picks.filter((p) => p.id !== btn.getAttribute("data-remove"));
        renderTable();
      });
    });
  }

  clearBtn.addEventListener("click", () => {
    picks = [];
    renderTable();
  });

  searchInput.addEventListener("input", renderResults);
  renderTable();
});
