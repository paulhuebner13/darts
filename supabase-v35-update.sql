-- v35: gemeinsame Cricket-Spielerliste
create table if not exists public.cricket_players (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table public.cricket_players enable row level security;

drop policy if exists "cricket_players_public_read" on public.cricket_players;
create policy "cricket_players_public_read"
on public.cricket_players for select
to anon, authenticated
using (true);

drop policy if exists "cricket_players_public_insert" on public.cricket_players;
create policy "cricket_players_public_insert"
on public.cricket_players for insert
to anon, authenticated
with check (length(trim(name)) between 1 and 24);

drop policy if exists "cricket_players_public_delete" on public.cricket_players;
create policy "cricket_players_public_delete"
on public.cricket_players for delete
to anon, authenticated
using (true);

insert into public.cricket_players (name)
values ('Paul'), ('Lukas')
on conflict (name) do nothing;
