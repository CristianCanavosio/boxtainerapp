-- 0005: precios de proveedores (Excel, PDF, a mano y, más adelante, Flexxus). Solo administrador.

-- De dónde salió cada precio de la lista de costos
alter table lista_costos add column if not exists proveedor text;
alter table lista_costos add column if not exists fuente text not null default 'manual';
alter table lista_costos add column if not exists referencia text;   -- archivo del presupuesto del proveedor

-- Catálogo de cada proveedor tal como vino (cada importación agrega filas; se guarda el historial)
create table if not exists precios_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  codigo text,
  descripcion text not null,
  unidad text,
  costo numeric not null check (costo >= 0),          -- en USD, que es la moneda de la app
  costo_original numeric,
  moneda text not null default 'USD' check (moneda in ('USD','ARS')),
  tipo_cambio numeric,
  fuente text not null default 'excel' check (fuente in ('excel','pdf','manual','flexxus')),
  archivo text,                                      -- ruta en el depósito privado "costos"
  fecha date not null default current_date,
  clave text,                                        -- ítem de la lista de costos al que quedó vinculado
  creado_en timestamptz not null default now(),
  creado_por uuid references perfiles default auth.uid()
);
create index if not exists precios_proveedor_prov on precios_proveedor (proveedor, codigo, descripcion);

alter table precios_proveedor enable row level security;
drop policy if exists precios_proveedor_admin on precios_proveedor;
create policy precios_proveedor_admin on precios_proveedor for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
revoke all on precios_proveedor from anon;
alter publication supabase_realtime add table precios_proveedor;

-- Depósito privado para los presupuestos de proveedores (Excel y PDF), solo administrador
insert into storage.buckets (id, name, public) values ('costos', 'costos', false) on conflict do nothing;
drop policy if exists costos_arch_ver on storage.objects;
create policy costos_arch_ver on storage.objects for select using (bucket_id = 'costos' and mi_rol() = 'admin');
drop policy if exists costos_arch_subir on storage.objects;
create policy costos_arch_subir on storage.objects for insert with check (bucket_id = 'costos' and mi_rol() = 'admin');
drop policy if exists costos_arch_borrar on storage.objects;
create policy costos_arch_borrar on storage.objects for delete using (bucket_id = 'costos' and mi_rol() = 'admin');

-- Comprobación: debe devolver 1 fila con rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename = 'precios_proveedor';
