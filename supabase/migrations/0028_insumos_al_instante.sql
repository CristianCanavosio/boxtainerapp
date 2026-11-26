-- 0028: Lo que se carga en Materiales y costos impacta al instante en los presupuestos (pedido de Cristian 26/11).
-- Antes:
--   · El precio en vivo de la nota ya salía del maestro, pero un presupuesto GUARDADO quedaba con el precio
--     del día en que se guardó, hasta que alguien abría la nota y la guardaba de nuevo.
--   · Un insumo nuevo no entraba en ninguna nota hasta emparejarlo a mano en "Ítems de proyectos",
--     aunque en la receta de obra tuviera exactamente el mismo nombre.
--   · Las otras pantallas abiertas (admin en otra compu, líder de ventas) no se enteraban de los cambios
--     del maestro hasta recargar.
-- Ahora:
--   1. Si un ítem de la nota o de la receta no está emparejado, toma el insumo del maestro que se llama igual
--      (o que tiene ese código), antes que el precio viejo de la lista de costos.
--   2. Cada vez que cambia un insumo, una equivalencia, una receta, una tipología, un parámetro o la lista de
--      costos, la base recalcula sola los presupuestos ABIERTOS (los de la nota y los del cotizador).
--      Los que el cliente ya aceptó (orden de compra) NO cambian: conservan su precio.
--      Un precio que pidió el vendedor y autorizó el líder de ventas se respeta; cambia el precio de lista.
--   3. Las tablas del maestro avisan en tiempo real: las pantallas abiertas se actualizan solas.
--   4. Mano de obra por regla de tres (pedido de Cristian 26/11): en todos los presupuestos de nota la mano de
--      obra = m² del piso del módulo × (costo de la mano de obra del módulo de referencia ÷ m² de referencia).
--      Referencia: "Mano de obra general" en Ítems de proyectos (hoy: Mano de obra módulo 40 sin baño) y el
--      parámetro "m² del módulo de referencia" (29,74 = 40 pies). Ej.: 40' 29,74 m² → 1 × costo; 20' 14,8 m² → ~0,5 × costo.
--      Si la receta de obra trae su propia "Mano de obra…", se reemplaza por esta (antes se sumaban las dos).
-- Se puede correr más de una vez.

-- ══════════════ 0. M² DE REFERENCIA DE LA MANO DE OBRA ══════════════
-- La primera vez: la equivalencia de "Mano de obra general" pasa a ser la del módulo entero (antes ya venía ÷ 29,74).
do $$
begin
  if not exists (select 1 from cot_parametros where clave = 'mo_m2_referencia') then
    insert into cot_parametros (clave, valor, descripcion)
      values ('mo_m2_referencia', 29.74, 'm² del módulo de referencia de la mano de obra (regla de tres por m²)');
    update cot_equivalencias set composicion = (
        select jsonb_agg(jsonb_set(e, '{factor}', to_jsonb(round(coalesce((e->>'factor')::numeric, 0) * 29.74, 4))))
        from jsonb_array_elements(composicion) e),
      actualizado_en = now()
    where clave = 'Mano de obra general' and jsonb_array_length(composicion) > 0;
  end if;
end $$;

-- ══════════════ 1. INSUMO CON EL MISMO NOMBRE ══════════════
-- Costo de un ítem de la app: equivalencia → insumo con el mismo nombre o código → precio viejo de lista_costos.
create or replace function _cot_costo_item(p_clave text, out costo numeric, out falta boolean)
language plpgsql stable security definer set search_path = public as $$
declare comp jsonb; i cot_insumos;
begin
  falta := false; costo := null;
  select composicion into comp from cot_equivalencias where clave = p_clave and jsonb_array_length(composicion) > 0;
  if comp is not null then
    select sum(x.costo_usd * coalesce((e->>'factor')::numeric, 0)), bool_or(x.costo_usd is null or x.codigo is null)
      into costo, falta
    from jsonb_array_elements(comp) e left join cot_insumos x on x.codigo = e->>'insumo';
    if falta then costo := null; end if;
    -- mano de obra por m²: el costo del módulo de referencia ÷ sus m²
    if p_clave = 'Mano de obra general' and costo is not null then
      costo := costo / coalesce(nullif((select valor from cot_parametros where clave = 'mo_m2_referencia'), 0), 29.74);
    end if;
    return;
  end if;
  select * into i from cot_insumos
    where activo and (codigo = trim(p_clave) or lower(trim(nombre)) = lower(trim(p_clave)))
    order by (codigo = trim(p_clave)) desc, codigo limit 1;
  if found then
    costo := i.costo_usd; falta := i.costo_usd is null; return;
  end if;
  select nullif(l.costo, 0) into costo from lista_costos l where l.clave = p_clave;
end $$;
revoke all on function _cot_costo_item(text) from public, anon, authenticated;

create or replace function _cot_calc_nota(p_lineas jsonb, p_prod text, p_tam text, p_unidades int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m numeric := coalesce((select valor from cot_parametros where clave = 'margen_default'), 0);
  u int := greatest(1, least(999, coalesce(p_unidades, 1)));
  company boolean := coalesce(p_prod, '') ~ 'Company$';
  costo numeric := 0; sin int := 0; sin_nom jsonb := '[]'::jsonb;
  det jsonb := '[]'::jsonb; dcost jsonb := '[]'::jsonb;
  r record; c numeric;
begin
  for r in
    with rec_todas as (
      select clave, cant, tam from recetas_tipologia
      where tipologia = p_prod and (tam = '' or tam = coalesce(p_tam, ''))),
    nota as (
      select trim(x->>'clave') as clave, sum(greatest(0, coalesce((x->>'cant')::numeric, 0))) as cant
      from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) x
      where coalesce(trim(x->>'clave'), '') <> '' and (x->>'cant') ~ '^-?[0-9]+([.][0-9]+)?$'
      group by 1),
    rec as (   -- la del tamaño manda sobre la de "cualquier tamaño"
      select distinct on (clave) clave, cant * u as cant from rec_todas
      -- con mano de obra por m² en la nota, la de la receta no se suma (regla de tres para todos)
      where not (clave ~* '^mano de obra' and exists (select 1 from nota where nota.clave = 'Mano de obra general'))
      order by clave, (tam = '') ),
    todo as (
      select clave, cant from nota
      where not exists (select 1 from rec where rec.clave = nota.clave)
        and (not company or not exists (select 1 from rec) or
             clave ~ '^(Contenedor |Corte de contenedor|Flete$|Comisión de venta$|Amortización de planta|Mano de obra general$)')
      union all select clave, cant from rec)
    select t.clave, t.cant from todo t where t.cant > 0 order by t.clave
  loop
    c := (_cot_costo_item(r.clave)).costo;
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

-- ══════════════ 2. LO QUE HACE FALTA PARA RECALCULAR ══════════════
-- Lo que mandó la nota al guardarse (ítems, producto, tamaño, unidades), para poder recalcular sin abrirla.
alter table cotizaciones add column if not exists entrada jsonb;
-- Los presupuestos guardados antes de esta migración: se arman con el detalle que ya tenían (receta incluida).
update cotizaciones v set entrada = jsonb_build_object(
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('clave', d->>'clave', 'cant', (d->>'cant')::numeric))
                        from jsonb_array_elements(cc.detalle) d where coalesce(d->>'clave', '') <> ''), '[]'::jsonb),
    'prod', null, 'tam', null, 'uni', v.unidades)
  from cotizaciones_costo cc
  where cc.cotizacion_id = v.id and v.origen = 'nota' and v.entrada is null;

-- Guardar el precio de una nota: igual que en 0027, y además guarda lo que mandó la nota (entrada).
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
  update cotizaciones set entrada = jsonb_build_object('lineas', coalesce(p_lineas, '[]'::jsonb), 'prod', p_prod, 'tam', p_tam, 'uni', (c->>'unidades')::int)
    where id = nid;
  return nid;
end $$;

revoke all on function cot_guardar_nota(uuid, uuid, jsonb, text, text, int, text, numeric, text) from anon;

-- ══════════════ 3. RECALCULAR LOS PRESUPUESTOS ABIERTOS ══════════════
-- Abiertos = todo lo que el cliente todavía no aceptó (lista, pendiente, autorizada, rechazada).
-- · Si el precio sigue al de lista (el vendedor no pidió otro): cambian el de lista y el final.
-- · Si el vendedor pidió un precio más alto: se mantiene, salvo que el de lista nuevo lo supere.
-- · Si hay un precio pedido más bajo (pendiente o autorizado): se respeta; solo cambia el de lista de referencia.
--   Si el que esperaba autorización ya no es más bajo que el de lista nuevo, queda listo sin autorizar.
-- · "Enviada" (el cliente aceptó / orden de compra) NO se toca nunca.
create or replace function _cot_recalcular_abiertas() returns int
language plpgsql security definer set search_path = public as $$
declare
  v cotizaciones; c jsonb; lista numeric; final numeric; pedido numeric; est text; n int := 0; e jsonb;
begin
  for v in select * from cotizaciones where estado in ('lista','pendiente','autorizada','rechazada') for update loop
    begin
      if v.origen = 'nota' then
        e := v.entrada;
        if e is null then continue; end if;
        c := _cot_calc_nota(e->'lineas', e->>'prod', e->>'tam', coalesce((e->>'uni')::int, v.unidades));
      else
        if v.tipologia is null then continue; end if;
        c := _cot_calc(v.tipologia, v.cambios, v.unidades);
      end if;
    exception when others then
      continue;   -- p. ej. la tipología se desactivó: esa cotización queda como estaba
    end;
    lista := (c->>'precio_total')::numeric;
    pedido := v.precio_pedido; final := v.precio_final; est := v.estado;
    if est = 'lista' then
      if pedido is null or pedido <= lista then final := lista; pedido := null;
      else final := pedido; end if;
    elsif est = 'pendiente' and pedido >= lista then
      est := 'lista'; final := pedido;   -- el precio pedido ya no es más bajo que el de lista: no hace falta autorizarlo
    end if;
    if v.estado is distinct from est or v.precio_lista is distinct from lista or v.precio_final is distinct from final or v.precio_pedido is distinct from pedido
       or v.sin_costo is distinct from (c->>'sin_costo')::int or v.detalle is distinct from c->'detalle'
       or v.iva is distinct from (c->>'iva')::numeric or v.tipo_cambio is distinct from (c->>'tipo_cambio')::numeric then
      update cotizaciones set estado = est, precio_lista = lista, precio_final = final, precio_pedido = pedido, detalle = c->'detalle',
        sin_costo = (c->>'sin_costo')::int, iva = (c->>'iva')::numeric, tipo_cambio = (c->>'tipo_cambio')::numeric,
        validez_dias = (c->>'validez_dias')::int, actualizado_en = now()
      where id = v.id;
      n := n + 1;
      -- el contacto del CRM de un presupuesto de nota muestra el precio nuevo (embudo y pronóstico)
      if v.origen = 'nota' and (c->>'sin_costo')::int = 0 then
        update oportunidades set precio_estandar = lista,
          precio_cliente = case when final is not null then final else precio_cliente end
        where id = v.oportunidad_id and etapa not in ('ganado','perdido','no_calificado')
          and (precio_estandar is distinct from lista or (final is not null and precio_cliente is distinct from final));
      end if;
    end if;
    insert into cotizaciones_costo (cotizacion_id, costo_total, margen, detalle)
      values (v.id, (c->>'costo_total')::numeric, (c->>'margen')::numeric, c->'detalle_costo')
      on conflict (cotizacion_id) do update set costo_total = excluded.costo_total, margen = excluded.margen, detalle = excluded.detalle
      where cotizaciones_costo.costo_total is distinct from excluded.costo_total or cotizaciones_costo.margen is distinct from excluded.margen
         or cotizaciones_costo.detalle is distinct from excluded.detalle;
  end loop;
  return n;
end $$;
revoke all on function _cot_recalcular_abiertas() from public, anon, authenticated;

create or replace function _cot_recalcular_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform _cot_recalcular_abiertas();
  return null;
end $$;
revoke all on function _cot_recalcular_trg() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['cot_insumos','cot_equivalencias','cot_recetas','cot_tipologias','cot_parametros','recetas_tipologia','lista_costos'] loop
    execute format('drop trigger if exists %I on %I', t||'_recalcular', t);
    execute format('create trigger %I after insert or update or delete on %I for each statement execute function _cot_recalcular_trg()', t||'_recalcular', t);
  end loop;
end $$;

-- Para que lo de hoy ya quede al día
select _cot_recalcular_abiertas() as presupuestos_actualizados;

-- ══════════════ 4. TIEMPO REAL PARA EL MAESTRO ══════════════
-- (cada usuario recibe solo lo que puede leer: el vendedor no recibe costos)
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['cot_insumos','cot_equivalencias','cot_recetas','cot_tipologias','cot_parametros','recetas_tipologia','oportunidades'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
