-- 0012: arquitectura es opcional. Ventas puede mandar la nota directo al líder de operaciones
-- cuando el proyecto no necesita plano (los mismos controles de la nota completa siguen valiendo).

create or replace function proteger_campos() returns trigger language plpgsql as $$
declare r rol_app := mi_rol();
begin
  new.actualizado_en := now();
  if r in ('admin','lider') then return new; end if;
  if new.supervisor_id is distinct from old.supervisor_id or new.inicio is distinct from old.inicio
     or new.stock_verificado_por is distinct from old.stock_verificado_por then
    raise exception 'Solo el líder de operaciones asigna supervisor, fechas y stock';
  end if;
  if r = 'supervisor' then
    if new.etapa <> old.etapa or new.valor_venta is distinct from old.valor_venta or new.ficha <> old.ficha
       or new.nombre <> old.nombre or new.cliente <> old.cliente then
      raise exception 'El supervisor solo actualiza avance y estado';
    end if;
  elsif r = 'ventas' then
    if new.etapa not in ('ventas','arquitectura','asignacion') or new.avance <> old.avance or new.estado <> old.estado then
      raise exception 'Ventas solo edita el pedido y lo envía a arquitectura o al líder';
    end if;
    if new.etapa in ('arquitectura','asignacion') and old.etapa = 'ventas' and not (
         (new.ficha->>'largo')::numeric > 0 and (new.ficha->>'ancho')::numeric > 0 and (new.ficha->>'alto')::numeric > 0
         and coalesce(new.ficha->>'puerta','') <> '' and coalesce(new.ficha->>'elec','') <> ''
         and coalesce(new.ficha->>'sani','') <> '' and coalesce((new.ficha->>'confirmada')::boolean, false)) then
      raise exception 'Falta completar la ficha técnica';
    end if;
  elsif r = 'arquitectura' then
    if new.etapa not in ('ventas','arquitectura','asignacion') or new.ficha <> old.ficha or new.valor_venta is distinct from old.valor_venta then
      raise exception 'Arquitectura solo carga plano y nota';
    end if;
    if new.etapa = 'asignacion' and new.plano_verificado_por is null then
      raise exception 'Hay que verificar el plano contra la ficha';
    end if;
  end if;
  return new;
end $$;

drop policy if exists proy_editar on proyectos;
create policy proy_editar on proyectos for update using (
  es_op()
  or (mi_rol() = 'ventas' and etapa = 'ventas' and creado_por = auth.uid())
  or (mi_rol() = 'arquitectura' and etapa = 'arquitectura')
  or (mi_rol() = 'supervisor' and supervisor_id = auth.uid() and etapa = 'ejecucion'))
  with check (
  es_op()
  or (mi_rol() = 'ventas' and creado_por = auth.uid() and etapa in ('ventas','arquitectura','asignacion'))
  or (mi_rol() = 'arquitectura' and etapa in ('ventas','arquitectura','asignacion'))
  or (mi_rol() = 'supervisor' and supervisor_id = auth.uid() and etapa = 'ejecucion'));

-- Comprobación: la política debe incluir 'asignacion' para ventas
select policyname from pg_policies where tablename = 'proyectos' and policyname = 'proy_editar';
