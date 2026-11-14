-- 0015: pestaña Recursos (guías y videos cortos de cómo usar la app, por rol).
-- La app ya trae una guía y un video para cada rol (carpeta web/recursos). Esta tabla guarda lo que el
-- administrador cambia desde la app sin tocar código: reemplazar un video, corregir el texto o los pasos,
-- elegir para qué roles es, ocultarlo, o sumar recursos nuevos (otro video, un manual en PDF, un enlace).
-- Cada fila con la misma "clave" que un recurso de la app lo reemplaza; una clave nueva es un recurso nuevo.
-- Sin correr esta migración la pestaña funciona igual, con los videos y guías que trae la app.

create table if not exists recursos (
  clave text primary key check (clave ~ '^[a-z0-9_-]{2,60}$'),
  titulo text not null default '' check (length(titulo) <= 200),
  descripcion text not null default '' check (length(descripcion) <= 2000),
  roles text[] not null default '{}',          -- vacío = para todos los roles
  pasos text not null default '' check (length(pasos) <= 8000),  -- un paso por renglón
  archivo text,                                -- ruta en el depósito "recursos" (video, PDF o imagen)
  archivo_tipo text,                           -- tipo del archivo (video/mp4, application/pdf, ...)
  enlace text check (enlace is null or enlace ~ '^https://'),  -- YouTube, Drive, etc. en lugar de archivo
  orden int not null default 100,
  oculto boolean not null default false,
  actualizado_por uuid references perfiles on delete set null default auth.uid(),
  actualizado_en timestamptz not null default now()
);

create or replace function recursos_tocar() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists recursos_tocar on recursos;
create trigger recursos_tocar before insert or update on recursos for each row execute function recursos_tocar();

alter table recursos enable row level security;
drop policy if exists recursos_ver on recursos;
create policy recursos_ver on recursos for select using (mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists recursos_admin on recursos;
create policy recursos_admin on recursos for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- ══════════════ ARCHIVOS (depósito privado, hasta 50 MB por archivo) ══════════════
-- Los ve cualquier usuario con rol; los sube y borra solo el administrador.
insert into storage.buckets (id, name, public, file_size_limit)
values ('recursos', 'recursos', false, 52428800) on conflict (id) do nothing;
drop policy if exists recursos_arch_ver on storage.objects;
create policy recursos_arch_ver on storage.objects for select
  using (bucket_id = 'recursos' and mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists recursos_arch_subir on storage.objects;
create policy recursos_arch_subir on storage.objects for insert
  with check (bucket_id = 'recursos' and mi_rol() = 'admin');
drop policy if exists recursos_arch_borrar on storage.objects;
create policy recursos_arch_borrar on storage.objects for delete
  using (bucket_id = 'recursos' and mi_rol() = 'admin');
