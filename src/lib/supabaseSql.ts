export const SUPABASE_SQL_SCHEMA = `-- ============================================================================
-- AVINASH STUDIO — SUPABASE POSTGRESQL DATABASE SETUP
-- Paste this in: Supabase Dashboard -> SQL Editor -> New Query -> Click "Run"
-- ============================================================================

-- 1. Client Leads Table
create table if not exists public.avinash_leads (
  id text primary key,
  business_name text not null,
  contact_person text not null default '',
  niche text not null default '',
  location text not null default '',
  matched_skill text not null default 'Business Website & Landing Page',
  pain_point text not null default '',
  email text not null default '',
  phone text not null default '',
  insta_handle text not null default '',
  website_url text not null default 'No website',
  estimated_deal_value text,
  conversion_score integer not null default 50,
  conversion_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'New — High Priority',
  last_contacted_at text,
  next_follow_up_date text not null default '',
  pitches jsonb not null default '{}'::jsonb,
  outreach_history jsonb not null default '[]'::jsonb,
  source text not null default 'Manual Entry',
  created_at text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists idx_avinash_leads_score
  on public.avinash_leads (conversion_score desc);

create index if not exists idx_avinash_leads_status
  on public.avinash_leads (status);

-- 2. Workspace Configuration Table
create table if not exists public.avinash_workspace_state (
  workspace_id text primary key default 'default',
  sms_config jsonb not null default '{}'::jsonb,
  email_config jsonb not null default '{}'::jsonb,
  insta_config jsonb not null default '{}'::jsonb,
  persona_config jsonb not null default '{}'::jsonb,
  webhook_config jsonb not null default '{}'::jsonb,
  ai_config jsonb not null default '{}'::jsonb,
  suppression_list jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. Multi-Channel Activity & Dispatch Logs Table
create table if not exists public.avinash_activity_logs (
  id text primary key,
  timestamp text not null,
  channel text not null,
  title text not null,
  detail text not null,
  status text not null default 'Success',
  created_at timestamptz not null default now()
);

create index if not exists idx_avinash_activity_logs_created
  on public.avinash_activity_logs (created_at desc);

-- 4. Enable RLS & Access Policies
alter table public.avinash_leads enable row level security;
alter table public.avinash_workspace_state enable row level security;
alter table public.avinash_activity_logs enable row level security;

drop policy if exists "Allow full access to avinash_leads" on public.avinash_leads;
create policy "Allow full access to avinash_leads"
  on public.avinash_leads
  for all
  to anon, authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "Allow full access to avinash_workspace_state" on public.avinash_workspace_state;
create policy "Allow full access to avinash_workspace_state"
  on public.avinash_workspace_state
  for all
  to anon, authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "Allow full access to avinash_activity_logs" on public.avinash_activity_logs;
create policy "Allow full access to avinash_activity_logs"
  on public.avinash_activity_logs
  for all
  to anon, authenticated, service_role
  using (true)
  with check (true);
`;

export const SUPABASE_SETUP_SQL = SUPABASE_SQL_SCHEMA;

