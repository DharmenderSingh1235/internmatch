# Supabase Postgres storage

The Express API can use this Supabase project for persistent portal storage. It keeps the existing Express authentication and route logic and stores each portal record in the server-only `public.portal_records` table, with hashed bearer sessions in `public.portal_sessions`. The client-facing normalized tables below are a separate schema draft and are not currently used by the Express API.

## Schema features

- Student, company, and admin profiles linked to Supabase Auth users.
- Company approval, internship approval, applications, shortlists, interviews, and support records.
- Assessment approval and submissions. MCQ correct answers live in the non-public `private.assessment_answer_keys` schema, away from client-facing tables.
- Row Level Security policies scope profiles, applications, assessments, and submissions by account and role.
- A private PDF-only CV bucket. The Express API must check the application relationship and the student's `cv_shared` setting before issuing a short-lived CV link.

RLS is enabled on all exposed tables. `portal_records`, `portal_sessions`, and `portal_meta` grant access only to Supabase's server role, and the collection sync function checks expected old values before applying changed rows. The `SUPABASE_SECRET_KEY` belongs only in the Vercel Express project's encrypted environment variables; never expose it in browser JavaScript.

Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_REQUIRED=true` on the Express deployment. The first configured run imports `server/data/portal-data.json` if present and marks the store initialized; subsequent starts load Supabase as the source of truth. Keep the local file as a backup until the cloud copy has been checked. The current custom Express passwords and sessions remain in place; this setup does not migrate accounts to Supabase Auth.
