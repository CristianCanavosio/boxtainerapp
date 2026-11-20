-- 0021: posiciones en planta (P1 a P8) para los proyectos a medida.
-- La planta está dividida en dos: la línea estándar (Company) y la zona de proyectos a medida,
-- con 8 posiciones pintadas en el piso (tipo "boxes"), cada una con sus materiales a mano.
-- 1. Tabla de posiciones: ya trae lugar para la cámara de cada posición (a futuro, todavía sin uso).
-- 2. Cada proyecto a medida lleva su posición. Dos proyectos activos no pueden estar en la misma:
--    la posición se libera sola cuando el proyecto pasa a "Finalizado" (o sale de ejecución).
-- 3. Ocupación: se guarda desde/hasta cuándo estuvo cada proyecto en cada posición.
--    Sirve hoy para ver tiempos por posición y mañana para cruzar con el video de las cámaras.
-- Solo el líder de operaciones y el admin asignan o cambian la posición.
-- Sin correr esta migración la app funciona igual, sin pedir posición.

-- ══════════════ 1. POSICIONES ══════════════
create table if not exists posiciones_planta (
  codigo text primary key check (codigo ~ '^[A-Z0-9-]{1,10}$'),   -- P1, P2... P8
  nombre text,                                -- opcional (ej. "Box junto al portón")
  orden int not null default 0,
  activa boolean not null default true,       -- apagarla la saca del mapa sin borrar la historia
  camara_url text,                            -- a futuro: transmisión de la cámara de la posición
  camara_id text,                             -- a futuro: identificador de la cámara en el sistema de video
  notas text
);
insert into posiciones_planta (codigo, orden)
  select 'P' || n, n from generate_series(1, 8) n
on conflict (codigo) do nothing;

alter table posiciones_planta enable row level security;
revoke all on posiciones_planta from anon;
drop policy if exists posiciones_ver on posiciones_planta;
create policy posiciones_ver on posiciones_planta for select using (mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists posiciones_admin on posiciones_planta;
create policy posiciones_admin on posiciones_planta for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- ══════════════ 2. POSICIÓN DEL PROYECTO ══════════════
alter table proyectos add column if not exists posicion text references posiciones_planta (codigo) on update cascade;

-- Una posición = un solo proyecto activo (en ejecución y no finalizado)
create unique index if not exists proyectos_posicion_ocupada on proyectos (posicion)
  where posicion is not null and etapa = 'ejecucion' and estado <> 'finalizado';

-- Solo el líder y el admin la cambian (el supervisor no la toca)
create or replace function proteger_posicion() returns trigger language plpgsql as $$
begin
  if new.posicion is distinct from old.posicion and not es_op() then
    raise exception 'Solo el líder de operaciones asigna la posición en planta' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists proteger_posicion on proyectos;
create trigger proteger_posicion before update on proyectos for each row execute function proteger_posicion();

-- ══════════════ 3. OCUPACIÓN (desde / hasta) ══════════════
create table if not exists ocupacion_posiciones (
  id bigint generated always as identity primary key,
  posicion text not null references posiciones_planta (codigo) on update cascade,
  proyecto_id uuid not null references proyectos on delete cascade,
  desde timestamptz not null default now(),
  hasta timestamptz                          -- vacío = sigue ahí
);
create index if not exists ocupacion_pos on ocupacion_posiciones (posicion, desde);
create index if not exists ocupacion_proy on ocupacion_posiciones (proyecto_id);

-- Un proyecto ocupa su posición mientras está en ejecución y no está finalizado
create or replace function proyecto_ocupa(p proyectos) returns boolean language sql immutable as $$
  select p.posicion is not null and p.etapa = 'ejecucion' and p.estado <> 'finalizado'
$$;

create or replace function registrar_ocupacion() returns trigger language plpgsql security definer set search_path = public as $$
declare antes boolean := tg_op = 'UPDATE' and proyecto_ocupa(old);
        ahora boolean := proyecto_ocupa(new);
begin
  if antes and (not ahora or new.posicion is distinct from old.posicion) then
    update ocupacion_posiciones set hasta = now() where proyecto_id = new.id and hasta is null;
  end if;
  if ahora and (not antes or new.posicion is distinct from old.posicion) then
    insert into ocupacion_posiciones (posicion, proyecto_id) values (new.posicion, new.id);
  end if;
  return null;
end $$;
drop trigger if exists registrar_ocupacion on proyectos;
create trigger registrar_ocupacion after insert or update of posicion, etapa, estado on proyectos
  for each row execute function registrar_ocupacion();

alter table ocupacion_posiciones enable row level security;
revoke all on ocupacion_posiciones from anon;
drop policy if exists ocupacion_ver on ocupacion_posiciones;
create policy ocupacion_ver on ocupacion_posiciones for select using (es_op() or mi_rol() = 'lectura' or puede_ver_id(proyecto_id));
-- Se escribe solo desde el disparador de arriba

-- Comprobación: debe mostrar P1 a P8
select codigo, activa from posiciones_planta order by orden;
