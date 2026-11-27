-- 0033: Aprobación del administrador (pedido de Cristian 27/11).
-- Desde el 1/12 todo trabajo pasa por la app y el cotizador todavía se está puliendo. Por un tiempo,
-- todo presupuesto y toda orden de compra confirmada pasan primero por el administrador:
--   · Presupuesto: cuando queda con precio (de lista, o con el descuento ya autorizado por el líder de
--     ventas), espera al administrador. Hasta que lo apruebe, el vendedor no puede enviarlo ni bajar el PDF
--     con precio. Si el precio cambia después (el vendedor lo edita o cambia un costo del maestro), vuelve a
--     esperar.
--   · Orden de compra confirmada: cuando ventas la envía, queda en ventas "esperando al administrador" y
--     recién pasa a Arquitectura o al Líder cuando él la aprueba.
--   · El administrador aprueba o devuelve con un comentario que ve el vendedor. Le llega un aviso al celular
--     (función avisar-pedido, hay que volver a publicarla) y al vendedor le llega la respuesta.
--   · Lo que carga el propio administrador no espera.
-- Es un interruptor (ajustes_app 'aprobacion_admin') que solo el administrador prende o apaga. Al apagarlo,
-- lo que estaba esperando sale solo y todo vuelve al flujo de antes.
-- La autorización de descuentos del líder de ventas no cambia: va primero, y después el administrador.
-- Requiere 0025 a 0027. Se puede correr más de una vez.

-- ══════════════ 1. EL INTERRUPTOR ══════════════
create table if not exists ajustes_app (
  clave text primary key,
  activo boolean not null default false,
  actualizado_por uuid references perfiles,
  actualizado_en timestamptz not null default now()
);
-- arranca prendido: es lo que pidió Cristian para la salida a producción del 1/12
insert into ajustes_app (clave, activo) values ('aprobacion_admin', true) on conflict (clave) do nothing;
alter table ajustes_app enable row level security;
revoke all on ajustes_app from anon;
drop policy if exists ajustes_ver on ajustes_app;
create policy ajustes_ver on ajustes_app for select using (auth.uid() is not null);
-- se cambia solo con aprobacion_admin_cambiar (así lo que esperaba sale solo al apagarlo)

create or replace function aprobacion_admin_activa() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo from ajustes_app where clave = 'aprobacion_admin'), false)
$$;
create or replace function _soy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text from perfiles where id = auth.uid()) = 'admin', false)
$$;

-- ══════════════ 2. PRESUPUESTOS (cotizaciones) ══════════════
alter table cotizaciones add column if not exists aprobacion text;          -- null (no hace falta) | pendiente | aprobada | devuelta
alter table cotizaciones drop constraint if exists cotizaciones_aprobacion_check;
alter table cotizaciones add constraint cotizaciones_aprobacion_check check (aprobacion in ('pendiente','aprobada','devuelta'));
alter table cotizaciones add column if not exists aprob_precio numeric(14,2);   -- el precio que aprobó
alter table cotizaciones add column if not exists aprob_comentario text;
alter table cotizaciones add column if not exists aprob_por uuid references perfiles;
alter table cotizaciones add column if not exists aprob_en timestamptz;
alter table cotizaciones add column if not exists aprob_pedida_en timestamptz;
create index if not exists cot_aprob on cotizaciones (aprobacion);

-- Antes de guardar una cotización: si el precio quedó listo (o cambió), espera al administrador.
create or replace function cot_controlar_aprobacion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adm boolean := _soy_admin();
  -- pg_trigger_depth() = 1: lo guardó una persona. Más profundo: lo recalculó la base porque cambió un costo.
  directo boolean := pg_trigger_depth() <= 1;
  cambio boolean;
begin
  if tg_op = 'UPDATE' and current_setting('app.aprobando', true) = '1' then return new; end if;
  -- las columnas de la aprobación las cambian solo las funciones de abajo
  if tg_op = 'UPDATE' and (new.aprobacion is distinct from old.aprobacion or new.aprob_precio is distinct from old.aprob_precio
       or new.aprob_comentario is distinct from old.aprob_comentario or new.aprob_por is distinct from old.aprob_por) then
    new.aprobacion := old.aprobacion; new.aprob_precio := old.aprob_precio; new.aprob_comentario := old.aprob_comentario;
    new.aprob_por := old.aprob_por; new.aprob_en := old.aprob_en; new.aprob_pedida_en := old.aprob_pedida_en;
  end if;
  if not aprobacion_admin_activa() then return new; end if;   -- apagado: como antes

  -- Enviar al cliente (cotizador por tipología). "Enviada" en una nota = el cliente aceptó (eso lo frena la orden de compra).
  if tg_op = 'UPDATE' and new.estado = 'enviada' and old.estado <> 'enviada' then
    if new.origen = 'tipologia' and coalesce(new.aprobacion, '') <> 'aprobada' and not adm then
      raise exception 'Este presupuesto espera la aprobación del administrador: todavía no se puede enviar al cliente' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado = 'enviada' then return new; end if;

  -- Sin precio todavía (espera al líder de ventas o lo rechazó): al administrador le llega después
  if new.estado not in ('lista','autorizada') then
    if tg_op = 'INSERT' or old.estado is distinct from new.estado then
      new.aprobacion := null; new.aprob_precio := null; new.aprob_por := null; new.aprob_en := null;
    end if;
    return new;
  end if;

  cambio := tg_op = 'INSERT' or old.estado not in ('lista','autorizada') or new.aprobacion is null
    or new.precio_final is distinct from old.precio_final or new.unidades is distinct from old.unidades
    or new.detalle is distinct from old.detalle or new.cambios is distinct from old.cambios or new.notas is distinct from old.notas;
  if not cambio then return new; end if;
  if adm and directo then
    new.aprobacion := 'aprobada'; new.aprob_precio := new.precio_final; new.aprob_por := auth.uid(); new.aprob_en := now();
    new.aprob_comentario := null;
  else
    new.aprobacion := 'pendiente'; new.aprob_precio := null; new.aprob_por := null; new.aprob_en := null;
    new.aprob_pedida_en := now();
    if tg_op = 'INSERT' or old.aprobacion is distinct from 'devuelta' then new.aprob_comentario := null; end if;
  end if;
  return new;
end $$;
revoke all on function cot_controlar_aprobacion() from public, anon, authenticated;
drop trigger if exists cot_aprobacion on cotizaciones;
create trigger cot_aprobacion before insert or update on cotizaciones for each row execute function cot_controlar_aprobacion();

-- El administrador aprueba o devuelve un presupuesto
create or replace function cot_aprobar_admin(p_id uuid, p_aprobar boolean, p_comentario text) returns void
language plpgsql security definer set search_path = public as $$
declare v cotizaciones;
begin
  if not _soy_admin() then raise exception 'Solo el administrador aprueba presupuestos' using errcode = 'P0001'; end if;
  select * into v from cotizaciones where id = p_id for update;
  if not found then raise exception 'No encontré ese presupuesto' using errcode = 'P0001'; end if;
  if v.estado not in ('lista','autorizada') then
    raise exception '%', case when v.estado = 'enviada' then 'Ese presupuesto ya salió' else 'Ese presupuesto todavía espera al líder de ventas' end
      using errcode = 'P0001';
  end if;
  if not p_aprobar and length(trim(coalesce(p_comentario, ''))) = 0 then
    raise exception 'Contale al vendedor qué hay que corregir' using errcode = 'P0001';
  end if;
  perform set_config('app.aprobando', '1', true);
  update cotizaciones set
    aprobacion = case when p_aprobar then 'aprobada' else 'devuelta' end,
    aprob_precio = case when p_aprobar then v.precio_final end,
    aprob_comentario = nullif(trim(coalesce(p_comentario, '')), ''),
    aprob_por = auth.uid(), aprob_en = now()
  where id = p_id;
  perform set_config('app.aprobando', '', true);
end $$;
revoke all on function cot_aprobar_admin(uuid, boolean, text) from public, anon;
grant execute on function cot_aprobar_admin(uuid, boolean, text) to authenticated;

-- ══════════════ 3. ÓRDENES DE COMPRA (proyectos) ══════════════
alter table proyectos add column if not exists aprob_oc text;               -- null | pendiente | aprobada | devuelta
alter table proyectos drop constraint if exists proyectos_aprob_oc_check;
alter table proyectos add constraint proyectos_aprob_oc_check check (aprob_oc in ('pendiente','aprobada','devuelta'));
alter table proyectos add column if not exists aprob_oc_destino etapa_proy;  -- a dónde va cuando se aprueba
alter table proyectos add column if not exists aprob_oc_comentario text;
alter table proyectos add column if not exists aprob_oc_por uuid references perfiles;
alter table proyectos add column if not exists aprob_oc_en timestamptz;
alter table proyectos add column if not exists aprob_oc_pedida_en timestamptz;

-- ¿Es una orden de compra (nota de pedido que no es presupuesto)?
create or replace function _es_oc(f jsonb) returns boolean language sql immutable as $$
  select coalesce((f->>'v')::int, 0) = 2 and coalesce(f->>'sol', '') <> 'Presupuesto'
$$;

create or replace function controlar_aprobacion_oc() returns trigger
language plpgsql security definer set search_path = public as $$
declare fn boolean := current_setting('app.aprobando', true) = '1'; adm boolean := _soy_admin();
begin
  if fn then return new; end if;
  -- las columnas de la aprobación las cambian solo las funciones de abajo
  if tg_op = 'INSERT' then
    new.aprob_oc := null; new.aprob_oc_destino := null; new.aprob_oc_comentario := null;
    new.aprob_oc_por := null; new.aprob_oc_en := null; new.aprob_oc_pedida_en := null;
  elsif new.aprob_oc is distinct from old.aprob_oc or new.aprob_oc_destino is distinct from old.aprob_oc_destino
     or new.aprob_oc_comentario is distinct from old.aprob_oc_comentario or new.aprob_oc_por is distinct from old.aprob_oc_por then
    new.aprob_oc := old.aprob_oc; new.aprob_oc_destino := old.aprob_oc_destino; new.aprob_oc_comentario := old.aprob_oc_comentario;
    new.aprob_oc_por := old.aprob_oc_por; new.aprob_oc_en := old.aprob_oc_en; new.aprob_oc_pedida_en := old.aprob_oc_pedida_en;
  end if;
  if adm or not aprobacion_admin_activa() or not _es_oc(new.ficha) then return new; end if;
  if tg_op = 'INSERT' then
    -- una orden de compra cargada directo para el líder (por ejemplo, por el líder de operaciones): queda esperando
    if new.etapa <> 'ventas' then
      new.aprob_oc_destino := new.etapa; new.etapa := 'ventas';
      new.aprob_oc := 'pendiente'; new.aprob_oc_pedida_en := now();
    end if;
    return new;
  end if;
  if old.etapa = 'ventas' and new.etapa <> 'ventas' and coalesce(old.aprob_oc, '') <> 'aprobada' then
    raise exception 'Esta orden de compra espera la aprobación del administrador antes de pasar a %',
      case new.etapa when 'arquitectura' then 'arquitectura' when 'asignacion' then 'el líder de operaciones' else 'ejecución' end
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function controlar_aprobacion_oc() from public, anon, authenticated;
-- el nombre empieza con "a" para que corra antes que los otros controles de proyectos
drop trigger if exists aprobacion_oc on proyectos;
create trigger aprobacion_oc before insert or update on proyectos for each row execute function controlar_aprobacion_oc();

-- Ventas (o el líder) envía la orden de compra: queda esperando al administrador.
-- Si el interruptor está apagado o la envía el administrador, devuelve false y la app la mueve como siempre.
create or replace function oc_pedir_aprobacion(p_id uuid, p_destino etapa_proy) returns boolean
language plpgsql security definer set search_path = public as $$
declare p proyectos; r text := (select rol::text from perfiles where id = auth.uid());
begin
  select * into p from proyectos where id = p_id for update;
  if not found or not (r in ('admin','lider') or (r = 'ventas' and (p.creado_por = auth.uid() or p.vendedor_id = auth.uid()))) then
    raise exception 'No encontré esa nota de pedido' using errcode = 'P0001';
  end if;
  if p_destino not in ('arquitectura','asignacion') then raise exception 'Destino inválido' using errcode = 'P0001'; end if;
  if not aprobacion_admin_activa() or r = 'admin' or not _es_oc(p.ficha) or p.etapa <> 'ventas' or p.aprob_oc = 'aprobada' then
    return false;
  end if;
  perform set_config('app.aprobando', '1', true);
  update proyectos set aprob_oc = 'pendiente', aprob_oc_destino = p_destino, aprob_oc_pedida_en = now(),
    aprob_oc_por = null, aprob_oc_en = null,
    aprob_oc_comentario = case when p.aprob_oc = 'devuelta' then aprob_oc_comentario end
  where id = p_id;
  perform set_config('app.aprobando', '', true);
  return true;
end $$;
revoke all on function oc_pedir_aprobacion(uuid, etapa_proy) from public, anon;
grant execute on function oc_pedir_aprobacion(uuid, etapa_proy) to authenticated;

-- El administrador aprueba (pasa a Arquitectura o al Líder) o la devuelve a ventas con un comentario
create or replace function _oc_aprobar(p_id uuid, p_comentario text) returns void
language plpgsql security definer set search_path = public as $$
declare p proyectos; dest etapa_proy;
begin
  select * into p from proyectos where id = p_id for update;
  dest := coalesce(p.aprob_oc_destino, case when p.ficha->>'arq' = 'No' then 'asignacion' else 'arquitectura' end::etapa_proy);
  perform set_config('app.aprobando', '1', true);
  update proyectos set aprob_oc = 'aprobada', aprob_oc_por = auth.uid(), aprob_oc_en = now(),
    aprob_oc_comentario = nullif(trim(coalesce(p_comentario, '')), ''), etapa = dest
  where id = p_id;
  perform set_config('app.aprobando', '', true);
  insert into recorrido (proyecto_id, a_etapa, detalle, autor_id)
  values (p_id, dest, 'Aprobada por el administrador', auth.uid());
end $$;
revoke all on function _oc_aprobar(uuid, text) from public, anon, authenticated;

create or replace function oc_aprobar_admin(p_id uuid, p_aprobar boolean, p_comentario text) returns void
language plpgsql security definer set search_path = public as $$
declare p proyectos;
begin
  if not _soy_admin() then raise exception 'Solo el administrador aprueba órdenes de compra' using errcode = 'P0001'; end if;
  select * into p from proyectos where id = p_id for update;
  if not found then raise exception 'No encontré esa orden de compra' using errcode = 'P0001'; end if;
  if p.etapa <> 'ventas' or p.aprob_oc is distinct from 'pendiente' then
    raise exception 'Esa orden de compra no está esperando aprobación' using errcode = 'P0001';
  end if;
  if p_aprobar then perform _oc_aprobar(p_id, p_comentario); return; end if;
  if length(trim(coalesce(p_comentario, ''))) = 0 then
    raise exception 'Contale al vendedor qué hay que corregir' using errcode = 'P0001';
  end if;
  perform set_config('app.aprobando', '1', true);
  update proyectos set aprob_oc = 'devuelta', aprob_oc_por = auth.uid(), aprob_oc_en = now(), aprob_oc_comentario = trim(p_comentario)
  where id = p_id;
  perform set_config('app.aprobando', '', true);
end $$;
revoke all on function oc_aprobar_admin(uuid, boolean, text) from public, anon;
grant execute on function oc_aprobar_admin(uuid, boolean, text) to authenticated;

-- ══════════════ 4. PRENDER / APAGAR ══════════════
-- Al apagarlo, lo que estaba esperando sale solo: los presupuestos quedan aprobados y las órdenes de
-- compra pasan a Arquitectura o al Líder. Devuelve cuántas cosas salieron.
create or replace function aprobacion_admin_cambiar(p_activo boolean) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; x record;
begin
  if not _soy_admin() then raise exception 'Solo el administrador prende o apaga la aprobación' using errcode = 'P0001'; end if;
  insert into ajustes_app (clave, activo, actualizado_por, actualizado_en) values ('aprobacion_admin', p_activo, auth.uid(), now())
    on conflict (clave) do update set activo = excluded.activo, actualizado_por = excluded.actualizado_por, actualizado_en = now();
  if p_activo then return 0; end if;
  perform set_config('app.aprobando', '1', true);
  update cotizaciones set aprobacion = 'aprobada', aprob_precio = precio_final, aprob_por = auth.uid(), aprob_en = now(),
    aprob_comentario = 'Aprobación del administrador apagada'
  where aprobacion = 'pendiente' and estado in ('lista','autorizada');
  get diagnostics k = row_count; n := n + k;
  perform set_config('app.aprobando', '', true);
  for x in select id from proyectos where aprob_oc = 'pendiente' and etapa = 'ventas' loop
    perform _oc_aprobar(x.id, 'Aprobación del administrador apagada'); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function aprobacion_admin_cambiar(boolean) from public, anon;
grant execute on function aprobacion_admin_cambiar(boolean) to authenticated;

-- ══════════════ 5. AVISOS AL CELULAR ══════════════
-- Mismo camino que los pedidos (0018): la base llama a la función avisar-pedido, que ahora también entiende
-- {tipo: 'aprobacion'}. Pendiente → al administrador. Aprobada o devuelta → al vendedor.
-- Lo que la base recalcula sola (cambió un costo) no avisa, para no llenar el celular.
create or replace function avisar_aprobacion() returns trigger language plpgsql security definer set search_path = public as $$
declare
  url text; secreto text;
  est text; antes text; que text := case when tg_table_name = 'proyectos' then 'oc' else 'presupuesto' end;
begin
  if pg_trigger_depth() > 1 and current_setting('app.aprobando', true) is distinct from '1' then return new; end if;
  if que = 'oc' then est := new.aprob_oc; antes := case when tg_op = 'UPDATE' then old.aprob_oc end;
  else est := new.aprobacion; antes := case when tg_op = 'UPDATE' then old.aprobacion end; end if;
  if est is null or est is not distinct from antes then return new; end if;
  -- lo que el administrador cargó y quedó aprobado solo no avisa a nadie
  if est = 'aprobada' and antes is null then return new; end if;
  -- al apagar el interruptor sale todo junto: no se avisa uno por uno
  if est = 'aprobada' and not aprobacion_admin_activa() then return new; end if;
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_url' limit 1);
  secreto := (select decrypted_secret from vault.decrypted_secrets where name = 'push_secreto' limit 1);
  if url is null or secreto is null then return new; end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secreto', secreto),
    body := jsonb_build_object('tipo', 'aprobacion', 'que', que, 'id', new.id, 'estado', est, 'por', auth.uid()));
  return new;
exception when others then
  raise warning 'No se pudo pedir el aviso al celular: %', sqlerrm;
  return new;
end $$;
revoke all on function avisar_aprobacion() from public, anon, authenticated;
drop trigger if exists avisar_aprobacion on cotizaciones;
create trigger avisar_aprobacion after insert or update on cotizaciones for each row execute function avisar_aprobacion();
drop trigger if exists avisar_aprobacion on proyectos;
create trigger avisar_aprobacion after insert or update on proyectos for each row execute function avisar_aprobacion();

-- ══════════════ 6. TIEMPO REAL ══════════════
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ajustes_app') then
    alter publication supabase_realtime add table ajustes_app;
  end if;
end $$;

-- Comprobación: debe devolver aprobacion_admin = true
select clave, activo from ajustes_app where clave = 'aprobacion_admin';
