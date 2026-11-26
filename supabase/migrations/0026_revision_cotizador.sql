-- 0026: Revisión del cotizador (26/11).
-- 1. Al guardar una cotización que ya existe, la base controla que sea del mismo contacto del CRM
--    (antes se podía mezclar el nombre de un cliente con la cotización de otro).
-- 2. Al actualizar costos (planilla hoy, Flexxus mañana), un costo negativo se saltea en vez de cortar
--    toda la actualización con un error.
-- No cambia datos ni permisos: solo reemplaza dos funciones. Se puede correr más de una vez.

create or replace function cot_guardar(p_id uuid, p_oportunidad uuid, p_tipologia text, p_cambios jsonb, p_unidades int,
  p_notas text, p_precio_pedido numeric, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c jsonb; o oportunidades; v cotizaciones; lista numeric; pedido numeric := nullif(p_precio_pedido, 0);
  est text; final numeric; aut uuid; aut_en timestamptz; nid uuid; lider boolean := ve_todo_crm();
begin
  if not usa_cotizador() then raise exception 'El cotizador es para ventas, el líder de ventas y el administrador'; end if;
  select * into o from oportunidades where id = p_oportunidad;
  if not found or not ve_oportunidad(p_oportunidad) then raise exception 'No encontré ese contacto del CRM'; end if;
  if p_id is not null then
    select * into v from cotizaciones where id = p_id for update;
    if not found or not (lider or v.vendedor_id = auth.uid()) then raise exception 'No encontré esa cotización'; end if;
    if v.estado = 'enviada' then raise exception 'La cotización ya se envió: hacé una nueva'; end if;
    -- una cotización no cambia de contacto (si no, quedaba con el nombre de un cliente y colgada de otro)
    if v.oportunidad_id <> p_oportunidad then raise exception 'Esa cotización es de otro contacto'; end if;
  end if;
  if pedido is not null and pedido < 0 then raise exception 'El precio no puede ser negativo'; end if;
  c := _cot_calc(p_tipologia, p_cambios, p_unidades);
  lista := (c->>'precio_total')::numeric;
  if pedido is null or pedido >= lista then
    est := 'lista'; final := coalesce(pedido, lista); pedido := case when pedido is not null and pedido <> lista then pedido end;
  elsif lider then
    est := 'autorizada'; final := pedido; aut := auth.uid(); aut_en := now();
  elsif p_id is not null and v.estado = 'autorizada' and v.precio_final = pedido and v.precio_lista = lista then
    est := 'autorizada'; final := pedido; aut := v.autorizado_por; aut_en := v.autorizado_en;   -- nada cambió: sigue autorizada
  else
    est := 'pendiente'; final := null;
    if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Contale al líder de ventas por qué pedís otro precio'; end if;
  end if;
  if p_id is null then
    insert into cotizaciones (oportunidad_id, vendedor_id, cliente, tipologia, tipologia_nombre, unidades, cambios, detalle, notas,
      precio_lista, precio_pedido, motivo_pedido, precio_final, estado, autorizado_por, autorizado_en, iva, tipo_cambio, validez_dias, sin_costo)
    values (o.id, o.vendedor_id, o.cliente, p_tipologia, c->>'tipologia_nombre', (c->>'unidades')::int, coalesce(p_cambios, '{}'::jsonb), c->'detalle', nullif(trim(p_notas), ''),
      lista, pedido, nullif(trim(p_motivo), ''), final, est, aut, aut_en, (c->>'iva')::numeric, (c->>'tipo_cambio')::numeric, (c->>'validez_dias')::int, (c->>'sin_costo')::int)
    returning id into nid;
  else
    update cotizaciones set tipologia = p_tipologia, tipologia_nombre = c->>'tipologia_nombre', unidades = (c->>'unidades')::int,
      cambios = coalesce(p_cambios, '{}'::jsonb), detalle = c->'detalle', notas = nullif(trim(p_notas), ''), cliente = o.cliente,
      precio_lista = lista, precio_pedido = pedido, motivo_pedido = nullif(trim(p_motivo), ''), precio_final = final, estado = est,
      respuesta = case when est = 'pendiente' then null else respuesta end,
      autorizado_por = aut, autorizado_en = aut_en, iva = (c->>'iva')::numeric, tipo_cambio = (c->>'tipo_cambio')::numeric,
      validez_dias = (c->>'validez_dias')::int, sin_costo = (c->>'sin_costo')::int, actualizado_en = now()
    where id = p_id;
    nid := p_id;
  end if;
  insert into cotizaciones_costo (cotizacion_id, costo_total, margen, detalle)
    values (nid, (c->>'costo_total')::numeric, (c->>'margen')::numeric, c->'detalle_costo')
    on conflict (cotizacion_id) do update set costo_total = excluded.costo_total, margen = excluded.margen, detalle = excluded.detalle;
  return nid;
end $$;

create or replace function cot_actualizar_costos(p_costos jsonb, p_fuente text default 'planilla') returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0; tc numeric := (select valor from cot_parametros where clave = 'tipo_cambio'); c numeric; k int;
begin
  if not es_admin_cot() then raise exception 'Solo el administrador actualiza costos'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_costos, '[]'::jsonb)) loop
    if x->>'costo' is null or (x->>'costo') !~ '^-?[0-9]+([.][0-9]+)?$' then continue; end if;
    c := (x->>'costo')::numeric;
    if c < 0 then continue; end if;   -- un costo negativo (error de carga) se saltea en vez de frenar toda la actualización
    if upper(coalesce(x->>'moneda', 'USD')) = 'ARS' then
      if coalesce(tc, 0) <= 0 then raise exception 'Falta el tipo de cambio para pasar pesos a dólares'; end if;
      c := c / tc;
    end if;
    update cot_insumos set costo_usd = round(c, 4), fuente = coalesce(nullif(p_fuente, ''), 'planilla'), costo_actualizado_en = now()
    where (x ? 'codigo' and codigo = x->>'codigo') or (x ? 'codigo_externo' and codigo_externo = x->>'codigo_externo');
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;

-- Comprobación: debe decir true dos veces
select pg_get_functiondef('public.cot_guardar(uuid,uuid,text,jsonb,integer,text,numeric,text)'::regprocedure) like '%es de otro contacto%' as guardar_ok,
       pg_get_functiondef('public.cot_actualizar_costos(jsonb,text)'::regprocedure) like '%c < 0 then continue%' as costos_ok;
