-- 0014: buzón de sugerencias de mejora.
-- Cualquier usuario con rol (no "pendiente") carga una sugerencia con texto, fotos y/o una nota de audio.
-- Cada sugerencia nueva se manda por correo al responsable de mejoras (por defecto licarizaga@gmail.com)
-- con las fotos y el audio adjuntos. El correo lo envía la propia base, con Resend (resend.com) y pg_net.
--
-- CONFIGURACIÓN (una sola vez, en el SQL Editor, después de correr este archivo):
--   select vault.create_secret('re_XXXXXXXX', 'resend_api_key');            -- clave de Resend
-- Opcional, para cambiar a quién llega o desde qué dirección sale:
--   select vault.create_secret('otro@correo.com', 'sugerencias_destino');
--   select vault.create_secret('Buzón BoxTainer <mejoras@tudominio.com>', 'sugerencias_remitente');
-- Para cambiar un valor ya cargado:
--   select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_NUEVA');
-- Sin la clave, las sugerencias se guardan igual y el administrador las ve en la app; se pueden
-- reenviar después con el botón "Reenviar correo".

create extension if not exists pg_net with schema extensions;

-- ══════════════ TABLA ══════════════
create table if not exists sugerencias (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references perfiles on delete cascade default auth.uid(),
  autor_nombre text not null default '',
  autor_rol text not null default '',
  autor_email text not null default '',
  texto text not null default '' check (length(texto) <= 5000),
  -- [{tipo:'foto'|'audio', nombre, ruta, url}]: ruta en el depósito "sugerencias", url firmada (30 días)
  adjuntos jsonb not null default '[]'::jsonb check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 6),
  estado text not null default 'nueva' check (estado in ('nueva','analisis','en_marcha','hecha','descartada')),
  respuesta text not null default '',         -- lo que el administrador le contesta al autor
  correo_req bigint,                           -- id del pedido a Resend (para ver si salió)
  correo_enviado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (length(trim(texto)) > 0 or jsonb_array_length(adjuntos) > 0)
);
create index if not exists sugerencias_autor_idx on sugerencias (autor, creado_en desc);

alter table sugerencias enable row level security;
drop policy if exists sug_ver on sugerencias;
create policy sug_ver on sugerencias for select using (autor = auth.uid() or mi_rol() = 'admin');
drop policy if exists sug_cargar on sugerencias;
create policy sug_cargar on sugerencias for insert
  with check (autor = auth.uid() and mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists sug_admin_edita on sugerencias;
create policy sug_admin_edita on sugerencias for update using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
drop policy if exists sug_admin_borra on sugerencias;
create policy sug_admin_borra on sugerencias for delete using (mi_rol() = 'admin');

-- ══════════════ FOTOS Y AUDIOS (depósito privado) ══════════════
-- Cada usuario sube en su carpeta: <uid>/<id sugerencia>/archivo. Lo ve él y el administrador.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sugerencias', 'sugerencias', false, 26214400) on conflict (id) do nothing;
drop policy if exists sug_arch_ver on storage.objects;
create policy sug_arch_ver on storage.objects for select
  using (bucket_id = 'sugerencias' and ((storage.foldername(name))[1] = auth.uid()::text or mi_rol() = 'admin'));
drop policy if exists sug_arch_subir on storage.objects;
create policy sug_arch_subir on storage.objects for insert
  with check (bucket_id = 'sugerencias' and (storage.foldername(name))[1] = auth.uid()::text
              and mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists sug_arch_borrar on storage.objects;
create policy sug_arch_borrar on storage.objects for delete
  using (bucket_id = 'sugerencias' and mi_rol() = 'admin');

-- ══════════════ CORREO ══════════════
create or replace function html_esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- Arma el correo y lo deja en la cola de pg_net (sale cuando la transacción se confirma).
-- Devuelve el id del pedido, o null si falta la clave de Resend.
create or replace function enviar_correo_sugerencia(s sugerencias) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  clave text := (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key' limit 1);
  destino text := coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'sugerencias_destino' limit 1),
                           'licarizaga@gmail.com');
  remitente text := coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'sugerencias_remitente' limit 1),
                             'Buzón BoxTainer <onboarding@resend.dev>');
  adj jsonb := '[]'::jsonb;
  lista text := '';
  a jsonb;
  resumen text;
  html text;
  req bigint;
begin
  if clave is null or trim(clave) = '' then return null; end if;

  for a in select * from jsonb_array_elements(s.adjuntos) loop
    -- solo se adjuntan enlaces firmados del propio depósito "sugerencias" y de la carpeta del autor
    if (a->>'url') like 'https://%/storage/v1/object/sign/sugerencias/' || s.autor::text || '/%' then
      adj := adj || jsonb_build_array(jsonb_build_object('filename', coalesce(nullif(a->>'nombre', ''), 'adjunto'), 'path', a->>'url'));
      lista := lista || format('<li>%s <a href="%s">%s</a></li>',
        case when a->>'tipo' = 'audio' then '🎙️' else '📷' end,
        html_esc(a->>'url'), html_esc(coalesce(nullif(a->>'nombre', ''), 'abrir')));
    end if;
  end loop;

  resumen := coalesce(nullif(left(regexp_replace(trim(s.texto), '\s+', ' ', 'g'), 60), ''),
                      case when s.adjuntos::text like '%"audio"%' then 'nota de audio' else 'foto' end);
  html := format(
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">'
    '<h2 style="color:#e8590c;margin:0 0 8px">💡 Nueva sugerencia de mejora</h2>'
    '<p style="margin:0 0 4px"><b>De:</b> %s (%s)%s</p>'
    '<p style="margin:0 0 12px;color:#666"><b>Fecha:</b> %s</p>'
    '<div style="background:#f6f6f6;border-radius:8px;padding:12px">%s</div>'
    '%s'
    '<p style="margin-top:16px"><a href="https://boxtainerapp.vercel.app">Abrir la app</a> para marcarla en análisis, en marcha o hecha y contestarle.</p>'
    '</div>',
    html_esc(s.autor_nombre), html_esc(s.autor_rol),
    case when s.autor_email <> '' then ' · ' || html_esc(s.autor_email) else '' end,
    to_char(s.creado_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'),
    coalesce(nullif(replace(html_esc(trim(s.texto)), E'\n', '<br>'), ''), '<i>(sin texto, ver adjuntos)</i>'),
    case when lista <> '' then '<p style="margin:14px 0 4px"><b>Adjuntos</b> (también van adjuntos al correo; los enlaces duran 30 días):</p><ul>' || lista || '</ul>' else '' end);

  select net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', remitente,
      'to', jsonb_build_array(destino),
      'subject', '💡 Sugerencia de ' || coalesce(nullif(s.autor_nombre, ''), 'un usuario') || ': ' || resumen,
      'html', html,
      'attachments', adj)
      || case when s.autor_email <> '' then jsonb_build_object('reply_to', s.autor_email) else '{}'::jsonb end,
    headers := jsonb_build_object('Authorization', 'Bearer ' || clave, 'Content-Type', 'application/json'),
    timeout_milliseconds := 20000
  ) into req;
  return req;
end $$;
revoke all on function enviar_correo_sugerencia(sugerencias) from public, anon, authenticated;

-- Al cargar: se completan los datos del autor desde su perfil (no se confía en lo que manda el celular)
-- y se encola el correo.
create or replace function sugerencia_nueva() returns trigger
language plpgsql security definer set search_path = public as $$
declare pf perfiles;
begin
  select * into pf from perfiles where id = new.autor;
  new.autor_nombre := coalesce(nullif(pf.nombre, ''), pf.email, '');
  new.autor_rol := case pf.rol::text when 'admin' then 'Administrador' when 'lider' then 'Líder de operaciones'
    when 'supervisor' then 'Supervisor' when 'ventas' then 'Ventas' when 'arquitectura' then 'Arquitectura'
    when 'lectura' then 'Solo lectura' when 'carp_aluminio' then 'Carpintería de aluminio'
    when 'carp_madera' then 'Carpintería de madera' else coalesce(pf.rol::text, '') end;
  new.autor_email := coalesce(pf.email, '');
  new.estado := 'nueva';
  new.respuesta := '';
  new.creado_en := now();
  new.correo_req := enviar_correo_sugerencia(new);
  new.correo_enviado_en := case when new.correo_req is not null then now() end;
  return new;
end $$;
drop trigger if exists sugerencia_nueva on sugerencias;
create trigger sugerencia_nueva before insert on sugerencias for each row execute function sugerencia_nueva();

-- El administrador solo cambia estado y respuesta.
create or replace function sugerencia_editada() returns trigger language plpgsql as $$
begin
  if (new.autor, new.texto, new.adjuntos, new.creado_en) is distinct from (old.autor, old.texto, old.adjuntos, old.creado_en) then
    raise exception 'Solo se puede cambiar el estado y la respuesta de una sugerencia';
  end if;
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists sugerencia_editada on sugerencias;
create trigger sugerencia_editada before update on sugerencias for each row execute function sugerencia_editada();

-- Reenviar (solo admin): por ejemplo, si se cargó la clave de Resend después.
create or replace function reenviar_sugerencia(sug uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sugerencias; req bigint;
begin
  if mi_rol() is distinct from 'admin' then raise exception 'Solo el administrador puede reenviar'; end if;
  select * into s from sugerencias where id = sug;
  if s.id is null then raise exception 'No existe la sugerencia'; end if;
  req := enviar_correo_sugerencia(s);
  if req is null then raise exception 'Falta configurar la clave de Resend (ver 0014_buzon_de_sugerencias.sql)'; end if;
  update sugerencias set correo_req = req, correo_enviado_en = now() where id = sug;
end $$;
revoke all on function reenviar_sugerencia(uuid) from public, anon;
grant execute on function reenviar_sugerencia(uuid) to authenticated;

-- Estado del último envío de cada sugerencia (solo admin). pg_net guarda las respuestas unas 6 horas.
create or replace function estado_correos_sugerencias()
returns table (id uuid, status_code int, error text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if mi_rol() is distinct from 'admin' then return; end if;
  return query
    select s.id, r.status_code, coalesce(r.error_msg, case when r.status_code >= 300 then left(r.content, 300) end)
    from sugerencias s join net._http_response r on r.id = s.correo_req;
end $$;
revoke all on function estado_correos_sugerencias() from public, anon;
grant execute on function estado_correos_sugerencias() to authenticated;
