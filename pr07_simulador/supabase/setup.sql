-- =====================================================================
--  PR07 · Simulador d'impressió en xarxa (Badia Tech) · Instal·lació a Supabase
--  Com fer-ho servir:
--    1. Canvia el PIN del docent a l'última secció d'aquest fitxer.
--    2. Supabase › SQL Editor › New query › enganxa tot el fitxer › Run.
--  Es pot tornar a executar sense perdre dades (només actualitza funcions i el PIN).
-- =====================================================================

-- ---------- Taules ----------
create table if not exists public.pr07_config (
  key   text primary key,
  value text not null
);

create table if not exists public.pr07_claims (
  room         text not null,
  device_id    text not null,
  student_name text not null,
  claimed_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  progress     jsonb not null default '{}'::jsonb,
  state        jsonb not null default '{}'::jsonb,
  primary key (room, device_id)
);

create table if not exists public.pr07_tokens (
  room      text not null,
  device_id text not null,
  token     text not null,
  primary key (room, device_id)
);

create table if not exists public.pr07_jobs (
  id           bigint generated always as identity primary key,
  room         text not null,
  device_id    text not null,
  student_name text not null,
  printer_name text,
  doc_name     text not null,
  pages        int  not null default 1,
  copies       int  not null default 1,
  duplex       text not null default 'none',
  paper        text not null default 'A4',
  protocol     text,
  method       text,
  driver_ok    boolean not null default true,
  status       text not null default 'queued',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pr07_jobs_status_chk check (status in ('queued','printing','done','cancelled'))
);
create index if not exists pr07_jobs_room_idx on public.pr07_jobs (room, status, id);

create table if not exists public.pr07_events (
  id         bigint generated always as identity primary key,
  room       text not null,
  device_id  text,
  kind       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists pr07_events_room_idx on public.pr07_events (room, id);

create table if not exists public.pr07_printer (
  room        text primary key,
  toner       numeric(5,1) not null default 87,
  pages_total int not null default 0,
  online      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ---------- Seguretat: lectura pública de l'estat del joc, escriptura només amb funcions ----------
alter table public.pr07_config  enable row level security;
alter table public.pr07_tokens  enable row level security;
alter table public.pr07_claims  enable row level security;
alter table public.pr07_jobs    enable row level security;
alter table public.pr07_events  enable row level security;
alter table public.pr07_printer enable row level security;

drop policy if exists pr07_claims_read  on public.pr07_claims;
drop policy if exists pr07_jobs_read    on public.pr07_jobs;
drop policy if exists pr07_events_read  on public.pr07_events;
drop policy if exists pr07_printer_read on public.pr07_printer;
create policy pr07_claims_read  on public.pr07_claims  for select to anon, authenticated using (true);
create policy pr07_jobs_read    on public.pr07_jobs    for select to anon, authenticated using (true);
create policy pr07_events_read  on public.pr07_events  for select to anon, authenticated using (true);
create policy pr07_printer_read on public.pr07_printer for select to anon, authenticated using (true);
-- pr07_config i pr07_tokens no tenen cap política: ningú no les pot llegir des del navegador.
revoke all on public.pr07_config, public.pr07_tokens from anon, authenticated;
revoke insert, update, delete, truncate on public.pr07_claims, public.pr07_jobs, public.pr07_events, public.pr07_printer from anon, authenticated;
grant select on public.pr07_claims, public.pr07_jobs, public.pr07_events, public.pr07_printer to anon, authenticated;

-- ---------- Funcions internes ----------
create or replace function public.pr07_norm_room(p text) returns text
language sql immutable as $$ select upper(left(regexp_replace(coalesce(p,''), '[^A-Za-z0-9_-]', '', 'g'), 24)) $$;

create or replace function public.pr07_token_ok(p_room text, p_device text, p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pr07_tokens t
                 where t.room = pr07_norm_room(p_room) and t.device_id = p_device and t.token = p_token
                   and length(coalesce(p_token,'')) >= 16)
$$;

create or replace function public.pr07_pin_ok(p_pin text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pr07_config c where c.key = 'teacher_pin' and c.value = coalesce(p_pin,''))
$$;

-- ---------- Funcions per a l'alumnat ----------
create or replace function public.pr07_claim(p_room text, p_device text, p_name text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text := pr07_norm_room(p_room);
  n text := left(btrim(coalesce(p_name,'')), 60);
  other text;
begin
  if r = '' then return jsonb_build_object('ok', false, 'error', 'sala'); end if;
  if length(n) < 3 then return jsonb_build_object('ok', false, 'error', 'nom'); end if;
  if p_device !~ '^[A-Z]{3}-PC0[1-9]$' then return jsonb_build_object('ok', false, 'error', 'dispositiu'); end if;
  if length(coalesce(p_token,'')) < 16 then return jsonb_build_object('ok', false, 'error', 'token'); end if;

  insert into pr07_printer(room) values (r) on conflict (room) do nothing;

  if exists (select 1 from pr07_claims where room = r and device_id = p_device) then
    if pr07_token_ok(r, p_device, p_token) then
      return jsonb_build_object('ok', true, 'resumed', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'ocupat');
  end if;

  select device_id into other from pr07_claims
   where room = r and lower(student_name) = lower(n) limit 1;
  if other is not null then
    return jsonb_build_object('ok', false, 'error', 'ja_tens', 'device', other);
  end if;

  insert into pr07_claims(room, device_id, student_name) values (r, p_device, n);
  insert into pr07_tokens(room, device_id, token) values (r, p_device, p_token)
    on conflict (room, device_id) do update set token = excluded.token;
  insert into pr07_events(room, device_id, kind, message)
    values (r, p_device, 'info', n || ' s''ha connectat a ' || p_device);
  return jsonb_build_object('ok', true, 'resumed', false);
end $$;

create or replace function public.pr07_resume(p_room text, p_device text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not pr07_token_ok(p_room, p_device, p_token) then
    return jsonb_build_object('ok', false, 'error', 'token');
  end if;
  select * into c from pr07_claims where room = pr07_norm_room(p_room) and device_id = p_device;
  if not found then return jsonb_build_object('ok', false, 'error', 'alliberat'); end if;
  return jsonb_build_object('ok', true, 'student_name', c.student_name, 'state', c.state, 'progress', c.progress);
end $$;

create or replace function public.pr07_save(p_room text, p_device text, p_token text, p_state jsonb, p_progress jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not pr07_token_ok(p_room, p_device, p_token) then
    return jsonb_build_object('ok', false, 'error', 'token');
  end if;
  if octet_length(coalesce(p_state,'{}'::jsonb)::text) > 40000 or octet_length(coalesce(p_progress,'{}'::jsonb)::text) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'massa_gran');
  end if;
  update pr07_claims set state = coalesce(p_state, state), progress = coalesce(p_progress, progress), updated_at = now()
   where room = pr07_norm_room(p_room) and device_id = p_device;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pr07_submit_job(p_room text, p_device text, p_token text,
  p_printer text, p_doc text, p_pages int, p_copies int, p_duplex text, p_paper text,
  p_protocol text, p_method text, p_driver_ok boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text := pr07_norm_room(p_room);
  nm text;
  pending int;
  new_id bigint;
begin
  if not pr07_token_ok(r, p_device, p_token) then
    return jsonb_build_object('ok', false, 'error', 'token');
  end if;
  select student_name into nm from pr07_claims where room = r and device_id = p_device;
  if nm is null then return jsonb_build_object('ok', false, 'error', 'alliberat'); end if;
  select count(*) into pending from pr07_jobs where room = r and device_id = p_device and status in ('queued','printing');
  if pending >= 5 then return jsonb_build_object('ok', false, 'error', 'cua_plena'); end if;

  insert into pr07_jobs(room, device_id, student_name, printer_name, doc_name, pages, copies, duplex, paper, protocol, method, driver_ok)
  values (r, p_device, nm, left(coalesce(p_printer,''), 80), left(coalesce(p_doc,'document'), 80),
          greatest(1, least(coalesce(p_pages,1), 20)), greatest(1, least(coalesce(p_copies,1), 3)),
          case when p_duplex in ('none','long','short') then p_duplex else 'none' end,
          left(coalesce(p_paper,'A4'), 60), left(coalesce(p_protocol,''), 10), left(coalesce(p_method,''), 12),
          coalesce(p_driver_ok, true))
  returning id into new_id;
  update pr07_claims set updated_at = now() where room = r and device_id = p_device;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.pr07_log_event(p_room text, p_device text, p_token text, p_kind text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := pr07_norm_room(p_room);
begin
  if not pr07_token_ok(r, p_device, p_token) then
    return jsonb_build_object('ok', false, 'error', 'token');
  end if;
  if p_kind not in ('deny','info') then return jsonb_build_object('ok', false, 'error', 'tipus'); end if;
  if exists (select 1 from pr07_events where room = r and device_id = p_device and kind = p_kind
             and message = left(coalesce(p_message,''), 220) and created_at > now() - interval '5 seconds') then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;
  insert into pr07_events(room, device_id, kind, message) values (r, p_device, p_kind, left(coalesce(p_message,''), 220));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Funcions per al docent (protegides amb PIN) ----------
create or replace function public.pr07_teacher_check(p_room text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  insert into pr07_printer(room) values (pr07_norm_room(p_room)) on conflict (room) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Un pas del motor de la impressora: acaba el treball en curs i comença el següent de la cua.
create or replace function public.pr07_teacher_step(p_room text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text := pr07_norm_room(p_room);
  pr record;
  cur record;
  nxt record;
  used numeric;
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  insert into pr07_printer(room) values (r) on conflict (room) do nothing;
  select * into pr from pr07_printer where room = r for update;
  if not pr.online then return jsonb_build_object('ok', true, 'idle', 'offline'); end if;

  for cur in select * from pr07_jobs where room = r and status = 'printing' order by id for update loop
    used := round((cur.pages * cur.copies) * 0.25, 1);
    update pr07_jobs set status = 'done', updated_at = now() where id = cur.id;
    update pr07_printer set toner = greatest(0, toner - used),
                            pages_total = pages_total + cur.pages * cur.copies,
                            updated_at = now()
     where room = r;
  end loop;

  select * into pr from pr07_printer where room = r;
  if pr.toner <= 0 then return jsonb_build_object('ok', true, 'idle', 'toner'); end if;

  select * into nxt from pr07_jobs where room = r and status = 'queued' order by id limit 1 for update skip locked;
  if found then
    update pr07_jobs set status = 'printing', updated_at = now() where id = nxt.id;
    return jsonb_build_object('ok', true, 'printing', nxt.id);
  end if;
  return jsonb_build_object('ok', true, 'idle', 'empty');
end $$;

create or replace function public.pr07_teacher_set_printer(p_room text, p_pin text, p_toner numeric, p_online boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := pr07_norm_room(p_room);
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  insert into pr07_printer(room) values (r) on conflict (room) do nothing;
  update pr07_printer set toner = coalesce(greatest(0, least(100, p_toner)), toner),
                          online = coalesce(p_online, online), updated_at = now()
   where room = r;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pr07_teacher_cancel(p_room text, p_pin text, p_job bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  update pr07_jobs set status = 'cancelled', updated_at = now()
   where id = p_job and room = pr07_norm_room(p_room) and status in ('queued','printing');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pr07_teacher_clear_queue(p_room text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  update pr07_jobs set status = 'cancelled', updated_at = now()
   where room = pr07_norm_room(p_room) and status in ('queued','printing');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pr07_teacher_release(p_room text, p_pin text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := pr07_norm_room(p_room);
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  delete from pr07_claims where room = r and device_id = p_device;
  delete from pr07_tokens where room = r and device_id = p_device;
  insert into pr07_events(room, device_id, kind, message) values (r, p_device, 'info', 'El docent ha alliberat ' || p_device);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pr07_teacher_reset(p_room text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := pr07_norm_room(p_room);
begin
  if not pr07_pin_ok(p_pin) then return jsonb_build_object('ok', false, 'error', 'pin'); end if;
  delete from pr07_jobs   where room = r;
  delete from pr07_events where room = r;
  delete from pr07_claims where room = r;
  delete from pr07_tokens where room = r;
  delete from pr07_printer where room = r;
  insert into pr07_printer(room) values (r);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Permisos ----------
revoke all on function public.pr07_token_ok(text, text, text) from public, anon, authenticated;
revoke all on function public.pr07_pin_ok(text) from public, anon, authenticated;
grant execute on function public.pr07_claim(text, text, text, text) to anon, authenticated;
grant execute on function public.pr07_resume(text, text, text) to anon, authenticated;
grant execute on function public.pr07_save(text, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.pr07_submit_job(text, text, text, text, text, int, int, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.pr07_log_event(text, text, text, text, text) to anon, authenticated;
grant execute on function public.pr07_teacher_check(text, text) to anon, authenticated;
grant execute on function public.pr07_teacher_step(text, text) to anon, authenticated;
grant execute on function public.pr07_teacher_set_printer(text, text, numeric, boolean) to anon, authenticated;
grant execute on function public.pr07_teacher_cancel(text, text, bigint) to anon, authenticated;
grant execute on function public.pr07_teacher_clear_queue(text, text) to anon, authenticated;
grant execute on function public.pr07_teacher_release(text, text, text) to anon, authenticated;
grant execute on function public.pr07_teacher_reset(text, text) to anon, authenticated;

-- ---------- Temps real (perquè la pantalla del docent i l'alumnat s'actualitzin sols) ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pr07_claims','pr07_jobs','pr07_events','pr07_printer'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- PIN del docent: CANVIA'L abans d'executar ----------
insert into public.pr07_config(key, value) values ('teacher_pin', 'Wn&V7jERPPsUD,u')
on conflict (key) do update set value = excluded.value;
