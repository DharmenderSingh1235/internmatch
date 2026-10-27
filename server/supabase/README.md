# Supabase migration preparation

This folder contains the first managed-Postgres schema for the InternMatch cloud migration. The running application still reads and writes `server/data/portal-data.json` and the local SQLite mirror; adding credentials to `.env` alone does not switch storage.

## Schema features

- Student, company, and admin profiles linked to Supabase Auth users.
- Company approval, internship approval, applications, shortlists, interviews, and support records.
- Assessment approval and submissions. MCQ correct answers live in the non-public `private.assessment_answer_keys` schema, away from client-facing tables.
- Row Level Security policies scope profiles, applications, assessments, and submissions by account and role.
- A private PDF-only CV bucket. The Express API must check the application relationship and the student's `cv_shared` setting before issuing a short-lived CV link.

## Before connecting the app

1. Create a Supabase project and keep its database password and service-role secret private.
2. Review `schema.sql`, then apply it to the new project's SQL editor. Do not apply it to production until the migration and restore plan are reviewed.
3. Add the Supabase URL, publishable/anon key, service-role key, and database connection string to the API host's environment variables. Keep the service-role key and database password on the server only.
4. Integrate the Express API with Supabase Auth and Postgres, then migrate existing portal data and verify company/student row access before switching traffic.

The existing student passwords are stored in the local demo system's format and cannot be copied into Supabase Auth as-is. Existing accounts will need a secure password-reset or invitation flow during migration. Do not delete the local JSON/SQLite data until the cloud copy and account recovery path have been checked.

## Deployment target

Recommended hosting is the existing Express API as a Render Web Service, with the static HTML site hosted as a Render Static Site. Configure the API's allowed origin to the deployed site URL. The API frontend base URL must also be made environment-aware before the static site is deployed; the current browser scripts still call `127.0.0.1:3002`.
