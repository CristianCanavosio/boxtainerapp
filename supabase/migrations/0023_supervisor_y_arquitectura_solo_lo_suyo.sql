-- 0023: el supervisor y arquitectura solo pueden cambiar lo que les toca de un proyecto.
-- Hasta ahora la base no dejaba al supervisor cambiar el supervisor, las fechas de inicio, la nota ni el
-- valor de venta, pero sí (usando la API de Supabase por fuera de la app) la fecha de entrega, la empresa,
-- el vendedor, la prioridad, el depósito y otros datos. La app nunca le ofrece cambiarlos: esto cierra
-- la puerta también en la base.
--   Supervisor: solo avance y estado (y la posición se libera sola al pausar, migración 0021).
--   Arquitectura: solo la etapa (enviar o devolver), la nota para operaciones y la verificación del plano.
-- Ventas, líder y admin quedan igual que antes.
-- Además corrige un error: arquitectura no podía devolver a ventas (ni mandar al líder) un proyecto en el que
-- todavía no había subido un plano. La base exige que quien guarda siga viendo el proyecto después de
-- guardarlo, y arquitectura solo veía los proyectos "en arquitectura" o con un plano suyo. Ahora también ve
-- los proyectos que pasaron por sus manos (los que mandó o devolvió).
-- Se puede correr más de una vez. Sin esta migración la app funciona igual (con el error de arriba).

-- ══════════════ QUIÉN VE QUÉ PROYECTO ══════════════
-- Igual que en 0001, más: arquitectura ve los proyectos que movió de etapa (queda en el recorrido).
create or replace function puede_ver(p proyectos) returns boolean language sql stable as $$
  select case mi_rol()
    when 'admin' then true when 'lider' then true when 'lectura' then true
    when 'supervisor' then p.supervisor_id = auth.uid()
    when 'ventas' then p.creado_por = auth.uid() or p.vendedor_id = auth.uid()
    when 'arquitectura' then p.etapa = 'arquitectura'
         or exists (select 1 from planos pl where pl.proyecto_id = p.id and pl.autor_id = auth.uid())
         or exists (select 1 from recorrido r where r.proyecto_id = p.id and r.autor_id = auth.uid())
    else false end
$$;

-- ══════════════ QUÉ PUEDE CAMBIAR CADA ROL ══════════════

create or replace function proteger_campos() returns trigger language plpgsql as $$
declare
  r rol_app := mi_rol();
  -- columnas que cada rol puede cambiar (actualizado_en lo pone la base)
  libres_sup text[] := array['avance','estado','posicion','actualizado_en'];
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
  elsif r = 'ventas' then
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

-- Comprobación: debe devolver true
select pg_get_functiondef('public.proteger_campos()'::regprocedure) like '%libres_sup%' as corrida_0023;
