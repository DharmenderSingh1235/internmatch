/*
 * Resume Intelligence — PDF analysis runs in this browser. The PDF is sent to
 * the InternMatch server only when the student explicitly shares it with companies.
 * Skills and opportunity scores are transparent heuristics; writing patterns are not an authorship detector.
 */
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("resume-file-input");
  if (!fileInput) return;

  const filenameEl = document.getElementById("resume-analyzer-filename");
  const adminShareCheckbox = document.getElementById("resume-admin-sharing");
  const adminShareStatus = document.getElementById("resume-admin-sharing-status");
  const companyProfileShare = document.getElementById("company-profile-sharing");
  const companyCvShare = document.getElementById("company-cv-sharing");
  const companyShareStatus = document.getElementById("company-sharing-status");
  const analyzeBtn = document.getElementById("analyze-btn");
  const errorEl = document.getElementById("resume-analyzer-error");
  const loadingEl = document.getElementById("resume-analyzer-loading");
  const resultsPanel = document.getElementById("results-panel");
  const foundSkillsWrap = document.getElementById("found-skills-wrap");
  const compareWrap = document.getElementById("profile-compare-wrap");
  const addSkillsBtn = document.getElementById("add-skills-btn");
  const addSkillsStatus = document.getElementById("add-skills-status");
  const matchesPanel = document.getElementById("matches-panel");
  const matchGrid = document.getElementById("resume-match-grid");
  const atsRoleSelect = document.getElementById("ats-role");
  const atsRoleRow = document.getElementById("ats-role-row");
  const atsOtherRoleWrap = document.getElementById("ats-other-role-wrap");
  const atsOtherRoleInput = document.getElementById("ats-other-role");
  const atsOtherRoleNote = document.getElementById("ats-other-role-note");
  const atsResults = document.getElementById("ats-results");
  const user = Store.getCurrentUser();
  const allInternships = Store.getAllInternships();
  let selectedFile = null;
  let foundSkills = [];
  let extractedResume = null;

  const studentToken = () => sessionStorage.getItem("im_student_api_token");
  const consentKey = user ? `im_company_consent_${user.email.toLowerCase()}` : "";
  function getCompanyConsent() {
    try { return JSON.parse(localStorage.getItem(consentKey) || "{}"); } catch (_) { return {}; }
  }
  async function sendCompanyConsent(profileVisible, cvShared) {
    const token = studentToken();
    if (!token) throw new Error("Sign in while the InternMatch server is running to share your profile.");
    const response = await fetch(`${window.IM_API_BASE}/api/student/profile`, {
      method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile: Store.getProfile(user.email), profileVisible, cvShared })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not save company-sharing preferences.");
    return data;
  }
  async function uploadCompanyCv(file) {
    if (!file || file.type !== "application/pdf" || file.size > 7.5 * 1024 * 1024) throw new Error("Choose a PDF smaller than 7.5 MB.");
    const token = studentToken();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("Could not read the selected PDF."));
      reader.readAsDataURL(file);
    });
    const response = await fetch(`${window.IM_API_BASE}/api/student/cv`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, data: base64 }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not upload the CV.");
  }

  async function saveSharedCV(file) {
    if (!user || !file || !window.ResumeVault) return;
    await ResumeVault.put(user.email, file);
    Store.saveProfile(user.email, { resumeFileName: file.name });
    adminShareStatus.textContent = "CV saved in this browser. Admin views will be added to its local activity log.";
  }

  if (!user) {
    adminShareCheckbox.disabled = true;
    adminShareStatus.textContent = "Log in to enable admin CV access.";
  } else if (window.ResumeVault) {
    ResumeVault.get(user.email).then((record) => {
      if (record) {
        adminShareCheckbox.checked = true;
        adminShareStatus.textContent = `Admin access is enabled for ${record.name}.`;
      }
    }).catch(() => { adminShareStatus.textContent = "Local file storage is unavailable in this browser."; });
  }

  if (companyProfileShare && companyCvShare) {
    const consent = getCompanyConsent();
    companyProfileShare.checked = consent.profileVisible === true;
    companyCvShare.checked = consent.cvShared === true;
    const loginHref = "login.html?role=student&next=resume-analyzer.html";
    const showLoginLink = (message) => {
      companyProfileShare.disabled = true;
      companyCvShare.disabled = true;
      companyShareStatus.innerHTML = `${App.escapeHtml(message)} <a href="${loginHref}">Sign in again</a>.`;
    };
    const showSharingState = () => {
      companyProfileShare.disabled = false;
      companyCvShare.disabled = !companyProfileShare.checked;
      if (companyCvShare.checked) companyShareStatus.textContent = "Your profile is discoverable; your CV is shared with companies you apply to. You can revoke either permission here.";
      else if (companyProfileShare.checked) companyShareStatus.textContent = "Your profile is discoverable by active companies. Your CV remains private.";
      else companyShareStatus.textContent = "Your profile and CV are private from companies until you opt in.";
    };
    if (!user || user.role !== "student") {
      showLoginLink("Sign in with a student account and the InternMatch API to manage company sharing.");
    } else if (!studentToken()) {
      showLoginLink("Your browser has no server sign-in session, so sharing controls are paused.");
    } else {
      companyProfileShare.disabled = true;
      companyCvShare.disabled = true;
      companyShareStatus.textContent = "Checking your saved sharing permissions…";
      fetch(`${window.IM_API_BASE}/api/student/profile`, { headers: { authorization: `Bearer ${studentToken()}` }, cache: "no-store" })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (response.status === 401) throw new Error("SESSION_EXPIRED");
          if (!response.ok) throw new Error(data.error || "Could not load sharing permissions.");
          companyProfileShare.checked = data.profileVisible === true;
          companyCvShare.checked = data.cvShared === true && data.profileVisible === true;
          localStorage.setItem(consentKey, JSON.stringify({ profileVisible: companyProfileShare.checked, cvShared: companyCvShare.checked }));
          showSharingState();
        })
        .catch((error) => {
          if (error.message === "SESSION_EXPIRED") sessionStorage.removeItem("im_student_api_token");
          showLoginLink(error.message === "SESSION_EXPIRED" ? "Your server session expired. Sign in again to update sharing permissions." : error.message);
        });
    }
  }

  allInternships.slice().sort((a, b) => a.title.localeCompare(b.title)).forEach((internship) => {
    const option = document.createElement("option");
    option.value = internship.id;
    option.textContent = internship.title;
    atsRoleSelect.appendChild(option);
  });
  const otherRoleOption = document.createElement("option");
  otherRoleOption.value = "other";
  otherRoleOption.textContent = "Other (enter a role)";
  atsRoleSelect.appendChild(otherRoleOption);

  function updateRoleSelection() {
    const isOther = atsRoleSelect.value === "other";
    atsOtherRoleWrap.hidden = !isOther;
    atsOtherRoleNote.hidden = !isOther;
    atsRoleRow.classList.toggle("ats-role-row--custom", isOther);
  }

  function getTargetInternship() {
    if (atsRoleSelect.value === "other") {
      const skills = [...new Set(allInternships.flatMap((internship) => internship.skills || []))];
      const customTitle = atsOtherRoleInput.value.trim();
      return { title: customTitle ? `Other: ${customTitle}` : "Other role", skills, isCustomRole: true };
    }
    return allInternships.find((internship) => internship.id === atsRoleSelect.value) || allInternships[0];
  }
  updateRoleSelection();

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const SECTION_RULES = [
    { key: "summary", label: "Summary", pattern: /^(?:professional\s+)?(?:summary|profile|objective|career\s+objective)$/i },
    { key: "education", label: "Education", pattern: /^(?:education|academic\s+background|education\s+and\s+training)$/i },
    { key: "skills", label: "Skills", pattern: /^(?:technical\s+)?skills|^(?:core\s+)?competencies$/i },
    { key: "projects", label: "Projects", pattern: /^(?:academic\s+)?projects|^(?:selected\s+)?project\s+experience$/i },
    { key: "experience", label: "Experience", pattern: /^(?:work\s+)?experience|employment|internships?|professional\s+experience$/i },
    { key: "certifications", label: "Certifications", pattern: /^(?:certifications?|licenses?|courses)$/i }
  ];

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files[0] || null;
    filenameEl.textContent = selectedFile ? selectedFile.name : "No file selected";
    errorEl.textContent = "";
    resultsPanel.style.display = "none";
    matchesPanel.style.display = "none";
    analyzeBtn.disabled = !selectedFile;
    if (selectedFile && adminShareCheckbox.checked && user) {
      saveSharedCV(selectedFile).catch(() => { adminShareStatus.textContent = "Could not save the CV locally. Try a smaller PDF or another browser."; });
    }
    if (selectedFile && companyCvShare?.checked && companyProfileShare?.checked) {
      uploadCompanyCv(selectedFile).then(() => { companyShareStatus.textContent = "Your updated CV is shared with active company accounts you apply to."; }).catch(async (error) => {
        companyCvShare.checked = false;
        const consent = { profileVisible: true, cvShared: false };
        try { localStorage.setItem(consentKey, JSON.stringify(consent)); await sendCompanyConsent(true, false); } catch (_) { /* Keep the upload error visible; the API may be unavailable. */ }
        companyShareStatus.textContent = error.message;
      });
    }
  });

  companyProfileShare?.addEventListener("change", async () => {
    const profileVisible = companyProfileShare.checked;
    const prior = getCompanyConsent();
    const cvShared = profileVisible && prior.cvShared === true;
    companyCvShare.disabled = !profileVisible || !studentToken();
    if (!profileVisible) companyCvShare.checked = false;
    try {
      await sendCompanyConsent(profileVisible, cvShared);
      localStorage.setItem(consentKey, JSON.stringify({ profileVisible, cvShared }));
      companyShareStatus.textContent = profileVisible ? "Your profile is discoverable by active company accounts. Your CV remains private unless separately shared." : "Company access to your profile and CV has been turned off.";
    } catch (error) {
      try { localStorage.setItem(consentKey, JSON.stringify(prior)); } catch (_) { /* Leave the last saved browser preference unchanged. */ }
      companyProfileShare.checked = prior.profileVisible === true;
      companyCvShare.checked = prior.cvShared === true;
      companyCvShare.disabled = !companyProfileShare.checked || !studentToken();
      companyShareStatus.textContent = error.message;
    }
  });
  companyCvShare?.addEventListener("change", async () => {
    const cvShared = companyCvShare.checked;
    const prior = getCompanyConsent();
    let serverConsentUpdated = false;
    try {
      if (cvShared) {
        if (!companyProfileShare.checked) throw new Error("Enable profile sharing first.");
        if (!selectedFile) throw new Error("Select a PDF before sharing your CV.");
        await sendCompanyConsent(true, true);
        serverConsentUpdated = true;
        await uploadCompanyCv(selectedFile);
      } else {
        await sendCompanyConsent(companyProfileShare.checked, false);
        serverConsentUpdated = true;
      }
      localStorage.setItem(consentKey, JSON.stringify({ profileVisible: companyProfileShare.checked, cvShared }));
      companyShareStatus.textContent = cvShared ? "Your PDF is shared with active companies you apply to." : "Your CV has been removed from company access.";
    } catch (error) {
      if (cvShared && serverConsentUpdated && prior.cvShared !== true) {
        try { await sendCompanyConsent(companyProfileShare.checked, false); } catch (_) { /* Server may be offline; preserve the original failure below. */ }
      }
      try { localStorage.setItem(consentKey, JSON.stringify(prior)); } catch (_) { /* Leave the last saved browser preference unchanged. */ }
      companyCvShare.checked = prior.cvShared === true;
      companyShareStatus.textContent = error.message;
    }
  });

  adminShareCheckbox.addEventListener("change", async () => {
    if (!user || !window.ResumeVault) return;
    if (adminShareCheckbox.checked) {
      if (!selectedFile) {
        adminShareStatus.textContent = "Choose a PDF to save a local copy for admin access.";
        return;
      }
      try { await saveSharedCV(selectedFile); }
      catch (_) { adminShareCheckbox.checked = false; adminShareStatus.textContent = "Could not save the CV locally. Try a smaller PDF or another browser."; }
    } else {
      try {
        await ResumeVault.remove(user.email);
        adminShareStatus.textContent = "Admin access removed and the saved CV copy was deleted from this browser.";
      } catch (_) { adminShareStatus.textContent = "Could not remove the saved CV copy."; }
    }
  });

  async function extractText(file) {
    if (!window.pdfjsLib) throw new Error("PDF_READER_UNAVAILABLE");
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join(""));
    }
    return { text: pages.join("\n"), pageCount: pdf.numPages };
  }

  function detectSkills(text) {
    const lower = text.toLowerCase();
    return SKILLS_VOCABULARY.filter((skill) => {
      const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
      return pattern.test(lower);
    });
  }

  function splitSections(text) {
    const sections = Object.fromEntries(SECTION_RULES.map((rule) => [rule.key, []]));
    let active = null;
    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.replace(/[\u2022\u25cf\u25aa]/g, " ").trim();
      if (!line) return;
      const headingText = line.replace(/[:|\-–—]+\s*$/, "").trim();
      const rule = SECTION_RULES.find((candidate) => candidate.pattern.test(headingText));
      if (rule) {
        active = rule.key;
        return;
      }
      if (active) sections[active].push(line);
    });
    return sections;
  }

  function getSectionEntries(lines, maxItems = 5) {
    return lines
      .flatMap((line) => line.split(/\s*[•▪|]\s*|\s{2,}/))
      .map((line) => line.trim().replace(/^[-*–—]+\s*/, ""))
      .filter((line) => line.length > 2)
      .slice(0, maxItems);
  }

  function analyzeEducation(text, sectionLines) {
    const details = [];
    const degree = text.match(/\b(B\.?\s?Tech|B\.?\s?E\.?|BCA|B\.?\s?Sc\.?|M\.?\s?Tech|MCA|M\.?\s?Sc\.?|MBA|Bachelor(?:'s)?|Master(?:'s)?|Ph\.?D\.?|Diploma)\b/i);
    const graduation = text.match(/\b(?:expected\s+)?(?:graduat(?:e|ion)|class\s+of|completion)\D{0,24}(20\d{2})\b/i);
    const cgpa = text.match(/\b(?:CGPA|GPA)\s*[:\-]?\s*(\d(?:\.\d{1,2})?\s*(?:\/\s*10|\/\s*4)?)\b/i);
    if (degree) details.push(`Degree detected: ${degree[0]}`);
    if (graduation) details.push(`Graduation year detected: ${graduation[1]}`);
    if (cgpa) details.push(`GPA/CGPA detected: ${cgpa[1]}`);
    const entries = getSectionEntries(sectionLines, 4);
    return { details, entries };
  }

  function analyzeWritingStyle(text) {
    const signals = [];
    const genericPhrases = [
      "results-driven", "detail-oriented", "team player", "hard-working", "highly motivated",
      "proven track record", "passionate professional", "excellent communication skills", "responsible for"
    ];
    const lower = text.toLowerCase();
    const genericHits = genericPhrases.filter((phrase) => lower.includes(phrase));
    if (genericHits.length) {
      signals.push(`Generic resume phrases found: ${genericHits.slice(0, 3).join(", ")}. Consider replacing them with specific actions and outcomes.`);
    }

    const words = lower.match(/\b[a-z][a-z'-]*\b/g) || [];
    const phraseCounts = new Map();
    for (let index = 0; index <= words.length - 4; index++) {
      const phrase = words.slice(index, index + 4).join(" ");
      if (!/^(?:the|and|with|from|that|this)\b/.test(phrase)) phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
    }
    const repeatedPhrase = [...phraseCounts.entries()].find(([, count]) => count >= 2);
    if (repeatedPhrase) signals.push(`Repeated wording detected: “${repeatedPhrase[0]}”. Check whether the repetition is intentional.`);

    const sentences = (text.match(/[^.!?\n]+[.!?]?/g) || []).map((part) => (part.match(/\b\w+\b/g) || []).length).filter((size) => size >= 4);
    if (sentences.length >= 6) {
      const mean = sentences.reduce((sum, size) => sum + size, 0) / sentences.length;
      const variance = sentences.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / sentences.length;
      if (mean && Math.sqrt(variance) / mean < 0.18) signals.push("Many sentences have a similar length. Varying sentence structure may make the writing easier to scan.");
    }
    return signals;
  }

  function calculateCompleteness(text, sections, education) {
    const checks = [
      { label: "Contact details", weight: 15, complete: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || /(?:\+?\d[\d\s().-]{7,}\d)/.test(text) },
      { label: "Education", weight: 20, complete: sections.education.length > 0 || education.details.length > 0 },
      { label: "Skills", weight: 15, complete: detectSkills(text).length > 0 || sections.skills.length > 0 },
      { label: "Projects", weight: 15, complete: sections.projects.length > 0 },
      { label: "Experience", weight: 15, complete: sections.experience.length > 0 },
      { label: "Summary or objective", weight: 10, complete: sections.summary.length > 0 },
      { label: "Portfolio or professional link", weight: 10, complete: /linkedin\.com|github\.com|portfolio|behance\.net/i.test(text) }
    ];
    return { score: checks.reduce((sum, check) => sum + (check.complete ? check.weight : 0), 0), checks };
  }

  function renderList(containerId, entries, fallback) {
    const container = document.getElementById(containerId);
    if (!entries.length) {
      container.innerHTML = `<p class="resume-section-empty">${App.escapeHtml(fallback)}</p>`;
      return;
    }
    container.innerHTML = `<ul class="resume-list">${entries.map((entry) => `<li>${App.escapeHtml(entry)}</li>`).join("")}</ul>`;
  }

  function renderOpportunityCard(internship) {
    const saved = user && Store.isSaved(user.email, internship.id);
    const match = internship.match;
    const matched = match.matchedSkills.length ? match.matchedSkills.join(", ") : "No direct skill overlap yet";
    const missing = match.missingSkills.length ? match.missingSkills.join(", ") : "No listed skill gaps";
    return `
      <article class="int-card">
        <div class="int-card__top"><div>
          <h3 class="int-card__title">${App.escapeHtml(internship.title)}</h3>
          <p class="int-card__org">${App.escapeHtml(internship.org)} &middot; ${App.escapeHtml(internship.location)}</p>
        </div><span class="resume-match-score">${match.score}% match</span></div>
        <div class="int-card__meta"><span class="pill">${App.escapeHtml(internship.sector)}</span><span class="pill pill--muted">${App.escapeHtml(internship.duration)}</span></div>
        <p class="resume-match-reasons"><strong>Skills match:</strong> ${App.escapeHtml(matched)}<br><strong>Skills to build:</strong> ${App.escapeHtml(missing)}<br><strong>Fit:</strong> ${App.escapeHtml(match.explanation)}</p>
        <div class="int-card__footer"><span class="deadline">Apply by ${App.formatDate(internship.deadline)}</span><div style="display:flex;gap:8px;">
          ${user ? `<button class="btn btn--ghost btn--sm" data-save-id="${App.escapeHtml(internship.id)}" aria-pressed="${saved}">${saved ? "Saved ✓" : "Save"}</button>` : ""}
          <a class="btn btn--secondary btn--sm" href="internship-details.html?id=${encodeURIComponent(internship.id)}">View details</a>
        </div></div>
      </article>`;
  }

  function wireSaveButtons() {
    matchGrid.querySelectorAll("[data-save-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const isSaved = Store.toggleSaved(user.email, button.getAttribute("data-save-id"));
        button.textContent = isSaved ? "Saved ✓" : "Save";
        button.setAttribute("aria-pressed", String(isSaved));
        App.toast(isSaved ? "Saved to your list." : "Removed from saved.");
      });
    });
  }

  function renderProfileComparison(profile) {
    const profileSkills = (profile?.skills || []).filter(Boolean);
    const profileSet = new Set(profileSkills.map((skill) => skill.toLowerCase()));
    const already = foundSkills.filter((skill) => profileSet.has(skill.toLowerCase()));
    const missing = foundSkills.filter((skill) => !profileSet.has(skill.toLowerCase()));
    if (profile) {
      compareWrap.innerHTML = `<p><strong>Already on your profile:</strong> ${already.length ? App.escapeHtml(already.join(", ")) : "none yet"}</p><p><strong>Detected in PDF but not listed on your profile:</strong> ${missing.length ? App.escapeHtml(missing.join(", ")) : "none"}</p>`;
      addSkillsBtn.hidden = !missing.length;
      addSkillsBtn.onclick = () => {
        const updated = profileSkills.concat(missing);
        Store.saveProfile(user.email, { skills: updated });
        addSkillsStatus.textContent = `Added ${missing.length} skill${missing.length === 1 ? "" : "s"} to your profile.`;
        addSkillsBtn.hidden = true;
      };
    } else {
      compareWrap.innerHTML = `<p class="hint"><a href="login.html">Log in</a> to compare resume skills with your profile or save opportunities.</p>`;
      addSkillsBtn.hidden = true;
    }
  }

  function renderResults() {
    const { text, pageCount, sections, education, projects, experience, styleSignals, completeness } = extractedResume;
    resultsPanel.style.display = "";
    document.getElementById("resume-review-meta").textContent = `${pageCount} PDF page${pageCount === 1 ? "" : "s"} analyzed locally. ${adminShareCheckbox.checked ? "A browser-only CV copy is available to admin." : "The PDF is not saved after this review."}`;
    const targetInternship = getTargetInternship();
    const atsResult = ATSScore.score(text, pageCount, targetInternship);
    atsResult.customRole = !!targetInternship.isCustomRole;
    renderAtsResults(atsResult);
    foundSkillsWrap.innerHTML = foundSkills.length
      ? foundSkills.map((skill) => `<span class="resume-chip">${App.escapeHtml(skill)}</span>`).join("")
      : `<p class="resume-section-empty">No known skills were detected in the extracted text. Add a skills section or check whether this is a scanned PDF.</p>`;

    document.getElementById("completeness-value").textContent = `${completeness.score}%`;
    const progress = document.querySelector(".resume-progress");
    progress.setAttribute("aria-valuenow", String(completeness.score));
    document.getElementById("completeness-bar").style.width = `${completeness.score}%`;
    const missingChecks = completeness.checks.filter((check) => !check.complete).map((check) => check.label);
    document.getElementById("completeness-detail").textContent = missingChecks.length
      ? `Coverage checklist only — consider adding: ${missingChecks.join(", ")}. This is not a quality score.`
      : "Common resume sections were detected. This coverage score does not measure resume quality.";

    const educationDetails = education.details.concat(education.entries);
    renderList("education-summary", educationDetails, "No clear education section was detected.");
    renderList("projects-summary", projects, "No clear projects section was detected.");
    renderList("experience-summary", experience, "No clear experience section was detected.");
    const signalsContainer = document.getElementById("writing-signals");
    signalsContainer.innerHTML = styleSignals.length
      ? `<ul class="resume-list">${styleSignals.map((signal) => `<li>${App.escapeHtml(signal)}</li>`).join("")}</ul>`
      : `<p class="resume-section-empty">The simple scan found no listed wording patterns. This does not indicate whether AI was or was not used.</p>`;

    const profile = user ? Store.getProfile(user.email) : null;
    renderProfileComparison(profile);
    renderMatches(profile);
  }

  function renderAtsResults(result) {
    if (user) Store.writeBlob(`im_profile_ats_${user.email}`, { score: result.score, role: result.role, checkedAt: new Date().toISOString() });
    const breakdown = result.breakdown.map((item) => `<div class="ats-breakdown-item"><strong>${App.escapeHtml(item.label)}</strong><span>${Number(item.score)} / ${Number(item.max)}</span></div>`).join("");
    const skillChips = (items, empty) => items.length ? `<div class="resume-chips">${items.map((item) => `<span class="resume-chip">${App.escapeHtml(item)}</span>`).join("")}</div>` : `<p class="hint">${empty}</p>`;
    const roleScopeNote = result.customRole ? `<p class="hint ats-scope-note">This role is not in the demo catalogue. Skills are compared against requirements from available listings.</p>` : "";
    atsResults.innerHTML = `
      <h3>CV ATS readiness check</h3>
      <div class="ats-score-heading"><div class="ats-score-badge" role="img" aria-label="Estimated ATS readiness ${Number(result.score)} percent">${Number(result.score)}%</div><div><strong>Estimated ATS readiness</strong><p class="hint">Target role: ${App.escapeHtml(result.role)}</p></div></div>
      ${roleScopeNote}
      <div class="ats-breakdown">${breakdown}</div>
      <div class="ats-results-grid">
        <section><h4>Role skills found (${result.skills.matched.length})</h4>${skillChips(result.skills.matched, "No listed role skills were detected in readable PDF text.")}</section>
        <section><h4>Skills to consider (${result.skills.missing.length})</h4>${skillChips(result.skills.missing, "All listed role skills were detected.")}</section>
      </div>
      <section style="margin-top:14px;"><h4>Suggested improvements</h4><ul class="ats-tips">${result.advice.map((tip) => `<li>${App.escapeHtml(tip)}</li>`).join("")}</ul></section>
      <p class="hint" style="margin:13px 0 0;">This is a heuristic estimate, not an employer ATS result or a guarantee of shortlisting. The CV file and extracted text are discarded after analysis; this result stays on this page.</p>
    `;
  }

  atsRoleSelect.addEventListener("change", () => {
    updateRoleSelection();
    if (!extractedResume) return;
    const targetInternship = getTargetInternship();
    const atsResult = ATSScore.score(extractedResume.text, extractedResume.pageCount, targetInternship);
    atsResult.customRole = !!targetInternship.isCustomRole;
    renderAtsResults(atsResult);
  });
  atsOtherRoleInput.addEventListener("input", () => {
    if (!extractedResume || atsRoleSelect.value !== "other") return;
    const targetInternship = getTargetInternship();
    const atsResult = ATSScore.score(extractedResume.text, extractedResume.pageCount, targetInternship);
    atsResult.customRole = true;
    renderAtsResults(atsResult);
  });

  function renderMatches(profile) {
    const profileSkills = (profile?.skills || []).filter(Boolean);
    const combinedSkills = [...new Map([...profileSkills, ...foundSkills].map((skill) => [skill.toLowerCase(), skill])).values()];
    const hasRelevantProfileData = combinedSkills.length || (profile?.interests || []).length || profile?.preferredSector;
    if (!hasRelevantProfileData) {
      matchesPanel.style.display = "";
      matchGrid.innerHTML = `<p class="resume-section-empty">Add skills or career interests to your profile to see relevant opportunities.</p>`;
      return;
    }

    const matchProfile = {
      skills: combinedSkills,
      interests: profile?.interests || [],
      academicYear: profile?.academicYear || "",
      preferredSector: profile?.preferredSector || "",
      preferredLocation: profile?.preferredLocation || "",
      preferredDuration: profile?.preferredDuration || ""
    };
    const ranked = Recommendation.rankAll(matchProfile, allInternships).slice(0, 6);
    matchesPanel.style.display = "";
    matchGrid.innerHTML = ranked.length
      ? ranked.map(renderOpportunityCard).join("")
      : `<p class="resume-section-empty">No opportunities are listed in the catalogue right now.</p>`;
    wireSaveButtons();
  }

  analyzeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;
    errorEl.textContent = "";
    addSkillsStatus.textContent = "";
    loadingEl.style.display = "";
    resultsPanel.style.display = "none";
    matchesPanel.style.display = "none";
    analyzeBtn.disabled = true;
    try {
      if (!/\.pdf$/i.test(selectedFile.name) && selectedFile.type !== "application/pdf") throw new Error("NOT_PDF");
      if (selectedFile.size > 15 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");
      const extracted = await extractText(selectedFile);
      const text = extracted.text.trim();
      if (text.length < 40) throw new Error("NO_TEXT");
      if (adminShareCheckbox.checked && user) await saveSharedCV(selectedFile);
      const sections = splitSections(extracted.text);
      foundSkills = detectSkills(text);
      const education = analyzeEducation(text, sections.education);
      extractedResume = {
        text,
        pageCount: extracted.pageCount,
        sections,
        education,
        projects: getSectionEntries(sections.projects),
        experience: getSectionEntries(sections.experience),
        styleSignals: analyzeWritingStyle(text),
        completeness: calculateCompleteness(text, sections, education)
      };
      renderResults();
    } catch (error) {
      const messages = {
        PDF_READER_UNAVAILABLE: "PDF reader could not load. Check your connection and reload this page.",
        NOT_PDF: "Choose a PDF file to analyze.",
        FILE_TOO_LARGE: "This PDF is over 15 MB. Choose a smaller resume file and try again.",
        NO_TEXT: "No readable text was found. This may be a scanned PDF; export a text-based PDF and try again."
      };
      errorEl.textContent = messages[error.message] || "Couldn't read that PDF. Make sure it is a valid, text-based PDF and try again.";
    } finally {
      loadingEl.style.display = "none";
      analyzeBtn.disabled = !selectedFile;
    }
  });
});
