-- 0027: Precio dentro de la nota de pedido (pedido de Cristian 26/11).
-- - Cuando el vendedor carga una nota de pedido como "Presupuesto", en el último paso ve el precio al
--   cliente de ESA nota, sea una tipología estándar o una versión a medida. La base lo calcula igual que
--   el costeo del proyecto: cada ítem de la nota (y la receta de su tipología) × su costo en el maestro de
--   insumos (equivalencias), o el precio viejo de la lista de costos si el ítem no está emparejado,
--   × (1 + margen por defecto). Al vendedor le llega solo el precio: nunca costos ni márgenes.
-- - Si pide un precio más bajo, lo autoriza el líder de ventas (igual que en el cotizador).
-- - Al guardar el presupuesto, el cliente queda en el CRM en la etapa Presupuesto con el precio
--   (si ya estaba cargado se usa ese contacto: no hay que cargar los datos de nuevo).
-- - Cuando el cliente acepta, la nota pasa a "Orden de compra confirmada" con ese precio.
-- Se puede correr más de una vez.

-- ══════════════ COTIZACIONES QUE SALEN DE UNA NOTA ══════════════
alter table cotizaciones alter column tipologia drop not null;
alter table cotizaciones add column if not exists origen text not null default 'tipologia';
alter table cotizaciones drop constraint if exists cotizaciones_origen_check;
alter table cotizaciones add constraint cotizaciones_origen_check check (origen in ('tipologia','nota'));
alter table cotizaciones add column if not exists proyecto_id uuid references proyectos on delete set null;
create index if not exists cot_proy on cotizaciones (proyecto_id);

-- ══════════════ CÁLCULO (interno: devuelve costos) ══════════════
-- p_lineas: lo que sale de la nota [{clave, cant}] (ya multiplicado por las unidades).
-- Se suma la receta de la tipología (recetas_tipologia), con la misma regla que el costeo del proyecto:
-- si un ítem está en la nota y en la receta, manda la receta; en los productos Company manda la receta
-- completa y de la nota quedan solo el contenedor, el corte, el flete, la comisión y la amortización.
create or replace function _cot_calc_nota(p_lineas jsonb, p_prod text, p_tam text, p_unidades int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m numeric := coalesce((select valor from cot_parametros where clave = 'margen_default'), 0);
  u int := greatest(1, least(999, coalesce(p_unidades, 1)));
  company boolean := coalesce(p_prod, '') ~ 'Company$';
  costo numeric := 0; sin int := 0; sin_nom jsonb := '[]'::jsonb;
  det jsonb := '[]'::jsonb; dcost jsonb := '[]'::jsonb;
  r record; c numeric; falta boolean;
begin
  for r in
    with rec_todas as (
      select clave, cant, tam from recetas_tipologia
      where tipologia = p_prod and (tam = '' or tam = coalesce(p_tam, ''))),
    rec as (   -- la del tamaño manda sobre la de "cualquier tamaño"
      select distinct on (clave) clave, cant * u as cant from rec_todas order by clave, (tam = '') ),
    nota as (
      select trim(x->>'clave') as clave, sum(greatest(0, coalesce((x->>'cant')::numeric, 0))) as cant
      from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) x
      where coalesce(trim(x->>'clave'), '') <> '' and (x->>'cant') ~ '^-?[0-9]+([.][0-9]+)?$'
      group by 1),
    todo as (
      select clave, cant from nota
      where not exists (select 1 from rec where rec.clave = nota.clave)
        and (not company or not exists (select 1 from rec) or
             clave ~ '^(Contenedor |Corte de contenedor|Flete$|Comisión de venta$|Amortización de planta)')
      union all select clave, cant from rec)
    select t.clave, t.cant, e.composicion, l.costo as costo_viejo
    from todo t
    left join cot_equivalencias e on e.clave = t.clave and jsonb_array_length(e.composicion) > 0
    left join lista_costos l on l.clave = t.clave
    where t.cant > 0
    order by t.clave
  loop
    c := null; falta := false;
    if r.composicion is not null then
      select sum(i.costo_usd * coalesce((x->>'factor')::numeric, 0)), bool_or(i.costo_usd is null or i.codigo is null)
        into c, falta
      from jsonb_array_elements(r.composicion) x left join cot_insumos i on i.codigo = x->>'insumo';
      if falta then c := null; end if;
    elsif coalesce(r.costo_viejo, 0) > 0 then
      c := r.costo_viejo;
    end if;
    det := det || jsonb_build_object('nombre', r.clave, 'cant', round(r.cant, 2));
    if c is null then sin := sin + 1; sin_nom := sin_nom || to_jsonb(r.clave);
    else costo := costo + r.cant * c; end if;
    dcost := dcost || jsonb_build_object('clave', r.clave, 'cant', round(r.cant, 2), 'costo', round(c, 2));
  end loop;
  return jsonb_build_object(
    'unidades', u, 'costo_total', round(costo, 2), 'margen', m,
    'precio_total', round(costo * (1 + m)), 'detalle', det, 'detalle_costo', dcost,
    'sin_costo', sin, 'sin_costo_nombres', sin_nom,
    'iva', coalesce((select valor from cot_parametros where clave = 'iva'), 0),
    'tipo_cambio', (select valor from cot_parametros where clave = 'tipo_cambio'),
    'validez_dias', coalesce((select valor from cot_parametros where clave = 'validez_dias'), 7)::int);
end $$;
revoke all on function _cot_calc_nota(jsonb, text, text, int) from public, anon, authenticated;

-- Precio en vivo en el último paso de la nota (al vendedor solo el precio; costos solo al líder y al admin)
create or replace function cot_calcular_nota(p_lineas jsonb, p_prod text, p_tam text, p_unidades int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb;
begin
  if not usa_cotizador() then raise exception 'El precio de la nota es para ventas, el líder de ventas y el administrador'; end if;
  c := _cot_calc_nota(p_lineas, p_prod, p_tam, p_unidades);
  if not ve_costos_cot() then c := c - 'costo_total' - 'margen' - 'detalle_costo'; end if;
  return c;
end $$;

-- Guarda el precio de una nota (una cotización por proyecto: si ya existe, se actualiza).
-- Mismas reglas que el cotizador: un precio más bajo que el de lista queda esperando al líder de ventas.
-- Además deja al contacto del CRM con el precio y, si todavía no estaba, en la etapa Presupuesto.
create or replace function cot_guardar_nota(p_oportunidad uuid, p_proyecto uuid, p_lineas jsonb, p_prod text, p_tam text,
  p_unidades int, p_nombre text, p_precio_pedido numeric, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c jsonb; o oportunidades; v cotizaciones; lista numeric; pedido numeric := nullif(p_precio_pedido, 0);
  est text; final numeric; aut uuid; aut_en timestamptz; nid uuid; lider boolean := ve_todo_crm(); hay boolean := false;
begin
  if not usa_cotizador() then raise exception 'El precio de la nota es para ventas, el líder de ventas y el administrador'; end if;
  select * into o from oportunidades where id = p_oportunidad for update;
  if not found or not ve_oportunidad(p_oportunidad) then raise exception 'No encontré ese contacto del CRM'; end if;
  if not exists (select 1 from proyectos where id = p_proyecto) then raise exception 'No encontré la nota de pedido'; end if;
  if pedido is not null and pedido < 0 then raise exception 'El precio no puede ser negativo'; end if;
  select * into v from cotizaciones where proyecto_id = p_proyecto and origen = 'nota' order by creado_en desc limit 1 for update;
  hay := found;
  if hay and not (lider or v.vendedor_id = auth.uid()) then raise exception 'Ese presupuesto es de otro vendedor'; end if;
  if hay and v.estado = 'enviada' then raise exception 'El cliente ya aceptó ese presupuesto: el precio no cambia'; end if;
  c := _cot_calc_nota(p_lineas, p_prod, p_tam, p_unidades);
  lista := (c->>'precio_total')::numeric;
  if pedido is null or pedido >= lista then
    est := 'lista'; final := coalesce(pedido, lista); pedido := case when pedido is not null and pedido <> lista then pedido end;
  elsif lider then
    est := 'autorizada'; final := pedido; aut := auth.uid(); aut_en := now();
  elsif hay and v.estado = 'autorizada' and v.precio_final = pedido and v.precio_lista = lista then
    est := 'autorizada'; final := pedido; aut := v.autorizado_por; aut_en := v.autorizado_en;   -- nada cambió: sigue autorizada
  elsif hay and v.estado = 'pendiente' and v.precio_pedido = pedido and v.precio_lista = lista then
    est := 'pendiente'; final := null;                                                             -- sigue esperando, sin volver a pedir
  else
    est := 'pendiente'; final := null;
    if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Contale al líder de ventas por qué pedís otro precio'; end if;
  end if;
  if not hay then
    insert into cotizaciones (oportunidad_id, vendedor_id, cliente, tipologia, tipologia_nombre, origen, proyecto_id, unidades, cambios, detalle,
      precio_lista, precio_pedido, motivo_pedido, precio_final, estado, autorizado_por, autorizado_en, iva, tipo_cambio, validez_dias, sin_costo)
    values (o.id, o.vendedor_id, o.cliente, null, nullif(trim(p_nombre), ''), 'nota', p_proyecto, (c->>'unidades')::int, '{}'::jsonb, c->'detalle',
      lista, pedido, nullif(trim(p_motivo), ''), final, est, aut, aut_en, (c->>'iva')::numeric, (c->>'tipo_cambio')::numeric, (c->>'validez_dias')::int, (c->>'sin_costo')::int)
    returning id into nid;
  else
    update cotizaciones set oportunidad_id = o.id, cliente = o.cliente, tipologia_nombre = nullif(trim(p_nombre), ''), unidades = (c->>'unidades')::int,
      detalle = c->'detalle', precio_lista = lista, precio_pedido = pedido, motivo_pedido = nullif(trim(p_motivo), ''), precio_final = final,
      estado = est, respuesta = case when est = 'pendiente' and v.estado <> 'pendiente' then null else respuesta end,
      autorizado_por = aut, autorizado_en = aut_en, iva = (c->>'iva')::numeric, tipo_cambio = (c->>'tipo_cambio')::numeric,
      validez_dias = (c->>'validez_dias')::int, sin_costo = (c->>'sin_costo')::int, actualizado_en = now()
    where id = v.id;
    nid := v.id;
  end if;
  insert into cotizaciones_costo (cotizacion_id, costo_total, margen, detalle)
    values (nid, (c->>'costo_total')::numeric, (c->>'margen')::numeric, c->'detalle_costo')
    on conflict (cotizacion_id) do update set costo_total = excluded.costo_total, margen = excluded.margen, detalle = excluded.detalle;
  -- el contacto del CRM: queda con la nota, el precio y, si estaba antes, pasa a Presupuesto
  update oportunidades set
    proyecto_id = coalesce(proyecto_id, p_proyecto),
    unidades = (c->>'unidades')::int,
    precio_estandar = case when (c->>'sin_costo')::int = 0 then lista else precio_estandar end,
    precio_cliente = case when (c->>'sin_costo')::int = 0 and final is not null then final else precio_cliente end,
    etapa = case when etapa in ('precalificado','calificado') then 'presupuesto' else etapa end
  where id = o.id;
  return nid;
end $$;

-- Cuando el cliente acepta: el contacto pasa a Ganado con la nota (la app pone el precio como valor de venta)
create or replace function cot_nota_aceptada(p_proyecto uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare v cotizaciones;
begin
  if not usa_cotizador() then raise exception 'Solo ventas, el líder de ventas o el administrador'; end if;
  select * into v from cotizaciones where proyecto_id = p_proyecto and origen = 'nota' order by creado_en desc limit 1;
  if not found then return null; end if;
  if not (ve_todo_crm() or v.vendedor_id = auth.uid()) then raise exception 'Ese presupuesto es de otro vendedor'; end if;
  if v.estado not in ('lista','autorizada','enviada') or v.precio_final is null then raise exception 'El precio del presupuesto todavía no está autorizado'; end if;
  update cotizaciones set estado = 'enviada', enviada_en = coalesce(enviada_en, now()), enviada_via = coalesce(enviada_via, 'nota'), actualizado_en = now()
    where id = v.id;
  update oportunidades set etapa = 'ganado', proyecto_id = coalesce(proyecto_id, p_proyecto),
    precio_cliente = v.precio_final, precio_estandar = coalesce(precio_estandar, v.precio_lista)
    where id = v.oportunidad_id and etapa <> 'ganado';
  return v.precio_final;
end $$;

-- Autorizar un precio: igual que antes, y si la cotización salió de una nota, el contacto del CRM
-- queda con el precio autorizado (así el embudo y el pronóstico muestran lo que se le pasó al cliente)
create or replace function cot_autorizar(p_id uuid, p_aprobar boolean, p_precio numeric, p_respuesta text) returns void
language plpgsql security definer set search_path = public as $$
declare v cotizaciones;
begin
  if not ve_todo_crm() then raise exception 'Solo el líder de ventas o el administrador autorizan precios'; end if;
  select * into v from cotizaciones where id = p_id for update;
  if not found then raise exception 'No encontré esa cotización'; end if;
  if v.estado <> 'pendiente' then raise exception 'Esa cotización no está esperando autorización'; end if;
  if p_aprobar then
    if coalesce(p_precio, v.precio_pedido) is null or coalesce(p_precio, v.precio_pedido) <= 0 then raise exception 'Falta el precio'; end if;
    update cotizaciones set estado = 'autorizada', precio_final = coalesce(p_precio, v.precio_pedido), precio_pedido = coalesce(p_precio, v.precio_pedido),
      autorizado_por = auth.uid(), autorizado_en = now(), respuesta = nullif(trim(p_respuesta), ''), actualizado_en = now()
    where id = p_id;
    if v.origen = 'nota' and v.sin_costo = 0 then
      update oportunidades set precio_cliente = coalesce(p_precio, v.precio_pedido) where id = v.oportunidad_id and etapa not in ('ganado','perdido','no_calificado');
    end if;
  else
    if length(trim(coalesce(p_respuesta, ''))) = 0 then raise exception 'Contale al vendedor por qué no'; end if;
    update cotizaciones set estado = 'rechazada', precio_final = null, autorizado_por = auth.uid(), autorizado_en = now(),
      respuesta = trim(p_respuesta), actualizado_en = now()
    where id = p_id;
  end if;
end $$;
