-- 0039: Revisión general 4 antes de producción (28/11). Tres arreglos de la aprobación del administrador (0033):
-- 1. Orden de compra ya aprobada que vuelve a ventas (por ejemplo, la devuelve arquitectura): si ventas cambia la
--    nota o el valor de venta, vuelve a esperar al administrador. Antes se podía cambiar y reenviar (o mandar por
--    correo al cliente) sin que él lo viera.
-- 2. Orden de compra devuelta por el administrador: el precio se reabre para que ventas lo pueda corregir. Antes quedaba
--    "aceptado por el cliente" y no se podía cambiar ("el precio no cambia").
-- 3. El precio de una orden de compra ya no espera además como presupuesto: lo aprueba el administrador junto con la
--    orden de compra. Antes le llegaba un aviso de "presupuesto para aprobar" por cada orden de compra guardada.
-- Necesita la 0033. Se puede correr más de una vez.

create or replace function cot_controlar_aprobacion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adm boolean := _soy_admin();
  -- pg_trigger_depth() = 1: lo guardó una persona. Más profundo: lo recalculó la base porque cambió un costo.
  directo boolean := pg_trigger_depth() <= 1;
  cambio boolean;
begin
  if tg_op = 'UPDATE' and current_setting('app.aprobando', true) = '1' then return new; end if;
  -- las columnas de la aprobación las cambian solo las funciones de abajo
  if tg_op = 'UPDATE' and (new.aprobacion is distinct from old.aprobacion or new.aprob_precio is distinct from old.aprob_precio
       or new.aprob_comentario is distinct from old.aprob_comentario or new.aprob_por is distinct from old.aprob_por) then
    new.aprobacion := old.aprobacion; new.aprob_precio := old.aprob_precio; new.aprob_comentario := old.aprob_comentario;
    new.aprob_por := old.aprob_por; new.aprob_en := old.aprob_en; new.aprob_pedida_en := old.aprob_pedida_en;
  end if;
  if not aprobacion_admin_activa() then return new; end if;   -- apagado: como antes
  -- El precio de una orden de compra lo revisa el administrador junto con la orden de compra (oc_aprobar_admin):
  -- no espera además como presupuesto (antes le llegaba un aviso de "presupuesto para aprobar" por cada OC guardada).
  if new.origen = 'nota' and exists (select 1 from proyectos p where p.id = new.proyecto_id and _es_oc(p.ficha)) then
    if tg_op = 'INSERT' or new.estado is distinct from old.estado or new.precio_final is distinct from old.precio_final then
      new.aprobacion := null; new.aprob_precio := null; new.aprob_por := null; new.aprob_en := null; new.aprob_pedida_en := null;
    end if;
    return new;
  end if;

  -- Enviar al cliente (cotizador por tipología). "Enviada" en una nota = el cliente aceptó (eso lo frena la orden de compra).
  if tg_op = 'UPDATE' and new.estado = 'enviada' and old.estado <> 'enviada' then
    if new.origen = 'tipologia' and coalesce(new.aprobacion, '') <> 'aprobada' and not adm then
      raise exception 'Este presupuesto espera la aprobación del administrador: todavía no se puede enviar al cliente' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado = 'enviada' then return new; end if;

  -- Sin precio todavía (espera al líder de ventas o lo rechazó): al administrador le llega después
  if new.estado not in ('lista','autorizada') then
    if tg_op = 'INSERT' or old.estado is distinct from new.estado then
      new.aprobacion := null; new.aprob_precio := null; new.aprob_por := null; new.aprob_en := null;
    end if;
    return new;
  end if;

  cambio := tg_op = 'INSERT' or old.estado not in ('lista','autorizada') or new.aprobacion is null
    or new.precio_final is distinct from old.precio_final or new.unidades is distinct from old.unidades
    or new.detalle is distinct from old.detalle or new.cambios is distinct from old.cambios or new.notas is distinct from old.notas;
  if not cambio then return new; end if;
  if adm and directo then
    new.aprobacion := 'aprobada'; new.aprob_precio := new.precio_final; new.aprob_por := auth.uid(); new.aprob_en := now();
    new.aprob_comentario := null;
  else
    new.aprobacion := 'pendiente'; new.aprob_precio := null; new.aprob_por := null; new.aprob_en := null;
    new.aprob_pedida_en := now();
    if tg_op = 'INSERT' or old.aprobacion is distinct from 'devuelta' then new.aprob_comentario := null; end if;
  end if;
  return new;
end $$;

create or replace function controlar_aprobacion_oc() returns trigger
language plpgsql security definer set search_path = public as $$
declare fn boolean := current_setting('app.aprobando', true) = '1'; adm boolean := _soy_admin();
begin
  if fn then return new; end if;
  -- las columnas de la aprobación las cambian solo las funciones de abajo
  if tg_op = 'INSERT' then
    new.aprob_oc := null; new.aprob_oc_destino := null; new.aprob_oc_comentario := null;
    new.aprob_oc_por := null; new.aprob_oc_en := null; new.aprob_oc_pedida_en := null;
  elsif new.aprob_oc is distinct from old.aprob_oc or new.aprob_oc_destino is distinct from old.aprob_oc_destino
     or new.aprob_oc_comentario is distinct from old.aprob_oc_comentario or new.aprob_oc_por is distinct from old.aprob_oc_por then
    new.aprob_oc := old.aprob_oc; new.aprob_oc_destino := old.aprob_oc_destino; new.aprob_oc_comentario := old.aprob_oc_comentario;
    new.aprob_oc_por := old.aprob_oc_por; new.aprob_oc_en := old.aprob_oc_en; new.aprob_oc_pedida_en := old.aprob_oc_pedida_en;
  end if;
  if adm or not aprobacion_admin_activa() or not _es_oc(new.ficha) then return new; end if;
  if tg_op = 'INSERT' then
    -- una orden de compra cargada directo para el líder (por ejemplo, por el líder de operaciones): queda esperando
    if new.etapa <> 'ventas' then
      new.aprob_oc_destino := new.etapa; new.etapa := 'ventas';
      new.aprob_oc := 'pendiente'; new.aprob_oc_pedida_en := now();
    end if;
    return new;
  end if;
  -- Ya aprobada pero de vuelta en ventas (la devolvió arquitectura, por ejemplo): si ventas cambia la nota o el
  -- valor de venta, lo que aprobó el administrador ya no es lo mismo y vuelve a esperar (no sale por correo ni avanza).
  if old.aprob_oc = 'aprobada' and old.etapa = 'ventas' and new.etapa = 'ventas'
     and ((new.ficha - 'pdfDibujo') is distinct from (old.ficha - 'pdfDibujo') or new.valor_venta is distinct from old.valor_venta) then
    new.aprob_oc := null; new.aprob_oc_destino := null; new.aprob_oc_por := null; new.aprob_oc_en := null;
    return new;
  end if;
  if old.etapa = 'ventas' and new.etapa <> 'ventas' and coalesce(old.aprob_oc, '') <> 'aprobada' then
    raise exception 'Esta orden de compra espera la aprobación del administrador antes de pasar a %',
      case new.etapa when 'arquitectura' then 'arquitectura' when 'asignacion' then 'el líder de operaciones' else 'ejecución' end
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function oc_aprobar_admin(p_id uuid, p_aprobar boolean, p_comentario text) returns void
language plpgsql security definer set search_path = public as $$
declare p proyectos;
begin
  if not _soy_admin() then raise exception 'Solo el administrador aprueba órdenes de compra' using errcode = 'P0001'; end if;
  select * into p from proyectos where id = p_id for update;
  if not found then raise exception 'No encontré esa orden de compra' using errcode = 'P0001'; end if;
  if p.etapa <> 'ventas' or p.aprob_oc is distinct from 'pendiente' then
    raise exception 'Esa orden de compra no está esperando aprobación' using errcode = 'P0001';
  end if;
  if p_aprobar then perform _oc_aprobar(p_id, p_comentario); return; end if;
  if length(trim(coalesce(p_comentario, ''))) = 0 then
    raise exception 'Contale al vendedor qué hay que corregir' using errcode = 'P0001';
  end if;
  perform set_config('app.aprobando', '1', true);
  update proyectos set aprob_oc = 'devuelta', aprob_oc_por = auth.uid(), aprob_oc_en = now(), aprob_oc_comentario = trim(p_comentario)
  where id = p_id;
  -- El precio de la orden de compra quedó "aceptado" al guardarla: se reabre para que ventas lo pueda corregir
  -- (si no, cot_guardar_nota dice "El cliente ya aceptó ese presupuesto: el precio no cambia"). Al guardar la nota
  -- de nuevo se recalcula y vuelve a quedar aceptado con el precio nuevo.
  update cotizaciones set estado = case when autorizado_por is not null then 'autorizada' else 'lista' end,
    enviada_en = null, enviada_via = null, actualizado_en = now()
  where id = (select id from cotizaciones where proyecto_id = p_id and origen = 'nota' order by creado_en desc limit 1)
    and estado = 'enviada' and enviada_via = 'nota';
  perform set_config('app.aprobando', '', true);
end $$;

-- Comprobación: debe devolver corrida_0039 = true
select pg_get_functiondef('public.oc_aprobar_admin(uuid,boolean,text)'::regprocedure) like '%se reabre%' as corrida_0039;
