-- 0024: CRM de ventas.
-- Cada vendedor carga sus oportunidades (contactos) y las va pasando por las etapas:
--   Pre-calificado → Calificado → Presupuesto → Acuerdo mutuo → Ganado
--   (o Perdido, con la razón, o No calificado).
-- Cada oportunidad tiene tareas de seguimiento con fecha. Al pasar a Ganado se carga la nota de pedido
-- y queda vinculada (proyecto_id).
-- Rol nuevo "Líder de ventas" (lider_ventas): ve las oportunidades de todos los vendedores con precio
-- estándar y precio del cliente, carga la comisión del vendedor y marca entregado y cobrado.
-- El vendedor ve solo las suyas (con sus importes) y no puede tocar comisión, entregado ni cobrado.
-- El resto de los roles no ve nada del CRM.
-- Se puede correr más de una vez.

-- ══════════════ ROL NUEVO ══════════════
-- (dentro de esta migración el rol se compara como texto: un valor nuevo de un tipo enum no se puede
--  usar en la misma transacción en que se crea)
alter type rol_app add value if not exists 'lider_ventas';

-- El administrador y el líder de ventas ven todo el CRM
create or replace function ve_todo_crm() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text from perfiles where id = auth.uid()) in ('admin','lider_ventas'), false)
$$;
create or replace function es_vendedor() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text from perfiles where id = auth.uid()) = 'ventas', false)
$$;

-- ══════════════ OPORTUNIDADES ══════════════
create table if not exists oportunidades (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  vendedor_id uuid not null references perfiles default auth.uid(),
  empresa text,
  cliente text not null check (length(trim(cliente)) > 0),
  telefono text,
  mail text,
  origen text,                                   -- whatsapp, llamada, mail, web, referido, otro
  producto text,
  unidades int not null default 1 check (unidades between 1 and 999),
  etapa text not null default 'precalificado'
    check (etapa in ('precalificado','calificado','presupuesto','acuerdo','ganado','perdido','no_calificado')),
  -- calificación: quién decide, para cuándo lo necesita, si tiene presupuesto, si le soluciona el problema
  decide text,
  necesita text,
  tiene_presupuesto boolean,
  soluciona boolean,
  cierre_estimado date,                          -- para el pronóstico de ingresos
  -- importe de la venta (se carga al calificar; USD como el resto de la app)
  precio_estandar numeric(14,2) check (precio_estandar is null or precio_estandar >= 0),
  precio_cliente numeric(14,2) check (precio_cliente is null or precio_cliente >= 0),
  presupuesto_via text,                          -- por dónde se mandó la propuesta (whatsapp / mail)
  motivo text,                                   -- perdido: precio, plazo, producto, otro · no calificado: el criterio que no cumple
  motivo_detalle text,
  notas text,
  proyecto_id uuid references proyectos on delete set null,   -- la nota de pedido que salió de esta venta
  -- solo el líder de ventas y el administrador
  comision numeric(14,2) check (comision is null or comision >= 0),
  entregado boolean not null default false,
  entregado_en date,
  cobrado boolean not null default false,
  cobrado_en date,
  historial jsonb not null default '[]'::jsonb, -- [{etapa, en, por}] lo escribe la base
  etapa_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perdido_con_razon check (etapa <> 'perdido' or (motivo in ('precio','plazo','producto','otro') and length(trim(coalesce(motivo_detalle,''))) > 0))
);
create index if not exists oport_vend on oportunidades (vendedor_id, etapa);
create index if not exists oport_proy on oportunidades (proyecto_id);

-- Historial de etapas, fechas y campos que el vendedor no puede tocar
create or replace function oport_controlar() returns trigger language plpgsql security definer set search_path = public as $$
declare vend boolean := es_vendedor();
begin
  new.actualizado_en := now();
  if tg_op = 'INSERT' then
    if vend then
      new.vendedor_id := auth.uid();
      new.comision := null; new.entregado := false; new.entregado_en := null; new.cobrado := false; new.cobrado_en := null;
    end if;
    new.etapa_en := now();
    new.historial := jsonb_build_array(jsonb_build_object('etapa', new.etapa, 'en', now(), 'por', auth.uid()));
    return new;
  end if;
  if vend then
    new.vendedor_id := old.vendedor_id;
    new.comision := old.comision;
    new.entregado := old.entregado; new.entregado_en := old.entregado_en;
    new.cobrado := old.cobrado; new.cobrado_en := old.cobrado_en;
  end if;
  new.historial := old.historial;   -- el historial lo escribe solo la base
  if new.etapa is distinct from old.etapa then
    new.etapa_en := now();
    new.historial := old.historial || jsonb_build_array(jsonb_build_object('etapa', new.etapa, 'en', now(), 'por', auth.uid()));
  else
    new.etapa_en := old.etapa_en;
  end if;
  if new.entregado and not old.entregado and new.entregado_en is null then new.entregado_en := current_date; end if;
  if not new.entregado then new.entregado_en := null; end if;
  if new.cobrado and not old.cobrado and new.cobrado_en is null then new.cobrado_en := current_date; end if;
  if not new.cobrado then new.cobrado_en := null; end if;
  return new;
end $$;
drop trigger if exists oport_controlar on oportunidades;
create trigger oport_controlar before insert or update on oportunidades for each row execute function oport_controlar();

alter table oportunidades enable row level security;
revoke all on oportunidades from anon;
drop policy if exists oport_ver on oportunidades;
create policy oport_ver on oportunidades for select using (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid()));
drop policy if exists oport_crear on oportunidades;
create policy oport_crear on oportunidades for insert with check (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid()));
drop policy if exists oport_cambiar on oportunidades;
create policy oport_cambiar on oportunidades for update
  using (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid()))
  with check (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid()));
-- el vendedor borra solo un contacto cargado por error (sin nota de pedido); el resto, el líder o el admin
drop policy if exists oport_borrar on oportunidades;
create policy oport_borrar on oportunidades for delete
  using (ve_todo_crm() or (es_vendedor() and vendedor_id = auth.uid() and proyecto_id is null and etapa <> 'ganado'));

-- ¿El usuario conectado ve esta oportunidad? (para las tareas)
create or replace function ve_oportunidad(oid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from oportunidades o where o.id = oid and (ve_todo_crm() or (es_vendedor() and o.vendedor_id = auth.uid())))
$$;

-- ══════════════ TAREAS DE SEGUIMIENTO ══════════════
create table if not exists tareas_crm (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades on delete cascade,
  tipo text not null default 'llamar',           -- llamar, whatsapp, mail, reunion, otro
  texto text,
  vence date not null default current_date,
  hecha_en timestamptz,
  creado_por uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists tareas_crm_op on tareas_crm (oportunidad_id);
create index if not exists tareas_crm_vence on tareas_crm (vence) where hecha_en is null;
alter table tareas_crm enable row level security;
revoke all on tareas_crm from anon;
drop policy if exists tareas_crm_todo on tareas_crm;
create policy tareas_crm_todo on tareas_crm for all using (ve_oportunidad(oportunidad_id)) with check (ve_oportunidad(oportunidad_id));

-- ══════════════ PROBABILIDAD TEÓRICA DE CIERRE POR ETAPA ══════════════
-- Se usa para el pronóstico hasta que haya suficientes ventas cerradas para calcular la conversión real.
-- La cambian el administrador y el líder de ventas desde CRM → Pronóstico.
create table if not exists crm_probabilidades (
  etapa text primary key check (etapa in ('precalificado','calificado','presupuesto','acuerdo')),
  prob int not null check (prob between 0 and 100),
  actualizado_en timestamptz not null default now()
);
insert into crm_probabilidades (etapa, prob) values
  ('precalificado', 10), ('calificado', 25), ('presupuesto', 40), ('acuerdo', 80)
on conflict (etapa) do nothing;
alter table crm_probabilidades enable row level security;
revoke all on crm_probabilidades from anon;
drop policy if exists crm_prob_ver on crm_probabilidades;
create policy crm_prob_ver on crm_probabilidades for select using (ve_todo_crm() or es_vendedor());
drop policy if exists crm_prob_cambiar on crm_probabilidades;
create policy crm_prob_cambiar on crm_probabilidades for update using (ve_todo_crm()) with check (ve_todo_crm());

-- ══════════════ TIEMPO REAL ══════════════
do $$
declare t text;
begin
  foreach t in array array['oportunidades','tareas_crm','crm_probabilidades'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Comprobación: debe mostrar las 4 etapas con su probabilidad
select etapa, prob from crm_probabilidades order by prob;
