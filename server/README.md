# InternMatch AI chatbot backend

This Express API connects the career chatbot to OpenAI, Google Gemini, or Anthropic Claude and provides shared accounts and data for the student, admin, and company workflows. Provider API keys and database credentials stay on the server and are never placed in browser JavaScript. The API supports managed MongoDB via `MONGODB_URI`; without it, local development uses SQLite with a JSON backup when available, or JSON storage as a fallback.

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
| `GEMINI_FALLBACK_MODEL` | Gemini model used for assessment drafts when the primary model is temporarily overloaded (default `gemini-2.5-flash`) |
| `PORT` | Proxy port (default `3002`) |
| `ALLOWED_ORIGIN` | Exact deployed site origin(s), comma-separated; localhost origins are allowed for development |
| `TRUST_PROXY` | Set to `true` only when exactly one trusted reverse proxy sits in front of the API; otherwise leave `false` |
| `ADMIN_PASSWORD` | Password for the admin login; set a private value before using the portal |
| `MONGODB_URI` | Optional MongoDB Atlas or MongoDB connection string. Set this to make MongoDB the primary portal store. |
| `MONGODB_DB` | Database name (default: the database name in the connection string) |
| `MONGODB_MAX_POOL_SIZE` | Maximum MongoDB connection pool size per server instance (default: 20) |

The backend grounds internship answers in the local sample catalogue and rate-limits chat requests to 20 per five minutes per IP. Sign-in, registration, and reset requests have both per-account limits and higher per-IP limits so students sharing a campus network are less likely to block one another. Password hashing is asynchronous. With MongoDB enabled, portal records and hashed login sessions are stored in shared MongoDB collections; API writes wait for MongoDB persistence before returning success. On the first MongoDB startup, existing `server/data/portal-data.json` records are imported if MongoDB has not already been initialized. After that, MongoDB is authoritative. Without `MONGODB_URI`, the local SQLite/JSON fallback remains available. The API adds security headers, disables response caching for API data, limits interview signaling payloads, and returns JSON errors for API failures. MongoDB is a stronger shared storage foundation, but does not guarantee a 1,000-user capacity by itself; load-test the deployed API and size the host/database for expected traffic. Sample listings are fictional.

## Enable MongoDB Atlas

1. Create a MongoDB Atlas cluster, a database user, and a network access rule for the API host. Prefer a narrow IP allowlist where your host provides stable egress IPs; avoid opening database access to all IPs for production.
2. Copy `server/.env.example` to `server/.env` and replace the `MONGODB_URI` placeholders with the Atlas connection string. Keep the URI out of Git, frontend files, and chat messages.
3. Run `npm install` from the `server` folder so the MongoDB Node driver is installed, then start with `npm start`.
4. Open `/api/health`; it should report `"storage":"mongodb"` and `"sessionStorage":"mongodb"`.

For Vercel or another hosted deployment, add `MONGODB_URI`, `MONGODB_DB`, `ALLOWED_ORIGIN` (the exact public frontend origin, such as `https://your-site.vercel.app`), and the existing AI/admin secrets in the API project's server environment settings, then redeploy the API. Keep the API deployment publicly reachable for browser requests and allow only its expected origins. Do not copy the local `.env` file to the frontend project.

## Company and student workflow

- Companies can upload a PDF, DOCX, TXT, or Markdown source document to draft assessment questions. The API extracts text in memory, sends the text to the configured AI provider, and returns editable question drafts; the original file and extracted text are not saved by this feature. Gemini assessment generation retries temporary capacity errors once and then tries `GEMINI_FALLBACK_MODEL`. Scanned/image-only PDFs are not supported. Companies must review every generated question and answer key before submission, and the usual admin approval is still required.
- Recruiter assessments do not request camera access. Descriptive answers can show a few server-calculated writing-style signals (generic phrasing or repeated sentences); this is not a reliable AI detector and cannot establish authorship. Signals are shown only for recruiter review and must not drive hiring decisions by themselves. Coding and MCQ answers are excluded from this heuristic.
- Recruiters submit a registration request from `company-register.html`. Requests are visible only to admins in the **Company access requests** section. An admin can approve or reject each request. Approval adds the company to the approved company list and enables login; pending or rejected companies cannot sign in. Admins can manage approved company accounts through protected `/api/admin/companies` routes.
- Signed-in recruiters can submit internships or jobs with their eligibility, skills, location, compensation, deadline, and role details.
- New and edited postings require admin approval before they appear in the student catalogue. Admins can approve or reject them from the Internship management review queue.
- Applications are linked to the owning company. Recruiters can view profiles only for students who applied to their roles; they can open CVs only when the student has enabled CV sharing.
- Students can separately allow admin CV review from Resume Analyzer. The admin CV endpoint and review actions require that consent; turning it off revokes admin access while preserving company access when company sharing remains enabled. The same uploaded server PDF can be shared with both audiences only when the student enables both permissions.
- Recruiters can update application stages, shortlist applicants, and schedule interviews for their own applicants.
- Student and recruiter users can request a password reset from the login page. An admin must confirm identity and set a temporary password in **Notifications & Support**; the prototype does not send recovery emails. The admin password is changed through `ADMIN_PASSWORD` in `.env`.
- Shortlists, interview schedules, application status updates, and CV access audit entries are stored on the server.

Company API routes require a server-issued company token and scope application actions to the signed-in company. This is a local project prototype: for a public deployment, use HTTPS, stronger operational security, backups, and a managed database. The recommendation score is a transparent prototype signal, not an automated hiring decision.

If you change `PORT`, update `AI_BACKEND_URL` in `js/chatbot.js`.
