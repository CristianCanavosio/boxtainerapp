-- 0025: Cotizador de ventas (pedido de Cristian 25/11).
-- El vendedor arma la cotización desde el CRM: elige la tipología, la app trae su receta y él agrega
-- variantes (una ventana más, un mingitorio, sin aire...). La base suma costo × cantidad de cada insumo,
-- aplica el margen de la tipología y devuelve SOLO el precio al cliente. El vendedor nunca recibe
-- costos ni márgenes: las tablas con plata las leen solo el administrador y el líder de ventas, y el
-- vendedor usa funciones de la base que devuelven el precio final.
-- Si el vendedor quiere un precio más bajo que el de lista, lo pide y el líder de ventas lo autoriza
-- (o pone otro precio, o lo rechaza). Al enviar la cotización, la app pasa el contacto a Presupuesto.
--
-- Maestro de insumos: hoy se carga desde la planilla "Cotizador Boxtainer.xlsx" (Materiales y costos →
-- Importar planilla). Está pensado para que mañana lo alimente Flexxus: cada insumo tiene codigo_externo
-- (el código del producto en Flexxus) y fuente; el programa de sincronización solo tiene que llamar a
-- cot_actualizar_costos(...) con la clave service_role o como administrador.
-- Se puede correr más de una vez.

-- ¿Quién usa el cotizador y quién ve la plata?
create or replace function usa_cotizador() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text from perfiles where id = auth.uid()) in ('admin','ventas','lider_ventas'), false)
$$;
create or replace function ve_costos_cot() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text from perfiles where id = auth.uid()) in ('admin','lider_ventas'), false)
$$;
create or replace function es_admin_cot() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text from perfiles where id = auth.uid()) = 'admin', false) or auth.role() = 'service_role'
$$;

-- ══════════════ MAESTRO DE INSUMOS ══════════════
create table if not exists cot_insumos (
  codigo text primary key,                         -- INS-001 (el de la planilla)
  nombre text not null check (length(trim(nombre)) > 0),
  rubro text,
  unidad text,
  costo_usd numeric(14,4) check (costo_usd is null or costo_usd >= 0),
  para_vendedor boolean not null default true,     -- aparece en "Agregar adicional" del vendedor
  activo boolean not null default true,
  fuente text not null default 'planilla',         -- planilla | manual | flexxus
  codigo_externo text unique,                      -- código del producto en Flexxus (cuando se conecte)
  costo_actualizado_en timestamptz,
  creado_en timestamptz not null default now()
);

-- ══════════════ TIPOLOGÍAS Y RECETAS ══════════════
create table if not exists cot_tipologias (
  codigo text primary key,                         -- MOD-40-BC-AA
  nombre text not null,
  pies int,
  m2 numeric(8,2),
  margen numeric(6,4) check (margen is null or margen > -1),   -- 0.30 = costo × 1,30. Vacío = el margen por defecto
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create table if not exists cot_recetas (
  tipologia text not null references cot_tipologias on update cascade on delete cascade,
  insumo text not null references cot_insumos on update cascade on delete cascade,
  cant numeric(12,3) not null check (cant >= 0),
  primary key (tipologia, insumo)
);

-- ══════════════ PARÁMETROS ══════════════
create table if not exists cot_parametros (
  clave text primary key,
  valor numeric not null,
  descripcion text,
  actualizado_en timestamptz not null default now()
);
insert into cot_parametros (clave, valor, descripcion) values
  ('tipo_cambio', 1630, 'Pesos por dólar (para mostrar el precio en pesos)'),
  ('margen_default', 0.20, 'Margen cuando la tipología no tiene uno (0,20 = costo × 1,20)'),
  ('iva', 0.21, 'IVA que se suma al precio'),
  ('validez_dias', 7, 'Días de validez de la cotización')
on conflict (clave) do nothing;

-- Plata: solo administrador y líder de ventas leen; solo el administrador cambia
do $$
declare t text;
begin
  foreach t in array array['cot_insumos','cot_tipologias','cot_recetas','cot_parametros'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists %I on %I', t||'_ver', t);
    execute format('create policy %I on %I for select using (ve_costos_cot())', t||'_ver', t);
    execute format('drop policy if exists %I on %I', t||'_admin', t);
    execute format('create policy %I on %I for all using (es_admin_cot()) with check (es_admin_cot())', t||'_admin', t);
  end loop;
end $$;

-- ══════════════ COTIZACIONES ══════════════
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  oportunidad_id uuid not null references oportunidades on delete cascade,
  vendedor_id uuid not null references perfiles,
  cliente text,
  tipologia text not null references cot_tipologias on update cascade,
  tipologia_nombre text,
  unidades int not null default 1 check (unidades between 1 and 999),
  cambios jsonb not null default '{}'::jsonb,      -- {codigo: cantidad por unidad} lo que cambia respecto de la receta
  detalle jsonb not null default '[]'::jsonb,      -- lo que lleva, SIN costos: [{codigo,nombre,unidad,cant,base}]
  notas text,
  precio_lista numeric(14,2) not null,             -- USD sin IVA, todas las unidades, calculado por la base
  precio_pedido numeric(14,2),                     -- el que pide el vendedor si es más bajo
  motivo_pedido text,
  precio_final numeric(14,2),                      -- el que va al cliente (lista o autorizado)
  estado text not null default 'lista'
    check (estado in ('lista','pendiente','autorizada','rechazada','enviada')),
  respuesta text,                                  -- lo que contesta el líder de ventas
  autorizado_por uuid references perfiles,
  autorizado_en timestamptz,
  iva numeric(6,4),
  tipo_cambio numeric(14,4),
  validez_dias int,
  enviada_en timestamptz,
  enviada_via text,
  sin_costo int not null default 0,                -- insumos sin costo cargado (no se puede enviar)
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists cot_oport on cotizaciones (oportunidad_id);
create index if not exists cot_estado on cotizaciones (estado);

-- Costo y margen de cada cotización: solo administrador y líder de ventas
create table if not exists cotizaciones_costo (
  cotizacion_id uuid primary key references cotizaciones on delete cascade,
  costo_total numeric(14,2) not null,
  margen numeric(6,4) not null,
  detalle jsonb not null default '[]'::jsonb       -- [{codigo,cant,costo}]
);

alter table cotizaciones enable row level security;
revoke all on cotizaciones from anon;
drop policy if exists cot_ver on cotizaciones;
create policy cot_ver on cotizaciones for select using (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid()));
-- se crean y se cambian solo con las funciones de abajo (así nadie escribe un precio a mano)
drop policy if exists cot_borrar on cotizaciones;
create policy cot_borrar on cotizaciones for delete using (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid() and estado <> 'enviada'));

alter table cotizaciones_costo enable row level security;
revoke all on cotizaciones_costo from anon;
drop policy if exists cot_costo_ver on cotizaciones_costo;
create policy cot_costo_ver on cotizaciones_costo for select using (ve_costos_cot());

-- ══════════════ CÁLCULO (interno: devuelve costos, no se puede llamar desde la app) ══════════════
create or replace function _cot_calc(p_tipologia text, p_cambios jsonb, p_unidades int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t cot_tipologias;
  m numeric;
  costo numeric := 0;
  det jsonb := '[]'::jsonb;
  dcost jsonb := '[]'::jsonb;
  sin int := 0;
  sin_nom jsonb := '[]'::jsonb;
  r record;
  u int := greatest(1, least(999, coalesce(p_unidades, 1)));
begin
  select * into t from cot_tipologias where codigo = p_tipologia and activo;
  if not found then raise exception 'La tipología % no existe o está desactivada', p_tipologia; end if;
  m := coalesce(t.margen, (select valor from cot_parametros where clave = 'margen_default'), 0);
  for r in
    with base as (select insumo, cant from cot_recetas where tipologia = p_tipologia),
    camb as (select key as insumo, greatest(0, (value #>> '{}')::numeric) as cant
             from jsonb_each(coalesce(p_cambios, '{}'::jsonb))
             where jsonb_typeof(value) = 'number' or (value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$')
    select i.codigo, i.nombre, i.unidad, i.costo_usd,
           coalesce(b.cant, 0) as base, coalesce(c.cant, b.cant, 0) as cant
    from cot_insumos i
    left join base b on b.insumo = i.codigo
    left join camb c on c.insumo = i.codigo
    where (b.insumo is not null or c.insumo is not null)
    order by i.rubro, i.nombre
  loop
    if r.cant = 0 and r.base = 0 then continue; end if;
    det := det || jsonb_build_object('codigo', r.codigo, 'nombre', r.nombre, 'unidad', r.unidad, 'cant', r.cant, 'base', r.base);
    if r.cant > 0 then
      if r.costo_usd is null then sin := sin + 1; sin_nom := sin_nom || to_jsonb(r.nombre);
      else costo := costo + r.cant * r.costo_usd; end if;
      dcost := dcost || jsonb_build_object('codigo', r.codigo, 'cant', r.cant, 'costo', r.costo_usd);
    end if;
  end loop;
  return jsonb_build_object(
    'tipologia', t.codigo, 'tipologia_nombre', t.nombre, 'unidades', u,
    'costo_unit', round(costo, 2), 'costo_total', round(costo * u, 2), 'margen', m,
    'precio_unit', round(costo * (1 + m)), 'precio_total', round(costo * (1 + m)) * u,
    'detalle', det, 'detalle_costo', dcost, 'sin_costo', sin, 'sin_costo_nombres', sin_nom,
    'iva', coalesce((select valor from cot_parametros where clave = 'iva'), 0),
    'tipo_cambio', (select valor from cot_parametros where clave = 'tipo_cambio'),
    'validez_dias', coalesce((select valor from cot_parametros where clave = 'validez_dias'), 7)::int);
end $$;
revoke all on function _cot_calc(text, jsonb, int) from public, anon, authenticated;

-- Lo que el vendedor puede ver del maestro: tipologías, insumos y recetas SIN costos ni márgenes
create or replace function cot_catalogo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not usa_cotizador() then raise exception 'El cotizador es para ventas, el líder de ventas y el administrador'; end if;
  return jsonb_build_object(
    'tipologias', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'pies', pies, 'm2', m2) order by orden, pies, nombre)
                            from cot_tipologias where activo), '[]'::jsonb),
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'rubro', rubro, 'unidad', unidad, 'para_vendedor', para_vendedor) order by rubro, nombre)
                         from cot_insumos where activo), '[]'::jsonb),
    'recetas', coalesce((select jsonb_agg(jsonb_build_object('tipologia', r.tipologia, 'insumo', r.insumo, 'cant', r.cant))
                         from cot_recetas r join cot_insumos i on i.codigo = r.insumo and i.activo), '[]'::jsonb),
    'iva', coalesce((select valor from cot_parametros where clave = 'iva'), 0),
    'tipo_cambio', (select valor from cot_parametros where clave = 'tipo_cambio'),
    'validez_dias', coalesce((select valor from cot_parametros where clave = 'validez_dias'), 7));
end $$;

-- Precio en vivo mientras el vendedor arma la cotización (solo el precio; costos solo para el líder)
create or replace function cot_calcular(p_tipologia text, p_cambios jsonb, p_unidades int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb;
begin
  if not usa_cotizador() then raise exception 'El cotizador es para ventas, el líder de ventas y el administrador'; end if;
  c := _cot_calc(p_tipologia, p_cambios, p_unidades);
  if ve_costos_cot() then return c - 'detalle_costo'; end if;
  return c - 'costo_unit' - 'costo_total' - 'margen' - 'detalle_costo';
end $$;

-- Guardar (nueva o cambiada). Si pide un precio más bajo que el de lista, queda esperando al líder.
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

-- El líder de ventas (o el admin) autoriza el precio pedido, pone otro o lo rechaza
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
  else
    if length(trim(coalesce(p_respuesta, ''))) = 0 then raise exception 'Contale al vendedor por qué no'; end if;
    update cotizaciones set estado = 'rechazada', precio_final = null, autorizado_por = auth.uid(), autorizado_en = now(),
      respuesta = trim(p_respuesta), actualizado_en = now()
    where id = p_id;
  end if;
end $$;

-- Marcar enviada: carga el precio en el contacto del CRM (precio estándar = lista, precio del cliente = el final).
-- El paso a Presupuesto lo hace la app (así agenda el seguimiento y pide la calificación si falta).
create or replace function cot_enviar(p_id uuid, p_via text) returns void
language plpgsql security definer set search_path = public as $$
declare v cotizaciones;
begin
  select * into v from cotizaciones where id = p_id for update;
  if not found or not (ve_todo_crm() or (es_vendedor() and v.vendedor_id = auth.uid())) then raise exception 'No encontré esa cotización'; end if;
  if v.estado = 'enviada' then return; end if;
  if v.estado not in ('lista','autorizada') then raise exception 'El precio todavía no está autorizado'; end if;
  if v.sin_costo > 0 then raise exception 'Hay insumos sin costo cargado: avisale al administrador antes de enviarla'; end if;
  update cotizaciones set estado = 'enviada', enviada_en = now(), enviada_via = nullif(p_via, ''), actualizado_en = now() where id = p_id;
  update oportunidades set precio_estandar = v.precio_lista, precio_cliente = v.precio_final, unidades = v.unidades,
    presupuesto_via = coalesce(nullif(p_via, ''), presupuesto_via)
  where id = v.oportunidad_id;
end $$;

-- ══════════════ CARGA DEL MAESTRO (planilla hoy, Flexxus mañana) ══════════════
-- Costos por código: [{codigo | codigo_externo, costo, moneda: 'USD'|'ARS'}]. Lo usa la planilla y lo usará Flexxus.
create or replace function cot_actualizar_costos(p_costos jsonb, p_fuente text default 'planilla') returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0; tc numeric := (select valor from cot_parametros where clave = 'tipo_cambio'); c numeric; k int;
begin
  if not es_admin_cot() then raise exception 'Solo el administrador actualiza costos'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_costos, '[]'::jsonb)) loop
    if x->>'costo' is null or (x->>'costo') !~ '^-?[0-9]+([.][0-9]+)?$' then continue; end if;
    c := (x->>'costo')::numeric;
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

-- Importar la planilla completa (insumos, tipologías, recetas y parámetros). Las recetas de las tipologías
-- que vienen en la planilla se reemplazan enteras; lo que no viene, queda como estaba.
create or replace function cot_importar(p_insumos jsonb, p_tipologias jsonb, p_recetas jsonb, p_parametros jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ni int := 0; nt int := 0; nr int := 0;
begin
  if not es_admin_cot() then raise exception 'Solo el administrador importa el maestro'; end if;
  insert into cot_insumos (codigo, nombre, rubro, unidad, costo_usd, fuente, costo_actualizado_en, para_vendedor)
  select trim(x->>'codigo'), trim(x->>'nombre'), nullif(trim(x->>'rubro'), ''), nullif(trim(x->>'unidad'), ''),
         case when (x->>'costo') ~ '^[0-9]+([.][0-9]+)?$' then (x->>'costo')::numeric end, 'planilla', now(),
         coalesce(nullif(trim(x->>'rubro'), ''), '') not in ('Otros')
  from jsonb_array_elements(coalesce(p_insumos, '[]'::jsonb)) x
  where length(trim(coalesce(x->>'codigo', ''))) > 0 and length(trim(coalesce(x->>'nombre', ''))) > 0
  on conflict (codigo) do update set nombre = excluded.nombre, rubro = excluded.rubro, unidad = excluded.unidad,
    costo_usd = coalesce(excluded.costo_usd, cot_insumos.costo_usd),
    fuente = case when excluded.costo_usd is null then cot_insumos.fuente else 'planilla' end,
    costo_actualizado_en = case when excluded.costo_usd is null then cot_insumos.costo_actualizado_en else now() end,
    activo = true;
  get diagnostics ni = row_count;

  insert into cot_tipologias (codigo, nombre, pies, m2, margen, orden)
  select trim(x->>'codigo'), trim(x->>'nombre'), nullif(x->>'pies', '')::numeric::int, nullif(x->>'m2', '')::numeric,
         nullif(x->>'margen', '')::numeric, coalesce(nullif(x->>'orden', '')::int, 0)
  from jsonb_array_elements(coalesce(p_tipologias, '[]'::jsonb)) x
  where length(trim(coalesce(x->>'codigo', ''))) > 0 and length(trim(coalesce(x->>'nombre', ''))) > 0
  on conflict (codigo) do update set nombre = excluded.nombre, pies = excluded.pies, m2 = excluded.m2,
    margen = excluded.margen, orden = excluded.orden, activo = true;
  get diagnostics nt = row_count;

  delete from cot_recetas where tipologia in (select distinct trim(x->>'tipologia') from jsonb_array_elements(coalesce(p_recetas, '[]'::jsonb)) x);
  insert into cot_recetas (tipologia, insumo, cant)
  select trim(x->>'tipologia'), trim(x->>'insumo'), sum((x->>'cant')::numeric)
  from jsonb_array_elements(coalesce(p_recetas, '[]'::jsonb)) x
  where (x->>'cant') ~ '^[0-9]+([.][0-9]+)?$'
    and exists (select 1 from cot_tipologias where codigo = trim(x->>'tipologia'))
    and exists (select 1 from cot_insumos where codigo = trim(x->>'insumo'))
  group by 1, 2;
  get diagnostics nr = row_count;

  insert into cot_parametros (clave, valor)
  select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_parametros, '{}'::jsonb))
  where key in ('tipo_cambio','margen_default','iva','validez_dias') and (value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

  return jsonb_build_object('insumos', ni, 'tipologias', nt, 'recetas', nr);
end $$;

-- ══════════════ COSTEO DE PROYECTOS DESDE EL MAESTRO (decisión de Cristian 25/11) ══════════════
-- Cada ítem de la nota de pedido (y de la receta de obra) toma su costo del maestro: uno o más insumos,
-- cada uno con un factor. Ej.: "Sanitario · Lavamatic" = lavamanos + monocomando; "Aislación térmica" (m²)
-- = rollo de Isover ÷ 9,4; "Pintura" (tacho de 20 l) = litro × 20. Si un ítem no tiene equivalencia,
-- la app usa el precio viejo de lista_costos y lo marca para que el admin lo empareje.
create table if not exists cot_equivalencias (
  clave text primary key,                          -- nombre del ítem en la app
  composicion jsonb not null default '[]'::jsonb,  -- [{insumo: 'INS-038', factor: 1}]
  actualizado_en timestamptz not null default now()
);
alter table cot_equivalencias enable row level security;
revoke all on cot_equivalencias from anon;
drop policy if exists cot_equivalencias_ver on cot_equivalencias;
create policy cot_equivalencias_ver on cot_equivalencias for select using (ve_costos_cot());
drop policy if exists cot_equivalencias_admin on cot_equivalencias;
create policy cot_equivalencias_admin on cot_equivalencias for all using (es_admin_cot()) with check (es_admin_cot());
-- Emparejamiento inicial, armado con la planilla unificada del 20/11 (hoja Agrupados). Se corrige en la app.
insert into cot_equivalencias (clave, composicion) values
  ('Aire acondicionado 3.000 fg', '[{"insumo": "INS-001", "factor": 1}]'::jsonb),
  ('Aislación térmica', '[{"insumo": "INS-041", "factor": 0.106383}]'::jsonb),
  ('Aislante burbuja doble aluminio rollo 20 m²', '[{"insumo": "INS-082", "factor": 1}]'::jsonb),
  ('Amortización de planta y máquinas', '[{"insumo": "INS-053", "factor": 1}]'::jsonb),
  ('Bacha larga 1,60 m con monocomando', '[{"insumo": "INS-005", "factor": 1}]'::jsonb),
  ('Bajo mesada y muebles de cocina 2,42 m', '[{"insumo": "INS-092", "factor": 1}]'::jsonb),
  ('Barral antipánico y cierre hidráulico', '[{"insumo": "INS-083", "factor": 1}]'::jsonb),
  ('Bastidor de puerta', '[{"insumo": "INS-088", "factor": 1}]'::jsonb),
  ('Bastidor de puerta ventana', '[{"insumo": "INS-089", "factor": 1}]'::jsonb),
  ('Bastidor de ventana', '[{"insumo": "INS-087", "factor": 1}]'::jsonb),
  ('Caño 100 × 100 × 1,6 mm', '[{"insumo": "INS-007", "factor": 1}]'::jsonb),
  ('Caño 100 × 100 × 3,2 mm', '[{"insumo": "INS-006", "factor": 1}]'::jsonb),
  ('Caño 100 × 20 × 1,2 mm', '[{"insumo": "INS-008", "factor": 1}]'::jsonb),
  ('Caño 20 × 20 × 1,2 mm', '[{"insumo": "INS-015", "factor": 1}]'::jsonb),
  ('Caño 25 × 25 × 2 mm', '[{"insumo": "INS-010", "factor": 1}]'::jsonb),
  ('Caño 30 × 30 × 2 mm', '[{"insumo": "INS-011", "factor": 1}]'::jsonb),
  ('Caño 40 × 100 × 3,2 mm', '[{"insumo": "INS-016", "factor": 1}]'::jsonb),
  ('Caño 40 × 40 × 1,2 mm', '[{"insumo": "INS-012", "factor": 1}]'::jsonb),
  ('Caño 40 × 60 × 1,2 mm', '[{"insumo": "INS-013", "factor": 1}]'::jsonb),
  ('Caño 50 × 50 × 1,2 mm', '[{"insumo": "INS-014", "factor": 1}]'::jsonb),
  ('Caño 60 × 60 × 1,2 mm', '[{"insumo": "INS-009", "factor": 1}]'::jsonb),
  ('Caños de agua y cloaca', '[{"insumo": "INS-017", "factor": 1}]'::jsonb),
  ('Chapa acanalada 1 × 1 m', '[{"insumo": "INS-018", "factor": 1}]'::jsonb),
  ('Chapa lisa N°16 1,22 × 2,44 m', '[{"insumo": "INS-019", "factor": 1}]'::jsonb),
  ('Chapa negra lisa para plegado', '[{"insumo": "INS-023", "factor": 1}]'::jsonb),
  ('Chapa semilla de melón aluminio 1,25 × 2,5 m 1,5 mm', '[{"insumo": "INS-020", "factor": 1}]'::jsonb),
  ('Chapa trapezoidal', '[{"insumo": "INS-021", "factor": 1}]'::jsonb),
  ('Chapa trapezoidal color', '[{"insumo": "INS-022", "factor": 1}]'::jsonb),
  ('Cocina · Alacena', '[{"insumo": "INS-003", "factor": 1}]'::jsonb),
  ('Cocina · Bacha monocomando', '[{"insumo": "INS-048", "factor": 1}]'::jsonb),
  ('Cocina · Bajo mesada', '[{"insumo": "INS-024", "factor": 1}]'::jsonb),
  ('Colocación de bastidor', '[{"insumo": "INS-025", "factor": 1}]'::jsonb),
  ('Comisión de venta', '[{"insumo": "INS-026", "factor": 1}]'::jsonb),
  ('Contenedor 10 pies', '[{"insumo": "INS-090", "factor": 1}]'::jsonb),
  ('Contenedor 20 DV', '[{"insumo": "INS-027", "factor": 1}]'::jsonb),
  ('Contenedor 40 ST', '[{"insumo": "INS-028", "factor": 1}]'::jsonb),
  ('Corte de chapa para 2 aberturas con bastidor', '[{"insumo": "INS-030", "factor": 1}]'::jsonb),
  ('Corte de chapa para abertura', '[{"insumo": "INS-032", "factor": 1}]'::jsonb),
  ('Corte de chapa y colocación de 2 aberturas con bastidor', '[{"insumo": "INS-031", "factor": 1}]'::jsonb),
  ('Corte de contenedor', '[{"insumo": "INS-029", "factor": 1}]'::jsonb),
  ('Cortina roller', '[{"insumo": "INS-033", "factor": 1}]'::jsonb),
  ('Equipamiento Company (electrodomésticos, vanitory y roperos)', '[{"insumo": "INS-004", "factor": 1}]'::jsonb),
  ('Flap', '[{"insumo": "INS-036", "factor": 1}]'::jsonb),
  ('Flete', '[{"insumo": "INS-037", "factor": 1}]'::jsonb),
  ('Instalación eléctrica módulo 20', '[{"insumo": "INS-039", "factor": 1}]'::jsonb),
  ('Instalación eléctrica módulo 40', '[{"insumo": "INS-040", "factor": 1}]'::jsonb),
  ('Instalación sanitaria por ambiente', '[{"insumo": "INS-017", "factor": 1}]'::jsonb),
  ('Isover rollo 9,4 m²', '[{"insumo": "INS-041", "factor": 1}]'::jsonb),
  ('Lavamanos / vanitory', '[{"insumo": "INS-042", "factor": 1}]'::jsonb),
  ('Machimbre PVC Aisplac', '[{"insumo": "INS-002", "factor": 1}]'::jsonb),
  ('Machimbre de madera', '[{"insumo": "INS-068", "factor": 1}]'::jsonb),
  ('Mampara de ducha', '[{"insumo": "INS-043", "factor": 1}]'::jsonb),
  ('Mano de obra general', '[{"insumo": "INS-047", "factor": 0.033625}]'::jsonb),
  ('Mano de obra módulo 20 con baño', '[{"insumo": "INS-044", "factor": 1}]'::jsonb),
  ('Mano de obra módulo 20 sin baño', '[{"insumo": "INS-046", "factor": 1}]'::jsonb),
  ('Mano de obra módulo 40 con baño', '[{"insumo": "INS-045", "factor": 1}]'::jsonb),
  ('Mano de obra módulo 40 sin baño', '[{"insumo": "INS-047", "factor": 1}]'::jsonb),
  ('Mesada de acero inoxidable con bacha y grifería 2,42 m', '[{"insumo": "INS-093", "factor": 1}]'::jsonb),
  ('Mesada de mármol con bacha y grifería 1,40 m', '[{"insumo": "INS-048", "factor": 1}]'::jsonb),
  ('Monocomando', '[{"insumo": "INS-050", "factor": 1}]'::jsonb),
  ('Montantes y soleras', '[{"insumo": "INS-051", "factor": 1}]'::jsonb),
  ('Pintura', '[{"insumo": "INS-054", "factor": 20}]'::jsonb),
  ('Pintura (litro)', '[{"insumo": "INS-054", "factor": 1}]'::jsonb),
  ('Pintura exterior módulo 20', '[{"insumo": "INS-055", "factor": 1}]'::jsonb),
  ('Pintura exterior módulo 40', '[{"insumo": "INS-057", "factor": 1}]'::jsonb),
  ('Pintura interior módulo 20', '[{"insumo": "INS-056", "factor": 1}]'::jsonb),
  ('Pintura interior módulo 40', '[{"insumo": "INS-058", "factor": 1}]'::jsonb),
  ('Piso flotante (madera o PVC)', '[{"insumo": "INS-059", "factor": 1}]'::jsonb),
  ('Piso · Flotante PVC', '[{"insumo": "INS-059", "factor": 1}]'::jsonb),
  ('Piso · Flotante madera', '[{"insumo": "INS-059", "factor": 1}]'::jsonb),
  ('Placa OSB fenólico 9 mm', '[{"insumo": "INS-052", "factor": 1}]'::jsonb),
  ('Placa fibrofácil 5,5 mm', '[{"insumo": "INS-065", "factor": 1}]'::jsonb),
  ('Placa melamina 5,5 mm', '[{"insumo": "INS-091", "factor": 1}]'::jsonb),
  ('Placard', '[{"insumo": "INS-060", "factor": 1}]'::jsonb),
  ('Plegado', '[{"insumo": "INS-061", "factor": 1}]'::jsonb),
  ('Puerta exterior (a confirmar)', '[{"insumo": "INS-063", "factor": 1}, {"insumo": "INS-088", "factor": 1}]'::jsonb),
  ('Puerta exterior (según plano)', '[{"insumo": "INS-063", "factor": 1}, {"insumo": "INS-088", "factor": 1}]'::jsonb),
  ('Puerta exterior de chapa inyectada', '[{"insumo": "INS-063", "factor": 1}]'::jsonb),
  ('Puerta exterior · Corrediza medida especial', '[{"insumo": "INS-064", "factor": 1}, {"insumo": "INS-089", "factor": 1}]'::jsonb),
  ('Puerta exterior · De abrir 80 cm', '[{"insumo": "INS-063", "factor": 1}, {"insumo": "INS-088", "factor": 1}]'::jsonb),
  ('Puerta exterior · De abrir 90 cm', '[{"insumo": "INS-063", "factor": 1}, {"insumo": "INS-088", "factor": 1}]'::jsonb),
  ('Puerta interior', '[{"insumo": "INS-062", "factor": 1}]'::jsonb),
  ('Puerta interior · Aluminio', '[{"insumo": "INS-062", "factor": 1}]'::jsonb),
  ('Puerta interior · Chapa contenedor', '[{"insumo": "INS-062", "factor": 1}]'::jsonb),
  ('Puerta interior · Madera', '[{"insumo": "INS-062", "factor": 1}]'::jsonb),
  ('Puerta ventana 1,50 × 2,05', '[{"insumo": "INS-064", "factor": 1}]'::jsonb),
  ('Revestimiento alistonado símil madera PVC', '[{"insumo": "INS-086", "factor": 1}]'::jsonb),
  ('Revestimiento de cocina', '[{"insumo": "INS-066", "factor": 1}]'::jsonb),
  ('Revestimiento de ducha', '[{"insumo": "INS-067", "factor": 1}]'::jsonb),
  ('Revestimiento exterior · Megacold', '[{"insumo": "INS-078", "factor": 1}]'::jsonb),
  ('Revestimiento exterior · WPC Varillado', '[{"insumo": "INS-086", "factor": 1}]'::jsonb),
  ('Revestimiento interior · PVC', '[{"insumo": "INS-002", "factor": 1}]'::jsonb),
  ('Revestimiento interior · WPC Varillado', '[{"insumo": "INS-086", "factor": 1}]'::jsonb),
  ('Revestimiento pvc (baño/cocina)', '[{"insumo": "INS-002", "factor": 1}]'::jsonb),
  ('Revestimiento símil mármol (baño/cocina)', '[{"insumo": "INS-067", "factor": 1}]'::jsonb),
  ('Sanitario · Bidet', '[{"insumo": "INS-076", "factor": 1}]'::jsonb),
  ('Sanitario · Ducha', '[{"insumo": "INS-034", "factor": 1}]'::jsonb),
  ('Sanitario · Espejo', '[{"insumo": "INS-035", "factor": 1}]'::jsonb),
  ('Sanitario · Inodoro', '[{"insumo": "INS-038", "factor": 1}]'::jsonb),
  ('Sanitario · Lavamatic', '[{"insumo": "INS-042", "factor": 1}, {"insumo": "INS-050", "factor": 1}]'::jsonb),
  ('Sanitario · Mingitorio', '[{"insumo": "INS-049", "factor": 1}]'::jsonb),
  ('Sellador', '[{"insumo": "INS-069", "factor": 1}]'::jsonb),
  ('Tabique divisorio', '[{"insumo": "INS-081", "factor": 0.158228}]'::jsonb),
  ('Tabique divisorio completo', '[{"insumo": "INS-081", "factor": 1}]'::jsonb),
  ('Telgopor', '[{"insumo": "INS-070", "factor": 1}]'::jsonb),
  ('Termotanque eléctrico', '[{"insumo": "INS-071", "factor": 1}]'::jsonb),
  ('Thinner', '[{"insumo": "INS-072", "factor": 1}]'::jsonb),
  ('Tornillo', '[{"insumo": "INS-073", "factor": 1}]'::jsonb),
  ('Tornillo T1 4,2 mm (caja 10.000)', '[{"insumo": "INS-084", "factor": 1}]'::jsonb),
  ('Tornillo T2 punta aguja 3,5 mm (caja 10.000)', '[{"insumo": "INS-085", "factor": 1}]'::jsonb),
  ('Ventana Company', '[{"insumo": "INS-079", "factor": 1}]'::jsonb),
  ('Ventana Módena · 100 × 100', '[{"insumo": "INS-074", "factor": 1}, {"insumo": "INS-087", "factor": 1}]'::jsonb),
  ('Ventana Módena · 100 × 60', '[{"insumo": "INS-074", "factor": 1}, {"insumo": "INS-087", "factor": 1}]'::jsonb),
  ('Ventana Módena · 60 × 40', '[{"insumo": "INS-075", "factor": 1}]'::jsonb),
  ('Ventana aluminio Módena', '[{"insumo": "INS-074", "factor": 1}]'::jsonb),
  ('Ventiluz', '[{"insumo": "INS-075", "factor": 1}]'::jsonb),
  ('Ventiluz Company', '[{"insumo": "INS-080", "factor": 1}]'::jsonb),
  ('Zócalo', '[{"insumo": "INS-077", "factor": 1}]'::jsonb)
on conflict (clave) do nothing;

revoke all on function cot_catalogo() from anon;
revoke all on function cot_calcular(text, jsonb, int) from anon;
revoke all on function cot_guardar(uuid, uuid, text, jsonb, int, text, numeric, text) from anon;
revoke all on function cot_autorizar(uuid, boolean, numeric, text) from anon;
revoke all on function cot_enviar(uuid, text) from anon;
revoke all on function cot_actualizar_costos(jsonb, text) from anon;
revoke all on function cot_importar(jsonb, jsonb, jsonb, jsonb) from anon;

-- ══════════════ TIEMPO REAL ══════════════
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cotizaciones') then
    alter publication supabase_realtime add table cotizaciones;
  end if;
end $$;

-- Comprobación: debe mostrar los 4 parámetros
select clave, valor from cot_parametros order by clave;
