-- BoxTainer Gestión Pro — esquema inicial y permisos por rol (Row Level Security)
-- Los permisos se aplican en la base: aunque alguien manipule la app,
-- cada usuario solo puede leer y escribir lo que su rol permite.

-- ══════════════ ROLES Y PERFILES ══════════════
create type rol_app as enum ('pendiente','admin','lider','supervisor','ventas','arquitectura','lectura');
create type etapa_proy as enum ('ventas','arquitectura','asignacion','ejecucion');
create type estado_proy as enum ('presupuesto','en-curso','pausado','finalizado');
create type area as enum ('ventas','arquitectura','lider');
create type rubro as enum ('mat','mo','ter','otr');

create table perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text not null default '',
  rol rol_app not null default 'pendiente',
  creado_en timestamptz not null default now()
);

-- Cada usuario nuevo queda "pendiente" hasta que un admin le asigne rol
create function crear_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre) values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''));
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users for each row execute function crear_perfil();

create function mi_rol() returns rol_app language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;
create function es_op() returns boolean language sql stable as $$ select mi_rol() in ('admin','lider') $$;

-- ══════════════ PROYECTOS ══════════════
create table proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente text not null,
  tipo text,
  etapa etapa_proy not null default 'ventas',
  estado estado_proy not null default 'presupuesto',
  avance int not null default 0 check (avance between 0 and 100),
  valor_venta numeric(14,2),
  creado_por uuid references perfiles default auth.uid(),
  vendedor_id uuid references perfiles,
  supervisor_id uuid references perfiles,
  inicio date, entrega date,
  deposito text, prioridad text default 'normal', personas int default 0, observaciones text,
  ficha jsonb not null default '{}'::jsonb,       -- medidas, puertas, ventanas, instalaciones, confirmada
  nota_arquitectura text,
  plano_verificado_por uuid references perfiles, plano_verificado_en timestamptz,
  stock_verificado_por uuid references perfiles, stock_verificado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on proyectos (supervisor_id); create index on proyectos (etapa); create index on proyectos (creado_por);

-- Presupuesto de costos aparte: ventas y arquitectura no lo ven
create table presupuestos (
  proyecto_id uuid primary key references proyectos on delete cascade,
  materiales numeric(14,2) default 0, mano_obra numeric(14,2) default 0,
  terceros numeric(14,2) default 0, otros numeric(14,2) default 0
);

-- ══════════════ TABLAS POR PROYECTO ══════════════
create table planos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  nombre text not null,
  archivo text,            -- ruta en el bucket "planos" (sin límite práctico de tamaño)
  enlace text,             -- o enlace externo (Drive, OneDrive)
  autor_id uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now(),
  check (archivo is not null or enlace is not null)
);
create table costos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  rubro rubro not null, importe numeric(14,2) not null check (importe > 0),
  descripcion text not null, fecha date not null default current_date,
  autor_id uuid references perfiles default auth.uid(), creado_en timestamptz not null default now()
);
create table actualizaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  avance int not null, estado estado_proy not null, texto text not null,
  autor_id uuid references perfiles default auth.uid(), creado_en timestamptz not null default now()
);
create table consultas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  para area not null, texto text not null, es_error boolean not null default false,
  de_id uuid references perfiles default auth.uid(), creado_en timestamptz not null default now(),
  respuesta text, respondida_por uuid references perfiles, respondida_en timestamptz
);
create table incidencias (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  tipo text not null, origen area not null, descripcion text not null, frena boolean not null default false,
  autor_id uuid references perfiles default auth.uid(), creado_en timestamptz not null default now()
);
create table faltantes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  material text not null, cantidad text, para_fecha date, frena boolean not null default false,
  autor_id uuid references perfiles default auth.uid(), creado_en timestamptz not null default now(),
  resuelto_por uuid references perfiles, resuelto_en timestamptz
);
create table recorrido (
  id bigint generated always as identity primary key,
  proyecto_id uuid not null references proyectos on delete cascade,
  a_etapa etapa_proy not null, detalle text,
  autor_id uuid references perfiles default auth.uid(), creado_en timestamptz not null default now()
);

-- ══════════════ QUIÉN VE QUÉ PROYECTO ══════════════
create function puede_ver(p proyectos) returns boolean language sql stable as $$
  select case mi_rol()
    when 'admin' then true when 'lider' then true when 'lectura' then true
    when 'supervisor' then p.supervisor_id = auth.uid()
    when 'ventas' then p.creado_por = auth.uid() or p.vendedor_id = auth.uid()
    when 'arquitectura' then p.etapa = 'arquitectura'
         or exists (select 1 from planos pl where pl.proyecto_id = p.id and pl.autor_id = auth.uid())
    else false end
$$;
create function puede_ver_id(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select puede_ver(p) from proyectos p where p.id = pid), false)
$$;
create function ve_costos(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select es_op() or mi_rol() = 'lectura' or exists (select 1 from proyectos where id = pid and supervisor_id = auth.uid())
$$;

-- ══════════════ CATÁLOGOS GENERALES ══════════════
create table personal (id uuid primary key default gen_random_uuid(), nombre text not null, rol text, telefono text);
create table contenedores (id uuid primary key default gen_random_uuid(), codigo text not null, tipo text, estado text,
  proyecto_id uuid references proyectos on delete set null, observaciones text);
create table materiales (id uuid primary key default gen_random_uuid(), nombre text not null, cantidad text,
  estado text not null default 'pendiente' check (estado in ('pendiente','comprado','transito')),
  proyecto_id uuid references proyectos on delete set null);

-- ══════════════ PERMISOS (RLS) ══════════════
alter table perfiles enable row level security;
alter table proyectos enable row level security;
alter table presupuestos enable row level security;
alter table planos enable row level security;
alter table costos enable row level security;
alter table actualizaciones enable row level security;
alter table consultas enable row level security;
alter table incidencias enable row level security;
alter table faltantes enable row level security;
alter table recorrido enable row level security;
alter table personal enable row level security;
alter table contenedores enable row level security;
alter table materiales enable row level security;

-- Perfiles: todos los usuarios con rol ven nombres; solo admin cambia roles
create policy perfiles_ver on perfiles for select using (id = auth.uid() or mi_rol() <> 'pendiente');
create policy perfiles_admin on perfiles for update using (mi_rol() = 'admin');
create policy perfiles_mi_nombre on perfiles for update using (id = auth.uid()) with check (id = auth.uid() and rol = mi_rol());

-- Proyectos
create policy proy_ver on proyectos for select using (puede_ver(proyectos));
create policy proy_crear on proyectos for insert with check (mi_rol() in ('admin','lider','ventas') and creado_por = auth.uid());
create policy proy_editar on proyectos for update using (
  es_op()
  or (mi_rol() = 'ventas' and etapa = 'ventas' and creado_por = auth.uid())
  or (mi_rol() = 'arquitectura' and etapa = 'arquitectura')
  or (mi_rol() = 'supervisor' and supervisor_id = auth.uid() and etapa = 'ejecucion'))
  with check (
  es_op()
  or (mi_rol() = 'ventas' and creado_por = auth.uid() and etapa in ('ventas','arquitectura'))
  or (mi_rol() = 'arquitectura' and etapa in ('ventas','arquitectura','asignacion'))
  or (mi_rol() = 'supervisor' and supervisor_id = auth.uid() and etapa = 'ejecucion'));
create policy proy_borrar on proyectos for delete using (es_op() or (mi_rol() = 'ventas' and etapa = 'ventas' and creado_por = auth.uid()));

-- Quién puede cambiar qué campos (las políticas de arriba no distinguen columnas)
create function proteger_campos() returns trigger language plpgsql as $$
declare r rol_app := mi_rol();
begin
  new.actualizado_en := now();
  if r in ('admin','lider') then return new; end if;
  if new.supervisor_id is distinct from old.supervisor_id or new.inicio is distinct from old.inicio
     or new.stock_verificado_por is distinct from old.stock_verificado_por then
    raise exception 'Solo el líder de operaciones asigna supervisor, fechas y stock';
  end if;
  if r = 'supervisor' then
    if new.etapa <> old.etapa or new.valor_venta is distinct from old.valor_venta or new.ficha <> old.ficha
       or new.nombre <> old.nombre or new.cliente <> old.cliente then
      raise exception 'El supervisor solo actualiza avance y estado';
    end if;
  elsif r = 'ventas' then
    if new.etapa not in ('ventas','arquitectura') or new.avance <> old.avance or new.estado <> old.estado then
      raise exception 'Ventas solo edita el pedido y lo envía a arquitectura';
    end if;
    if new.etapa = 'arquitectura' and not (
         (new.ficha->>'largo')::numeric > 0 and (new.ficha->>'ancho')::numeric > 0 and (new.ficha->>'alto')::numeric > 0
         and coalesce(new.ficha->>'puerta','') <> '' and coalesce(new.ficha->>'elec','') <> ''
         and coalesce(new.ficha->>'sani','') <> '' and coalesce((new.ficha->>'confirmada')::boolean, false)) then
      raise exception 'Falta completar la ficha técnica';
    end if;
  elsif r = 'arquitectura' then
    if new.etapa not in ('ventas','arquitectura','asignacion') or new.ficha <> old.ficha or new.valor_venta is distinct from old.valor_venta then
      raise exception 'Arquitectura solo carga plano y nota';
    end if;
    if new.etapa = 'asignacion' and new.plano_verificado_por is null then
      raise exception 'Hay que verificar el plano contra la ficha';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_campos before update on proyectos for each row execute function proteger_campos();

-- Presupuesto y costos: solo líder, admin, solo lectura y el supervisor asignado
create policy pres_ver on presupuestos for select using (ve_costos(proyecto_id));
create policy pres_op on presupuestos for all using (es_op()) with check (es_op());
create policy costos_ver on costos for select using (ve_costos(proyecto_id));
create policy costos_cargar on costos for insert with check (ve_costos(proyecto_id) and mi_rol() <> 'lectura' and autor_id = auth.uid());
create policy costos_borrar on costos for delete using (es_op());

-- Resto de tablas por proyecto: las ve quien ve el proyecto
create policy planos_ver on planos for select using (puede_ver_id(proyecto_id));
create policy planos_cargar on planos for insert with check (mi_rol() in ('arquitectura','admin','lider') and puede_ver_id(proyecto_id) and autor_id = auth.uid());
create policy planos_borrar on planos for delete using (es_op() or autor_id = auth.uid());

create policy act_ver on actualizaciones for select using (puede_ver_id(proyecto_id));
create policy act_cargar on actualizaciones for insert with check (ve_costos(proyecto_id) and mi_rol() <> 'lectura' and autor_id = auth.uid());

create policy cons_ver on consultas for select using (puede_ver_id(proyecto_id));
create policy cons_crear on consultas for insert with check (puede_ver_id(proyecto_id) and mi_rol() <> 'lectura' and de_id = auth.uid());
create policy cons_responder on consultas for update using (
  puede_ver_id(proyecto_id) and (es_op() or mi_rol()::text = para::text));

create policy inc_ver on incidencias for select using (puede_ver_id(proyecto_id));
create policy inc_crear on incidencias for insert with check (ve_costos(proyecto_id) and mi_rol() <> 'lectura' and autor_id = auth.uid());

create policy falt_ver on faltantes for select using (puede_ver_id(proyecto_id));
create policy falt_crear on faltantes for insert with check (ve_costos(proyecto_id) and mi_rol() <> 'lectura' and autor_id = auth.uid());
create policy falt_resolver on faltantes for update using (es_op());

create policy rec_ver on recorrido for select using (puede_ver_id(proyecto_id));
create policy rec_crear on recorrido for insert with check (puede_ver_id(proyecto_id) and autor_id = auth.uid());

-- Catálogos
create policy personal_ver on personal for select using (es_op() or mi_rol() = 'lectura');
create policy personal_op on personal for all using (es_op()) with check (es_op());
create policy cont_ver on contenedores for select using (es_op() or mi_rol() = 'lectura');
create policy cont_op on contenedores for all using (es_op()) with check (es_op());
create policy mat_ver on materiales for select using (es_op() or mi_rol() = 'lectura' or (proyecto_id is not null and puede_ver_id(proyecto_id)));
create policy mat_op on materiales for all using (es_op()) with check (es_op());
create policy mat_sup on materiales for update using (mi_rol() = 'supervisor' and puede_ver_id(proyecto_id));

-- ══════════════ ARCHIVOS DE PLANOS (Storage privado) ══════════════
-- Ruta de cada archivo: <proyecto_id>/<nombre>. Sin enlaces públicos.
insert into storage.buckets (id, name, public) values ('planos', 'planos', false) on conflict do nothing;
create policy planos_arch_ver on storage.objects for select
  using (bucket_id = 'planos' and puede_ver_id(((storage.foldername(name))[1])::uuid));
create policy planos_arch_subir on storage.objects for insert
  with check (bucket_id = 'planos' and mi_rol() in ('arquitectura','admin','lider')
              and puede_ver_id(((storage.foldername(name))[1])::uuid));
create policy planos_arch_borrar on storage.objects for delete
  using (bucket_id = 'planos' and (es_op() or owner = auth.uid()));
