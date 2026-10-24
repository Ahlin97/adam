-- Gymlogg: all synced collections share the same shape.
-- The client is the source of truth for `data`; the server assigns `seq` (monotonic) so clients can pull changes.

create sequence if not exists public.sync_seq;

create or replace function public.bump_seq() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.sync_seq');
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['exercises', 'templates', 'programs', 'sessions', 'sets', 'settings'] loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null,
        data jsonb not null,
        deleted boolean not null default false,
        seq bigint not null default 0,
        updated_at timestamptz not null default now(),
        primary key (user_id, id)
      );
      create index if not exists %1$s_user_seq on public.%1$I (user_id, seq);
      alter table public.%1$I enable row level security;
      drop policy if exists "own rows" on public.%1$I;
      create policy "own rows" on public.%1$I for all
        using (user_id = auth.uid()) with check (user_id = auth.uid());
      drop trigger if exists bump_seq on public.%1$I;
      create trigger bump_seq before insert or update on public.%1$I
        for each row execute function public.bump_seq();
    $f$, t);
  end loop;
end $$;

create index if not exists sets_session on public.sets (user_id, (data ->> 'sessionId'));
create index if not exists sessions_status on public.sessions (user_id, (data ->> 'status'));

-- Personal API keys for the Apple Watch shortcut. Only the SHA-256 hash is stored.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Apple Watch',
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.api_keys enable row level security;
drop policy if exists "own keys" on public.api_keys;
create policy "own keys" on public.api_keys for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
