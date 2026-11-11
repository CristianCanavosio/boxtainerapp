-- 0007: materiales de cada proyecto. Salen de la nota de pedido.
-- El líder valida el stock de cada ítem antes de asignar, y el supervisor carga cuánto usó.
-- Con eso se miden los desvíos de materiales. Los desvíos en plata los calcula la app
-- solo para el administrador, con la lista de costos, que sigue siendo solo suya (0004).

create table if not exists materiales_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  clave text not null,
  det text not null default '',
  unidad text not null default 'c/u',
  cant_plan numeric not null default 0,
  -- true: no estaba en la nota (lo agregó el líder o el supervisor)
  extra boolean not null default false,
  stock text check (stock in ('hay','pedido','falta')),
  stock_por uuid references perfiles,
  stock_en timestamptz,
  cant_usada numeric,
  usada_por uuid references perfiles,
  usada_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (proyecto_id, clave, det)
);
create index if not exists materiales_proyecto_pid on materiales_proyecto (proyecto_id);
alter table materiales_proyecto enable row level security;
revoke all on materiales_proyecto from anon;

-- Lo ven el líder, el admin, solo lectura y el supervisor del proyecto (igual que el avance)
drop policy if exists mp_ver on materiales_proyecto;
create policy mp_ver on materiales_proyecto for select using (ve_costos(proyecto_id));
drop policy if exists mp_crear on materiales_proyecto;
create policy mp_crear on materiales_proyecto for insert with check (
  es_op() or (mi_rol() = 'supervisor' and ve_costos(proyecto_id) and extra and cant_plan = 0));
drop policy if exists mp_editar on materiales_proyecto;
create policy mp_editar on materiales_proyecto for update using (
  es_op() or (mi_rol() = 'supervisor' and ve_costos(proyecto_id)));
drop policy if exists mp_borrar on materiales_proyecto;
create policy mp_borrar on materiales_proyecto for delete using (es_op());

create or replace function proteger_materiales() returns trigger language plpgsql set search_path = public as $$
declare r rol_app := mi_rol(); et text := (select etapa from proyectos where id = new.proyecto_id);
begin
  -- el supervisor solo carga lo usado
  if r = 'supervisor' and (new.cant_plan is distinct from old.cant_plan or new.stock is distinct from old.stock
       or new.clave <> old.clave or new.det <> old.det or new.unidad <> old.unidad) then
    raise exception 'El supervisor solo carga la cantidad usada' using errcode = 'P0001';
  end if;
  -- en ejecución lo planificado queda fijo (solo el admin lo corrige), así el desvío es real
  if et = 'ejecucion' and r <> 'admin' and new.cant_plan is distinct from old.cant_plan then
    raise exception 'El proyecto ya está en ejecución: lo planificado no se cambia' using errcode = 'P0001';
  end if;
  if new.stock is distinct from old.stock then new.stock_por := auth.uid(); new.stock_en := now(); end if;
  if new.cant_usada is distinct from old.cant_usada then new.usada_por := auth.uid(); new.usada_en := now(); end if;
  return new;
end $$;
drop trigger if exists proteger_materiales on materiales_proyecto;
create trigger proteger_materiales before update on materiales_proyecto for each row execute function proteger_materiales();

alter publication supabase_realtime add table materiales_proyecto;

-- Comprobación: debe devolver 1 fila con rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename = 'materiales_proyecto';
