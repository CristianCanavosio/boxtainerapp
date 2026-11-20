-- 0020: metas de los indicadores de la pestaña Reportes.
-- Cada indicador (ventas, producción, compras, finanzas) se pinta verde, amarillo o rojo según su meta.
-- Las metas se acuerdan con cada líder, así que no están fijas en el código: el administrador
-- las cambia desde Reportes → "🎯 Metas". Las ve cualquier usuario con rol; las cambia solo el admin.
-- Sin correr esta migración los indicadores se ven igual, sin semáforo.

create table if not exists metas_indicadores (
  clave text primary key check (clave ~ '^[a-z0-9_]{2,40}$'),
  meta numeric,                                -- vacío = sin meta
  actualizado_por uuid references perfiles on delete set null default auth.uid(),
  actualizado_en timestamptz not null default now()
);

create or replace function metas_tocar() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists metas_tocar on metas_indicadores;
create trigger metas_tocar before insert or update on metas_indicadores for each row execute function metas_tocar();

alter table metas_indicadores enable row level security;
revoke all on metas_indicadores from anon;
drop policy if exists metas_ver on metas_indicadores;
create policy metas_ver on metas_indicadores for select using (mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists metas_admin on metas_indicadores;
create policy metas_admin on metas_indicadores for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- Comprobación: debe mostrar la tabla (vacía hasta que se carguen metas)
select count(*) as metas_cargadas from metas_indicadores;
