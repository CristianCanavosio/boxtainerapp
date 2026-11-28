-- 0034: Un solo concepto de melamina (pedido de Cristian 27/11).
-- Antes había tres ítems: "Revestimiento melamina (baño/cocina)", "Revestimiento de techo melamina (baño/cocina)"
-- y "Revestimiento interior · Melamina". Ahora todo es "Revestimiento melamina 5.5" (m²), sumando las cantidades.
-- · En el maestro de insumos queda un solo insumo genérico: "REVESTIMIENTO MELAMINA 5.5" (el INS-091), por placa,
--   con el precio de Faplac (Faplac es una marca: el nombre no la lleva).
-- · El ítem de la nota va en m² y toma el costo de la placa ÷ los m² de una placa (factor en Ítems de proyectos).
-- · Las recetas de obra y de tipologías que tenían otros insumos o ítems de melamina pasan al nuevo, sumando.
--   Los insumos viejos de melamina (y el de Faplac) quedan desactivados, no se borran.
-- · Los presupuestos abiertos se recalculan; los aceptados conservan su precio.
-- Necesita la 0032. Se puede correr más de una vez.

-- ══════════ DATOS A REVISAR ANTES DE CORRER ══════════
-- (tabla común y no "temp": el editor SQL de Supabase puede correr cada sentencia en otra conexión y la temporal se pierde)
drop table if exists public._mel_param;
create table public._mel_param as select
  null::numeric as precio_placa,   -- USD por placa. Vacío = toma el del insumo que hoy se llama Faplac
  1.83 * 2.60  as m2_placa;        -- m² de una placa (1,83 × 2,60 = 4,758 m²)

-- ¿Es un concepto/insumo de revestimiento de melamina? (no muebles de cocina en melamina, por ejemplo)
create or replace function _cot_es_melamina(p text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p, '') ~* '(revestimiento|placa).*melamina|melamina.*(revestimiento|placa|5[.,]5)|faplac'
$$;

-- El nombre actual de un ítem: los de melamina de antes pasan a ser uno solo
create or replace function _cot_clave_actual(p text) returns text
language sql immutable set search_path = public as $$
  select case when _cot_es_melamina(p) then 'Revestimiento melamina 5.5' else trim(p) end
$$;

do $$
declare
  par record; nuevo constant text := 'INS-091'; precio numeric; fap record; n int;
begin
  select * into par from _mel_param;

  -- 1) precio: el que se cargó arriba o el del insumo Faplac
  precio := par.precio_placa;
  if precio is null then
    select count(*) into n from cot_insumos where nombre ~* 'faplac' and codigo <> nuevo and activo and costo_usd is not null;
    if n > 1 then
      raise exception 'Hay % insumos con "Faplac" en el nombre. Escribí el precio por placa arriba (precio_placa) y volvé a correr.', n;
    end if;
    select * into fap from cot_insumos where nombre ~* 'faplac' and codigo <> nuevo and activo and costo_usd is not null;
    if found then
      precio := fap.costo_usd;
      -- si Faplac estaba cargado por m², se pasa a placa
      if coalesce(fap.unidad, '') ~* '^m ?(2|²)$' then precio := precio * par.m2_placa; end if;
    end if;
  end if;
  if precio is null and not exists (select 1 from cot_insumos where codigo = nuevo and costo_usd is not null) then
    raise exception 'No encontré el insumo Faplac. Escribí el precio por placa arriba (precio_placa) y volvé a correr.';
  end if;

  -- 2) el insumo genérico
  insert into cot_insumos (codigo, nombre, rubro, unidad, costo_usd, para_vendedor, fuente, costo_actualizado_en)
  values (nuevo, 'REVESTIMIENTO MELAMINA 5.5', 'Revestimientos', 'PLACA', precio, true, 'manual', now())
  on conflict (codigo) do update set nombre = excluded.nombre, unidad = 'PLACA', activo = true,
    costo_usd = coalesce(precio, cot_insumos.costo_usd),
    costo_actualizado_en = case when precio is distinct from cot_insumos.costo_usd then now() else cot_insumos.costo_actualizado_en end;

  -- 3) recetas de tipologías: los otros insumos de melamina (y Faplac) se suman al genérico, en placas
  insert into cot_recetas (tipologia, insumo, cant)
  select r.tipologia, nuevo,
         round(sum(case when coalesce(i.unidad, '') ~* '^m ?(2|²)$' then r.cant / par.m2_placa else r.cant end), 3)
  from cot_recetas r join cot_insumos i on i.codigo = r.insumo
  where _cot_es_melamina(i.nombre)
  group by r.tipologia
  on conflict (tipologia, insumo) do update set cant = excluded.cant;
  delete from cot_recetas r using cot_insumos i
  where i.codigo = r.insumo and i.codigo <> nuevo and _cot_es_melamina(i.nombre);

  -- 4) los insumos viejos quedan desactivados (no se borran) y ya no se ofrecen al vendedor
  update cot_insumos set activo = false, para_vendedor = false
  where codigo <> nuevo and _cot_es_melamina(nombre) and activo;

  -- 5) el ítem de la nota (m²): costo de la placa ÷ m² por placa
  insert into cot_equivalencias (clave, composicion)
  values ('Revestimiento melamina 5.5', jsonb_build_array(jsonb_build_object('insumo', nuevo, 'factor', round(1 / par.m2_placa, 4))))
  on conflict (clave) do update set composicion = excluded.composicion;
  -- otros ítems que usaban un insumo de melamina viejo ahora usan el genérico
  update cot_equivalencias e set composicion = (
    select jsonb_agg(case when i.codigo is not null
                          -- el genérico es por placa: 1 m² del insumo viejo = 1 ÷ m² por placa
                          then jsonb_build_object('insumo', nuevo, 'factor', round(coalesce((c->>'factor')::numeric, 0)
                                 / case when coalesce(i.unidad, '') ~* '^m ?(2|²)$' then par.m2_placa else 1 end, 4))
                          else c end)
    from jsonb_array_elements(e.composicion) c
    left join cot_insumos i on i.codigo = c->>'insumo' and i.codigo <> nuevo and _cot_es_melamina(i.nombre))
  where e.clave <> 'Revestimiento melamina 5.5' and not _cot_es_melamina(e.clave)
    and exists (select 1 from jsonb_array_elements(e.composicion) c join cot_insumos i on i.codigo = c->>'insumo'
                where i.codigo <> nuevo and _cot_es_melamina(i.nombre));
  -- los ítems viejos de melamina desaparecen (equivalencias y lista de costos vieja)
  delete from cot_equivalencias where clave <> 'Revestimiento melamina 5.5' and _cot_es_melamina(clave);
  delete from lista_costos where clave <> 'Revestimiento melamina 5.5' and _cot_es_melamina(clave);

  -- 6) recetas de obra: los ítems de melamina se suman en uno (en m²)
  insert into recetas_tipologia (tipologia, tam, clave, unidad, cant)
  select tipologia, tam, 'Revestimiento melamina 5.5', 'm²',
         sum(case when unidad ~* 'placa' then cant * par.m2_placa else cant end)
  from recetas_tipologia where _cot_es_melamina(clave)
  group by tipologia, tam
  on conflict (tipologia, tam, clave) do update set unidad = 'm²', cant = round(excluded.cant, 2);
  delete from recetas_tipologia where clave <> 'Revestimiento melamina 5.5' and _cot_es_melamina(clave);
end $$;

-- El cálculo de la nota (misma función de la 0032) lee los ítems viejos de melamina como el nuevo,
-- así los presupuestos guardados antes también quedan con un solo concepto.
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
      select _cot_clave_actual(clave) as clave, sum(cant) as cant, tam from recetas_tipologia
      where tipologia = p_prod and (tam = '' or tam = coalesce(p_tam, ''))
      group by 1, tam),
    nota0 as (
      select _cot_clave_actual(x->>'clave') as clave, sum(greatest(0, coalesce((x->>'cant')::numeric, 0))) as cant
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
    select t.clave, t.cant from todo t
    where t.cant > 0 and t.clave !~* '^armado de '   -- sin costos de armado: van dentro de la mano de obra por m² (0032)
    order by t.clave
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

drop table if exists public._mel_param;

-- Los presupuestos abiertos quedan al día (los aceptados no cambian)
select _cot_recalcular_abiertas() as presupuestos_actualizados;

-- Para revisar: cómo quedó
select codigo, nombre, unidad, costo_usd, activo from cot_insumos where _cot_es_melamina(nombre) order by activo desc, codigo;
