# What's new in this folder

Six features added to InternMatch on top of your original prototype:

## 1. Resume Analyzer (`resume-analyzer.html`, `js/resume-analyzer.js`)
Upload a PDF, extract text client-side with pdf.js, keyword-match against `js/skills-vocabulary.js`,
compare to the student's saved profile, offer to add missing skills, and surface catalogue
internships that fit.

## 2. Internship Comparison (`compare.html`, `js/compare.js`)
Search and add up to 3 internships, view them side by side: org, sector, location, duration,
deadline, stipend, required skills, and a skill-overlap % against the student's profile.

## 3. Deadline Calendar (`calendar.html`, `js/calendar.js`)
Month-view calendar with dots on days that have a tracked internship's deadline. Auto-seeds
from the student's saved internships and existing applications on first visit; students can
add more via search and mark each as Planned / Applied / Completed. Also lists upcoming
deadlines sorted by days remaining.
Storage: `im_calendar_<email>` → `{ [internshipId]: { status } }`.

## 4. Interview Preparation Center (`interview-prep.html`, `js/interview-prep.js`,
`js/interview-questions.js`)
Scored multiple-choice quizzes for Python, Java, SQL, Cloud, and AI (5 questions each, in
`js/interview-questions.js` — easy to extend). HR/behavioral is open-ended: student types an
answer, then reveals a model-answer tip. Practice history (score + date) is saved and shown
below.
Storage: `im_interview_history_<email>` → array of `{ category, type, score, total, date }`.

## 5. Admin Analytics + Export Reports (patched into `admin.html`, new `js/admin-analytics.js`)
Added an "Analytics" panel to the bottom of the existing admin dashboard: most popular sector,
most requested skill, average applications per student, and three Chart.js bar charts
(applications by sector, applications by status, most requested skills across the catalogue).
Also two CSV export buttons (students, applications) that generate the file entirely
client-side (no backend). This reads applications across **all** demo users by looping
`im_users` and each user's `im_applications_<email>` — see the integration caveat below if
your real storage layer works differently.

## 6. Career Guidance Chatbot (`chatbot.html`, `js/chatbot.js`)
Rule-based (not a trained AI model, clearly labeled as such in the UI, matching your project's
"no black box" framing). Parses the message for known skills, known sectors, and a few FAQ
intents (match-score explanation, what to learn next), and replies with matching internships
or an explanation. No external API calls — everything runs against the local catalogue.

## Files patched (nav links only, or as noted for admin.html)
Added sidebar links for Calendar / Interview prep / Career chatbot (and, from last time,
Compare / Resume analyzer) to: `dashboard.html`, `recommendations.html`, `saved.html`,
`applications.html`, `skills.html`, `profile.html`, `compare.html`, `resume-analyzer.html`.
`admin.html` got a new Analytics panel + script tags appended (Chart.js CDN,
`js/shared-adapter.js`, `js/admin-analytics.js`) — the rest of the file is untouched.

## New shared helper
`js/shared-adapter.js` centralizes the "talk to your data layer" functions used by the four
newest features (`getCurrentUserEmail`, `getProfile`, `saveProfile`, `getAllInternships`,
`getAllUsers`, `getApplications`, `getSavedIds`, plus generic `readBlob`/`writeBlob` for data
with no equivalent in your documented `Store` interface, like calendar status or interview
history). `resume-analyzer.js` and `compare.js` from last time still have their own inline
copies of the adapter functions rather than this shared file, so they weren't touched again —
functionally identical, just not consolidated.

## ⚠️ Same caveat as before
I still only have your **HTML files**, not `css/style.css`, `css/dashboard.css`,
`js/storage.js`, `js/app.js`, `js/recommendation.js`, or `data/internships.js`. Everything
here is built against the `Store` interface and `localStorage` key formats your README
documents, with graceful fallbacks. If your real `storage.js` exposes different method or key
names — especially `getAllUsers()`, used by Admin Analytics to aggregate across students —
update the corresponding function in `js/shared-adapter.js`; nothing else needs to change.
Drop everything into your real `internmatch/` folder (overwrite the 9 patched HTML files;
add the rest) and it'll pick up your existing `css/` and data layer automatically.

