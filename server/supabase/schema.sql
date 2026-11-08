-- InternMatch managed Postgres schema (apply to a new Supabase project).
-- Application code must keep assessment answer keys in the private schema.
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null check (role in ('student','company','admin')),
  profile jsonb not null default '{}'::jsonb,
  profile_visible boolean not null default false,
  cv_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  industry text not null default '',
  location text not null default '',
  website text not null default '',
  contact text not null default '',
  about text not null default '',
  status text not null default 'pending' check (status in ('pending','active','suspended','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.company_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  review_note text not null default '',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create table if not exists public.internships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  posting_type text not null default 'Internship' check (posting_type in ('Internship','Job')),
  employment_type text not null default 'Internship',
  location text not null default '',
  duration text not null default '',
  location_type text not null default 'On-site',
  sector text not null default '',
  stipend text not null default '',
  salary text not null default '',
  positions integer not null default 1 check (positions > 0),
  deadline date,
  description text not null default '',
  responsibilities text not null default '',
  eligibility text not null default '',
  skills text[] not null default '{}',
  status text not null default 'pending_approval' check (status in ('pending_approval','active','paused','rejected')),
  admin_review_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  internship_id uuid not null references public.internships(id) on delete cascade,
  status text not null default 'Applied' check (status in ('Applied','Shortlisted','Assessment','Interview','Offered','Rejected')),
  history jsonb not null default '[]'::jsonb,
  applied_at timestamptz not null default now(),
  unique (student_id, internship_id)
);
create index if not exists applications_company_idx on public.applications(company_id, internship_id);
create index if not exists applications_student_idx on public.applications(student_id, applied_at desc);

create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (company_id, student_id)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  internship_id uuid not null references public.internships(id) on delete cascade,
  title text not null,
  category text not null check (category in ('Coding','Aptitude','Technical','HR','Custom')),
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  duration_minutes integer not null check (duration_minutes between 5 and 180),
  total_marks integer not null check (total_marks > 0),
  passing_marks integer not null check (passing_marks between 0 and total_marks),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','rejected')),
  admin_review_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position integer not null check (position > 0),
  question_type text not null check (question_type in ('MCQ','Coding','Descriptive')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  marks integer not null check (marks > 0),
  explanation text not null default '',
  unique (assessment_id, position),
  check (question_type <> 'MCQ' or jsonb_array_length(options) = 4)
);

-- Never expose answer keys through the client-facing PostgREST schema.
create table if not exists private.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_index smallint not null check (correct_index between 0 and 3)
);
revoke all on private.assessment_answer_keys from public, anon, authenticated;

create table if not exists public.assessment_submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score integer not null default 0 check (score >= 0),
  total_marks integer not null check (total_marks > 0),
  passed boolean not null default false,
  status text not null default 'Submitted' check (status in ('Submitted','Needs recruiter review','Reviewed','Scored')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (assessment_id, student_id)
);
create index if not exists submissions_assessment_idx on public.assessment_submissions(assessment_id, submitted_at desc);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  type text not null default 'Interview',
  starts_at timestamptz not null,
  mode text not null default 'Online',
  details text not null default '',
  feedback jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  category text not null default 'General help',
  message text not null,
  status text not null default 'Open' check (status in ('Open','In progress','Resolved')),
  reply text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  actor_role text not null,
  action text not null,
  target_id text,
  created_at timestamptz not null default now()
);

-- Compatibility store for the existing Express API. The API owns auth and
-- authorization; these rows are server-only and never granted to browser roles.
create table if not exists public.portal_records (
  collection text not null check (collection in (
    'companies','companyRequests','students','internships','applications','shortlists',
    'interviews','assessments','assessmentSessions','assessmentSubmissions',
    'assessmentObserverInvites','supportMessages','passwordResetRequests','practiceAreas','audit'
  )),
  id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists portal_records_collection_idx on public.portal_records(collection);
alter table public.portal_records enable row level security;
revoke all on public.portal_records from public, anon, authenticated;
grant all on public.portal_records to service_role;
create policy portal_records_server_only on public.portal_records for all to service_role
using (true) with check (true);

create table if not exists public.portal_sessions (
  token_hash text primary key,
  account_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists portal_sessions_account_idx on public.portal_sessions(account_id);
create index if not exists portal_sessions_expiry_idx on public.portal_sessions(expires_at);
alter table public.portal_sessions enable row level security;
revoke all on public.portal_sessions from public, anon, authenticated;
grant all on public.portal_sessions to service_role;
create policy portal_sessions_server_only on public.portal_sessions for all to service_role
using (true) with check (true);

create table if not exists public.portal_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.portal_meta enable row level security;
revoke all on public.portal_meta from public, anon, authenticated;
grant all on public.portal_meta to service_role;
create policy portal_meta_server_only on public.portal_meta for all to service_role
using (true) with check (true);

drop function if exists public.sync_portal_collection(text, jsonb, jsonb);
create or replace function public.sync_portal_collection(
  p_collection text,
  p_changes jsonb
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  change_item jsonb;
  expected_item jsonb;
  next_item jsonb;
  stored_item jsonb;
  item_id text;
begin
  if p_collection not in (
    'companies','companyRequests','students','internships','applications','shortlists',
    'interviews','assessments','assessmentSessions','assessmentSubmissions',
    'assessmentObserverInvites','supportMessages','passwordResetRequests','practiceAreas','audit'
  ) or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Invalid portal collection sync request';
  end if;

  perform pg_advisory_xact_lock(hashtext('internmatch_portal'), hashtext(p_collection));

  -- Validate all expected old values before changing anything. Each API update
  -- sends only changed rows, so profile documents and CV blobs are not resent
  -- for unrelated writes.
  for change_item in select value from jsonb_array_elements(p_changes) as item(value) loop
    item_id := change_item ->> 'id';
    expected_item := change_item -> 'expected';
    next_item := change_item -> 'next';
    if item_id is null or not (change_item ? 'expected') or not (change_item ? 'next') then
      raise exception 'Invalid portal record change';
    end if;
    if expected_item = 'null'::jsonb then
      if exists (select 1 from public.portal_records where collection = p_collection and id = item_id) then
        raise exception 'Portal record already exists; reload and retry' using errcode = '40001';
      end if;
    else
      select payload into stored_item from public.portal_records
        where collection = p_collection and id = item_id for update;
      if not found or stored_item is distinct from expected_item then
        raise exception 'Stale portal record; reload and retry' using errcode = '40001';
      end if;
    end if;
  end loop;

  for change_item in select value from jsonb_array_elements(p_changes) as item(value) loop
    item_id := change_item ->> 'id';
    next_item := change_item -> 'next';
    if next_item = 'null'::jsonb then
      delete from public.portal_records where collection = p_collection and id = item_id;
    else
      if jsonb_typeof(next_item) <> 'object' or next_item ->> 'id' <> item_id then
        raise exception 'Invalid portal record payload';
      end if;
      insert into public.portal_records(collection, id, payload, updated_at)
        values (p_collection, item_id, next_item, now())
      on conflict (collection, id) do update
        set payload = excluded.payload, updated_at = excluded.updated_at;
    end if;
  end loop;
end;
$$;
revoke all on function public.sync_portal_collection(text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_portal_collection(text, jsonb) to service_role;

create or replace function private.current_app_role()
returns text language sql stable security definer set search_path = public, auth
as $$ select role from public.profiles where id = auth.uid() $$;
revoke all on function private.current_app_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
create or replace function public.current_app_role()
returns text language sql stable security invoker set search_path = public, private, auth
as $$ select private.current_app_role() $$;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

-- New sign-ups can only become students through the public Auth flow.
-- Company/admin roles are assigned by the trusted server after review.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure private.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_requests enable row level security;
alter table public.internships enable row level security;
alter table public.applications enable row level security;
alter table public.shortlists enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_submissions enable row level security;
alter table public.interviews enable row level security;
alter table public.support_messages enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read_scoped on public.profiles for select to authenticated
using (id = auth.uid() or private.current_app_role() = 'admin' or exists (
  select 1 from public.applications a where a.student_id = profiles.id and a.company_id = auth.uid()
));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid() and role = private.current_app_role());

create policy companies_read_active_or_owner on public.companies for select to authenticated
using (status = 'active' or id = auth.uid() or private.current_app_role() = 'admin');
create policy company_requests_read_owner_or_admin on public.company_requests for select to authenticated
using (company_id = auth.uid() or private.current_app_role() = 'admin');

create policy internships_read_visible on public.internships for select to authenticated
using (status = 'active' or company_id = auth.uid() or private.current_app_role() = 'admin');
create policy internships_company_submit on public.internships for insert to authenticated
with check (company_id = auth.uid() and private.current_app_role() = 'company' and status = 'pending_approval');
create policy internships_company_edit on public.internships for update to authenticated
using (company_id = auth.uid() and private.current_app_role() = 'company')
with check (company_id = auth.uid() and private.current_app_role() = 'company' and status in ('pending_approval','paused'));

create policy applications_read_participants on public.applications for select to authenticated
using (student_id = auth.uid() or company_id = auth.uid() or private.current_app_role() = 'admin');
create policy applications_student_apply on public.applications for insert to authenticated
with check (student_id = auth.uid() and private.current_app_role() = 'student' and exists (
  select 1 from public.internships i where i.id = applications.internship_id and i.company_id = applications.company_id and i.status = 'active'
));

create policy shortlists_read_owner on public.shortlists for select to authenticated
using (company_id = auth.uid() or student_id = auth.uid() or private.current_app_role() = 'admin');

create policy assessments_read_eligible on public.assessments for select to authenticated
using (company_id = auth.uid() or private.current_app_role() = 'admin' or (status = 'approved' and exists (
  select 1 from public.applications a where a.student_id = auth.uid() and a.internship_id = assessments.internship_id and a.status <> 'Rejected'
)));
create policy assessments_company_create on public.assessments for insert to authenticated
with check (company_id = auth.uid() and private.current_app_role() = 'company' and status = 'pending_approval');
create policy assessments_company_resubmit on public.assessments for update to authenticated
using (company_id = auth.uid() and status = 'rejected')
with check (company_id = auth.uid() and status = 'pending_approval');

create policy questions_read_eligible on public.assessment_questions for select to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (
  a.company_id = auth.uid() or private.current_app_role() = 'admin' or (a.status = 'approved' and exists (
    select 1 from public.applications ap where ap.student_id = auth.uid() and ap.internship_id = a.internship_id and ap.status <> 'Rejected'
  ))
)));
create policy questions_company_manage on public.assessment_questions for all to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and a.company_id = auth.uid() and a.status in ('pending_approval','rejected')))
with check (exists (select 1 from public.assessments a where a.id = assessment_id and a.company_id = auth.uid() and a.status in ('pending_approval','rejected')));

create policy submissions_read_participants on public.assessment_submissions for select to authenticated
using (student_id = auth.uid() or private.current_app_role() = 'admin' or exists (
  select 1 from public.assessments a where a.id = assessment_id and a.company_id = auth.uid()
));
create policy submissions_student_submit on public.assessment_submissions for insert to authenticated
with check (student_id = auth.uid() and private.current_app_role() = 'student' and exists (
  select 1 from public.assessments a join public.applications ap on ap.internship_id = a.internship_id
  where a.id = assessment_id and a.status = 'approved' and ap.student_id = auth.uid() and ap.status <> 'Rejected'
));

create policy interviews_read_participants on public.interviews for select to authenticated
using (student_id = auth.uid() or company_id = auth.uid() or private.current_app_role() = 'admin');
create policy interviews_company_manage on public.interviews for all to authenticated
using (company_id = auth.uid() and private.current_app_role() = 'company')
with check (company_id = auth.uid() and private.current_app_role() = 'company');

create policy support_read_owner_or_admin on public.support_messages for select to authenticated
using (student_id = auth.uid() or private.current_app_role() = 'admin');
create policy support_student_create on public.support_messages for insert to authenticated
with check (student_id = auth.uid() and private.current_app_role() = 'student');
create policy audit_admin_read on public.audit_logs for select to authenticated
using (private.current_app_role() = 'admin');

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.companies, public.company_requests, public.internships, public.applications,
  public.shortlists, public.assessments, public.assessment_questions, public.assessment_submissions,
  public.interviews, public.support_messages, public.audit_logs to authenticated;
grant insert, update on public.internships, public.assessments, public.assessment_questions,
  public.interviews, public.support_messages to authenticated;
grant insert on public.applications, public.assessment_submissions to authenticated;

-- CV uploads remain private. The Express API should issue short-lived signed URLs
-- only after checking the candidate's application and cv_shared preference.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-cvs','student-cvs',false,10485760,array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

create policy cv_owner_upload on storage.objects for insert to authenticated
with check (bucket_id = 'student-cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy cv_owner_read on storage.objects for select to authenticated
using (bucket_id = 'student-cvs' and (storage.foldername(name))[1] = auth.uid()::text);
