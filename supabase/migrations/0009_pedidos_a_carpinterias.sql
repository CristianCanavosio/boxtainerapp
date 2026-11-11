-- 0009: pedidos a las carpinterías del grupo (aluminio y madera).
-- El supervisor (o el líder / admin) le manda un pedido a una carpintería desde el proyecto.
-- Cada carpintería entra con su propio usuario, ve SOLO sus pedidos (sin precios ni datos del
-- proyecto que no necesita) y los planos de esos proyectos, acepta con fecha comprometida y
-- va marcando el estado. El supervisor confirma cuando lo recibe en obra.
-- Todo cambio de estado o de fecha queda en el historial del pedido (lo escribe la base).

-- ══════════════ ROLES NUEVOS ══════════════
alter type rol_app add value if not exists 'carp_aluminio';
alter type rol_app add value if not exists 'carp_madera';

-- Qué carpintería es el usuario que está conectado (null si no es una carpintería)
create or replace function mi_taller() returns text language sql stable security definer set search_path = public as $$
  select case (select rol::text from perfiles where id = auth.uid())
    when 'carp_aluminio' then 'aluminio' when 'carp_madera' then 'madera' end
$$;

-- ══════════════ PEDIDOS ══════════════
create table if not exists pedidos_carpinteria (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  proyecto_id uuid not null references proyectos on delete cascade,
  taller text not null check (taller in ('aluminio','madera')),
  proyecto_nombre text not null default '',     -- copia del nombre: la carpintería no ve el proyecto
  items jsonb not null default '[]'::jsonb,     -- [{desc, medida, cant, unidad}]
  para_fecha date,                              -- cuándo lo necesita la obra
  entregar_en text,                             -- dónde se entrega
  observaciones text,
  estado text not null default 'enviado'
    check (estado in ('enviado','aceptado','en_fabricacion','listo','entregado','rechazado','cancelado')),
  fecha_compromiso date,                        -- la pone la carpintería al aceptar
  nota_taller text,                             -- comentario de la carpintería (motivo si rechaza)
  historial jsonb not null default '[]'::jsonb, -- [{estado|fecha, por, en, nota}]
  creado_por uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists pedidos_carp_pid on pedidos_carpinteria (proyecto_id);
create index if not exists pedidos_carp_taller on pedidos_carpinteria (taller, estado);
alter table pedidos_carpinteria enable row level security;
revoke all on pedidos_carpinteria from anon;

-- Lo ven: líder, admin, solo lectura y el supervisor del proyecto (ve_costos), y la carpintería destino
drop policy if exists pc_ver on pedidos_carpinteria;
create policy pc_ver on pedidos_carpinteria for select using (ve_costos(proyecto_id) or taller = mi_taller());
-- Lo crean el líder / admin o el supervisor del proyecto
drop policy if exists pc_crear on pedidos_carpinteria;
create policy pc_crear on pedidos_carpinteria for insert with check (
  creado_por = auth.uid() and estado = 'enviado' and (
    es_op()
    or (mi_rol() = 'supervisor' and exists (select 1 from proyectos p where p.id = proyecto_id and p.supervisor_id = auth.uid()))));
-- Lo actualizan quien lo pidió (supervisor del proyecto, líder, admin) y la carpintería destino
drop policy if exists pc_editar on pedidos_carpinteria;
create policy pc_editar on pedidos_carpinteria for update using (
  (ve_costos(proyecto_id) and mi_rol() <> 'lectura') or taller = mi_taller());
-- No se borran: se cancelan, así queda el registro. Solo el admin puede borrar.
drop policy if exists pc_borrar on pedidos_carpinteria;
create policy pc_borrar on pedidos_carpinteria for delete using (mi_rol() = 'admin');

-- Al crear: copia el nombre del proyecto y arranca el historial
create or replace function nuevo_pedido_carp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.proyecto_nombre := coalesce((select nombre from proyectos where id = new.proyecto_id), '');
  new.estado := 'enviado'; new.fecha_compromiso := null; new.nota_taller := null;
  new.historial := jsonb_build_array(jsonb_build_object('estado','enviado','por',auth.uid(),'en',now()));
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
    raise exception 'El pedido tiene que tener al menos un ítem' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists nuevo_pedido_carp on pedidos_carpinteria;
create trigger nuevo_pedido_carp before insert on pedidos_carpinteria for each row execute function nuevo_pedido_carp();

-- Quién cambia qué, y qué pasos de estado valen
create or replace function proteger_pedido_carp() returns trigger language plpgsql security definer set search_path = public as $$
declare
  soy_taller boolean := mi_taller() is not null and mi_taller() = old.taller;
  a text := old.estado; b text := new.estado;
begin
  new.actualizado_en := now();
  if new.proyecto_id <> old.proyecto_id or new.taller <> old.taller or new.numero <> old.numero
     or new.creado_por is distinct from old.creado_por or new.creado_en <> old.creado_en
     or new.proyecto_nombre <> old.proyecto_nombre then
    raise exception 'Esos datos del pedido no se cambian' using errcode = 'P0001';
  end if;
  -- el historial lo escribe solo la base
  new.historial := old.historial;

  if soy_taller then
    -- la carpintería responde: no toca lo que pidió la obra
    if new.items <> old.items or new.para_fecha is distinct from old.para_fecha
       or new.entregar_en is distinct from old.entregar_en or new.observaciones is distinct from old.observaciones then
      raise exception 'La carpintería no cambia el pedido: si algo no cierra, rechazalo con el motivo' using errcode = 'P0001';
    end if;
    if a <> b and not (
         (a = 'enviado' and b in ('aceptado','rechazado'))
      or (a = 'aceptado' and b in ('en_fabricacion','listo','rechazado'))
      or (a = 'en_fabricacion' and b = 'listo')) then
      raise exception 'Ese cambio de estado no corresponde' using errcode = 'P0001';
    end if;
    if b = 'aceptado' and new.fecha_compromiso is null then
      raise exception 'Para aceptar poné la fecha en que lo tenés listo' using errcode = 'P0001';
    end if;
    if b = 'rechazado' and coalesce(trim(new.nota_taller),'') = '' then
      raise exception 'Escribí el motivo del rechazo' using errcode = 'P0001';
    end if;
    if new.fecha_compromiso is distinct from old.fecha_compromiso and b not in ('aceptado','en_fabricacion') then
      raise exception 'La fecha se pone al aceptar y se puede correr mientras se fabrica' using errcode = 'P0001';
    end if;
  else
    -- la obra (supervisor, líder, admin)
    if new.fecha_compromiso is distinct from old.fecha_compromiso or new.nota_taller is distinct from old.nota_taller then
      raise exception 'La fecha comprometida y la respuesta las pone la carpintería' using errcode = 'P0001';
    end if;
    if (new.items <> old.items or new.para_fecha is distinct from old.para_fecha
        or new.entregar_en is distinct from old.entregar_en or new.observaciones is distinct from old.observaciones)
       and a not in ('enviado','rechazado') then
      raise exception 'La carpintería ya aceptó el pedido: para cambiarlo, cancelalo y mandá uno nuevo' using errcode = 'P0001';
    end if;
    if a <> b and not (
         (b = 'cancelado' and a in ('enviado','aceptado','en_fabricacion','listo','rechazado'))
      or (b = 'entregado' and a in ('aceptado','en_fabricacion','listo'))
      or (b = 'enviado' and a = 'rechazado')) then
      raise exception 'Ese cambio de estado no corresponde' using errcode = 'P0001';
    end if;
    if b = 'enviado' and a = 'rechazado' then new.fecha_compromiso := null; new.nota_taller := null; end if;
  end if;

  if a <> b then
    new.historial := new.historial || jsonb_build_object('estado', b, 'por', auth.uid(), 'en', now(),
      'nota', case when soy_taller and new.nota_taller is distinct from old.nota_taller then new.nota_taller end);
  elsif new.fecha_compromiso is distinct from old.fecha_compromiso then
    new.historial := new.historial || jsonb_build_object('fecha', new.fecha_compromiso, 'antes', old.fecha_compromiso,
      'por', auth.uid(), 'en', now(), 'nota', case when new.nota_taller is distinct from old.nota_taller then new.nota_taller end);
  end if;
  return new;
end $$;
drop trigger if exists proteger_pedido_carp on pedidos_carpinteria;
create trigger proteger_pedido_carp before update on pedidos_carpinteria for each row execute function proteger_pedido_carp();

-- ══════════════ PLANOS PARA LA CARPINTERÍA ══════════════
-- Ve los planos de los proyectos donde tiene un pedido (no el resto del proyecto)
create or replace function taller_ve_proyecto(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select mi_taller() is not null and exists (
    select 1 from pedidos_carpinteria where proyecto_id = pid and taller = mi_taller() and estado <> 'cancelado')
$$;
drop policy if exists planos_ver_taller on planos;
create policy planos_ver_taller on planos for select using (taller_ve_proyecto(proyecto_id));
drop policy if exists planos_arch_ver_taller on storage.objects;
create policy planos_arch_ver_taller on storage.objects for select
  using (bucket_id = 'planos' and taller_ve_proyecto(((storage.foldername(name))[1])::uuid));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pedidos_carpinteria') then
    alter publication supabase_realtime add table pedidos_carpinteria;
  end if;
end $$;

-- Comprobación: debe devolver 1 fila con rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename = 'pedidos_carpinteria';
