-- 0008: el presupuesto de obra y los gastos reales en USD los ve y los carga solo el administrador.
-- El control de obra del líder y del supervisor pasa a ser por materiales (0007).

drop policy if exists pres_ver on presupuestos;
drop policy if exists pres_op on presupuestos;
create policy pres_admin on presupuestos for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

drop policy if exists costos_ver on costos;
drop policy if exists costos_cargar on costos;
drop policy if exists costos_borrar on costos;
create policy costos_admin_ver on costos for select using (mi_rol() = 'admin');
create policy costos_admin_cargar on costos for insert with check (mi_rol() = 'admin' and autor_id = auth.uid());
create policy costos_admin_borrar on costos for delete using (mi_rol() = 'admin');

-- Comprobación: deben aparecer solo las políticas de admin
select tablename, policyname from pg_policies where tablename in ('presupuestos','costos') order by 1, 2;
