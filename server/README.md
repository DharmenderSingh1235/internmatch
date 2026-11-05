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
| `GEMINI_FALLBACK_MODELS` | Comma-separated Gemini models tried for assessment drafts when the primary is overloaded (default fallback order: `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`). The older `GEMINI_FALLBACK_MODEL` setting is also accepted. |
| `PORT` | Proxy port (default `3003`) |
| `ALLOWED_ORIGIN` | Exact deployed site origin(s), comma-separated; localhost origins are allowed for development |
| `TRUST_PROXY` | Set to `true` only when exactly one trusted reverse proxy sits in front of the API; otherwise leave `false` |
| `RESEND_API_KEY` | Optional Resend API key used to email teacher/observer invitations |
| `EMAIL_FROM` | Sender address verified with Resend |
| `PUBLIC_APP_URL` | Public frontend origin used to create the one-time observer invitation URL |
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

To configure real teacher invitation email locally, run `./configure-email.ps1` from the `server` folder. It asks for the Resend API key without echoing it, the Resend-verified sender, and the public frontend origin, then writes them to the git-ignored `server/.env`. Restart the API afterward. For a deployed site, add the same three variables to the API host's environment settings and redeploy; do not use a localhost `PUBLIC_APP_URL` for teachers on other devices.

## Netlify frontend and Render API

The repository includes `netlify.toml`, `scripts/build-netlify.js`, and `render.yaml` for this layout. Create the Render web service from the Blueprint first. It uses `server/` as its root, `npm ci` as its build command, `npm start` as its start command, and `/api/health` as the health check. Render must have `GEMINI_API_KEY`, `MONGODB_URI`, and `ADMIN_PASSWORD` set as private environment variables; add other provider or email settings you use there as well. The API reads Render's `PORT` and listens on `0.0.0.0`.

Then connect the same GitHub repository to Netlify. The build succeeds without additional variables using the frontend's built-in API default. When the Render service is ready, set the Netlify build variable `API_BASE_URL` to its `https://...onrender.com` origin; Netlify injects that URL at build time. Netlify builds only the public HTML, CSS, JavaScript, and catalogue files into `dist/`. After Netlify gives you its site origin, set that exact origin (no trailing slash) as Render's `ALLOWED_ORIGIN`, then redeploy Render and rebuild Netlify. Add `PUBLIC_APP_URL` with the Netlify origin to Render too for email links. Never put API keys or database credentials in Netlify's frontend environment or `js/` files.

## Company and student workflow

- Companies can upload a PDF, DOCX, TXT, or Markdown source document to draft assessment questions. The API extracts text in memory, sends the text to the configured AI provider, and returns editable question drafts; the original file and extracted text are not saved by this feature. Gemini assessment generation retries temporary capacity errors once, then tries configured fallback models and current stable Flash alternatives. Scanned/image-only PDFs are not supported. Companies must review every generated question and answer key before submission, and the usual admin approval is still required.
- Recruiters submit a registration request from `company-register.html`. Requests are visible only to admins in the **Company access requests** section. An admin can approve or reject each request. Approval adds the company to the approved company list and enables login; pending or rejected companies cannot sign in. Admins can manage approved company accounts through protected `/api/admin/companies` routes.
- Signed-in recruiters can submit internships or jobs with their eligibility, skills, location, compensation, deadline, and role details.
- New and edited postings require admin approval before they appear in the student catalogue. Admins can approve or reject them from the Internship management review queue.
- Applications are linked to the owning company. Recruiters can view profiles only for students who applied to their roles; they can open CVs only when the student has enabled CV sharing.
- Students can separately allow admin CV review from Resume Analyzer. The admin CV endpoint and review actions require that consent; turning it off revokes admin access while preserving company access when company sharing remains enabled. The same uploaded server PDF can be shared with both audiences only when the student enables both permissions.
- Recruiters can update application stages, shortlist applicants, and schedule interviews for their own applicants.
- For approved assessments, a company can invite a teacher/observer by email from **Company workspace → Assessments → Verified observers**. Configure `RESEND_API_KEY`, a Resend-verified `EMAIL_FROM`, and the frontend origin in `PUBLIC_APP_URL` first. The email contains a one-time link which is valid for 60 minutes and redeems into an 8-hour session scoped to that one assessment; the company can revoke it at any time. The observer sees only students who have separately opted into live camera sharing, and cannot read questions, answers, profiles, or results. Live video is not recorded by InternMatch. Live signaling is held in memory on the API instance, so use a single API instance or add shared signaling storage before scaling horizontally.
- Student and recruiter users can request a password reset from the login page. An admin must confirm identity and set a temporary password in **Notifications & Support**; the prototype does not send recovery emails. The admin password is changed through `ADMIN_PASSWORD` in `.env`.
- Shortlists, interview schedules, application status updates, and CV access audit entries are stored on the server.

Company API routes require a server-issued company token and scope application actions to the signed-in company. This is a local project prototype: for a public deployment, use HTTPS, stronger operational security, backups, and a managed database. The recommendation score is a transparent prototype signal, not an automated hiring decision.

If you change `PORT`, update `AI_BACKEND_URL` in `js/chatbot.js`.
