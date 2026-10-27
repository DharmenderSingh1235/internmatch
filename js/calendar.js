/* js/calendar.js — calendar.html
   Storage: im_calendar_<email> -> { [internshipId]: { status } }
   status is one of "Planned" | "Applied" | "Completed". */

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("cal-grid");
  if (!grid) return;
  const user = Store.getCurrentUser();
  if (!user) return;

  const key = `im_calendar_${user.email}`;
  const dowRow = document.getElementById("cal-dow-row");
  const monthLabel = document.getElementById("cal-month-label");
  const prevBtn = document.getElementById("cal-prev");
  const nextBtn = document.getElementById("cal-next");
  const todayBtn = document.getElementById("cal-today");
  const filterSelect = document.getElementById("cal-filter");
  const reminderForm = document.getElementById("cal-reminder-form");
  const reminderList = document.getElementById("cal-reminder-list");
  const selectedLabel = document.getElementById("cal-selected-label");
  const searchInput = document.getElementById("cal-search");
  const searchResults = document.getElementById("cal-search-results");
  const upcomingEl = document.getElementById("cal-upcoming");
  const trackedEl = document.getElementById("cal-tracked-list");

  const all = Store.getAllInternships();
  const byId = {};
  all.forEach((i) => (byId[i.id] = i));

  let tracked = Adapter.readBlob(key, null);
  if (!tracked) {
    tracked = {};
    Store.getSavedIds(user.email).forEach((id) => (tracked[id] = { status: "Planned" }));
    Store.getApplications(user.email).forEach((a) => {
      tracked[a.internshipId] = { status: a.status === "Withdrawn" ? "Planned" : "Applied" };
    });
    Adapter.writeBlob(key, tracked);
  }
  // Applications can be created from the internship pages. Keep the calendar
  // status in sync when the student returns here, even if they never used Track.
  Store.getApplications(user.email).forEach((application) => {
    if (!byId[application.internshipId]) return;
    if (application.status !== "Withdrawn") {
      tracked[application.internshipId] = { status: "Applied" };
    } else if (tracked[application.internshipId]?.status === "Applied") {
      tracked[application.internshipId] = { status: "Planned" };
    }
  });
  Adapter.writeBlob(key, tracked);
  const reminderKey = `im_calendar_reminders_${user.email}`;
  let reminders = Adapter.readBlob(reminderKey, []);
  if (!Array.isArray(reminders)) reminders = [];

  function persist() {
    Adapter.writeBlob(key, tracked);
  }

  let viewDate = new Date();
  viewDate.setDate(1);
  let selectedDate = "";

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function daysFromToday(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dowRow.innerHTML = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");

  function deadlinesInMonth(year, month) {
    return all
      .map((internship) => ({ id: internship.id, internship, status: tracked[internship.id]?.status || "Available" }))
      .filter((t) => {
        const d = new Date(t.internship.deadline);
        return d.getFullYear() === year && d.getMonth() === month;
      });
  }

  function renderGrid() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    monthLabel.textContent = viewDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const entries = deadlinesInMonth(year, month);

    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell cal-cell--empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const dateKey = localDateKey(new Date(year, month, day));
      const dayEntries = entries.filter((e) => localDateKey(new Date(e.internship.deadline)) === dateKey);
      const dayReminders = reminders.filter((item) => item.date === dateKey);
      cells += `
        <button type="button" class="cal-cell ${isToday ? "cal-cell--today" : ""} ${selectedDate === dateKey ? "cal-cell--selected" : ""}" data-date="${dateKey}" aria-label="${dateKey}: ${dayEntries.length} deadline(s), ${dayReminders.length} reminder(s)">
          <div class="cal-cell__num">${day}</div>
          <div class="cal-dot-row">
            ${dayEntries.slice(0, 4).map((e) => `<span class="cal-dot status-${e.status}" title="${App.escapeHtml(e.internship.title)} — ${e.status === "Available" ? "deadline" : e.status}"></span>`).join("")}
            ${dayReminders.slice(0, 3).map((item) => `<span class="cal-dot cal-dot--reminder" title="${App.escapeHtml(item.title)}"></span>`).join("")}
          </div>
        </button>
      `;
    }
    grid.innerHTML = cells;
    grid.querySelectorAll("[data-date]").forEach((cell) => {
      cell.addEventListener("click", () => {
        selectedDate = selectedDate === cell.dataset.date ? "" : cell.dataset.date;
        renderAll();
      });
    });
  }

  function renderUpcoming() {
    let items = all
      .map((internship) => ({ id: internship.id, internship, status: tracked[internship.id]?.status || "Not tracked" }))
      .map((t) => Object.assign(t, { date: localDateKey(new Date(t.internship.deadline)), days: App.daysUntil(t.internship.deadline), kind: "internship" }))
      .filter((t) => t.days !== null)
      .concat(reminders.map((item) => Object.assign({}, item, { days: daysFromToday(item.date), kind: "reminder" })))
      .sort((a, b) => a.days - b.days);

    if (selectedDate) {
      items = items.filter((item) => item.date === selectedDate);
      selectedLabel.textContent = `Showing items for ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Select the date again to clear.`;
    } else {
      items = items.filter((item) => item.days >= 0 && !(item.kind === "internship" && item.status === "Completed"));
      items = items.slice(0, 8);
      selectedLabel.textContent = "Your next deadlines and reminders, sorted by date.";
    }

    upcomingEl.innerHTML = items.length ? items.map((t) => `
      <div class="cal-item-row">
        <div>
          <strong>${App.escapeHtml(t.kind === "reminder" ? t.title : t.internship.title)}</strong>
          <p class="hint" style="margin:2px 0 0;">${t.kind === "reminder" ? "Personal reminder" : App.escapeHtml(t.internship.org)} &middot; ${t.days === 0 ? "Due today" : t.days < 0 ? `${Math.abs(t.days)} day${t.days === -1 ? "" : "s"} ago` : `${t.days} day${t.days === 1 ? "" : "s"} left`}</p>
        </div>
        <div class="cal-deadline-actions"><span class="cal-item-status ${t.kind === "internship" && t.status === "Applied" ? "cal-item-status--applied" : t.days <= 3 ? "cal-item-status--urgent" : ""}">${t.kind === "reminder" ? "Reminder" : t.status}</span>${t.kind === "internship" && t.status === "Not tracked" ? `<button type="button" class="btn btn--ghost btn--sm" data-track-deadline="${t.id}">Track</button>` : ""}</div>
      </div>
    `).join("") : `<p class="hint">${selectedDate ? "Nothing scheduled for this date." : "No upcoming deadlines in the catalogue."}</p>`;
    upcomingEl.querySelectorAll("[data-track-deadline]").forEach((button) => button.addEventListener("click", () => {
      tracked[button.dataset.trackDeadline] = { status: "Planned" };
      persist();
      renderAll();
    }));
  }

  function renderTracked() {
    const items = Object.keys(tracked)
      .map((id) => ({ id, internship: byId[id], status: tracked[id].status }))
      .filter((t) => t.internship && (filterSelect.value === "All" || t.status === filterSelect.value))
      .sort((a, b) => new Date(a.internship.deadline) - new Date(b.internship.deadline));

    trackedEl.innerHTML = items.length ? items.map((t) => `
      <div class="cal-item-row" data-tracked-row="${t.id}">
        <div>
          <strong>${App.escapeHtml(t.internship.title)}</strong>
          <p class="hint" style="margin:2px 0 0;">${App.escapeHtml(t.internship.org)} &middot; Deadline ${App.formatDate(t.internship.deadline)}</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <select data-status-for="${t.id}">
            <option ${t.status === "Planned" ? "selected" : ""}>Planned</option>
            <option ${t.status === "Applied" ? "selected" : ""}>Applied</option>
            <option ${t.status === "Completed" ? "selected" : ""}>Completed</option>
          </select>
          <button class="compare-remove" data-untrack="${t.id}">Remove</button>
        </div>
      </div>
    `).join("") : `<p class="hint">No internships tracked yet.</p>`;

    trackedEl.querySelectorAll("[data-status-for]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const internshipId = sel.getAttribute("data-status-for");
        if (sel.value === "Applied" && !Store.hasApplied(user.email, internshipId)) {
          const result = Store.applyToInternship(user.email, internshipId);
          if (!result.ok) {
            App.toast(result.error || "Could not record this application.", "error");
            renderAll();
            return;
          }
        }
        tracked[internshipId].status = sel.value;
        persist();
        renderAll();
      });
    });
    trackedEl.querySelectorAll("[data-untrack]").forEach((btn) => {
      btn.addEventListener("click", () => {
        delete tracked[btn.getAttribute("data-untrack")];
        persist();
        renderAll();
      });
    });
  }

  function renderAll() {
    renderGrid();
    renderUpcoming();
    renderTracked();
    renderReminders();
    renderStats();
  }

  function renderStats() {
    const nextWeek = all.filter((internship) => {
      const days = App.daysUntil(internship.deadline);
      return days !== null && days >= 0 && days <= 7 && tracked[internship.id]?.status !== "Completed";
    }).length;
    document.getElementById("cal-stat-tracked").textContent = String(Object.keys(tracked).filter((id) => byId[id]).length);
    document.getElementById("cal-stat-week").textContent = String(nextWeek);
    document.getElementById("cal-stat-applied").textContent = String(Store.getApplications(user.email).filter((application) => application.status !== "Withdrawn").length);
  }

  function renderReminders() {
    const sorted = reminders.slice().sort((a, b) => a.date.localeCompare(b.date));
    reminderList.innerHTML = sorted.length ? sorted.map((item) => `
      <div class="cal-item-row">
        <div><strong>${App.escapeHtml(item.title)}</strong><p class="hint" style="margin:2px 0 0;">${App.escapeHtml(new Date(`${item.date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}${item.note ? ` · ${App.escapeHtml(item.note)}` : ""}</p></div>
        <button type="button" class="btn btn--ghost btn--sm" data-delete-reminder="${App.escapeHtml(item.id)}" aria-label="Delete reminder: ${App.escapeHtml(item.title)}">Delete</button>
      </div>
    `).join("") : `<p class="hint">No personal reminders yet.</p>`;
    reminderList.querySelectorAll("[data-delete-reminder]").forEach((button) => button.addEventListener("click", () => {
      reminders = reminders.filter((item) => item.id !== button.dataset.deleteReminder);
      Adapter.writeBlob(reminderKey, reminders);
      renderAll();
    }));
  }

  prevBtn.addEventListener("click", () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderGrid();
  });
  nextBtn.addEventListener("click", () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderGrid();
  });

  todayBtn.addEventListener("click", () => {
    const today = new Date();
    viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDate = localDateKey(today);
    renderAll();
  });

  filterSelect.addEventListener("change", renderTracked);

  reminderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.getElementById("cal-reminder-title").value.trim();
    const date = document.getElementById("cal-reminder-date").value;
    const note = document.getElementById("cal-reminder-note").value.trim();
    if (!title || !date) return;
    reminders.push({ id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, date, note });
    Adapter.writeBlob(reminderKey, reminders);
    reminderForm.reset();
    selectedDate = date;
    const [year, month] = date.split("-").map(Number);
    viewDate = new Date(year, month - 1, 1);
    renderAll();
  });

  document.getElementById("cal-export").addEventListener("click", () => {
    const events = Object.keys(tracked).map((id) => {
      const internship = byId[id];
      if (!internship) return null;
      return { date: localDateKey(new Date(internship.deadline)).replace(/-/g, ""), title: `${internship.title} — ${internship.org}` };
    }).filter(Boolean).concat(reminders.map((item) => ({ date: item.date.replace(/-/g, ""), title: item.title })));
    if (!events.length) { App.toast("Add a deadline or reminder before exporting.", "error"); return; }
    const escapeIcs = (value) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InternMatch//Deadline Calendar//EN", ...events.map((item, index) => `BEGIN:VEVENT\r\nUID:${Date.now()}-${index}@internmatch\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${item.date}\r\nSUMMARY:${escapeIcs(item.title)}\r\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "internmatch-deadlines.ics"; link.click();
    URL.revokeObjectURL(url);
  });

  function renderSearchResults() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      const suggestions = all
        .filter((internship) => !tracked[internship.id] && daysFromToday(localDateKey(new Date(internship.deadline))) >= 0)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 3);
      searchResults.innerHTML = suggestions.length ? `
        <p class="cal-suggestions-label">Upcoming opportunities</p>
        ${suggestions.map((internship) => `
          <div class="cal-item-row">
          <span class="cal-suggestion-copy"><strong>${App.escapeHtml(internship.title)}</strong><small>${App.escapeHtml(internship.org)} · Due ${App.formatDate(internship.deadline)}</small></span>
            <button class="btn btn--ghost btn--sm" data-add="${internship.id}">Track</button>
          </div>
        `).join("")}
      ` : `<p class="cal-suggestions-empty">All upcoming internships are already tracked. Search to find another opportunity.</p>`;
      bindTrackButtons();
      return;
    }
    const matches = all.filter((i) => `${i.title} ${i.org}`.toLowerCase().includes(q)).slice(0, 6);
    searchResults.innerHTML = matches.length ? matches.map((i) => `
      <div class="cal-item-row">
        <span>${App.escapeHtml(i.title)} — ${App.escapeHtml(i.org)}</span>
        <button class="btn btn--ghost btn--sm" data-add="${i.id}" ${tracked[i.id] ? "disabled" : ""}>${tracked[i.id] ? "Tracked" : "Track"}</button>
      </div>
    `).join("") : `<p class="hint">No matches.</p>`;

    bindTrackButtons();
  }

  function bindTrackButtons() {
    searchResults.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tracked[btn.getAttribute("data-add")] = { status: "Planned" };
        persist();
        renderSearchResults();
        renderAll();
      });
    });
  }

  searchInput.addEventListener("input", renderSearchResults);
  renderSearchResults();

  document.getElementById("cal-reminder-date").min = localDateKey(new Date());

  renderAll();
});
