/* Student help desk: private requests and admin replies. */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("student-support-form");
  const list = document.getElementById("student-support-list");
  const status = document.getElementById("student-support-status");
  const refresh = document.getElementById("student-support-refresh");
  const messageInput = document.getElementById("support-message");
  const messageCount = document.getElementById("support-message-count");
  const token = sessionStorage.getItem("im_student_api_token");

  messageInput.addEventListener("input", () => {
    messageCount.textContent = `${messageInput.value.length.toLocaleString()} / 2,000`;
  });

  async function request(method, payload) {
    const response = await fetch(`${window.IM_API_BASE}/api/student/support-messages`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token || ""}` },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not reach the admin support inbox.");
    return data;
  }

  function render(items) {
    list.innerHTML = items.length ? items.map((item) => `
      <article class="student-support-item">
        <div class="student-support-item__head"><strong>${App.escapeHtml(item.subject)}</strong><span class="pill pill--muted support-status--${item.status === "Resolved" ? "resolved" : item.status === "In progress" ? "progress" : item.status === "Sent" ? "sent" : "open"}">${App.escapeHtml(item.status)}</span></div>
        <div class="student-support-item__meta">${item.senderRole === "admin" ? "Message from InternMatch admin" : App.escapeHtml(item.category)} · ${App.escapeHtml(App.formatDate(item.createdAt))}</div>
        <p class="student-support-item__body">${App.escapeHtml(item.message)}</p>
        ${item.reply ? `<div class="student-support-reply"><strong>Admin reply · ${App.escapeHtml(item.repliedAt ? App.formatDate(item.repliedAt) : "")}</strong><br>${App.escapeHtml(item.reply)}</div>` : item.senderRole === "admin" ? "" : `<div class="student-support-item__meta">Waiting for an admin reply</div>`}
      </article>`).join("") : '<div class="panel support-empty"><strong>No support requests yet</strong><p class="hint">When you send a message, its status and admin reply will appear here.</p></div>';
  }

  async function load() {
    try {
      const data = await request("GET");
      render(data.items || []);
      status.textContent = "Your messages are private to you and the admin.";
    } catch (error) {
      const sessionExpired = token && error.message.includes("Sign in again");
      const guidance = !token ? "Sign in with your student account while the server is running." : sessionExpired ? "Log out and sign in again, then return here." : "Refresh this page and try again.";
      list.innerHTML = `<div class="panel support-empty"><strong>Support inbox unavailable</strong><p class="hint">${App.escapeHtml(error.message)} ${guidance}</p></div>`;
      status.textContent = sessionExpired ? "Your student sign-in expired." : "Student sign-in and the running server are required.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!token) { App.toast("Sign in with your student account while the server is running.", "error"); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = "Sending your message…";
    try {
      await request("POST", Object.fromEntries(new FormData(form).entries()));
      form.reset();
      App.toast("Your message was sent to the admin.");
      await load();
    } catch (error) {
      status.textContent = error.message;
      App.toast(error.message, "error");
    } finally { button.disabled = false; }
  });
  refresh.addEventListener("click", load);
  load();
});
