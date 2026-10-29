document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("student-company-assessments");
  if (!list) return;
  const getToken = () => sessionStorage.getItem("im_student_api_token");
  const currentUser = Store.getCurrentUser();
  const run = document.getElementById("student-assessment-run");
  const api = async (route, options = {}) => {
    const response = await fetch(`${window.IM_API_BASE}/api${route}`, { ...options, headers: { authorization: `Bearer ${getToken() || ""}`, "content-type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
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
        : `<p class="hint">${esc(error.message)} Make sure the InternMatch API is running.</p>`;
    }
  }
  async function start(id) {
    run.hidden = false;
    run.innerHTML = `<section class="assessment-integrity-intro"><span class="browse-eyebrow">Before you begin</span><h2>Camera and writing-style review</h2><p>Your browser can show a live camera preview during the assessment. Video stays on this device: it is not recorded or sent to the company.</p><p>Written answers may be checked for broad style patterns. This is not a reliable AI detector and cannot prove AI use; any signals are review-only and must not determine a hiring decision by themselves.</p><label class="assessment-camera-consent"><input id="assessment-camera-consent" type="checkbox"> I understand and agree to enable my camera for a local preview during this test.</label><div class="assessment-integrity-actions"><button class="btn btn--primary" type="button" id="assessment-start-camera" disabled>Enable camera &amp; start</button><button class="btn btn--ghost" type="button" id="assessment-start-no-camera">Continue without camera</button><button class="btn btn--ghost" type="button" id="assessment-start-cancel">Cancel</button></div><p class="hint" id="assessment-camera-message" role="status"></p></section>`;
    const consent = document.getElementById("assessment-camera-consent");
    const withCamera = document.getElementById("assessment-start-camera");
    const message = document.getElementById("assessment-camera-message");
    consent.addEventListener("change", () => { withCamera.disabled = !consent.checked; });
    document.getElementById("assessment-start-cancel").addEventListener("click", () => { run.hidden = true; run.innerHTML = ""; });
    document.getElementById("assessment-start-no-camera").addEventListener("click", () => begin(id, null));
    withCamera.addEventListener("click", async () => {
      if (!consent.checked) return;
      withCamera.disabled = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        begin(id, stream);
      } catch (error) {
        message.textContent = "Camera access was unavailable or denied. You can continue without camera.";
        withCamera.disabled = false;
      }
    });
    run.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function writingStyleSignals(answers) {
    const texts = answers.filter((answer) => typeof answer.text === "string" && answer.text.trim().length >= 40).map((answer) => answer.text.trim());
    const signals = [];
    const disclaimer = "These simple style clues are unreliable, can flag human writing, and do not establish AI use or misconduct.";
    if (!texts.length) return { label: "Not enough written text to review", signals, disclaimer };
    const combined = texts.join(" ").toLowerCase();
    const genericPhrases = ["in today's fast-paced", "it is important to note", "delve into", "moreover", "furthermore", "in conclusion", "plays a crucial role"];
    const found = genericPhrases.filter((phrase) => combined.includes(phrase));
    if (found.length) signals.push("Some common or generic phrasing appears in written answers.");
    if (texts.length >= 2 && texts.map((value) => value.toLowerCase().replace(/\s+/g, " ")).some((value, index, all) => all.indexOf(value) !== index)) signals.push("One or more written answers repeat the same wording.");
    return { label: signals.length ? "Patterns for human review" : "No listed patterns found", signals, disclaimer };
  }
  async function begin(id, cameraStream) {
    let interval = null;
    const stopCamera = () => cameraStream?.getTracks().forEach((track) => track.stop());
    try {
      const { assessment } = await api(`/student/assessments/${encodeURIComponent(id)}/start`, { method: "POST", body: "{}" });
      let remaining = assessment.remainingSeconds;
      run.innerHTML = `<div class="assessment-camera-row">${cameraStream ? `<div class="assessment-camera-preview"><video id="assessment-camera-video" autoplay muted playsinline></video><span><i></i> Camera preview · on this device only</span></div>` : `<p class="hint">Camera preview was not enabled for this attempt.</p>`}<p class="assessment-integrity-note"><strong>Writing-style review:</strong> any style signals are uncertain feedback only, not proof of AI use.</p></div><div class="panel__head"><div><h2>${esc(assessment.title)}</h2><p class="hint">${esc(assessment.category)} · ${assessment.totalMarks} marks · One attempt</p></div><strong id="student-assessment-timer" aria-live="polite"></strong></div><form id="student-assessment-form">${assessment.questions.map((question, index) => `<fieldset class="company-form-section"><legend><span>${String(index + 1).padStart(2, "0")}</span>${esc(question.type)} · ${question.marks} marks</legend><p><strong>${esc(question.prompt)}</strong></p>${question.type === "MCQ" ? question.options.map((option, optionIndex) => `<label class="student-assessment-option"><input type="radio" name="q-${esc(question.id)}" value="${optionIndex}"> ${String.fromCharCode(65 + optionIndex)}. ${esc(option)}</label>`).join("") : `<label class="field"><span>${question.type === "Coding" ? "Your code / solution" : "Your answer"}</span><textarea name="q-${esc(question.id)}" rows="${question.type === "Coding" ? 8 : 5}" maxlength="10000" placeholder="Write your response"></textarea></label>`}</fieldset>`).join("")}<button class="btn btn--primary" type="submit">Submit assessment</button> <button class="btn btn--ghost" type="button" id="student-assessment-cancel">Exit without submitting</button></form>`;
      const video = document.getElementById("assessment-camera-video");
      if (video && cameraStream) video.srcObject = cameraStream;
      const form = document.getElementById("student-assessment-form");
      const timer = document.getElementById("student-assessment-timer");
      const format = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      timer.textContent = `Time remaining ${format(remaining)}`;
      interval = setInterval(() => { remaining -= 1; timer.textContent = `Time remaining ${format(Math.max(0, remaining))}`; if (remaining <= 0) { clearInterval(interval); form.requestSubmit(); } }, 1000);
      document.getElementById("student-assessment-cancel").addEventListener("click", () => { clearInterval(interval); stopCamera(); run.hidden = true; run.innerHTML = ""; });
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); clearInterval(interval);
        const answers = assessment.questions.map((question) => {
          if (question.type === "MCQ") return { questionId: question.id, selectedIndex: Number(form.querySelector(`input[name="q-${CSS.escape(question.id)}"]:checked`)?.value) };
          return { questionId: question.id, text: form.querySelector(`[name="q-${CSS.escape(question.id)}"]`)?.value || "" };
        });
        const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
        try { const result = await api(`/student/assessments/${encodeURIComponent(id)}/submit`, { method: "POST", body: JSON.stringify({ answers, writingReview: writingStyleSignals(answers) }) }); stopCamera(); run.innerHTML = `<h2>Assessment submitted</h2><p>Your MCQ score: <strong>${result.result.score}/${result.result.totalMarks}</strong></p><p>${result.result.status === "Scored" ? (result.result.passed ? "You reached the passing score." : "You did not reach the passing score.") : "Your written or coding responses are waiting for recruiter review."}</p><p class="assessment-integrity-note">Writing-style clues are limited and cannot determine whether AI was used.</p><button type="button" class="btn btn--primary" id="assessment-done">Back to assessments</button>`; document.getElementById("assessment-done").addEventListener("click", () => { run.hidden = true; load(); }); }
        catch (error) { App.toast(error.message, "error"); submit.disabled = false; }
      });
      run.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { stopCamera(); App.toast(error.message, "error"); }
  }
  document.getElementById("company-assessments-refresh").addEventListener("click", load);
  load();
});
