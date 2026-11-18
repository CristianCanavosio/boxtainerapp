-- 0017: pedidos de colocación de aires acondicionados a los técnicos.
-- Usa el mismo circuito que los pedidos a carpinterías (0009): el líder (o el supervisor)
-- manda el pedido desde el proyecto, los técnicos entran con su usuario, ven solo sus pedidos
-- y los planos de esos proyectos, aceptan con fecha, marcan "colocando" y "colocado", y la obra
-- confirma. Requiere haber corrido 0009.

-- ══════════════ ROL NUEVO ══════════════
alter type rol_app add value if not exists 'tecnico_aires';

-- Qué taller es el usuario conectado (compara como texto: funciona aunque el valor recién se agregue)
create or replace function mi_taller() returns text language sql stable security definer set search_path = public as $$
  select case (select rol::text from perfiles where id = auth.uid())
    when 'carp_aluminio' then 'aluminio' when 'carp_madera' then 'madera' when 'tecnico_aires' then 'aires' end
$$;

-- ══════════════ DESTINO NUEVO DEL PEDIDO ══════════════
alter table pedidos_carpinteria drop constraint if exists pedidos_carpinteria_taller_check;
alter table pedidos_carpinteria add constraint pedidos_carpinteria_taller_check
  check (taller in ('aluminio','madera','aires'));

-- Comprobación: debe mostrar la regla con 'aires'
select pg_get_constraintdef(oid) from pg_constraint where conname = 'pedidos_carpinteria_taller_check';
