-- 0022: limitaciones técnicas de las aberturas en la nota de pedido.
-- Cada fila es una tipología de abertura (puerta o ventana) con su ancho y alto máximos en mm.
-- La nota de pedido ofrece estas tipologías y no deja avanzar si una medida pasa el máximo.
-- El líder de operaciones y el administrador las cambian desde Materiales → "Limitaciones de aberturas".
-- Sin correr esta migración la nota usa la tabla inicial (la misma que se carga acá abajo).
-- Se puede correr más de una vez: no pisa lo que ya se haya editado.

create table if not exists limites_aberturas (
  tipologia text primary key check (length(trim(tipologia)) between 2 and 60),
  clase text not null check (clase in ('puerta','ventana')),
  ancho_max_mm integer check (ancho_max_mm is null or ancho_max_mm > 0),   -- vacío = sin límite
  alto_max_mm integer check (alto_max_mm is null or alto_max_mm > 0),      -- vacío = sin límite
  orden integer not null default 0,
  actualizado_por uuid references perfiles on delete set null default auth.uid(),
  actualizado_en timestamptz not null default now()
);

create or replace function limites_aberturas_tocar() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists limites_aberturas_tocar on limites_aberturas;
create trigger limites_aberturas_tocar before insert or update on limites_aberturas
  for each row execute function limites_aberturas_tocar();

alter table limites_aberturas enable row level security;
revoke all on limites_aberturas from anon;
drop policy if exists limites_aberturas_ver on limites_aberturas;
create policy limites_aberturas_ver on limites_aberturas for select
  using (mi_rol() is not null and mi_rol() <> 'pendiente');
drop policy if exists limites_aberturas_editar on limites_aberturas;
create policy limites_aberturas_editar on limites_aberturas for all
  using (mi_rol() in ('admin','lider')) with check (mi_rol() in ('admin','lider'));

-- Tabla inicial (Cristian, 24/11)
insert into limites_aberturas (tipologia, clase, ancho_max_mm, alto_max_mm, orden) values
  ('Puerta ingreso',           'puerta',  1000, null, 1),
  ('Puerta ventana corrediza', 'puerta',  null, 2300, 2),
  ('Ventana corrediza',        'ventana', null, null, 3),
  ('Raja',                     'ventana', null, null, 4),
  ('Ventiluz',                 'ventana', null, null, 5),
  ('Desplazable',              'ventana', null, null, 6),
  ('Banderola',                'ventana', null, null, 7),
  ('Oscilobatiente',           'ventana', null, null, 8)
on conflict (tipologia) do nothing;

-- Comprobación: debe mostrar las 8 tipologías
select tipologia, clase, ancho_max_mm, alto_max_mm from limites_aberturas order by orden;
