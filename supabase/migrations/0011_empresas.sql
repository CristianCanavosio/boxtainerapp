-- 0011: razones sociales del grupo. Cada vendedor tiene su empresa (la asigna el admin en Usuarios)
-- y cada nota de pedido / proyecto queda con la empresa que vende, para poder filtrar.
-- La lista de empresas válidas está acá y en web/app.js (EMPRESAS).

alter table perfiles add column if not exists empresa text;
alter table proyectos add column if not exists empresa text;

alter table perfiles drop constraint if exists perfiles_empresa_valida;
alter table perfiles add constraint perfiles_empresa_valida check (empresa is null or empresa in
  ('LT1 SAS','Boxtainers Argentina SAS','Refeer Containers SA','Total Containers SA','Utilbox SAS'));
alter table proyectos drop constraint if exists proyectos_empresa_valida;
alter table proyectos add constraint proyectos_empresa_valida check (empresa is null or empresa in
  ('LT1 SAS','Boxtainers Argentina SAS','Refeer Containers SA','Total Containers SA','Utilbox SAS'));

create index if not exists proyectos_empresa on proyectos (empresa);

-- Cada uno puede cambiar su nombre pero no su rol ni su empresa (eso lo hace el admin)
drop policy if exists perfiles_mi_nombre on perfiles;
create policy perfiles_mi_nombre on perfiles for update using (id = auth.uid())
  with check (id = auth.uid() and rol = mi_rol()
    and empresa is not distinct from (select p.empresa from perfiles p where p.id = auth.uid()));

-- Comprobación: deben aparecer las dos columnas
select table_name, column_name from information_schema.columns
where column_name = 'empresa' and table_name in ('perfiles','proyectos') order by 1;
