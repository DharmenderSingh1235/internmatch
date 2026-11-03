document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("student-company-assessments");
  if (!list) return;
  const getToken = () => sessionStorage.getItem("im_student_api_token");
  const currentUser = Store.getCurrentUser();
  const run = document.getElementById("student-assessment-run");
  const api = async (route, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response, data;
    try {
      response = await fetch(`${window.IM_API_BASE}/api${route}`, { ...options, signal: controller.signal, headers: { authorization: `Bearer ${getToken() || ""}`, "content-type": "application/json", ...(options.headers || {}) } });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The assessment service did not respond within 10 seconds. Check that the API is running, then refresh.");
      throw new Error("Could not reach the assessment service. Check that the API is running, then refresh.");
    } finally { clearTimeout(timeout); }
    if (!response.ok) { const error = new Error(data.error || `Student API request failed (${response.status}).`); error.status = response.status; throw error; }
    return data;
  };
  const esc = (value) => App.escapeHtml(String(value ?? ""));
  async function load() {
    if (!getToken()) {
      list.innerHTML = currentUser?.role === "student"
        ? `<p class="hint">This browser session is not connected to the assessment service. Sign in with the same student account you used to apply.</p><form id="assessment-inline-login" class="assessment-inline-login"><label class="field"><span>Student email</span><input type="email" name="email" required autocomplete="username" value="${esc(currentUser.email)}"></label><label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label><button class="btn btn--primary btn--sm" type="submit">Sign in and load my assessments</button><p class="hint" data-assessment-login-error role="alert"></p></form>`
        : '<p class="hint">Sign in with the student account that applied to the internship. <a href="login.html?role=student&amp;next=interview-prep.html%23company-assessments-panel">Student sign in</a></p>';
      const loginForm = document.getElementById("assessment-inline-login");
      loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = loginForm.querySelector('[type="submit"]'); const errorLabel = loginForm.querySelector("[data-assessment-login-error]");
        submit.disabled = true; errorLabel.textContent = "Signing in…";
        try {
          const response = await fetch(`${window.IM_API_BASE}/api/auth/student/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value }) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Student sign-in failed.");
          sessionStorage.setItem("im_student_api_token", data.token);
          errorLabel.textContent = "Signed in. Loading your assessments…";
          await load();
        } catch (error) { errorLabel.textContent = error.message; submit.disabled = false; }
      });
      return;
    }
    list.innerHTML = '<p class="hint">Loading available assessments…</p>';
    try {
      const data = await api("/student/assessments");
      list.innerHTML = data.items.length ? data.items.map((item) => `<article class="company-role-card"><div class="company-role-main"><div><span class="company-status-badge ${item.submitted ? "is-active" : ""}">${item.submitted ? "Submitted" : "Available"}</span><h3>${esc(item.title)}</h3><p>${esc(item.companyName)} · ${esc(item.category)} · ${esc(item.difficulty)} · ${item.durationMinutes} minutes · ${item.totalMarks} marks</p>${item.submitted ? `<p><strong>Score:</strong> ${item.result.score}/${item.result.totalMarks} · ${item.result.passed ? "Passing score" : "Below passing score"} · ${esc(item.result.status || "Scored")}</p>` : `<p>Passing score: ${item.passingMarks} · One submission allowed</p>`}</div><div class="company-role-side">${item.submitted ? "✓" : `<button class="btn btn--primary btn--sm" type="button" data-start-assessment="${esc(item.id)}">Start assessment</button>`}</div></div></article>`).join("") : '<p class="hint">No assessment is visible for this account yet. A company assessment appears here after Admin approves it and you have applied to its related internship.</p>';
      list.querySelectorAll("[data-start-assessment]").forEach((button) => button.addEventListener("click", () => start(button.dataset.startAssessment)));
    } catch (error) {
      list.innerHTML = error.status === 401
        ? '<p class="hint">Your student server session expired. <a href="login.html?role=student&amp;next=interview-prep.html%23company-assessments-panel">Sign in again and return here</a>.</p>'
        : `<p class="hint" role="status">${esc(error.message)} <button class="btn btn--ghost btn--sm" type="button" data-assessment-retry>Try again</button></p>`;
      list.querySelector("[data-assessment-retry]")?.addEventListener("click", load);
    }
  }
  async function start(id) {
    run.hidden = false;
    run.innerHTML = `<section class="assessment-integrity-intro"><span class="browse-eyebrow">Before you begin</span><h2>Assessment instructions</h2><p>You have one timed attempt. MCQs are scored automatically; written and coding responses are reviewed by the recruiter.</p><p>Written responses may show limited style patterns for recruiter review. These signals cannot reliably detect AI use or prove who wrote an answer, and should not determine hiring decisions by themselves.</p><div class="assessment-integrity-actions"><button class="btn btn--primary" type="button" id="assessment-start">Start assessment</button><button class="btn btn--ghost" type="button" id="assessment-start-cancel">Cancel</button></div></section>`;
    document.getElementById("assessment-start-cancel").addEventListener("click", () => { run.hidden = true; run.innerHTML = ""; });
    document.getElementById("assessment-start").addEventListener("click", () => begin(id));
    run.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function begin(id) {
    let interval = null;
    try {
      const { assessment } = await api(`/student/assessments/${encodeURIComponent(id)}/start`, { method: "POST", body: "{}" });
      let remaining = assessment.remainingSeconds;
      run.innerHTML = `<div class="panel__head"><div><h2>${esc(assessment.title)}</h2><p class="hint">${esc(assessment.category)} · ${assessment.totalMarks} marks · One attempt</p></div><strong id="student-assessment-timer" aria-live="polite"></strong></div><form id="student-assessment-form">${assessment.questions.map((question, index) => `<fieldset class="company-form-section"><legend><span>${String(index + 1).padStart(2, "0")}</span>${esc(question.type)} · ${question.marks} marks</legend><p><strong>${esc(question.prompt)}</strong></p>${question.type === "MCQ" ? question.options.map((option, optionIndex) => `<label class="student-assessment-option"><input type="radio" name="q-${esc(question.id)}" value="${optionIndex}"> ${String.fromCharCode(65 + optionIndex)}. ${esc(option)}</label>`).join("") : `<label class="field"><span>${question.type === "Coding" ? "Your code / solution" : "Your answer"}</span><textarea name="q-${esc(question.id)}" rows="${question.type === "Coding" ? 8 : 5}" maxlength="10000" placeholder="Write your response"></textarea></label>`}</fieldset>`).join("")}<button class="btn btn--primary" type="submit">Submit assessment</button> <button class="btn btn--ghost" type="button" id="student-assessment-cancel">Exit without submitting</button></form>`;
      const form = document.getElementById("student-assessment-form");
      const timer = document.getElementById("student-assessment-timer");
      const format = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      timer.textContent = `Time remaining ${format(remaining)}`;
      interval = setInterval(() => { remaining -= 1; timer.textContent = `Time remaining ${format(Math.max(0, remaining))}`; if (remaining <= 0) { clearInterval(interval); form.requestSubmit(); } }, 1000);
      document.getElementById("student-assessment-cancel").addEventListener("click", () => { clearInterval(interval); run.hidden = true; run.innerHTML = ""; });
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); clearInterval(interval);
        const answers = assessment.questions.map((question) => {
          if (question.type === "MCQ") return { questionId: question.id, selectedIndex: Number(form.querySelector(`input[name="q-${CSS.escape(question.id)}"]:checked`)?.value) };
          return { questionId: question.id, text: form.querySelector(`[name="q-${CSS.escape(question.id)}"]`)?.value || "" };
        });
        const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
        try { const result = await api(`/student/assessments/${encodeURIComponent(id)}/submit`, { method: "POST", body: JSON.stringify({ answers }) }); run.innerHTML = `<h2>Assessment submitted</h2><p>Your MCQ score: <strong>${result.result.score}/${result.result.totalMarks}</strong></p><p>${result.result.status === "Scored" ? (result.result.passed ? "You reached the passing score." : "You did not reach the passing score.") : "Your written or coding responses are waiting for recruiter review."}</p><p class="assessment-integrity-note">Writing-style clues are uncertain and cannot establish whether AI was used.</p><button type="button" class="btn btn--primary" id="assessment-done">Back to assessments</button>`; document.getElementById("assessment-done").addEventListener("click", () => { run.hidden = true; load(); }); }
        catch (error) { App.toast(error.message, "error"); submit.disabled = false; }
      });
      run.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { App.toast(error.message, "error"); }
  }
  document.getElementById("company-assessments-refresh").addEventListener("click", load);
  load();
});
