/* js/interview-prep.js — interview-prep.html
   Storage: im_interview_history_<email> -> [{ category, type, score, total, date }] */

document.addEventListener("DOMContentLoaded", () => {
  const categoryPanel = document.getElementById("category-panel");
  if (!categoryPanel) return;
  const user = Store.getCurrentUser();
  if (!user) return;

  const historyKey = `im_interview_history_${user.email}`;
  const categoryGrid = document.getElementById("category-grid");
  const quizPanel = document.getElementById("quiz-panel");
  const quizTitle = document.getElementById("quiz-title");
  const quizExitBtn = document.getElementById("quiz-exit-btn");
  const quizProgress = document.getElementById("quiz-progress");
  const quizArea = document.getElementById("quiz-question-area");
  const hrPanel = document.getElementById("hr-panel");
  const hrExitBtn = document.getElementById("hr-exit-btn");
  const hrProgress = document.getElementById("hr-progress");
  const hrArea = document.getElementById("hr-question-area");
  const resultsPanel = document.getElementById("results-panel");
  const resultsSummary = document.getElementById("results-summary");
  const resultsBackBtn = document.getElementById("results-back-btn");
  const historyEl = document.getElementById("interview-history");

  const categories = Object.keys(INTERVIEW_QUESTIONS);
  const categoryInfo = {
    Python: ["Py", "Core syntax, data types, and practical Python concepts"],
    Java: ["Ja", "Object-oriented programming and Java fundamentals"],
    SQL: ["SQL", "Queries, joins, aggregation, and database thinking"],
    Cloud: ["☁", "Cloud concepts, services, and deployment basics"],
    AI: ["AI", "Machine learning and artificial intelligence basics"],
    "Analytical reasoning": ["∑", "Patterns, logic, and structured problem solving"],
    "Coding logic": ["{ }", "Translate problem statements into clear steps"],
    "Google-style coding": ["G", "Algorithmic coding practice in a Google-style format"],
    "Microsoft-style coding": ["M", "Problem solving and coding practice in a Microsoft-style format"],
    "Amazon-style problem solving": ["A", "Structured problem solving in an Amazon-style format"],
    "Data structures & algorithms": ["DS", "Core data structures, complexity, and algorithms"],
    "SQL & data interview": ["DB", "Data-focused SQL and database interview practice"],
    "HR / Behavioral": ["★", "Practice concise stories about your work and decisions"]
  };
  function categoryCard(category, isHr = false) {
    const [icon, description] = categoryInfo[category] || ["✦", "Build confidence with a focused practice session"];
    const count = isHr ? "Open-ended practice" : `${INTERVIEW_QUESTIONS[category].length} questions · Scored quiz`;
    return `<button type="button" class="interview-cat-btn${isHr ? " interview-cat-btn--hr" : ""}" data-cat="${isHr ? "HR" : category}">
      <span class="interview-cat-icon" aria-hidden="true">${icon}</span>
      <span class="interview-cat-copy"><strong>${category}</strong><small>${description}</small><span class="interview-cat-meta">${count}</span></span>
    </button>`;
  }
  categoryGrid.innerHTML = categories.map((category) => categoryCard(category)).join("") + categoryCard("HR / Behavioral", true);

  function showOnly(panel) {
    [categoryPanel, quizPanel, hrPanel, resultsPanel].forEach((p) => (p.style.display = p === panel ? "" : "none"));
  }

  function saveHistory(entry) {
    const history = Store.readBlob(historyKey, []);
    history.unshift(Object.assign({ date: new Date().toISOString() }, entry));
    Store.writeBlob(historyKey, history);
    renderHistory();
    renderResultsSummary();
    syncInterviewScores();
  }

  function syncInterviewScores() {
    const token = sessionStorage.getItem("im_student_api_token");
    if (!token) return;
    const scores = Store.readBlob(historyKey, []).filter((entry) => entry.type === "quiz" && Number(entry.total) > 0 && Number.isFinite(Number(entry.score))).slice(0, 20).map((entry) => ({ category: entry.category, score: Number(entry.score), total: Number(entry.total), date: entry.date }));
    fetch(`${window.IM_API_BASE}/api/student/interview-scores`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ scores }) }).catch(() => {});
  }

  function renderResultsSummary() {
    const history = Store.readBlob(historyKey, []);
    const scored = history.filter((h) => h.type === "quiz" && Number.isFinite(Number(h.score)) && Number(h.total) > 0);
    if (!scored.length) {
      resultsSummary.textContent = "Your scored practice tests will appear here and on your profile.";
      return;
    }
    const best = Math.max(...scored.map((h) => Math.round((Number(h.score) / Number(h.total)) * 100)));
    resultsSummary.textContent += ` Best practice score so far: ${best}%. Your latest scores are saved in My profile.`;
  }

  function renderHistory() {
    const history = Store.readBlob(historyKey, []);
    historyEl.innerHTML = history.length ? history.slice(0, 10).map((h) => `
      <div class="history-row">
        <span>${App.escapeHtml(h.category)} ${h.type === "HR" ? "(HR practice)" : "quiz"}</span>
        <span>${h.type === "HR" ? `${h.total} question${h.total === 1 ? "" : "s"} answered` : `${h.score}/${h.total} (${Math.round((Number(h.score) / Number(h.total)) * 100)}%)`} &middot; ${App.formatDate(h.date)}</span>
      </div>
    `).join("") : `<p class="hint">No practice sessions yet — pick a topic above to get started.</p>`;
  }

  // ---------- Technical quiz ----------

  function runQuiz(category) {
    const questions = INTERVIEW_QUESTIONS[category];
    let idx = 0;
    let score = 0;
    showOnly(quizPanel);
    quizTitle.textContent = `${category} quiz`;

    function renderQuestion() {
      quizProgress.textContent = `Question ${idx + 1} of ${questions.length}`;
      const q = questions[idx];
      quizArea.innerHTML = `
        <h3>${App.escapeHtml(q.question)}</h3>
        <div id="quiz-options">
          ${q.options.map((opt, i) => `<button type="button" class="quiz-option" data-opt="${i}">${App.escapeHtml(opt)}</button>`).join("")}
        </div>
        <button type="button" class="btn btn--primary" id="quiz-next-btn" style="display:none; margin-top:10px;">
          ${idx === questions.length - 1 ? "See results" : "Next question"}
        </button>
      `;
      const optionButtons = quizArea.querySelectorAll(".quiz-option");
      const nextBtn = document.getElementById("quiz-next-btn");
      optionButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const chosen = parseInt(btn.getAttribute("data-opt"), 10);
          optionButtons.forEach((b) => (b.disabled = true));
          if (chosen === q.correctIndex) {
            btn.classList.add("correct");
            score++;
          } else {
            btn.classList.add("incorrect");
            optionButtons[q.correctIndex].classList.add("correct");
          }
          nextBtn.style.display = "";
        });
      });
      nextBtn.addEventListener("click", () => {
        idx++;
        if (idx < questions.length) {
          renderQuestion();
        } else {
          finishQuiz();
        }
      });
    }

    function finishQuiz() {
      saveHistory({ category, type: "quiz", score, total: questions.length, percent: Math.round((score / questions.length) * 100) });
      showOnly(resultsPanel);
      resultsSummary.textContent = `You scored ${score} out of ${questions.length} on the ${category} quiz.`;
      renderResultsSummary();
    }

    renderQuestion();
  }

  // ---------- HR / behavioral practice ----------

  function runHr() {
    let idx = 0;
    showOnly(hrPanel);

    function renderQuestion() {
      hrProgress.textContent = `Question ${idx + 1} of ${HR_QUESTIONS.length}`;
      const q = HR_QUESTIONS[idx];
      hrArea.innerHTML = `
        <h3>${App.escapeHtml(q.question)}</h3>
        <textarea id="hr-answer" rows="5" placeholder="Type your answer…" style="width:100%;"></textarea>
        <div style="display:flex; gap:10px; margin-top:10px;">
          <button type="button" class="btn btn--ghost" id="hr-reveal-btn">Show model answer tip</button>
          <button type="button" class="btn btn--primary" id="hr-next-btn">${idx === HR_QUESTIONS.length - 1 ? "Finish" : "Next question"}</button>
        </div>
        <p class="hint" id="hr-tip" style="display:none; margin-top:10px;">${App.escapeHtml(q.tip)}</p>
      `;
      document.getElementById("hr-reveal-btn").addEventListener("click", () => {
        document.getElementById("hr-tip").style.display = "";
      });
      document.getElementById("hr-next-btn").addEventListener("click", () => {
        idx++;
        if (idx < HR_QUESTIONS.length) {
          renderQuestion();
        } else {
          saveHistory({ category: "HR / Behavioral", type: "HR", score: null, total: HR_QUESTIONS.length });
          showOnly(resultsPanel);
          resultsSummary.textContent = `You worked through all ${HR_QUESTIONS.length} HR/behavioral questions. Review your notes before the real thing.`;
        }
      });
    }

    renderQuestion();
  }

  categoryGrid.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "HR") runHr();
      else runQuiz(cat);
    });
  });

  quizExitBtn.addEventListener("click", () => showOnly(categoryPanel));
  hrExitBtn.addEventListener("click", () => showOnly(categoryPanel));
  resultsBackBtn.addEventListener("click", () => showOnly(categoryPanel));

  showOnly(categoryPanel);
  renderHistory();
  syncInterviewScores();
});
