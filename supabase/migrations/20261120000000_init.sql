-- CECH initial schema
-- Two strictly separate layers per test: test_results (real Kane CLI execution)
-- and ai_analyses (Groq interpretation). AI never overwrites execution data.


-- ---------------------------------------------------------------- inspections
create table public.inspections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid null,                              -- reserved for optional auth
  website_url         text not null check (char_length(website_url) <= 2048),
  status              text not null default 'planning'
                        check (status in ('planning','dispatching','running','analyzing','completed','failed')),
  overall_status      text not null default 'pending'
                        check (overall_status in ('pending','passed','issues_found','verified','incomplete')),
  selected_categories text[] not null
                        check (selected_categories <@ array['navigation','forms','interface','journey']::text[]),
  custom_instructions text null check (char_length(custom_instructions) <= 1000),
  health_score        integer null check (health_score between 0 and 100),
  plan_source         text null check (plan_source in ('groq','baseline')),
  plan_notes          text null,
  summary             jsonb null,
  error               text null,
  latest_run_id       uuid null,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz null
);
create index inspections_created_at_idx on public.inspections (created_at desc);
create index inspections_website_url_idx on public.inspections (website_url);
create index inspections_user_id_idx on public.inspections (user_id) where user_id is not null;

-- ---------------------------------------------------------------- test_cases
create table public.test_cases (
  id               uuid primary key default gen_random_uuid(),
  inspection_id    uuid not null references public.inspections(id) on delete cascade,
  key              text not null,
  category         text not null check (category in ('navigation','forms','interface','journey')),
  title            text not null,
  objective        text not null check (char_length(objective) <= 1000),
  expected_outcome text not null,
  priority         text not null check (priority in ('high','medium','low')),
  assumption       text null,
  status           text not null default 'NOT_EXECUTED'
                     check (status in ('NOT_EXECUTED','QUEUED','RUNNING','PASSED','FAILED','ERROR','TIMEOUT','INCONCLUSIVE')),
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index test_cases_inspection_idx on public.test_cases (inspection_id, position);

-- ---------------------------------------------------------------- verification_runs
create table public.verification_runs (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.inspections(id) on delete cascade,
  parent_run_id  uuid null references public.verification_runs(id) on delete set null,
  sequence       integer not null,
  run_type       text not null check (run_type in ('initial','retest_failed','retest_all')),
  status         text not null default 'queued'
                   check (status in ('queued','dispatching','running','analyzing','completed','failed')),
  test_case_ids  uuid[] not null default '{}',
  health_score   integer null check (health_score between 0 and 100),
  passed         integer not null default 0,
  failed         integer not null default 0,
  inconclusive   integer not null default 0,
  errored        integer not null default 0,
  error          text null,
  started_at     timestamptz null,
  completed_at   timestamptz null,
  created_at     timestamptz not null default now(),
  unique (inspection_id, sequence)
);
create index verification_runs_created_at_idx on public.verification_runs (created_at desc);

alter table public.inspections
  add constraint inspections_latest_run_fk
  foreign key (latest_run_id) references public.verification_runs(id) on delete set null;

-- ---------------------------------------------------------------- test_results (Kane execution layer)
create table public.test_results (
  id                  uuid primary key default gen_random_uuid(),
  test_case_id        uuid not null references public.test_cases(id) on delete cascade,
  verification_run_id uuid not null references public.verification_runs(id) on delete cascade,
  objective           text not null,                 -- exact objective Kane executed
  objective_note      text null,                     -- retest rationale
  execution_status    text not null
                        check (execution_status in ('QUEUED','RUNNING','PASSED','FAILED','ERROR','TIMEOUT','INCONCLUSIVE')),
  error_kind          text null,
  raw_output          text null,                     -- raw kane-cli NDJSON stdout
  stderr              text null,
  exit_code           integer null,
  duration_ms         integer null,
  evidence_reference  text null,
  kane_summary        text null,
  kane_reason         text null,
  kane_test_url       text null,
  steps               jsonb not null default '[]'::jsonb,
  started_at          timestamptz null,
  completed_at        timestamptz null,
  created_at          timestamptz not null default now(),
  unique (verification_run_id, test_case_id)
);
create index test_results_case_idx on public.test_results (test_case_id);
create index test_results_status_idx on public.test_results (execution_status);

-- ---------------------------------------------------------------- ai_analyses (Groq interpretation layer)
create table public.ai_analyses (
  id                uuid primary key default gen_random_uuid(),
  test_result_id    uuid not null unique references public.test_results(id) on delete cascade,
  source            text not null check (source in ('groq','system','unavailable')),
  summary           text not null,
  issue_detected    boolean null,
  severity          text null check (severity in ('critical','high','medium','low','none')),
  title             text null,
  description       text null,
  expected_behavior text null,
  observed_behavior text null,
  recommendation    text null,
  confidence        text null check (confidence in ('high','medium','low')),
  model             text null,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- demo_settings
create table public.demo_settings (
  id         text primary key default 'default',
  mode       text not null default 'broken' check (mode in ('healthy','broken')),
  updated_at timestamptz not null default now()
);
insert into public.demo_settings (id, mode) values ('default', 'broken') on conflict do nothing;

-- ---------------------------------------------------------------- access control
-- All access goes through the CECH server using the service-role key, which
-- bypasses RLS. RLS is enabled with NO policies for anon/authenticated, so the
-- public anon key cannot read or modify any CECH data directly.
alter table public.inspections       enable row level security;
alter table public.test_cases        enable row level security;
alter table public.verification_runs enable row level security;
alter table public.test_results      enable row level security;
alter table public.ai_analyses       enable row level security;
alter table public.demo_settings     enable row level security;

revoke all on public.inspections, public.test_cases, public.verification_runs,
              public.test_results, public.ai_analyses, public.demo_settings
  from anon, authenticated;

-- When optional user auth is added, add owner policies such as:
--   create policy "owner reads inspections" on public.inspections
--     for select to authenticated using (user_id = auth.uid());
