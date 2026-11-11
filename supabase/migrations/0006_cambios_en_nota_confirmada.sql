-- 0006: cambios en la nota de pedido después de que la confirmó el cliente.
-- Una vez que la nota sale de ventas, solo el líder o el administrador pueden corregirla.
-- Cada corrección queda registrada (quién, cuándo y cómo quedó la nota) y el proyecto
-- NO puede pasar a ejecución hasta que ventas confirme que el cliente aprobó el cambio.

create table if not exists nota_versiones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  version int not null,
  -- enviada: ventas la mandó con la confirmación del cliente
  -- cambio: el líder o el admin la corrigió después (falta que el cliente lo apruebe)
  -- reconfirmada: ventas avisó que el cliente aprobó el cambio
  tipo text not null default 'enviada' check (tipo in ('enviada','cambio','reconfirmada')),
  ficha jsonb not null,
  autor_id uuid references perfiles,
  creado_en timestamptz not null default now(),
  unique (proyecto_id, version)
);
alter table nota_versiones enable row level security;
drop policy if exists nota_versiones_ver on nota_versiones;
create policy nota_versiones_ver on nota_versiones for select using (puede_ver_id(proyecto_id));
-- nadie las escribe ni las borra desde la app: solo el disparador y la función de abajo
revoke all on nota_versiones from anon;

create or replace function nota_pendiente(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select tipo = 'cambio' from nota_versiones where proyecto_id = pid order by version desc limit 1), false)
$$;

create or replace function registrar_version_nota(pid uuid, t text, f jsonb) returns void
language sql security definer set search_path = public as $$
  insert into nota_versiones (proyecto_id, version, tipo, ficha, autor_id)
  values (pid, coalesce((select max(version) from nota_versiones where proyecto_id = pid), 0) + 1, t, f, auth.uid())
$$;
revoke all on function registrar_version_nota(uuid, text, jsonb) from public, anon, authenticated;

create or replace function controlar_nota() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 1. Después de ventas, la nota solo la corrigen el líder o el admin, y queda registrado
  if new.ficha is distinct from old.ficha and old.etapa <> 'ventas' then
    if mi_rol() not in ('admin','lider') then
      raise exception 'La nota de pedido ya fue confirmada con el cliente: solo el líder o el administrador pueden corregirla.'
        using errcode = 'P0001';
    end if;
    if coalesce((new.ficha->>'v')::int, 0) = 2 then
      perform registrar_version_nota(new.id, 'cambio', new.ficha);
    end if;
  end if;
  -- 2. Cada vez que sale de ventas se guarda la versión que aprobó el cliente
  if old.etapa = 'ventas' and new.etapa <> 'ventas' and coalesce((new.ficha->>'v')::int, 0) = 2 then
    perform registrar_version_nota(new.id, 'enviada', new.ficha);
  end if;
  -- 3. Con un cambio sin reconfirmar, no pasa a ejecución
  if new.etapa = 'ejecucion' and old.etapa <> 'ejecucion' and nota_pendiente(new.id) then
    raise exception 'La nota de pedido tuvo un cambio que el cliente todavía no aprobó. Ventas tiene que reconfirmarlo antes de pasar a ejecución.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists controlar_nota on proyectos;
create trigger controlar_nota before update on proyectos for each row execute function controlar_nota();

-- Ventas (o el admin) avisa que el cliente aprobó el cambio
create or replace function reconfirmar_nota(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (mi_rol() in ('ventas','admin') and puede_ver_id(pid)) then
    raise exception 'Solo ventas o el administrador reconfirman la nota con el cliente' using errcode = 'P0001';
  end if;
  if not nota_pendiente(pid) then return; end if;
  perform registrar_version_nota(pid, 'reconfirmada', (select ficha from proyectos where id = pid));
end $$;
revoke all on function reconfirmar_nota(uuid) from public, anon;
grant execute on function reconfirmar_nota(uuid) to authenticated;

-- Proyectos que ya pasaron de ventas: su nota actual queda como versión 1
insert into nota_versiones (proyecto_id, version, tipo, ficha, autor_id, creado_en)
select p.id, 1, 'enviada', p.ficha, p.creado_por, coalesce(p.actualizado_en, p.creado_en)
from proyectos p
where p.etapa <> 'ventas' and coalesce((p.ficha->>'v')::int, 0) = 2
  and not exists (select 1 from nota_versiones v where v.proyecto_id = p.id);

alter publication supabase_realtime add table nota_versiones;

-- Comprobación: debe devolver 1 fila con rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename = 'nota_versiones';
