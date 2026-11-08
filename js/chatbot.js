/* js/chatbot.js — chatbot.html
   Keyword-matching rule-based assistant — clearly labeled as such in the
   UI, not a trained language model. Covers a broad set of FAQ-style
   intents (matching, applying, saving, tracking, eligibility, stipends,
   deadlines, sectors, locations, companies, other InternMatch features)
   plus a fallback keyword search across the local catalogue. No external
   API calls — everything is answered from data already in this browser. */

/* js/chatbot.js — chatbot.html
   Tries the optional AI backend (server/) first — a real provider-powered
   reply, grounded to the local catalogue by the server's system prompt.
   If that backend isn't running (most people won't have set it up), or a
   request to it fails, this transparently falls back to the built-in
   rule-based assistant below, which covers a broad set of FAQ-style
   intents plus a fallback keyword search across the local catalogue. No
   external API calls happen unless the AI backend is reachable, and the
   status line always tells the person honestly which one answered. */

document.addEventListener("DOMContentLoaded", () => {
  const windowEl = document.getElementById("chat-window");
  if (!windowEl) return;
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const suggestRow = document.getElementById("chat-suggestions");
  const statusEl = document.getElementById("ai-status");

  // Change this if you run the proxy on a different host/port, or set it
  // to null to always use the built-in rule-based assistant.
  const AI_BACKEND_URL = window.IM_API_BASE;

  let aiAvailable = false;
  const conversationHistory = [];

  function setStatus(on, text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("ai-status--on", on);
    statusEl.classList.toggle("ai-status--off", !on);
  }

  async function checkAiBackend() {
    if (!AI_BACKEND_URL) {
      setStatus(false, "Using the built-in rule-based assistant.");
      return;
    }
    try {
      const res = await fetch(`${AI_BACKEND_URL}/api/health`, { method: "GET" });
      const data = await res.json();
      aiAvailable = res.ok && !!data.keyConfigured;
      const providerName = data.provider ? data.provider.charAt(0).toUpperCase() + data.provider.slice(1) : "AI";
      setStatus(
        aiAvailable,
        aiAvailable
          ? `Connected to ${providerName} (${data.model || "AI model"}) — replies are grounded to this catalogue.`
          : res.ok
            ? "AI backend is running but has no API key configured — using the built-in rule-based assistant. See server/.env.example."
            : "AI backend not detected — using the built-in rule-based assistant. See server/README.md to enable it."
      );
    } catch (e) {
      aiAvailable = false;
      setStatus(false, "AI backend not detected — using the built-in rule-based assistant. See server/README.md to enable it.");
    }
  }

  async function askAiBackend(text, onChunk) {
    const res = await fetch(`${AI_BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: conversationHistory.slice(-6) })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Backend returned ${res.status}`);
    }
    if (res.headers.get("content-type")?.includes("text/event-stream") && res.body?.getReader) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      const consume = (events) => {
        for (const event of events) {
          const line = event.split(/\r?\n/).find((part) => part.startsWith("data:"));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.error) throw new Error(payload.error);
          if (payload.text) {
            reply += payload.text;
            onChunk?.(payload.text);
          }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        consume(events);
        if (done) break;
      }
      if (buffer.trim()) consume([buffer]);
      return reply.trim();
    }
    const data = await res.json();
    return data.reply;
  }

  const user = Store.getCurrentUser();
  const profile = user ? Store.getProfile(user.email) : null;
  const all = Store.getAllInternships();

  const ORG_NAMES = [...new Set(all.map((i) => i.org))];
  const LOCATIONS = [...new Set(all.map((i) => i.location))];
  const STOPWORDS = new Set(["the","a","an","is","are","was","were","what","which","who","how","do","does","did",
    "i","you","me","my","your","for","of","to","in","on","at","and","or","with","about","can","could","would",
    "should","will","want","need","tell","show","find","please","hi","hello","hey","there","this","that","it",
    "internship","internships","job","jobs"]);

  function addBubble(text, who) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble--${who === "ai" ? "bot ai" : who}`;
    bubble.textContent = text;
    windowEl.appendChild(bubble);
    windowEl.scrollTop = windowEl.scrollHeight;
    return bubble;
  }

  function findMentioned(list, text) {
    const lower = text.toLowerCase();
    return list.filter((term) => lower.includes(term.toLowerCase()));
  }

  function internshipsForSkills(skills) {
    if (!skills.length) return [];
    const lowerSkills = skills.map((s) => s.toLowerCase());
    return all
      .map((i) => ({ internship: i, overlap: (i.skills || []).filter((s) => lowerSkills.includes(s.toLowerCase())).length }))
      .filter((r) => r.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map((r) => r.internship);
  }

  function internshipsForSector(sector) {
    return all.filter((i) => i.sector.toLowerCase() === sector.toLowerCase()).slice(0, 3);
  }

  function internshipsForOrg(org) {
    return all.filter((i) => i.org.toLowerCase() === org.toLowerCase());
  }

  function internshipsForLocation(loc) {
    if (loc.toLowerCase() === "remote") return all.filter((i) => i.locationType.toLowerCase() === "remote");
    return all.filter((i) => i.location.toLowerCase() === loc.toLowerCase());
  }

  function parseStipend(str) {
    if (!str) return null;
    const digits = str.replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : null;
  }

  function formatInternshipList(list) {
    return list.map((i) => `• ${i.title} at ${i.org} (${i.location}) — apply by ${App.formatDate(i.deadline)}`).join("\n");
  }

  // ---------- Ordered intent handlers: first match wins ----------

  const INTENTS = [
    {
      test: (lo) => /(match score|how.*(score|match).*(work|calculat)|explain.*match)/.test(lo),
      handle: () => "Your match score is a weighted formula, not a trained AI model: skills 40%, interests 25%, academic eligibility 15%, sector preference 10%, and location/duration fit 10%. You can see the exact breakdown on any internship's detail page."
    },
    {
      test: (lo) => /(what.*(should|to).*learn|skill.*(next|gap|missing))/.test(lo),
      handle: () => {
        if (!profile || !profile.skills.length) {
          return "Add a few skills to your profile first, then I can tell you which missing skills show up most often across the catalogue. You can also check the Skill development page for a ranked roadmap.";
        }
        const ranked = Recommendation.rankAll(profile, all).slice(0, 8);
        const freq = {};
        ranked.forEach((i) => (i.match.missingSkills || []).forEach((s) => (freq[s] = (freq[s] || 0) + 1)));
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => s);
        return top.length
          ? `Based on your top matches, the skills worth learning next are: ${top.join(", ")}. Check the Skill development page for a full roadmap.`
          : "You're already covering the skills asked for across your best-matching internships — nice work.";
      }
    },
    {
      test: (lo) => /(are you (a )?(real )?(ai|human|bot|chatgpt|robot)|real ai|trained (ai|model)|language model)/.test(lo),
      handle: () => "I'm a rule-based demo assistant — I match keywords in your message against a fixed set of rules and this browser's local catalogue. I'm not a trained AI language model, and I don't send anything to an external API."
    },
    {
      test: (lo) => /(real (internship|compan|vacanc|job)|actual (internship|compan)|is this real|fake|genuine)/.test(lo),
      handle: () => "Every internship in this catalogue is fictional sample data, created for this demo prototype — not live or official listings. Nothing here should be treated as a real vacancy."
    },
    {
      test: (lo) => /(how (do|can) i apply|how to apply|apply.*(internship|process)|application process)/.test(lo),
      handle: () => "To apply: open an internship's detail page (from Browse internships or Recommendations) and click \"Apply now.\" It's saved to your Applications page immediately, where you can track its status."
    },
    {
      test: (lo) => /(how (do|can) i save|how to save|save.*(internship|list)|bookmark)/.test(lo),
      handle: () => "Click \"Save\" (or the bookmark icon) on any internship card or its detail page. Saved internships collect on the Saved page, and you can remove them the same way."
    },
    {
      test: (lo) => /(withdraw|cancel.*application)/.test(lo),
      handle: () => "On the Applications page, each active application has a \"Withdraw\" button. It asks for confirmation, then marks the application as Withdrawn — this can't be undone."
    },
    {
      test: (lo) => /(application status|track.*application|my applications|where.*application)/.test(lo),
      handle: () => {
        if (!user) return "Log in to track applications — once you have, this page (and the dashboard) will show live counts by status.";
        const apps = Store.getApplications(user.email);
        if (!apps.length) return "You haven't applied to anything yet. Browse internships or check your Recommendations to get started.";
        const counts = {};
        apps.forEach((a) => (counts[a.status] = (counts[a.status] || 0) + 1));
        const summary = Object.entries(counts).map(([s, c]) => `${c} ${s}`).join(", ");
        return `You have ${apps.length} application${apps.length === 1 ? "" : "s"}: ${summary}. See the Applications page for details.`;
      }
    },
    {
      test: (lo) => /(compare)/.test(lo),
      handle: () => "Use the Compare page — search for up to 3 internships and see them side by side: skills, location, duration, stipend, and your skill-overlap percentage for each."
    },
    {
      test: (lo) => /(resume|cv)\b/.test(lo),
      handle: () => "The Resume analyzer page reads a PDF resume entirely in your browser, matches its text against a known skills list, compares that to your profile, and can add any missing skills for you. Nothing is uploaded anywhere."
    },
    {
      test: (lo) => /(interview|hr question|behavioral)/.test(lo),
      handle: () => "Interview prep has scored multiple-choice quizzes for Python, Java, SQL, Cloud, and AI, plus open-ended HR/behavioral practice with model-answer tips. Your practice history is saved there too."
    },
    {
      test: (lo) => /(edit|update|change).*(profile)|my profile/.test(lo),
      handle: () => "Go to My profile to update your academic details, skills, interests, and preferences — your match scores recalculate immediately from whatever you save there."
    },
    {
      test: (lo) => /(eligib)/.test(lo),
      handle: () => "Eligibility is 15% of your match score: full credit if your academic year meets an internship's stated minimum, partial credit if you're one year short, and none otherwise. It's a fit signal only — not a guarantee, since it can't verify documents or competition from other applicants."
    },
    {
      test: (lo) => /(stipend|pay|salary|highest paying|best paid)/.test(lo),
      handle: () => {
        const withStipend = all
          .map((i) => ({ i, val: parseStipend(i.stipend) }))
          .filter((r) => r.val !== null)
          .sort((a, b) => b.val - a.val)
          .slice(0, 3)
          .map((r) => r.i);
        return withStipend.length
          ? `Highest listed stipends right now:\n${formatInternshipList(withStipend)}`
          : "None of the current listings have a stipend figure attached.";
      }
    },
    {
      test: (lo) => /(deadline|due soon|closing soon|last date)/.test(lo),
      handle: () => {
        const soonest = all
          .filter((i) => App.daysUntil(i.deadline) >= 0)
          .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
          .slice(0, 3);
        return soonest.length
          ? `Closing soonest:\n${formatInternshipList(soonest)}`
          : "I couldn't find any upcoming deadlines in the catalogue right now.";
      }
    },
    {
      test: (lo) => /(what sectors|which sectors|list.*sector|sectors (are )?available)/.test(lo),
      handle: () => `The catalogue currently covers: ${[...new Set(all.map((i) => i.sector))].sort().join(", ")}.`
    },
    {
      test: (lo) => /(how many internship|number of internship|how many listing)/.test(lo),
      handle: () => {
        const bySector = {};
        all.forEach((i) => (bySector[i.sector] = (bySector[i.sector] || 0) + 1));
        const top = Object.entries(bySector).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s} (${c})`).join(", ");
        return `There are ${all.length} internships in the demo catalogue right now. Best represented sectors: ${top}.`;
      }
    },
    {
      test: (lo) => /(remote)/.test(lo),
      handle: () => {
        const remote = internshipsForLocation("remote").slice(0, 4);
        return remote.length ? `Remote listings:\n${formatInternshipList(remote)}` : "There aren't any remote listings right now.";
      }
    },
    {
      test: (lo) => /help|what can you do|capabilities|options/.test(lo),
      handle: () => "I can point you to internships by skill, sector, company, or location; explain match scores and eligibility; surface the highest stipends or soonest deadlines; and explain how to apply, save, withdraw, compare, upload a resume, or practice interviews. Just ask in plain language."
    },
    {
      test: (lo) => /(thank|thanks|thx)/.test(lo),
      handle: () => "You're welcome — good luck with the search!"
    },
    {
      test: (lo) => /(bye|goodbye|see you)/.test(lo),
      handle: () => "Good luck out there — come back anytime you want another look at your matches."
    },
    {
      test: (lo) => /(hi|hello|hey)\b/.test(lo),
      handle: () => "Hi! Ask me about a skill, sector, company, location, stipend, deadline, or how any part of InternMatch works."
    }
  ];

  function fallbackCatalogueSearch(text) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    if (!words.length) return null;
    const scored = all.map((i) => {
      const haystack = `${i.title} ${i.org} ${i.description} ${i.skills.join(" ")}`.toLowerCase();
      const score = words.filter((w) => haystack.includes(w)).length;
      return { i, score };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    if (!scored.length) return null;
    return `Here's what I found related to that:\n${formatInternshipList(scored.map((r) => r.i))}`;
  }

  function reply(text) {
    const lower = text.toLowerCase();

    for (const intent of INTENTS) {
      if (intent.test(lower)) return intent.handle();
    }

    const mentionedOrg = ORG_NAMES.find((org) => lower.includes(org.toLowerCase()));
    if (mentionedOrg) {
      const matches = internshipsForOrg(mentionedOrg);
      return matches.length
        ? `${mentionedOrg} has these listings:\n${formatInternshipList(matches)}`
        : `I don't see any current listings from ${mentionedOrg}.`;
    }

    const mentionedLocation = LOCATIONS.find((loc) => lower.includes(loc.toLowerCase()));
    if (mentionedLocation) {
      const matches = internshipsForLocation(mentionedLocation).slice(0, 4);
      return matches.length
        ? `In ${mentionedLocation} right now:\n${formatInternshipList(matches)}`
        : `Nothing in ${mentionedLocation} in the current catalogue.`;
    }

    const durationMatch = lower.match(/\b(\d{1,2})\s*(?:-)?\s*month/);
    if (durationMatch) {
      const months = parseInt(durationMatch[1], 10);
      const matches = all.filter((i) => i.durationMonths === months).slice(0, 4);
      return matches.length
        ? `${months}-month internships:\n${formatInternshipList(matches)}`
        : `I don't see any ${months}-month listings right now — try 3, 4, or 6 months.`;
    }

    const mentionedSkills = findMentioned(SKILLS_VOCABULARY, text);
    if (mentionedSkills.length) {
      const matches = internshipsForSkills(mentionedSkills);
      return matches.length
        ? `Based on ${mentionedSkills.join(", ")}, here are internships worth a look:\n${formatInternshipList(matches)}`
        : `I recognized ${mentionedSkills.join(", ")}, but couldn't find a current listing asking for those skills. Try browsing the full catalogue instead.`;
    }

    const mentionedSectors = findMentioned(SECTOR_VOCABULARY, text);
    if (mentionedSectors.length) {
      const matches = internshipsForSector(mentionedSectors[0]);
      return matches.length
        ? `Here's what's open in ${mentionedSectors[0]} right now:\n${formatInternshipList(matches)}`
        : `There aren't any ${mentionedSectors[0]} listings in the demo catalogue right now.`;
    }

    const fallback = fallbackCatalogueSearch(text);
    if (fallback) return fallback;

    return "I couldn't match that to anything specific. I can help with: a skill, sector, company, or location; match scores and eligibility; stipends or deadlines; or how to apply, save, compare, upload a resume, or practice interviews.";
  }

  const SUGGESTIONS = [
    "How is my match score calculated?",
    "What skills should I learn next?",
    "How do I apply?",
    "Which internships have the highest stipend?"
  ];
  suggestRow.innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="btn btn--ghost btn--sm" data-suggest="${App.escapeHtml(s)}">${App.escapeHtml(s)}</button>`).join("");

  async function handleUserMessage(text) {
    addBubble(text, "user");
    if (aiAvailable) {
      let streamedBubble;
      try {
        streamedBubble = addBubble("Thinking…", "ai");
        const aiReply = await askAiBackend(text, (chunk) => {
          if (streamedBubble.textContent === "Thinking…") streamedBubble.textContent = "";
          streamedBubble.textContent += chunk;
          windowEl.scrollTop = windowEl.scrollHeight;
        });
        conversationHistory.push({ role: "user", text });
        conversationHistory.push({ role: "assistant", text: aiReply });
        if (!aiReply && streamedBubble) streamedBubble.textContent = "I couldn't generate a reply for that — try rephrasing.";
        return;
      } catch (e) {
        streamedBubble?.remove();
        aiAvailable = false;
        setStatus(false, "Lost the AI backend mid-conversation — switched to the built-in rule-based assistant.");
      }
    }
    setTimeout(() => addBubble(reply(text), "bot"), 200);
  }

  suggestRow.querySelectorAll("[data-suggest]").forEach((btn) => {
    btn.addEventListener("click", () => handleUserMessage(btn.getAttribute("data-suggest")));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    handleUserMessage(text);
  });

  addBubble("Hi! I'm the InternMatch career assistant. Ask me about a skill, sector, company, deadline, stipend, or how any part of the site works.", "bot");
  checkAiBackend();
});
