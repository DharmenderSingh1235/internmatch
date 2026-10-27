/* js/saved.js — saved.html */

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("saved-grid");
  if (!grid) return;
  const user = Store.getCurrentUser();
  if (!user) return;

  function render() {
    const profile = Store.getProfile(user.email);
    const savedIds = Store.getSavedIds(user.email);
    const all = Store.getAllInternships();
    const savedInternships = all.filter((i) => savedIds.includes(i.id));
    const ranked = Recommendation.rankAll(profile, savedInternships);

    document.getElementById("saved-count").textContent =
      `${ranked.length} saved internship${ranked.length === 1 ? "" : "s"}`;

    grid.innerHTML = ranked.length
      ? ranked.map((i) => Internships.renderCard(i, { match: i.match })).join("")
      : `<p class="empty-state">You haven't saved any internships yet. <a href="internships.html">Browse the catalogue</a> to start bookmarking.</p>`;

    Internships.wireSaveButtons(grid, render);
  }

  render();
});
