-- 0016: fotos en el parte diario del supervisor.
-- Cada parte puede llevar hasta 4 fotos del avance. Se guardan en el depósito privado "planos",
-- en la carpeta <proyecto>/avance/, y las ve quien puede ver el proyecto (la misma regla de los planos).
-- Correr una sola vez en Supabase → SQL Editor. Sin esta migración la app funciona igual, pero no deja adjuntar fotos.

alter table actualizaciones add column if not exists fotos text[] not null default '{}';

-- El supervisor (y el líder o el admin) puede subir fotos solo en la carpeta "avance" de un proyecto que ve
drop policy if exists planos_avance_subir on storage.objects;
create policy planos_avance_subir on storage.objects for insert
  with check (bucket_id = 'planos'
              and (storage.foldername(name))[2] = 'avance'
              and mi_rol() in ('supervisor','lider','admin')
              and puede_ver_id(((storage.foldername(name))[1])::uuid));

-- Comprobación: tiene que aparecer la columna fotos y la política nueva
select column_name from information_schema.columns where table_name = 'actualizaciones' and column_name = 'fotos';
select policyname from pg_policies where tablename = 'objects' and policyname = 'planos_avance_subir';
