/* js/admin-analytics.js — admin.html analytics panel + CSV export.
   Aggregates across all demo users via Adapter.getAllUsers() and each
   user's applications. See INTEGRATION-NOTES.md item 5. */

(function () {
  let charts = {};

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function buildDatasets() {
    const internships = Adapter.getAllInternships();
    const internshipsById = {};
    internships.forEach((i) => (internshipsById[i.id] = i));
    const users = Adapter.getAllUsers();

    const sectorCounts = {};
    const skillCounts = {};
    internships.forEach((i) => {
      (i.skills || []).forEach((s) => (skillCounts[s] = (skillCounts[s] || 0) + 1));
    });

    let totalApps = 0;
    const statusCounts = {};
    const sectorAppCounts = {};

    users.forEach((u) => {
      const apps = Adapter.getApplications(u.email);
      totalApps += apps.length;
      apps.forEach((a) => {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
        const internship = internshipsById[a.internshipId];
        if (internship) {
          sectorAppCounts[internship.sector] = (sectorAppCounts[internship.sector] || 0) + 1;
        }
      });
    });
    internships.forEach((i) => {
      sectorCounts[i.sector] = (sectorCounts[i.sector] || 0) + 1;
    });

    return { users, internships, sectorCounts, skillCounts, statusCounts, sectorAppCounts, totalApps };
  }

  function topEntry(obj) {
    const entries = Object.entries(obj);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  function render() {
    if (!document.getElementById("chart-sectors")) return;
    const data = buildDatasets();

    document.getElementById("admin-stat-top-sector").textContent = topEntry(data.sectorAppCounts) || topEntry(data.sectorCounts) || "—";
    document.getElementById("admin-stat-top-skill").textContent = topEntry(data.skillCounts) || "—";
    const avg = data.users.length ? (data.totalApps / data.users.length) : 0;
    document.getElementById("admin-stat-avg-apps").textContent = avg.toFixed(1);

    if (!window.Chart) return;

    Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue("--color-muted").trim() || "#9aa9c5";
    Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim() || "#293b60";

    destroyChart("sectors");
    destroyChart("status");
    destroyChart("skills");

    const sectorLabels = Object.keys(data.sectorAppCounts).length ? Object.keys(data.sectorAppCounts) : Object.keys(data.sectorCounts);
    const sectorValues = sectorLabels.map((s) => data.sectorAppCounts[s] || 0);
    charts.sectors = new Chart(document.getElementById("chart-sectors"), {
      type: "bar",
      data: { labels: sectorLabels, datasets: [{ label: "Applications by sector", data: sectorValues, backgroundColor: "#2a5bd7", borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: "Applications by sector" } } }
    });

    const statusLabels = Object.keys(data.statusCounts);
    charts.status = new Chart(document.getElementById("chart-app-status"), {
      type: "doughnut",
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusLabels.map((s) => data.statusCounts[s]),
          backgroundColor: ["#2a5bd7", "#f0ad4e", "#1a9e6b", "#7c5cff", "#c0392b", "#999"]
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: "Applications by status" } } }
    });

    const topSkills = Object.entries(data.skillCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    charts.skills = new Chart(document.getElementById("chart-top-skills"), {
      type: "bar",
      data: { labels: topSkills.map((s) => s[0]), datasets: [{ label: "Listings requesting this skill", data: topSkills.map((s) => s[1]), backgroundColor: "#1a9e6b", borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, title: { display: true, text: "Most requested skills" } } }
    });
  }

  function toCsv(rows) {
    return rows.map((row) => row.map((cell) => {
      const str = String(cell === undefined || cell === null ? "" : cell);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")).join("\n");
  }

  function downloadCsv(filename, csv) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportStudentsCsv() {
    const users = Adapter.getAllUsers();
    const rows = [["Name", "Email", "College", "Applications"]];
    users.forEach((u) => rows.push([u.name, u.email, u.college || "", Adapter.getApplications(u.email).length]));
    downloadCsv("internmatch-students.csv", toCsv(rows));
  }

  function exportApplicationsCsv() {
    const users = Adapter.getAllUsers();
    const internships = Adapter.getAllInternships();
    const internshipsById = {};
    internships.forEach((i) => (internshipsById[i.id] = i));
    const rows = [["Student email", "Internship", "Organization", "Status", "Applied on"]];
    users.forEach((u) => {
      Adapter.getApplications(u.email).forEach((a) => {
        const i = internshipsById[a.internshipId];
        rows.push([u.email, i ? i.title : a.internshipId, i ? i.org : "", a.status, a.appliedOn]);
      });
    });
    downloadCsv("internmatch-applications.csv", toCsv(rows));
  }

  document.addEventListener("DOMContentLoaded", () => {
    const exportStudents = document.getElementById("export-students-csv");
    const exportApps = document.getElementById("export-applications-csv");
    if (exportStudents) exportStudents.addEventListener("click", exportStudentsCsv);
    if (exportApps) exportApps.addEventListener("click", exportApplicationsCsv);
  });

  window.AdminAnalytics = { render };
})();
