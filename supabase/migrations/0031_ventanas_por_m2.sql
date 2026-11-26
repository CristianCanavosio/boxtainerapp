-- 0031: Ventanas por m² y vidrio DVH (pedido de Cristian 26/11).
-- · En la nota, la línea de aberturas queda Módena, A30 o A40 (Herrero y DVH ya no se ofrecen) y se agrega
--   el tipo de vidrio: Simple o DVH (3+3 / Cam 9).
-- · Todo el costo de las ventanas pasa a ser un solo ítem por m², mano de obra + materiales:
--   "Aberturas: ventanas por m² (MO+MAT)" = m² de ventanas (ancho × alto × cantidad) × USD 145.
--   Ej.: 2 ventanas de 100 × 100 = 2 m² × 145 = USD 290.
-- · Si el vidrio es DVH se suma "Aberturas: adicional vidrio DVH por m²" = mismos m² × USD 120.
-- · Los dos valores están en Materiales y costos → Insumos ("VENTANA POR M2 (MO+MAT)" y
--   "ADICIONAL VIDRIO DVH POR M2"): se cambian ahí.
-- · Cada ventana suelta ("Ventana Módena · 100 × 100"…) sigue en la nota, el taller y el pedido a la carpintería,
--   pero con costo 0. Reja y mosquitero siguen costeándose aparte.
-- · Puertas: sin cambios (no comparten ítems de costo con las ventanas).
-- · Los Company NO cambian: siguen con las ventanas de su receta (igual que la mano de obra y lo eléctrico).
-- · Los presupuestos abiertos se recalculan (los guardados antes toman los m² de la medida de cada ventana;
--   una "medida especial" vieja conserva su costo anterior). Los aceptados conservan su precio.
-- Necesita la 0028, la 0029 y la 0030. Se puede correr más de una vez.

insert into cot_insumos (codigo, nombre, rubro, unidad, costo_usd, para_vendedor, fuente, costo_actualizado_en) values
  ('INS-VENT-M2', 'VENTANA POR M2 (MO+MAT)', 'Aberturas', 'M2', 145, false, 'manual', now()),
  ('INS-DVH-M2', 'ADICIONAL VIDRIO DVH POR M2', 'Aberturas', 'M2', 120, false, 'manual', now())
on conflict (codigo) do nothing;
insert into cot_equivalencias (clave, composicion) values
  ('Aberturas: ventanas por m² (MO+MAT)', '[{"insumo": "INS-VENT-M2", "factor": 1}]'::jsonb),
  ('Aberturas: adicional vidrio DVH por m²', '[{"insumo": "INS-DVH-M2", "factor": 1}]'::jsonb)
on conflict (clave) do nothing;

-- ¿Es una ventana suelta? (mismo criterio que la app: esVentana en web/maestro.js)
create or replace function _cot_es_ventana(p_clave text) returns boolean
language sql immutable set search_path = public as $$
  select lower(trim(coalesce(p_clave, ''))) ~ '^ventana'
$$;

-- m² de una ventana por su nombre ("Ventana Módena · 100 × 60" → 0,6). Null si no trae medida (medida especial).
create or replace function _cot_medida_ventana(p_clave text) returns numeric
language sql immutable set search_path = public as $$
  select (m[1])::numeric * (m[2])::numeric / 10000
  from (select regexp_match(coalesce(p_clave, ''), '([0-9]+) × ([0-9]+)') as m) t
$$;

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
  -- ventanas por m² (0031, todos menos Company): la nota nueva ya trae el ítem; en las guardadas antes,
  -- los m² salen de la medida de cada ventana ("Ventana Módena · 100 × 100" → 1 m² por unidad)
  vent_nueva boolean := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) x where trim(x->>'clave') = 'Aberturas: ventanas por m² (MO+MAT)');
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
    vent_viejas as (   -- presupuestos guardados antes de la 0031 (no Company): m² y DVH desde la medida de cada ventana
      select clave, cant, _cot_medida_ventana(clave) * cant as m2
      from nota0
      where not company and not vent_nueva and _cot_es_ventana(clave) and _cot_medida_ventana(clave) is not null),
    nota as (   -- presupuestos guardados antes de la 0030: la instalación eléctrica sale de los m² de la mano de obra
      select clave, cant from nota0 where (elec or clave <> 'Instalación eléctrica')   -- Company: no se suma
        and not (company and clave in ('Aberturas: ventanas por m² (MO+MAT)', 'Aberturas: adicional vidrio DVH por m²'))   -- Company: ventanas de su receta
      union all
      select 'Aberturas: ventanas por m² (MO+MAT)', sum(m2) from vent_viejas having sum(m2) > 0
      union all
      select 'Aberturas: adicional vidrio DVH por m²', sum(m2) from vent_viejas where clave ~* '^ventana dvh' having sum(m2) > 0
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
    select t.clave, t.cant from todo t where t.cant > 0 order by t.clave
  loop
    -- tomas, luces, tablero, disyuntor, térmicas, cables… quedan incluidos en la instalación eléctrica por m²
    -- (siguen en la lista de materiales para el taller, pero con costo 0)
    incl := elec and r.clave <> 'Instalación eléctrica' and _cot_es_electrico(r.clave);
    -- cada ventana suelta queda incluida en el costo por m² (MO+MAT): sigue para el taller, con costo 0
    incl := incl or (not company and _cot_es_ventana(r.clave)
                     and (vent_nueva or _cot_medida_ventana(r.clave) is not null));
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
