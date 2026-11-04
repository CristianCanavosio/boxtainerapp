-- 0002: correo en perfiles, nombre libre del vendedor y actualización en vivo

-- El administrador necesita ver el correo de quien pide acceso
alter table perfiles add column if not exists email text;
update perfiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
create or replace function crear_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), new.email);
  return new;
end $$;

-- Nombre del vendedor tal como lo escribe ventas (además de vendedor_id)
alter table proyectos add column if not exists vendedor text;

-- Actualización en vivo: Supabase avisa a cada celular solo de las filas que puede ver
alter publication supabase_realtime add table
  perfiles, proyectos, presupuestos, planos, costos, actualizaciones,
  consultas, incidencias, faltantes, recorrido, personal, contenedores, materiales;

-- Primer administrador: después de crear tu usuario en la app, corré esto con tu correo:
--   update perfiles set rol = 'admin' where email = 'tu-correo@empresa.com';
