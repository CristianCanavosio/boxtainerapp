-- Verificar qué migraciones ya están corridas en Supabase.
-- Pegar todo en Supabase → SQL Editor → Run. Solo lee, no cambia nada.
-- Cada fila dice "✅ corrida" o "❌ FALTA". Las que falten se corren en orden desde supabase/migrations del repo.
select m.migracion, case when m.ok then '✅ corrida' else '❌ FALTA' end as estado, m.para_que
from (values
  ('0009', to_regclass('public.pedidos_carpinteria') is not null, 'Pedidos a carpinterías'),
  ('0010', coalesce((select pg_get_functiondef('public.reconfirmar_nota(uuid)'::regprocedure) like '%Cambio en la nota de pedido%'), false), 'Cerrar aviso de cambio al reconfirmar'),
  ('0011', exists(select 1 from information_schema.columns where table_schema='public' and table_name='proyectos' and column_name='empresa'), 'Empresas (sin esto no se guardan notas nuevas con empresa)'),
  ('0012', coalesce((select pg_get_functiondef('public.proteger_campos()'::regprocedure) like '%o al líder%'), false), 'Arquitectura opcional (botón Directo al líder)'),
  ('0013', to_regclass('public.recetas_tipologia') is not null
           and exists(select 1 from information_schema.columns where table_schema='public' and table_name='actualizaciones' and column_name='horas'), 'Parte diario con personas y horas, receta por tipología'),
  ('0014', to_regclass('public.sugerencias') is not null, 'Buzón de sugerencias'),
  ('0015', to_regclass('public.recursos') is not null, 'Pestaña Recursos (videos y guías)'),
  ('0016', exists(select 1 from information_schema.columns where table_schema='public' and table_name='actualizaciones' and column_name='fotos'), 'Fotos en el parte diario'),
  ('0017', exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='rol_app' and e.enumlabel='tecnico_aires'), 'Pedidos de aires y rol Técnico de aire'),
  ('0018', to_regclass('public.push_suscripciones') is not null, 'Avisos al celular con la app cerrada'),
  ('0019', to_regclass('public.stock_taller') is not null, 'Supervisor Company, órdenes de trabajo y stock de Utilbox'),
  ('0020', to_regclass('public.metas_indicadores') is not null, 'Metas de los indicadores de Reportes'),
  ('0021', to_regclass('public.posiciones_planta') is not null, 'Posiciones en planta P1 a P8'),
  ('0022', to_regclass('public.limites_aberturas') is not null, 'Limitaciones de aberturas en la nota de pedido'),
  ('0023', coalesce((select pg_get_functiondef('public.proteger_campos()'::regprocedure) like '%libres_sup%'), false), 'Supervisor y arquitectura solo cambian lo suyo; arquitectura puede devolver sin plano'),
  ('0024', to_regclass('public.oportunidades') is not null, 'CRM de ventas y rol Líder de ventas'),
  ('0025', to_regclass('public.cotizaciones') is not null and to_regclass('public.cot_equivalencias') is not null, 'Cotizador de ventas y maestro de insumos'),
  ('0026', coalesce((select pg_get_functiondef(f) like '%es de otro contacto%' from to_regprocedure('public.cot_guardar(uuid,uuid,text,jsonb,integer,text,numeric,text)') f where f is not null), false), 'Revisión del cotizador (contacto de la cotización y costos negativos)'),
  ('0027', to_regprocedure('public.cot_guardar_nota(uuid,uuid,jsonb,text,text,integer,text,numeric,text)') is not null, 'Precio en la nota de pedido (presupuesto → CRM → orden de compra)'),
  ('0028', exists(select 1 from information_schema.columns where table_schema='public' and table_name='cotizaciones' and column_name='entrada'), 'Insumos al instante en los presupuestos abiertos'),
  ('0029', exists(select 1 from cot_parametros where clave='mo_m2_referencia'), 'Mano de obra por m²'),
  ('0030', exists(select 1 from cot_insumos where codigo='INS-ELEC-M2'), 'Instalación eléctrica por m²'),
  ('0031', exists(select 1 from cot_insumos where codigo='INS-VENT-M2'), 'Ventanas por m² y vidrio DVH'),
  ('0032', coalesce((select pg_get_functiondef(f) like '%armado de%' from to_regprocedure('public._cot_calc_nota(jsonb,text,text,integer)') f where f is not null), false), 'Sin costos de armado'),
  ('0033', to_regclass('public.ajustes_app') is not null, 'Aprobación del administrador (presupuestos y órdenes de compra)'),
  ('0034', exists(select 1 from cot_equivalencias where clave='Revestimiento melamina 5.5'), 'Melamina unificada'),
  ('0035', exists(select 1 from information_schema.columns where table_schema='public' and table_name='proyectos' and column_name='numero_proyecto'), 'Número de proyecto del Supervisor Company'),
  ('0036', exists(select 1 from information_schema.columns where table_schema='public' and table_name='actualizaciones' and column_name='horas_extras'), 'Horas extras en el parte diario'),
  ('0037', to_regclass('public.correos_clientes') is not null, 'Mandar presupuesto u orden de compra por correo'),
  ('0038', exists(select 1 from cot_insumos where codigo='INS-BAST-M2'), 'Cotizador: lo mínimo por ambiente, bastidor, precio por m² de referencia'),
  ('0039', coalesce((select pg_get_functiondef(f) like '%se reabre%' from to_regprocedure('public.oc_aprobar_admin(uuid,boolean,text)') f where f is not null), false), 'Revisión 4: arreglos de la aprobación del administrador'),
  ('0040', exists(select 1 from cot_insumos where codigo='INS-LAVAM'), 'Lavamatic = ducha higiénica (no se cobra el lavamanos dos veces)')
) as m(migracion, ok, para_que)
order by 1;
