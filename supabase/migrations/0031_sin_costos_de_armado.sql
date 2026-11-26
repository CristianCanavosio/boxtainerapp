-- 0031: Sin costos de armado (decisión de Cristian 26/11).
-- "Armado de oficina / baño / cocina / habitación…" ya no se cuentan en el precio ni figuran como "sin costo".
-- La nota nueva ya no los manda; esto cubre los presupuestos guardados antes y las recetas de obra.
-- Necesita la 0030. Se puede correr más de una vez.

create or replace function _cot_calc_nota(p_lineas jsonb, p_prod text, p_tam text, p_unidades int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m numeric := coalesce((select valor from cot_parametros where clave = 'margen_default'), 0);
  u int := greatest(1, least(999, coalesce(p_unidades, 1)));
  company boolean := coalesce(p_prod, '') ~ 'Company$';
  costo numeric := 0; sin int := 0; sin_nom jsonb := '[]'::jsonb;
  det jsonb := '[]'::jsonb; dcost jsonb := '[]'::jsonb;
  r record; c numeric; incl boolean;
  -- instalación eléctrica por m² (todos menos Company): la nota ya la trae, o sale de los m² de la mano de obra
  elec boolean := not (coalesce(p_prod, '') ~ 'Company$') and exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) x
    where trim(x->>'clave') in ('Instalación eléctrica', 'Mano de obra general'));
begin
  for r in
    with rec_todas as (
      select clave, cant, tam from recetas_tipologia
      where tipologia = p_prod and (tam = '' or tam = coalesce(p_tam, ''))),
    nota0 as (
      select trim(x->>'clave') as clave, sum(greatest(0, coalesce((x->>'cant')::numeric, 0))) as cant
      from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) x
      where coalesce(trim(x->>'clave'), '') <> '' and (x->>'cant') ~ '^-?[0-9]+([.][0-9]+)?$'
      group by 1),
    nota as (   -- presupuestos guardados antes de la 0030: la instalación eléctrica sale de los m² de la mano de obra
      select clave, cant from nota0 where elec or clave <> 'Instalación eléctrica'   -- Company: no se suma
      union all
      select 'Instalación eléctrica', cant from nota0
      where elec and clave = 'Mano de obra general' and not exists (select 1 from nota0 where clave = 'Instalación eléctrica')),
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
    select t.clave, t.cant from todo t
    where t.cant > 0 and t.clave !~* '^armado de '   -- los costos de armado no se cuentan (decisión de Cristian 26/11)
    order by t.clave
  loop
    -- tomas, luces, tablero, disyuntor, térmicas, cables… quedan incluidos en la instalación eléctrica por m²
    -- (siguen en la lista de materiales para el taller, pero con costo 0)
    incl := elec and r.clave <> 'Instalación eléctrica' and _cot_es_electrico(r.clave);
    c := case when incl then 0 else (_cot_costo_item(r.clave)).costo end;
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

-- Los presupuestos abiertos quedan al día (los aceptados no cambian)
select _cot_recalcular_abiertas() as presupuestos_actualizados;
