-- 0004: costeo del pedido, visible y editable SOLO por el administrador.
-- La protección está en la base (Row Level Security): ventas, arquitectura, líder, supervisores
-- y solo lectura no pueden leer estas tablas aunque usen la API de Supabase directamente.

-- Lista de costos unitarios. "clave" es el nombre del ítem tal como sale de la nota de pedido
-- (por ejemplo "Puerta exterior · De abrir 90 cm" o "Piso · Flotante PVC").
create table if not exists lista_costos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  rubro text not null default 'mat' check (rubro in ('mat','mo','ter','otr')),
  unidad text not null default 'c/u',
  costo numeric not null default 0 check (costo >= 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles default auth.uid()
);

-- Costeo de cada proyecto: correcciones de cantidad y líneas agregadas a mano.
-- Las cantidades base se calculan en la app a partir de la nota de pedido.
create table if not exists costeos (
  proyecto_id uuid primary key references proyectos on delete cascade,
  ajustes jsonb not null default '{}'::jsonb,
  extras jsonb not null default '[]'::jsonb,
  total numeric,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles default auth.uid()
);

alter table lista_costos enable row level security;
alter table costeos enable row level security;

drop policy if exists lista_costos_admin on lista_costos;
create policy lista_costos_admin on lista_costos for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
drop policy if exists costeos_admin on costeos;
create policy costeos_admin on costeos for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

revoke all on lista_costos, costeos from anon;

-- Actualización en vivo (Supabase solo avisa a quien puede leer la fila, es decir al administrador)
alter publication supabase_realtime add table lista_costos, costeos;

-- Comprobación: debe devolver 2 filas con rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename in ('lista_costos','costeos');
