-- 0035: Número de proyecto del supervisor Company (pedido de Cristian 27/11).
-- Cada proyecto tiene un campo de texto libre "N° de proyecto" (por ejemplo el número que usa Company/Utilbox
-- para identificarlo). Se ve en la tarjeta y en el detalle del proyecto, y se puede buscar.
--   · Lo carga y lo corrige el Supervisor Company, solo en los proyectos que tiene asignados.
--   · El líder y el admin también lo pueden cargar o corregir.
--   · Un supervisor que no es Company no lo puede cambiar (sigue cambiando solo avance y estado, regla de la 0023).
-- Necesita la 0019 (perfiles.company) y la 0023. Se puede correr más de una vez.
-- Sin esta migración la app funciona igual, pero no deja guardar el número.

alter table proyectos add column if not exists numero_proyecto text;
alter table proyectos drop constraint if exists numero_proyecto_largo;
alter table proyectos add constraint numero_proyecto_largo check (char_length(numero_proyecto) <= 60);

-- Igual que en la 0023, más el número de proyecto para el Supervisor Company.
create or replace function proteger_campos() returns trigger language plpgsql as $$
declare
  r rol_app := mi_rol();
  -- columnas que cada rol puede cambiar (actualizado_en lo pone la base)
  libres_sup text[] := array['avance','estado','posicion','numero_proyecto','actualizado_en'];
  libres_arq text[] := array['etapa','nota_arquitectura','plano_verificado_por','plano_verificado_en','actualizado_en'];
begin
  new.actualizado_en := now();
  if r in ('admin','lider') then return new; end if;
  if new.supervisor_id is distinct from old.supervisor_id or new.inicio is distinct from old.inicio
     or new.stock_verificado_por is distinct from old.stock_verificado_por then
    raise exception 'Solo el líder de operaciones asigna supervisor, fechas y stock' using errcode = 'P0001';
  end if;
  if r = 'supervisor' then
    if (to_jsonb(new) - libres_sup) is distinct from (to_jsonb(old) - libres_sup) then
      raise exception 'El supervisor solo actualiza avance y estado' using errcode = 'P0001';
    end if;
    if new.numero_proyecto is distinct from old.numero_proyecto
       and not coalesce((select company from perfiles where id = auth.uid()), false) then
      raise exception 'Solo el Supervisor Company carga el número de proyecto' using errcode = 'P0001';
    end if;
  elsif r = 'ventas' then
    if new.numero_proyecto is distinct from old.numero_proyecto then
      raise exception 'El número de proyecto lo carga el Supervisor Company' using errcode = 'P0001';
    end if;
    if new.etapa not in ('ventas','arquitectura','asignacion') or new.avance <> old.avance or new.estado <> old.estado then
      raise exception 'Ventas solo edita el pedido y lo envía a arquitectura o al líder' using errcode = 'P0001';
    end if;
    if new.etapa in ('arquitectura','asignacion') and old.etapa = 'ventas' and not (
         (nullif(new.ficha->>'largo','')::numeric) > 0 and (nullif(new.ficha->>'ancho','')::numeric) > 0
         and (nullif(new.ficha->>'alto','')::numeric) > 0
         and coalesce(new.ficha->>'puerta','') <> '' and coalesce(new.ficha->>'elec','') <> ''
         and coalesce(new.ficha->>'sani','') <> '' and coalesce((new.ficha->>'confirmada')::boolean, false)) then
      raise exception 'Falta completar la ficha técnica' using errcode = 'P0001';
    end if;
  elsif r = 'arquitectura' then
    if (to_jsonb(new) - libres_arq) is distinct from (to_jsonb(old) - libres_arq) then
      raise exception 'Arquitectura solo carga plano y nota' using errcode = 'P0001';
    end if;
    if new.etapa not in ('ventas','arquitectura','asignacion') then
      raise exception 'Arquitectura solo envía el proyecto al líder o lo devuelve a ventas' using errcode = 'P0001';
    end if;
    if new.etapa = 'asignacion' and new.plano_verificado_por is null then
      raise exception 'Hay que verificar el plano contra la ficha' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Comprobación: debe devolver una fila con numero_proyecto y corrida_0035 = true
select column_name, pg_get_functiondef('public.proteger_campos()'::regprocedure) like '%numero_proyecto%' as corrida_0035
from information_schema.columns where table_name = 'proyectos' and column_name = 'numero_proyecto';
