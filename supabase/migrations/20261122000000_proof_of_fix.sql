-- CECH — Proof of Fix
-- Additive and backward compatible: every new column is nullable, existing
-- rows and inspections without evidence keep working unchanged.
-- Kane outcomes (test_results.execution_status) are never modified here.

-- ---------------------------------------------------------------- execution evidence on results
-- Structured, worker-observed facts for one Kane execution: viewport,
-- URL before/after, console errors, failed requests, capture errors.
alter table public.test_results add column if not exists evidence jsonb null;
-- Snapshot of the test's expected outcome at dispatch time, used to check
-- that a retest is equivalent to the original test.
alter table public.test_results add column if not exists expected_outcome text null;

-- ---------------------------------------------------------------- AI bug reproduction report
alter table public.ai_analyses add column if not exists bug_report jsonb null;

-- ---------------------------------------------------------------- evidence artifacts (screenshots)
create table if not exists public.evidence_artifacts (
  id                  uuid primary key default gen_random_uuid(),
  inspection_id       uuid not null references public.inspections(id) on delete cascade,
  test_case_id        uuid not null references public.test_cases(id) on delete cascade,
  test_result_id      uuid not null references public.test_results(id) on delete cascade,
  verification_run_id uuid not null references public.verification_runs(id) on delete cascade,
  kind                text not null check (kind in ('before', 'at_failure', 'after_viewport', 'after_fullpage')),
  storage_key         text not null unique check (storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z_]+\.(jpg|png)$'),
  content_type        text not null check (content_type in ('image/jpeg', 'image/png')),
  bytes               integer not null check (bytes > 0 and bytes <= 4194304),
  width               integer null,
  height              integer null,
  sha256              text not null check (char_length(sha256) = 64),
  page_url            text null,
  captured_at         timestamptz not null,
  created_at          timestamptz not null default now(),
  unique (test_result_id, kind)
);
create index if not exists evidence_artifacts_inspection_idx on public.evidence_artifacts (inspection_id);

-- ---------------------------------------------------------------- proof of fix records
-- One row per (original genuine failure, equivalent genuine passing retest).
-- status becomes 'regressed' if the same test later fails again; the row is kept.
create table if not exists public.fix_verifications (
  id                  uuid primary key default gen_random_uuid(),
  inspection_id       uuid not null references public.inspections(id) on delete cascade,
  test_case_id        uuid not null references public.test_cases(id) on delete cascade,
  original_result_id  uuid not null references public.test_results(id) on delete cascade,
  retest_result_id    uuid not null references public.test_results(id) on delete cascade,
  equivalence         text not null check (equivalence in ('exact_objective', 'same_expected_outcome')),
  status              text not null default 'verified' check (status in ('verified', 'regressed')),
  regressed_result_id uuid null references public.test_results(id) on delete set null,
  verified_at         timestamptz not null default now(),
  regressed_at        timestamptz null,
  created_at          timestamptz not null default now(),
  unique (original_result_id, retest_result_id)
);
create index if not exists fix_verifications_inspection_idx on public.fix_verifications (inspection_id);

-- ---------------------------------------------------------------- access control (same model as init)
alter table public.evidence_artifacts enable row level security;
alter table public.fix_verifications  enable row level security;
revoke all on public.evidence_artifacts, public.fix_verifications from anon, authenticated;

-- ---------------------------------------------------------------- private storage bucket
-- Screenshots live in a PRIVATE Supabase Storage bucket. storage.objects has
-- RLS enabled with no anon policies, so only the CECH server (service role)
-- can read or write; browsers receive images only through CECH's API.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('cech-evidence', 'cech-evidence', false, 4194304, array['image/jpeg', 'image/png'])
    on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png'];
  end if;
end $$;
