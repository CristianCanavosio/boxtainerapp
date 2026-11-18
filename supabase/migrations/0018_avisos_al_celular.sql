-- 0018: avisos al celular (Web Push) de los pedidos a carpinterías y técnicos de aire,
-- aunque la app esté cerrada.
-- Cómo funciona:
--   1. Cada usuario toca "🔔 Activar" en la app: su celular o compu queda anotado en push_suscripciones.
--   2. Cuando se crea o cambia un pedido, la base llama a la función "avisar-pedido" (pg_net).
--   3. La función busca a quién avisar y manda el aviso a sus equipos.
-- Antes de correr esto: publicar la función avisar-pedido (ver supabase/functions/avisar-pedido)
-- y cargar en el Vault la dirección de la función y la clave compartida:
--   select vault.create_secret('https://hdmpauhoeznoowxmgbwn.supabase.co/functions/v1/avisar-pedido', 'push_url');
--   select vault.create_secret('LA_MISMA_CLAVE_QUE_PUSH_SECRETO', 'push_secreto');
-- Sin esas dos claves los pedidos se guardan igual: solo no sale el aviso al celular.
-- Requiere 0009 (pedidos) y la extensión pg_net (0014 ya la activó).

create extension if not exists pg_net with schema extensions;

-- ══════════════ EQUIPOS ANOTADOS PARA AVISOS ══════════════
create table if not exists push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  equipo text,                                   -- navegador / celular, para reconocerlo
  creado_en timestamptz not null default now()
);
create index if not exists push_susc_usuario on push_suscripciones (usuario_id);
alter table push_suscripciones enable row level security;
revoke all on push_suscripciones from anon;
-- cada uno ve, anota y borra solo los suyos (la función usa la clave de servicio)
drop policy if exists push_propias on push_suscripciones;
create policy push_propias on push_suscripciones for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Si el mismo equipo ya estaba anotado (por ejemplo con otro usuario), lo pasa a quien lo activa ahora
create or replace function anotar_push(p_endpoint text, p_p256dh text, p_auth text, p_equipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión' using errcode = 'P0001'; end if;
  insert into push_suscripciones (usuario_id, endpoint, p256dh, auth, equipo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_equipo)
  on conflict (endpoint) do update set usuario_id = auth.uid(), p256dh = excluded.p256dh,
    auth = excluded.auth, equipo = excluded.equipo, creado_en = now();
end $$;
revoke all on function anotar_push(text, text, text, text) from anon;

-- ══════════════ AVISO AL CREAR O CAMBIAR UN PEDIDO ══════════════
create or replace function avisar_pedido_carp() returns trigger language plpgsql security definer set search_path = public as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_url' limit 1);
  secreto text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto' limit 1);
begin
  if url is null or secreto is null then return new; end if;
  if tg_op = 'UPDATE' and new.estado = old.estado and new.fecha_compromiso is not distinct from old.fecha_compromiso then
    return new; -- no cambió nada que avise
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secreto', secreto),
    body := jsonb_build_object(
      'id', new.id, 'nuevo', tg_op = 'INSERT', 'por', auth.uid(),
      'estado_antes', case when tg_op = 'UPDATE' then old.estado end, 'estado', new.estado,
      'fecha_antes', case when tg_op = 'UPDATE' then old.fecha_compromiso end, 'fecha', new.fecha_compromiso));
  return new;
exception when others then
  raise warning 'No se pudo pedir el aviso al celular: %', sqlerrm;
  return new; -- el pedido se guarda igual
end $$;
drop trigger if exists avisar_pedido_carp on pedidos_carpinteria;
create trigger avisar_pedido_carp after insert or update on pedidos_carpinteria
  for each row execute function avisar_pedido_carp();

-- Comprobación: debe devolver push_suscripciones con rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename = 'push_suscripciones';
