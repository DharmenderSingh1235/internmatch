/* Transparent role-specific ATS readiness estimate; never a hiring decision. */
window.ATSScore = {
  score(text, pageCount, internship) {
    const normalized = text.toLowerCase();
    const roleSkills = internship.skills || [];
    const vocabulary = typeof SKILLS_VOCABULARY !== "undefined" ? SKILLS_VOCABULARY : roleSkills;
    const detected = vocabulary.filter((skill) => {
      const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(normalized);
    });
    const matched = roleSkills.filter((skill) => detected.some((found) => found.toLowerCase() === skill.toLowerCase()));
    const missing = roleSkills.filter((skill) => !matched.some((found) => found.toLowerCase() === skill.toLowerCase()));
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const hasSection = (names) => lines.some((line) => new RegExp(`^(?:${names})(?:\\s*[:\\-–—])?$`, "i").test(line.replace(/[•▪]/g, "").trim()));
    const sections = [
      ["Summary", hasSection("summary|professional summary|profile|objective|career objective")],
      ["Education", hasSection("education|academic background")],
      ["Skills", hasSection("skills|technical skills|core competencies")],
      ["Projects", hasSection("projects|project experience")],
      ["Experience", hasSection("experience|work experience|internships?|employment")]
    ];
    const sectionScore = sections.filter(([, found]) => found).length * 5;
    const wordCount = (text.match(/\b[\w'-]+\b/g) || []).length;
    const hasMetrics = /\b\d+(?:\.\d+)?\s*(?:%|percent|users|customers|projects|hours|days|weeks|months|years|₹|\$)?\b/i.test(text);
    const actionVerbs = /\b(built|created|developed|designed|implemented|improved|increased|reduced|analyzed|automated|led|managed|delivered|launched|tested|optimized|researched|organized)\b/i.test(text);
    const evidenceScore = (hasMetrics ? 10 : 0) + (actionVerbs ? 10 : 0);
    const hasEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);
    const hasPhone = /(?:\+?\d[\d\s().-]{7,}\d)/.test(text);
    const hasLink = /linkedin\.com|github\.com|portfolio|behance\.net/i.test(text);
    const contactScore = (hasEmail ? 4 : 0) + (hasPhone ? 3 : 0) + (hasLink ? 3 : 0);
    const hasPageCount = Number.isFinite(pageCount);
    const parseScore = (wordCount >= 250 ? 6 : wordCount >= 100 ? 3 : 0) + (hasPageCount ? (pageCount <= 2 ? 4 : pageCount <= 3 ? 2 : 0) : 0);
    const keywordScore = roleSkills.length ? Math.round(matched.length / roleSkills.length * 35) : 0;
    const breakdown = [
      { label: "Role keyword match", score: keywordScore, max: 35 },
      { label: "Standard sections", score: sectionScore, max: 25 },
      { label: "Action & measurable evidence", score: evidenceScore, max: 20 },
      { label: "Contact & profile links", score: contactScore, max: 10 },
      { label: "Readable text & length", score: parseScore, max: 10 }
    ];
    const advice = [];
    if (missing.length) advice.push(`If accurate, include relevant examples of: ${missing.join(", ")}.`);
    if (sectionScore < 25) advice.push("Use clear headings for Summary, Education, Skills, Projects, and Experience where relevant.");
    if (!hasMetrics) advice.push("Add specific outcomes or numbers to project and experience bullets when you can support them.");
    if (!hasEmail || !hasPhone) advice.push("Make sure your CV includes a professional email address and a reachable phone number.");
    if (!hasLink) advice.push("Add a relevant LinkedIn, GitHub, or portfolio link if you have one.");
    if (wordCount < 100) advice.push("The extracted text is short; check that the PDF contains selectable text and all pages were exported.");
    if (!advice.length) advice.push("Review the role requirements and keep your strongest, most relevant evidence easy to find.");
    return { score: breakdown.reduce((sum, item) => sum + item.score, 0), role: internship.title, breakdown, skills: { matched, missing }, advice };
  }
};
