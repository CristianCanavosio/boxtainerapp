-- 0003: ventas puede subir el croquis o plano del cliente desde la nota de pedido
-- (antes solo arquitectura, líder y administrador podían subir archivos al proyecto).
-- Sigue valiendo que cada uno solo sube a proyectos que puede ver.

drop policy if exists planos_cargar on planos;
create policy planos_cargar on planos for insert
  with check (mi_rol() in ('arquitectura','admin','lider','ventas') and puede_ver_id(proyecto_id) and autor_id = auth.uid());

drop policy if exists planos_arch_subir on storage.objects;
create policy planos_arch_subir on storage.objects for insert
  with check (bucket_id = 'planos' and mi_rol() in ('arquitectura','admin','lider','ventas')
              and puede_ver_id(((storage.foldername(name))[1])::uuid));
