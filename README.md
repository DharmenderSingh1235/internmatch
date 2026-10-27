# InternMatch — AI-Based Internship Recommendation Engine for PM Internship Scheme

A frontend web application prototype that matches student profiles to internship
listings using a transparent, rule-based scoring algorithm. Built with plain
HTML, CSS, and JavaScript (no build step), with all data persisted in the
browser via `localStorage`.

> **Important note on data:** every internship listed in this project is
> **fictional sample data** created for demonstration purposes. This prototype
> is not affiliated with, and does not pull live data from, the official PM
> Internship Scheme. Do not present the sample listings as real vacancies.

> **Important note on the "AI" in the name:** the recommendation engine is a
> **rule-based, weighted-scoring prototype**, not a trained machine learning
> model. Every score is fully explainable from the formula in
> `js/recommendation.js`.

---

## 1. Project Abstract

Students searching for internships under large national schemes are often
faced with long, unfiltered lists of opportunities and no way to tell which
ones genuinely fit their skills and goals. InternMatch addresses this by
asking students to build a structured profile (skills, interests, academic
standing, and preferences) and then scoring every internship in the catalogue
against that profile using a transparent, weighted formula. The result is a
ranked, explainable shortlist, along with tools to save internships, track
applications, and close identified skill gaps.

## 2. Problem Statement

Manually comparing dozens of internship listings against one's own skills,
academic eligibility, and preferences is slow and error-prone. Students often
apply to internships they are not eligible for, or miss ones that are a
strong fit simply because the requirements were not clearly compared against
their profile. There is no lightweight tool that gives students an
explainable, numeric sense of "how well do I fit this internship" before they
invest time in an application.

## 3. Objectives

- Let students build a structured profile of skills, interests, and academic details.
- Score every internship against that profile using a transparent, weighted formula.
- Explain each match score in plain language (matched skills, missing skills).
- Let students save internships and track applications through a status pipeline.
- Surface a personalized skill-development roadmap based on real gaps in the catalogue.
- Provide a lightweight admin view for managing the sample internship catalogue.

## 4. Scope

**In scope:** student registration/login (demo), profile management, a
searchable/filterable internship catalogue, a rule-based recommendation
engine, a dashboard with charts, saved internships, application tracking, a
skill-development roadmap, and an optional admin panel — all running entirely
client-side against sample data.

**Out of scope:** integration with the real/official PM Internship Scheme
data or APIs, real authentication and password security, a production
database or backend, resume parsing, and any automated communication with
employers. The project structure is deliberately designed so a real backend
and verified data source could be substituted later (see Section 12).

## 5. Proposed System

InternMatch is a static, multi-page frontend application. Each page focuses
on one task (profile, catalogue, recommendations, applications, etc.) and
shares a common CSS design system and a small set of JavaScript modules. All
state — user accounts, profiles, saved internships, and applications — is
stored in the browser's `localStorage`, keyed per user email, so the app is
fully functional without a server while remaining structured enough to swap
in a real backend later.

## 6. System Architecture

```
Browser (client-only)
├── HTML pages (one per feature)
├── css/            → shared design system (tokens, components, layout, responsive)
├── data/            → sample internship dataset (INTERNSHIP_DATA)
├── js/storage.js    → localStorage persistence layer (users, profiles, saved, applications)
├── js/recommendation.js → rule-based weighted matching engine
├── js/app.js        → cross-cutting UI behaviour (nav, auth guard, toasts, formatting)
└── js/*.js          → one controller script per page (auth, profile, internships, …)
```

No server is required to run or demo the project. A future version could
replace `storage.js`'s localStorage calls with `fetch()` calls to a real
backend (Flask or Node.js) without changing any other module, since all
other code depends only on the `Store` interface.

### Company recruitment preview

The **Company portal (demo)** now includes a candidate search and recommended-student view backed by the optional local Node API. Start it using [server/README.md](server/README.md). Candidate profiles are fictional and are not connected to student profiles stored in visitors' browsers. The ranking is an explainable criteria score, not a trained AI hiring model. Real recruitment requires verified company authentication, a persistent database, and explicit student consent.

## 7. Use-Case Description

| Actor | Use case | Summary |
|---|---|---|
| Student | Register / Log in | Create a demo account or use the one-click demo login. |
| Student | Build profile | Enter academic details, skills, interests, and preferences. |
| Student | Browse & filter internships | Search the catalogue by sector, location, duration, skill. |
| Student | View match explanation | See a 0–100 score with a breakdown by weighted component. |
| Student | Save internship | Bookmark listings for later without applying. |
| Student | Apply to internship | Submit a demo application and track its status. |
| Student | Withdraw application | Cancel a pending application with confirmation. |
| Student | View skill roadmap | See the most commonly missing skills and demo learning resources. |
| Admin | Manage catalogue | Add, edit, or delete internship listings. |
| Admin | View student activity | See registered demo accounts and their application counts. |

## 8. Database Design

No database is used; this is a frontend-only prototype. The equivalent
"schema" is the shape of the objects stored in `localStorage`:

- `im_users`: `[{ name, email, passwordDemo, college, createdOn }]`
- `im_profile_<email>`: `{ fullName, college, degree, course, academicYear, graduationYear, cgpa, mobileNumber, skills[], interests[], preferredSector, preferredLocation, preferredDuration, resumeFileName }`
- `im_saved_<email>`: `[internshipId, …]`
- `im_applications_<email>`: `[{ internshipId, appliedOn, status, history[] }]`
- `im_skillprogress_<email>`: `{ [skillName]: boolean }`
- `im_admin_internships`: `{ added[], edited: { [id]: patch }, deleted[] }`

If a real backend were added, each of these keys maps naturally onto a table
(`users`, `profiles`, `saved_internships`, `applications`, `internships`).

## 9. Recommendation Algorithm Explanation

For a given student profile and internship, the match score is a weighted
sum of five components, each normalized to 0–1 before weighting:

| Component | Weight | How it's computed |
|---|---|---|
| Skills match | 40% | Fraction of the internship's required skills present in the student's skill list. |
| Interest match | 25% | Fraction of the internship's tagged interests present in the student's interests. |
| Academic eligibility | 15% | Full credit if the student's academic year meets the internship's minimum; partial credit if exactly one year short. |
| Sector preference | 10% | Full credit if the student's preferred sector matches the internship's sector. |
| Location & duration fit | 10% | Blend of location-preference match and how close the internship's duration is to the student's preferred duration. |

`score = round(100 × (0.40·skills + 0.25·interest + 0.15·eligibility + 0.10·sector + 0.10·logistics))`

The engine also returns the specific matched and missing skills and a
plain-language explanation sentence, so the score is never a black box. See
`js/recommendation.js` for the full implementation. A high score reflects fit
with the listed criteria only — it is **not** a guarantee of eligibility or
selection, which is why eligibility text is always shown separately.

## 10. Testing Table

| # | Test case | Steps | Expected result | Status |
|---|---|---|---|---|
| 1 | Registration validation | Submit register form with mismatched passwords | Inline error shown, form not submitted | Pass |
| 2 | Duplicate account | Register twice with the same email | Second attempt shows "account already exists" | Pass |
| 3 | Demo login | Click "Continue with demo student account" on login page | Redirects to dashboard with a pre-filled profile | Pass |
| 4 | Auth guard | Visit `dashboard.html` while logged out | Redirects to `login.html?next=dashboard.html` | Pass |
| 5 | Profile completion | Fill in profile fields one by one | Completion bar increases live | Pass |
| 6 | Catalogue search | Type a skill name into the search box | Grid filters to matching internships only | Pass |
| 7 | Catalogue filters | Select a sector filter | Only that sector's internships remain, count updates | Pass |
| 8 | Match score display | Log in, open an internship's detail page | Score, breakdown bars, and explanation render | Pass |
| 9 | Save / unsave | Click "Save" on a card, then again | Button toggles between "Save" and "Saved ✓" and persists on refresh | Pass |
| 10 | Apply flow | Apply to an internship, then try again | Second attempt blocked with "already applied" message | Pass |
| 11 | Withdraw application | Withdraw an application, confirm dialog | Status changes to "Withdrawn", button hidden thereafter | Pass |
| 12 | Skill roadmap | Check a skill checkbox on the skills page | Item shows strikethrough and persists on refresh | Pass |
| 13 | Admin gate | Enter wrong passcode, then correct passcode | Error shown, then panel unlocks with `admin123` | Pass |
| 14 | Admin CRUD | Add, edit, then delete a sample internship | Catalogue reflects each change immediately | Pass |
| 15 | Responsive layout | Resize to a mobile width | Sidebar collapses behind a toggle button, cards stack to one column | Pass |
| 16 | Data persistence | Refresh the page after applying/saving | All state still present (localStorage-backed) | Pass |

## 11. Limitations

- Authentication is a frontend demo only: passwords are stored with simple
  obfuscation (not real hashing), and there is no server-side verification.
- All data lives in a single browser's `localStorage`; it does not sync
  across devices and is lost if site data is cleared.
- The internship dataset is static sample data, not a live feed.
- The recommendation engine is intentionally simple and rule-based; it does
  not use natural-language understanding of free-text resumes or descriptions.
- The admin panel's passcode gate is for demonstration only and is not secure.

## 12. Future Enhancements

- Replace `js/storage.js`'s localStorage calls with real API calls to a
  Flask/Node.js backend and a proper database, without touching other modules.
- Integrate verified, authorized PM Internship Scheme data or an official API.
- Add resume parsing to auto-populate skills from an uploaded PDF/DOCX.
- Add real authentication (hashed passwords, sessions/JWT, email verification).
- Expand the matching engine with optional ML-based re-ranking once real
  historical application/outcome data is available.

## 13. Installation & Execution Instructions

> **Optional AI chatbot backend:** the Career chatbot page can use OpenAI,
> Google Gemini, or Anthropic Claude instead of its built-in rule-based
> assistant, via a small Express proxy in `server/` that keeps the API key off the client. This
> is entirely optional — without it, the chatbot works exactly as
> described below. See `server/README.md` for setup.

**Requirements:** any modern browser; VS Code with the "Live Server"
extension is recommended (no Node.js or build tools required).

1. Unzip the project and open the `internmatch` folder in VS Code.
2. Install the "Live Server" extension if you don't already have it.
3. Right-click `index.html` → **Open with Live Server**.
4. The app opens at a local address like `http://127.0.0.1:5500/index.html`.
5. Click **Continue with demo student account** on the login page for the
   fastest way to explore the app with a pre-filled profile, or register a
   new account from scratch.
6. To try the admin panel, open `admin.html` and enter the demo passcode
   `admin123`.

No backend setup is required for this prototype; if a backend is added later,
document its setup separately (e.g., a `server/README.md`).

## 14. Viva Questions & Answers

**Q: Is this using a real AI model?**
A: No. The "recommendation engine" is a transparent, rule-based weighted
formula (see Section 9), not a trained machine learning model. This is
stated explicitly in the UI and documentation so the scope isn't
overstated.

**Q: Where does the internship data come from?**
A: It's fictional sample data defined in `data/internships.js`, created for
this demonstration. It's structured so it could later be replaced by
verified official data or an authorized API.

**Q: How is the match score calculated?**
A: A weighted sum of five components — skills (40%), interests (25%),
academic eligibility (15%), sector preference (10%), and location/duration
fit (10%) — each normalized to a 0–1 scale before weighting. See
`js/recommendation.js`.

**Q: Is user data secure?**
A: This is a frontend-only demo. Passwords are obfuscated, not securely
hashed, and everything is stored in the browser's localStorage rather than
a real database. This is explicitly called out as a limitation.

**Q: What happens if I clear my browser data?**
A: All accounts, profiles, saved internships, and applications are lost,
since there is no backend database in this prototype.

**Q: How would you turn this into a production system?**
A: Swap the `Store` module's localStorage calls for API calls to a real
backend and database, add proper authentication, and connect to a verified
internship data source — without needing to change the rest of the app,
since every page only depends on the `Store` interface.

**Q: Why is a high match score not a guarantee of selection?**
A: The score only reflects fit against the criteria the algorithm can see
(skills, interests, stated eligibility, preferences). It cannot verify
actual eligibility documents, competition from other applicants, or
employer-specific selection criteria — which is why eligibility text is
always shown separately from the score.

## 15. Presentation Outline

1. Problem statement and motivation (30s)
2. Live demo: register/demo login → profile → catalogue → match explanation (2–3 min)
3. Dashboard walkthrough: stats, chart, recent activity (1 min)
4. Application tracking and skill roadmap (1 min)
5. Recommendation algorithm explanation, with the weight table on screen (1 min)
6. Architecture diagram and data model (1 min)
7. Limitations and future enhancements (30s)
8. Q&A

---

## Project Structure

```
internmatch/
  index.html
  login.html
  register.html
  dashboard.html
  profile.html
  internships.html
  internship-details.html
  recommendations.html
  applications.html
  saved.html
  skills.html
  admin.html
  css/
    style.css
    dashboard.css
    responsive.css
  js/
    app.js
    auth.js
    profile.js
    internships.js
    recommendation.js
    recommendation-page.js
    applications.js
    saved.js
    skills.js
    admin.js
    storage.js
    dashboard.js
  data/
    internships.js
  README.md
```

## Recommended Project Title

**InternMatch: A Rule-Based Internship Recommendation Prototype for the PM Internship Scheme**
