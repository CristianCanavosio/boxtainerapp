-- 0036: Horas extras en el parte diario (pedido de Cristian 27/11).
-- Además de "Horas de trabajo en el día", el parte diario tiene "Horas extras" (por persona, solo si hubo).
-- Las horas-hombre del proyecto y el indicador de Reportes suman personas × (horas + horas extras).
-- Se puede correr más de una vez. Sin esta migración la app funciona igual, pero no deja guardar horas extras.

alter table actualizaciones add column if not exists horas_extras numeric;
alter table actualizaciones drop constraint if exists horas_extras_rango;
alter table actualizaciones add constraint horas_extras_rango
  check (horas_extras >= 0 and horas_extras <= 24 and coalesce(horas, 0) + horas_extras <= 24);

-- Comprobación: debe devolver una fila con horas_extras
select column_name from information_schema.columns
where table_name = 'actualizaciones' and column_name = 'horas_extras';
