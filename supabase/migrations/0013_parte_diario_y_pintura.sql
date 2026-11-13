-- 0013: parte diario del supervisor, pintura unificada y receta de materiales por tipología.
-- 1) La actualización diaria guarda cuántas personas trabajaron y cuántas horas fue la jornada.
-- 2) La pintura deja de estar separada en exterior e interior: es un solo material, en tachos de 20 l
--    (rendimiento supuesto: 100 m² por tacho). Los proyectos que ya tenían la lista fijada se pasan
--    al ítem nuevo, así el supervisor no ve los dos viejos en m².
-- 3) Receta por tipología: el líder (o el admin) carga una vez qué materiales lleva cada tipología
--    (Oficina, Sanitario, Pañol...) y, si hace falta, por tamaño de contenedor. Al asignar un proyecto,
--    la receta se suma a lo que sale de la nota y queda como lo planificado. No tiene precios.

-- ══════════════ PARTE DIARIO ══════════════
alter table actualizaciones add column if not exists personas int check (personas >= 0 and personas <= 200);
alter table actualizaciones add column if not exists horas numeric check (horas >= 0 and horas <= 24);

-- ══════════════ PINTURA EN TACHOS ══════════════
insert into materiales_proyecto (proyecto_id, clave, det, unidad, cant_plan, extra, stock, cant_usada)
select proyecto_id, 'Pintura', '', 'tacho 20 l',
       ceil(sum(cant_plan) / 100 - 1e-9),
       false,
       case when bool_or(stock = 'falta') then 'falta'
            when bool_or(stock = 'pedido') then 'pedido'
            when bool_and(stock = 'hay') then 'hay' end,
       case when bool_or(cant_usada is not null) then round(sum(coalesce(cant_usada, 0)) / 100, 1) end
from materiales_proyecto
where clave in ('Pintura exterior', 'Pintura interior') and not extra and unidad = 'm²'
group by proyecto_id
on conflict (proyecto_id, clave, det) do nothing;

delete from materiales_proyecto
where clave in ('Pintura exterior', 'Pintura interior') and not extra and unidad = 'm²';

-- ══════════════ RECETA POR TIPOLOGÍA ══════════════
create table if not exists recetas_tipologia (
  id uuid primary key default gen_random_uuid(),
  tipologia text not null,                 -- el producto de la nota: Oficina, Sanitario, Pañol...
  tam text not null default '',            -- '20 DV', '40 ST', '40 HC' o '' (cualquier tamaño)
  clave text not null check (length(trim(clave)) >= 2),
  unidad text not null default 'c/u',
  cant numeric not null check (cant > 0),  -- por cada unidad fabricada
  creado_por uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (tipologia, tam, clave)
);
alter table recetas_tipologia enable row level security;
revoke all on recetas_tipologia from anon;
drop policy if exists rt_ver on recetas_tipologia;
create policy rt_ver on recetas_tipologia for select using (mi_rol() in ('admin','lider','supervisor','lectura'));
drop policy if exists rt_crear on recetas_tipologia;
create policy rt_crear on recetas_tipologia for insert with check (es_op());
drop policy if exists rt_editar on recetas_tipologia;
create policy rt_editar on recetas_tipologia for update using (es_op());
drop policy if exists rt_borrar on recetas_tipologia;
create policy rt_borrar on recetas_tipologia for delete using (es_op());

-- Comprobación: debe devolver las dos columnas nuevas y la tabla con rowsecurity = true
select column_name from information_schema.columns
where table_name = 'actualizaciones' and column_name in ('personas', 'horas');
select tablename, rowsecurity from pg_tables where tablename = 'recetas_tipologia';
