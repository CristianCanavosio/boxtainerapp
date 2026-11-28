-- 0038: Ajustes del cotizador que pidió Cristian por audio (27/11).
-- · Ventanas: el m² pasa a ser abertura USD 140 + bastidor y corte USD 30 = USD 170 (antes 145 todo junto).
--   Son dos insumos en Materiales y costos → Insumos, se cambian por separado.
-- · Aislación térmica (m²): además de la lana de vidrio (Isover ÷ 9,4) lleva montantes, soleras y tornillos.
--   Supuesto, a revisar en "Ítems de proyectos": 1 montante o solera por m² (USD 3 c/u) y 20 tornillos por m² (USD 0,20).
-- · Cocina: bajo mesada USD 180 y alacena USD 150 por metro (la nota trae los metros de mesada; por defecto 1,40 m).
-- · Baño: "Bacha" = grifería (monocomando) y "Mueble" = vanitory, para que la bacha + mueble del vanitory tenga costo.
--   Solo si todavía no tenían costo armado.
-- · Precio de venta por m² de referencia (Parámetros): 20' sin baño 620, 20' con baño 690, 40' sin baño 630,
--   40' con baño o cocina 680; tolerancia 15%. El presupuesto que se aleja más muestra un aviso.
-- Los presupuestos abiertos se recalculan solos (los aceptados conservan su precio). Se puede correr más de una vez.

-- Ventanas por m²: abertura + bastidor y corte
insert into cot_insumos (codigo, nombre, rubro, unidad, costo_usd, para_vendedor, fuente, costo_actualizado_en) values
  ('INS-VENT-M2', 'VENTANA POR M2 (MO+MAT)', 'Aberturas', 'M2', 140, false, 'manual', now()),
  ('INS-BAST-M2', 'BASTIDOR Y CORTE DE ABERTURA POR M2', 'Aberturas', 'M2', 30, false, 'manual', now()),
  ('INS-BAJOM-ML', 'BAJO MESADA POR METRO', 'Cocina', 'ML', 180, false, 'manual', now()),
  ('INS-ALAC-ML', 'ALACENA POR METRO', 'Cocina', 'ML', 150, false, 'manual', now()),
  -- ya vienen de la planilla de costos; por si faltan (si están, no se tocan)
  ('INS-051', 'MONTANTES Y SOLERAS', 'Estructura', 'UN', 3, false, 'manual', now()),
  ('INS-073', 'TORNILLOS', 'Estructura', 'UN', 0.2, false, 'manual', now()),
  ('INS-042', 'LAVAMANOS / VANITORY', 'Sanitarios', 'UN', 150, false, 'manual', now()),
  ('INS-050', 'MONOCOMANDOS', 'Sanitarios', 'UN', 85, false, 'manual', now())
on conflict (codigo) do nothing;
-- la ventana por m² baja a 140 solo si sigue con el valor de la 0031 (si Cristian ya la cambió, queda como está)
update cot_insumos set costo_usd = 140, costo_actualizado_en = now() where codigo = 'INS-VENT-M2' and costo_usd = 145;

insert into cot_equivalencias (clave, composicion) values
  ('Aberturas: ventanas por m² (MO+MAT)', '[{"insumo": "INS-VENT-M2", "factor": 1}, {"insumo": "INS-BAST-M2", "factor": 1}]'::jsonb),
  ('Aislación térmica', '[{"insumo": "INS-041", "factor": 0.106383}, {"insumo": "INS-051", "factor": 1}, {"insumo": "INS-073", "factor": 20}]'::jsonb),
  ('Cocina · Bajo mesada', '[{"insumo": "INS-BAJOM-ML", "factor": 1}]'::jsonb),
  ('Cocina · Alacena', '[{"insumo": "INS-ALAC-ML", "factor": 1}]'::jsonb)
on conflict (clave) do update set composicion = excluded.composicion, actualizado_en = now();

-- bacha y mueble del baño: solo si no tenían costo armado
insert into cot_equivalencias (clave, composicion) values
  ('Sanitario · Bacha', '[{"insumo": "INS-050", "factor": 1}]'::jsonb),
  ('Sanitario · Mueble', '[{"insumo": "INS-042", "factor": 1}]'::jsonb)
on conflict (clave) do update set composicion = excluded.composicion, actualizado_en = now()
  where jsonb_array_length(cot_equivalencias.composicion) = 0;

-- precio de venta por m² de referencia (los cambia el administrador en Parámetros)
insert into cot_parametros (clave, valor, descripcion) values
  ('ref_m2_20_sin', 620, 'Precio de venta por m² de referencia: 20 pies sin baño (USD sin IVA)'),
  ('ref_m2_20_con', 690, 'Precio de venta por m² de referencia: 20 pies con baño o cocina'),
  ('ref_m2_40_sin', 630, 'Precio de venta por m² de referencia: 40 pies sin baño'),
  ('ref_m2_40_con', 680, 'Precio de venta por m² de referencia: 40 pies con baño o cocina'),
  ('ref_m2_tolerancia', 0.15, 'Cuánto se puede alejar el precio por m² de la referencia antes de avisar (0,15 = 15%)')
on conflict (clave) do nothing;

-- Para revisar: cómo quedó
select e.clave, x.codigo, x.nombre, x.unidad, x.costo_usd, (c->>'factor')::numeric as factor,
       round(x.costo_usd * (c->>'factor')::numeric, 2) as aporte_usd
from cot_equivalencias e, jsonb_array_elements(e.composicion) c left join cot_insumos x on x.codigo = c->>'insumo'
where e.clave in ('Aberturas: ventanas por m² (MO+MAT)', 'Aislación térmica', 'Cocina · Bajo mesada', 'Cocina · Alacena', 'Sanitario · Bacha', 'Sanitario · Mueble')
order by e.clave, x.codigo;
