# InternMatch AI chatbot backend

This Express API connects the career chatbot to OpenAI, Google Gemini, or Anthropic Claude and provides shared accounts and data for the student, admin, and company workflows. Provider API keys stay on the server and are never placed in browser JavaScript. Portal records are stored in `server/data/portal-data.json`.

## Setup

1. Install Node.js 22.3 or newer (the PDF parser requires a supported Node runtime).
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `AI_PROVIDER` to `openai`, `gemini`, or `anthropic`, then add that provider's key to its matching variable. The default is OpenAI with `gpt-4o-mini`.
5. Start the API with `npm start`.
6. Set `ADMIN_PASSWORD` in `.env`, restart the server, and open the site using Live Server. Students can register from the login page. Recruiters submit a company registration request; an admin must approve it before the company is added to the approved company list and can sign in. Admin access uses the configured `ADMIN_PASSWORD`; recruiter postings also remain unpublished until an admin approves them.

The API key must be supplied by you. Keep `.env` private; it is excluded by `.gitignore`. Without a configured key or running backend, the chatbot continues with its built-in rule-based assistant.

## Configuration

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `openai` (default), `gemini`, or `anthropic` |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Provider key matching `AI_PROVIDER` |
| `OPENAI_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL` | Optional model override for that provider |
| `PORT` | Proxy port (default `3002`) |
| `ALLOWED_ORIGIN` | Exact deployed site origin; localhost origins are allowed for development |
| `ADMIN_PASSWORD` | Password for the admin login; set a private value before using the portal |

The backend grounds internship answers in the local sample catalogue and rate-limits chat requests to 20 per five minutes per IP. Sample listings are fictional. The in-memory rate limiter is suitable for demos; deploy behind a production rate limiter for public use.

## Company and student workflow

- Companies can upload a PDF, DOCX, TXT, or Markdown source document to draft assessment questions. The API extracts text in memory, sends the text to the configured AI provider, and returns editable question drafts; the original file and extracted text are not saved by this feature. Scanned/image-only PDFs are not supported. Companies must review every generated question and answer key before submission, and the usual admin approval is still required.
- Recruiters submit a registration request from `company-register.html`. Requests are visible only to admins in the **Company access requests** section. An admin can approve or reject each request. Approval adds the company to the approved company list and enables login; pending or rejected companies cannot sign in. Admins can manage approved company accounts through protected `/api/admin/companies` routes.
- Signed-in recruiters can submit internships or jobs with their eligibility, skills, location, compensation, deadline, and role details.
- New and edited postings require admin approval before they appear in the student catalogue. Admins can approve or reject them from the Internship management review queue.
- Applications are linked to the owning company. Recruiters can view profiles only for students who applied to their roles; they can open CVs only when the student has enabled CV sharing.
- Recruiters can update application stages, shortlist applicants, and schedule interviews for their own applicants.
- Student and recruiter users can request a password reset from the login page. An admin must confirm identity and set a temporary password in **Notifications & Support**; the prototype does not send recovery emails. The admin password is changed through `ADMIN_PASSWORD` in `.env`.
- Shortlists, interview schedules, application status updates, and CV access audit entries are stored on the server.

Company API routes require a server-issued company token and scope application actions to the signed-in company. This is a local project prototype: for a public deployment, use HTTPS, stronger operational security, backups, and a managed database. The recommendation score is a transparent prototype signal, not an automated hiring decision.

If you change `PORT`, update `AI_BACKEND_URL` in `js/chatbot.js`.
