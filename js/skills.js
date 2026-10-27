/* js/skills.js — skills.html */

document.addEventListener("DOMContentLoaded", () => {
  const existingEl = document.getElementById("existing-skills");
  const roadmapEl = document.getElementById("roadmap-list");
  if (!existingEl || !roadmapEl) return;
  const user = Store.getCurrentUser();
  if (!user) return;

  const targetSelect = document.getElementById("skills-target-role");
  const customRoleInput = document.getElementById("skills-custom-role");
  const searchInput = document.getElementById("skills-search");
  const filterSelect = document.getElementById("skills-filter");
  const summaryEl = document.getElementById("skills-target-summary");
  const opportunitiesEl = document.getElementById("skills-opportunities");
  const profile = Store.getProfile(user.email);
  const all = Store.getAllInternships();
  const progress = Store.getSkillProgress(user.email);
  const targetKey = `im_skill_target_${user.email}`;
  const customRoleKey = `im_skill_target_custom_${user.email}`;
  const targetSaved = Store.readBlob(targetKey, "all");
  const have = new Set(profile.skills.map((skill) => skill.toLowerCase()));
  const roleOptions = [...new Map(all.map((internship) => [internship.title, internship.title])).values()].sort();

  roleOptions.forEach((title) => {
    const option = document.createElement("option");
    option.value = title;
    option.textContent = title;
    targetSelect.appendChild(option);
  });
  const otherOption = document.createElement("option");
  otherOption.value = "other";
  otherOption.textContent = "Other (enter a role)";
  targetSelect.appendChild(otherOption);
  customRoleInput.value = Store.readBlob(customRoleKey, "");
  if (targetSaved === "all" || targetSaved === "other" || roleOptions.includes(targetSaved)) targetSelect.value = targetSaved;
  customRoleInput.hidden = targetSelect.value !== "other";

  function buildRoadmap() {
    const selectedRole = targetSelect.value;
    const internships = selectedRole === "all" || selectedRole === "other" ? all : all.filter((internship) => internship.title === selectedRole);
    const frequency = new Map();
    internships.forEach((internship) => (internship.skills || []).forEach((skill) => {
      if (!have.has(skill.toLowerCase())) frequency.set(skill, (frequency.get(skill) || 0) + 1);
    }));
    return [...frequency.entries()]
      .map(([skill, count]) => ({ skill, count, learned: !!progress[skill] }))
      .sort((a, b) => Number(a.learned) - Number(b.learned) || b.count - a.count || a.skill.localeCompare(b.skill));
  }

  function renderProfileSkills() {
    existingEl.innerHTML = profile.skills.length
      ? `<div class="int-card__meta">${profile.skills.map((skill) => `<span class="pill pill--matched">${App.escapeHtml(skill)}</span>`).join("")}</div>`
      : `<p class="empty-state">You haven't added any skills yet. <a href="profile.html">Add skills to your profile</a> to see role-specific gaps.</p>`;
  }

  function renderOpportunities() {
    const ranked = all.map((internship) => {
      const skills = internship.skills || [];
      const matched = skills.filter((skill) => have.has(skill.toLowerCase())).length;
      return { internship, matched, total: skills.length, percent: skills.length ? Math.round(matched / skills.length * 100) : 0 };
    }).sort((a, b) => b.percent - a.percent || b.matched - a.matched).slice(0, 3);
    opportunitiesEl.innerHTML = ranked.map(({ internship, matched, total, percent }) => `
      <article class="skills-role-card">
        <strong>${App.escapeHtml(internship.title)}</strong>
        <p class="hint">${App.escapeHtml(internship.org)} · ${App.escapeHtml(internship.location)}</p>
        <p class="skills-match"><span>${percent}% skill match</span><span class="skills-match-track" role="progressbar" aria-label="${percent}% skill match" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></span></p>
        <p class="hint">${matched} of ${total} listed skills currently match your profile.</p>
        <a class="btn btn--ghost btn--sm" href="internship-details.html?id=${encodeURIComponent(internship.id)}">View opportunity</a>
      </article>
    `).join("") || `<p class="skills-empty">No opportunities are available in the catalogue right now.</p>`;
  }

  function updateOverview(roadmap) {
    const learned = roadmap.filter((item) => item.learned).length;
    const remaining = roadmap.length - learned;
    const percent = roadmap.length ? Math.round(learned / roadmap.length * 100) : 0;
    document.getElementById("skills-learned-count").textContent = String(learned);
    document.getElementById("skills-remaining-count").textContent = String(remaining);
    document.getElementById("skills-progress-percent").textContent = `${percent}%`;
    document.getElementById("skills-progress-fill").style.width = `${percent}%`;
    document.getElementById("skills-progress-ring-label").textContent = `${percent}%`;
    const progressRing = document.getElementById("skills-progress-ring");
    progressRing.style.setProperty("--roadmap-progress", `${percent}%`);
    progressRing.setAttribute("aria-label", `Roadmap progress ${percent} percent`);
    document.getElementById("skills-progress-track").setAttribute("aria-valuenow", String(percent));
  }

  function render() {
    const roadmap = buildRoadmap();
    const query = searchInput.value.trim().toLowerCase();
    const status = filterSelect.value;
    const visible = roadmap.filter((item) => {
      const matchesSearch = item.skill.toLowerCase().includes(query);
      const matchesStatus = status === "all" || (status === "learned" ? item.learned : !item.learned);
      return matchesSearch && matchesStatus;
    });
    updateOverview(roadmap);
    const roleLabel = targetSelect.value === "all" ? "all catalogue roles" : targetSelect.value === "other" ? (customRoleInput.value.trim() || "your other target role") : targetSelect.value;
    summaryEl.textContent = targetSelect.value === "other"
      ? `${roadmap.length} skill gap${roadmap.length === 1 ? "" : "s"} for ${roleLabel}. Based on skills requested across all available listings because this role is not in the catalogue. ${visible.length} shown.`
      : `${roadmap.length} skill gap${roadmap.length === 1 ? "" : "s"} for ${roleLabel}. ${visible.length} shown.`;
    roadmapEl.innerHTML = visible.length ? visible.map(({ skill, count, learned }) => {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${skill} beginner tutorial free`)}`;
      return `
        <li class="roadmap-item ${learned ? "roadmap-item--done" : ""}">
          <label class="roadmap-item__row">
            <input type="checkbox" data-skill="${App.escapeHtml(skill)}" ${learned ? "checked" : ""} aria-label="Mark ${App.escapeHtml(skill)} as learned" />
            <span><span class="roadmap-item__name">${App.escapeHtml(skill)}</span><span class="hint"> — requested in ${count} listing${count === 1 ? "" : "s"}</span></span>
          </label>
          <p class="hint roadmap-item__resource"><a href="${searchUrl}" target="_blank" rel="noopener noreferrer">Find free ${App.escapeHtml(skill)} learning resources ↗</a></p>
        </li>
      `;
    }).join("") : `<li class="skills-empty">${roadmap.length ? "No skills match these filters." : "No skill gaps found for this view. Your profile already covers the listed requirements."}</li>`;

    roadmapEl.querySelectorAll("[data-skill]").forEach((checkbox) => checkbox.addEventListener("change", () => {
      Store.toggleSkillLearned(user.email, checkbox.dataset.skill);
      Object.assign(progress, Store.getSkillProgress(user.email));
      render();
    }));
  }

  targetSelect.addEventListener("change", () => {
    Store.writeBlob(targetKey, targetSelect.value);
    customRoleInput.hidden = targetSelect.value !== "other";
    render();
  });
  customRoleInput.addEventListener("input", () => {
    Store.writeBlob(customRoleKey, customRoleInput.value);
    render();
  });
  searchInput.addEventListener("input", render);
  filterSelect.addEventListener("change", render);
  renderProfileSkills();
  renderOpportunities();
  render();
});
