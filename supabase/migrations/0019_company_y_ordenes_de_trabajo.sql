-- 0019: Supervisor Company, órdenes de trabajo con toda la nota y stock de Utilbox.
-- 1. Supervisor Company: es un supervisor (mismos permisos, ve solo sus proyectos) marcado como
--    "company". Los productos Company se le asignan a él y el líder no valida stock de materiales.
--    Se marca con una columna y no con un rol nuevo, así no hay que tocar ningún permiso del supervisor.
-- 2. Órdenes de trabajo: el supervisor de aberturas / muebles y los técnicos de aire ven toda la nota
--    de pedido del proyecto de cada orden suya (sin precios: la nota no los tiene).
-- 3. Stock de Utilbox: cada supervisor de aberturas y de muebles carga su stock desde un Excel
--    y la app compara cada orden contra ese stock.
-- Requiere 0009, 0011 y 0017.

-- ══════════════ 1. SUPERVISOR COMPANY ══════════════
alter table perfiles add column if not exists company boolean not null default false;

-- Cada uno puede cambiar su nombre pero no su rol, su empresa ni si es Company (eso lo hace el admin)
drop policy if exists perfiles_mi_nombre on perfiles;
create policy perfiles_mi_nombre on perfiles for update using (id = auth.uid())
  with check (id = auth.uid() and rol = mi_rol()
    and empresa is not distinct from (select p.empresa from perfiles p where p.id = auth.uid())
    and company = (select p.company from perfiles p where p.id = auth.uid()));

-- ══════════════ 2. LA NOTA DE PEDIDO EN LA ORDEN DE TRABAJO ══════════════
-- Devuelve los datos de la nota de los proyectos donde el usuario tiene una orden de trabajo
-- (o que ya puede ver). Nunca devuelve el valor de venta ni costos.
create or replace function notas_de_ordenes(pids uuid[])
returns table (proyecto_id uuid, nombre text, cliente text, empresa text, tipo text, entrega date, deposito text, ficha jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.cliente, p.empresa, p.tipo, p.entrega, p.deposito, p.ficha
  from proyectos p
  where p.id = any(pids) and (taller_ve_proyecto(p.id) or ve_costos(p.id))
$$;
revoke all on function notas_de_ordenes(uuid[]) from anon;

-- ══════════════ 3. STOCK DE UTILBOX (aberturas y muebles) ══════════════
create table if not exists stock_taller (
  id uuid primary key default gen_random_uuid(),
  taller text not null check (taller in ('aluminio','madera')),
  codigo text,
  descripcion text not null,
  cantidad numeric not null default 0,
  unidad text,
  cargado_por uuid references perfiles default auth.uid(),
  cargado_en timestamptz not null default now()
);
create index if not exists stock_taller_t on stock_taller (taller);
alter table stock_taller enable row level security;
revoke all on stock_taller from anon;
-- Lo ve el taller dueño, el líder, el admin y solo lectura. Se carga solo con la función de abajo.
drop policy if exists st_ver on stock_taller;
create policy st_ver on stock_taller for select using (taller = mi_taller() or es_op() or mi_rol() = 'lectura');

-- Reemplaza todo el stock del taller del usuario por las filas del Excel
create or replace function cargar_stock_taller(filas jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare t text := mi_taller(); n integer;
begin
  if t is null or t not in ('aluminio','madera') then
    raise exception 'Solo el supervisor de aberturas o de muebles carga su stock' using errcode = 'P0001';
  end if;
  if jsonb_typeof(filas) <> 'array' or jsonb_array_length(filas) = 0 then
    raise exception 'La planilla no tiene filas' using errcode = 'P0001';
  end if;
  delete from stock_taller where taller = t;
  insert into stock_taller (taller, codigo, descripcion, cantidad, unidad)
  select t, nullif(trim(f->>'codigo'),''), trim(f->>'descripcion'),
         coalesce(nullif(f->>'cantidad','')::numeric, 0), nullif(trim(f->>'unidad'),'')
  from jsonb_array_elements(filas) f
  where coalesce(trim(f->>'descripcion'),'') <> '';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function cargar_stock_taller(jsonb) from anon;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'stock_taller') then
    alter publication supabase_realtime add table stock_taller;
  end if;
end $$;

-- Comprobación: debe devolver stock_taller con rowsecurity = true y la columna company
select tablename, rowsecurity from pg_tables where tablename = 'stock_taller';
select column_name from information_schema.columns where table_name = 'perfiles' and column_name = 'company';
