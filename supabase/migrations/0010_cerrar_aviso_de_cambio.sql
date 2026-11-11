-- 0010: cuando ventas toca "El cliente aprobó el cambio", el aviso automático que le llegó
-- ("✏️ Cambio en la nota de pedido: …") queda respondido. Antes quedaba abierto y le seguía
-- figurando como "consulta esperando respuesta" a quien hizo el cambio.

create or replace function reconfirmar_nota(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (mi_rol() in ('ventas','admin') and puede_ver_id(pid)) then
    raise exception 'Solo ventas o el administrador reconfirman la nota con el cliente' using errcode = 'P0001';
  end if;
  if nota_pendiente(pid) then
    perform registrar_version_nota(pid, 'reconfirmada', (select ficha from proyectos where id = pid));
  end if;
  update consultas set respuesta = '✅ El cliente aprobó el cambio', respondida_por = auth.uid(), respondida_en = now()
  where proyecto_id = pid and respuesta is null and texto like '✏️ Cambio en la nota de pedido:%';
end $$;
revoke all on function reconfirmar_nota(uuid) from public, anon;
grant execute on function reconfirmar_nota(uuid) to authenticated;

-- Avisos viejos: se cierran los de proyectos cuya nota ya no tiene un cambio pendiente de aprobar
update consultas c set respuesta = '✅ El cliente aprobó el cambio', respondida_en = now()
where c.respuesta is null and c.texto like '✏️ Cambio en la nota de pedido:%' and not nota_pendiente(c.proyecto_id);

-- Comprobación: avisos de cambio que siguen abiertos (solo los de notas que el cliente todavía no aprobó)
select count(*) as avisos_abiertos from consultas where respuesta is null and texto like '✏️ Cambio en la nota de pedido:%';
