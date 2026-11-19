-- MixLearn Studio — Supabase PostgreSQL Schema & Strict Row-Level Security (RLS)
-- Stores lightweight user profiles and DSP session metric summaries ONLY.
-- Raw audio files are NEVER persisted in Supabase Storage or PostgreSQL.

create extension if not exists "pgcrypto";

-- 1. Profiles table (1:1 with auth.users, auto-deleted on account deletion)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  using (auth.uid() = id);

-- Automatically provision a profile row on auth.users signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Mix sessions table (isolated per-user lightweight DSP summaries — zero raw audio)
create table if not exists public.mix_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track_name text not null,
  genre text not null,
  stage text not null,
  summary_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mix_sessions_user_created
  on public.mix_sessions (user_id, created_at desc);

alter table public.mix_sessions enable row level security;

drop policy if exists "mix_sessions_select_own" on public.mix_sessions;
create policy "mix_sessions_select_own"
  on public.mix_sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "mix_sessions_insert_own" on public.mix_sessions;
create policy "mix_sessions_insert_own"
  on public.mix_sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "mix_sessions_update_own" on public.mix_sessions;
create policy "mix_sessions_update_own"
  on public.mix_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mix_sessions_delete_own" on public.mix_sessions;
create policy "mix_sessions_delete_own"
  on public.mix_sessions
  for delete
  using (auth.uid() = user_id);
