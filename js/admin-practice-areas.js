/* Admin editor for student interview-practice topics and MCQ question sets. */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("admin-practice-area-form");
  if (!form) return;
  const questionList = document.getElementById("admin-practice-question-list");
  const areaList = document.getElementById("admin-practice-area-list");
  const generateButton = document.getElementById("admin-practice-generate-questions");
  const generationStatus = document.getElementById("admin-practice-generation-status");
  const token = () => sessionStorage.getItem("im_admin_api_token") || "";
  const esc = (value) => App.escapeHtml(value == null ? "" : String(value));
  let areas = [];

  async function api(route, options = {}) {
    const response = await fetch(`${window.IM_API_BASE}/api${route}`, {
      ...options,
      headers: { "content-type": "application/json", authorization: `Bearer ${token()}`, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 && /route not found/i.test(String(data.error || ""))) {
        throw new Error(`The API server is missing ${route}. Restart or redeploy the latest InternMatch backend, then verify /api/health reports adminPracticeFileQuestionDrafts: true.`);
      }
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  function addQuestion() {
    if (questionList.children.length >= 30) return App.toast("A practice area can contain up to 30 questions.", "error");
    const card = document.createElement("article");
    card.className = "admin-practice-question";
    card.innerHTML = `<div class="admin-practice-question__head"><strong>Question ${questionList.children.length + 1}</strong><button type="button" class="btn btn--ghost btn--sm" data-remove-practice-question>Remove</button></div><div class="field"><label>Question prompt</label><textarea data-practice-prompt rows="2" maxlength="500" required placeholder="Write a clear question (at least 8 characters)"></textarea></div><div class="admin-practice-options">${[0,1,2,3].map((index) => `<div class="field"><label>Option ${String.fromCharCode(65 + index)}</label><input data-practice-option="${index}" maxlength="240" required /></div>`).join("")}</div><div class="field"><label>Correct option</label><select data-practice-correct><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div>`;
    questionList.appendChild(card);
    renumberQuestions();
  }

  function renumberQuestions() {
    [...questionList.children].forEach((card, index) => { card.querySelector(".admin-practice-question__head strong").textContent = `Question ${index + 1}`; });
  }

  generateButton.addEventListener("click", async () => {
    const fileInput = document.getElementById("practice-area-source-file");
    const file = fileInput.files?.[0];
    if (!file) return App.toast("Choose a PDF, TXT, or DOCX file first.", "error");
    if (file.size > 3 * 1024 * 1024) return App.toast("Choose a file smaller than 3 MB.", "error");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("The selected file could not be read."));
      reader.readAsDataURL(file);
    }).catch((error) => { App.toast(error.message, "error"); return ""; });
    if (!dataUrl) return;
    generateButton.disabled = true;
    generationStatus.textContent = "Reading the file and drafting questions…";
    try {
      const data = await api("/admin/practice-areas/generate-questions", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, data: dataUrl.split(",")[1], count: Number(document.getElementById("practice-area-question-count").value), category: document.getElementById("practice-area-title").value.trim() || "Student interview practice" })
      });
      questionList.innerHTML = "";
      (data.questions || []).forEach((question) => {
        addQuestion();
        const card = questionList.lastElementChild;
        card.querySelector("[data-practice-prompt]").value = question.question || "";
        [0, 1, 2, 3].forEach((index) => { card.querySelector(`[data-practice-option="${index}"]`).value = question.options?.[index] || ""; });
        card.querySelector("[data-practice-correct]").value = String(question.correctIndex ?? 0);
      });
      generationStatus.textContent = `${data.questions?.length || 0} draft questions from ${data.sourceName || file.name}. Review and edit all answers before saving.`;
      App.toast("Draft questions added. Review them, then save the practice area.");
    } catch (error) {
      generationStatus.textContent = error.message;
      App.toast(error.message, "error");
    } finally { generateButton.disabled = false; }
  });

  async function renderAreas() {
    areaList.innerHTML = '<p class="hint">Loading practice areas…</p>';
    try {
      const data = await api("/admin/practice-areas");
      areas = data.items || [];
      areaList.innerHTML = areas.length ? areas.map((area) => `<article class="admin-practice-area-row" data-practice-area="${esc(area.id)}"><div><strong>${esc(area.icon || "✦")} ${esc(area.title)}</strong><p>${esc(area.description || "No description")} · ${(area.questions || []).length} question${(area.questions || []).length === 1 ? "" : "s"} · ${area.active ? "Active for students" : "Hidden from students"}</p></div><div class="admin-practice-area-row__actions"><button type="button" class="btn btn--ghost btn--sm" data-practice-toggle="${area.active ? "false" : "true"}">${area.active ? "Deactivate" : "Activate"}</button><button type="button" class="btn btn--ghost btn--sm" data-practice-delete>Delete</button></div></article>`).join("") : '<p class="hint">No custom practice areas yet. Add one above to show it to students.</p>';
      areaList.querySelectorAll("[data-practice-toggle]").forEach((button) => button.addEventListener("click", async () => {
        const row = button.closest("[data-practice-area]"); button.disabled = true;
        try { await api(`/admin/practice-areas/${encodeURIComponent(row.dataset.practiceArea)}`, { method: "PATCH", body: JSON.stringify({ active: button.dataset.practiceToggle === "true" }) }); App.toast("Practice area updated."); await renderAreas(); }
        catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
      areaList.querySelectorAll("[data-practice-delete]").forEach((button) => button.addEventListener("click", async () => {
        const row = button.closest("[data-practice-area]");
        const area = areas.find((item) => item.id === row.dataset.practiceArea);
        if (!window.confirm(`Delete the practice area “${area?.title || ""}”?`)) return;
        button.disabled = true;
        try { await api(`/admin/practice-areas/${encodeURIComponent(row.dataset.practiceArea)}`, { method: "DELETE" }); App.toast("Practice area deleted."); await renderAreas(); }
        catch (error) { App.toast(error.message, "error"); button.disabled = false; }
      }));
    } catch (error) { areaList.innerHTML = `<p class="hint">${esc(error.message)}</p>`; }
  }

  document.getElementById("admin-practice-question-add").addEventListener("click", addQuestion);
  questionList.addEventListener("click", (event) => {
    if (!event.target.closest("[data-remove-practice-question]")) return;
    event.target.closest(".admin-practice-question").remove();
    renumberQuestions();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("admin-practice-area-save");
    const questions = [...questionList.children].map((card) => ({
      question: card.querySelector("[data-practice-prompt]").value.trim(),
      options: [0,1,2,3].map((index) => card.querySelector(`[data-practice-option="${index}"]`).value.trim()),
      correctIndex: Number(card.querySelector("[data-practice-correct]").value)
    }));
    if (!questions.length) return App.toast("Add at least one multiple-choice question.", "error");
    if (questions.some((question) => question.question.length < 8 || question.options.some((option) => !option) || new Set(question.options.map((option) => option.toLowerCase())).size !== 4)) return App.toast("Each question needs at least 8 characters and four different answer choices.", "error");
    button.disabled = true;
    try {
      await api("/admin/practice-areas", { method: "POST", body: JSON.stringify({ title: document.getElementById("practice-area-title").value.trim(), icon: document.getElementById("practice-area-icon").value.trim(), description: document.getElementById("practice-area-description").value.trim(), questions }) });
      form.reset(); document.getElementById("practice-area-icon").value = "✦"; questionList.innerHTML = ""; addQuestion();
      App.toast("Practice area added for students."); await renderAreas();
    } catch (error) { App.toast(error.message, "error"); }
    finally { button.disabled = false; }
  });

  addQuestion();
  renderAreas();
});
