-- Family World Cup Sweepstake — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Database > SQL Editor > New query > paste > Run).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.sweepstakes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  admin_pin    text not null,
  big_teams    jsonb not null default '[]'::jsonb,
  lesser_teams jsonb not null default '[]'::jsonb,
  status       text not null default 'open',       -- open | complete
  locked       boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.participants (
  id            uuid primary key default gen_random_uuid(),
  sweepstake_id uuid not null references public.sweepstakes (id) on delete cascade,
  name          text not null,
  nickname      text,
  created_at    timestamptz not null default now()
);

create table if not exists public.results (
  id             uuid primary key default gen_random_uuid(),
  sweepstake_id  uuid not null references public.sweepstakes (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  player_name    text not null,
  nickname       text,
  big_team       text not null,
  lesser_team    text not null,
  draw_order     integer not null,
  created_at     timestamptz not null default now(),
  unique (sweepstake_id, participant_id),
  unique (sweepstake_id, big_team),
  unique (sweepstake_id, lesser_team)
);

create index if not exists participants_sweepstake_idx on public.participants (sweepstake_id);
create index if not exists results_sweepstake_idx on public.results (sweepstake_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- This is a private family app shared by link, so the policies are permissive:
-- anyone with the link (anon key) can read and write these tables.
-- ---------------------------------------------------------------------------

alter table public.sweepstakes enable row level security;
alter table public.participants enable row level security;
alter table public.results enable row level security;

drop policy if exists "sweepstakes_select" on public.sweepstakes;
drop policy if exists "sweepstakes_insert" on public.sweepstakes;
drop policy if exists "sweepstakes_update" on public.sweepstakes;
create policy "sweepstakes_select" on public.sweepstakes for select using (true);
create policy "sweepstakes_insert" on public.sweepstakes for insert with check (true);
create policy "sweepstakes_update" on public.sweepstakes for update using (true) with check (true);

drop policy if exists "participants_select" on public.participants;
drop policy if exists "participants_insert" on public.participants;
create policy "participants_select" on public.participants for select using (true);
create policy "participants_insert" on public.participants for insert with check (true);

drop policy if exists "results_select" on public.results;
drop policy if exists "results_insert" on public.results;
create policy "results_select" on public.results for select using (true);
create policy "results_insert" on public.results for insert with check (true);

-- ---------------------------------------------------------------------------
-- Realtime: lets the waiting room update instantly when someone joins.
-- (Safe to run more than once.)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.participants;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sweepstakes;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Room chat
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sweepstake_id uuid not null references public.sweepstakes (id) on delete cascade,
  name          text not null,
  text          text not null check (char_length(text) <= 240),
  created_at    timestamptz not null default now()
);

create index if not exists messages_sweepstake_idx on public.messages (sweepstake_id, created_at);

alter table public.messages enable row level security;
drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_insert" on public.messages;
create policy "messages_select" on public.messages for select using (true);
create policy "messages_insert" on public.messages for insert with check (true);

-- Admin can remove a player before the draw
drop policy if exists "participants_delete" on public.participants;
create policy "participants_delete" on public.participants for delete using (true);

-- Live updates for chat + draw results landing in the room
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.results;
  exception when duplicate_object then null;
  end;
end $$;
