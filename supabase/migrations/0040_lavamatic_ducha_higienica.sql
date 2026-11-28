-- 0040: El Lavamatic es la ducha higiénica del inodoro (Cristian, 28/11).
-- Antes "Sanitario · Lavamatic" costaba un lavamanos/vanitory + un monocomando (USD 235), y el baño por defecto
-- ya trae su vanitory (bacha con grifería + mueble): el lavamanos se cobraba dos veces.
-- Ahora el Lavamatic es un insumo propio: "DUCHA HIGIENICA (LAVAMATIC)".
-- SUPUESTO A CONFIRMAR: USD 50. Se cambia en Materiales y costos → Insumos (si ya existe, no se toca el precio).
-- Los presupuestos abiertos se recalculan solos (los aceptados conservan su precio). Se puede correr más de una vez.

insert into cot_insumos (codigo, nombre, rubro, unidad, costo_usd, para_vendedor, fuente, costo_actualizado_en)
values ('INS-LAVAM', 'DUCHA HIGIENICA (LAVAMATIC)', 'Sanitarios', 'UN', 50, false, 'manual', now())
on conflict (codigo) do nothing;

insert into cot_equivalencias (clave, composicion)
values ('Sanitario · Lavamatic', '[{"insumo": "INS-LAVAM", "factor": 1}]'::jsonb)
on conflict (clave) do update set composicion = excluded.composicion, actualizado_en = now();

-- Para revisar: cómo quedó el baño por defecto
select e.clave, x.codigo, x.nombre, x.costo_usd
from cot_equivalencias e, jsonb_array_elements(e.composicion) c left join cot_insumos x on x.codigo = c->>'insumo'
where e.clave in ('Sanitario · Lavamatic', 'Sanitario · Bacha', 'Sanitario · Mueble', 'Sanitario · Inodoro')
order by e.clave;
