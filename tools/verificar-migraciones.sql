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
  ('0025', to_regclass('public.cotizaciones') is not null and to_regclass('public.cot_equivalencias') is not null, 'Cotizador de ventas y maestro de insumos')
) as m(migracion, ok, para_que)
order by 1;
