-- 0029: Mano de obra por regla de tres en todos los presupuestos (pedido de Cristian 26/11).
-- Mano de obra de cada presupuesto de nota = m² del piso del módulo × (costo de la mano de obra del módulo de
-- referencia ÷ m² de referencia). Referencia: "Mano de obra general" en Materiales y costos → Ítems de proyectos
-- (hoy: Mano de obra módulo 40 sin baño) y el parámetro "m² del módulo de referencia" (29,74 = 40 pies).
-- Ej.: 40' 29,74 m² → 1 × costo; 20' 14,87 m² → 0,5 × costo.
-- Si la receta de obra trae su propia "Mano de obra…", se reemplaza por esta (antes se sumaban las dos).
-- Los productos Company NO: siguen con la mano de obra fija de su receta (USD 2000, decisión de Cristian 26/11).
-- Necesita la 0028. Se puede correr más de una vez.

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
      -- (menos en los Company: mantienen la mano de obra fija de su receta)
      where company or not (clave ~* '^mano de obra' and exists (select 1 from nota where nota.clave = 'Mano de obra general'))
      order by clave, (tam = '') ),
    todo as (
      select clave, cant from nota
      where not exists (select 1 from rec where rec.clave = nota.clave)
        and (not company or not exists (select 1 from rec) or
             clave ~ '^(Contenedor |Corte de contenedor|Flete$|Comisión de venta$|Amortización de planta)')
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

-- Los presupuestos abiertos quedan al día con la regla nueva (los aceptados no cambian)
select _cot_recalcular_abiertas() as presupuestos_actualizados;
