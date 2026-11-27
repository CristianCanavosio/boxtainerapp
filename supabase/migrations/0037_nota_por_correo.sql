-- 0037: mandar el presupuesto o la orden de compra por correo al cliente (pedido de ventas, 27/11).
-- Al terminar un presupuesto o una orden de compra confirmada, además de bajar el PDF, el vendedor lo manda
-- por correo al cliente con el PDF adjunto. El correo lo envía la propia base con Resend (la misma clave que
-- el buzón de sugerencias, 0014) y queda registrado en el proyecto y en el seguimiento del CRM del cliente.
--
-- Respeta la aprobación del administrador (0033): mientras está prendida, no sale nada que él no haya aprobado
-- (ni presupuestos ni órdenes de compra). Tampoco sale un presupuesto cuyo precio espera al líder de ventas o tiene ítems sin costo.
--
-- CONFIGURACIÓN (una sola vez, en el editor SQL de Supabase):
--   La clave de Resend ya está si se configuró el buzón de sugerencias ('resend_api_key' en Vault).
--   Para que los correos lleguen a CUALQUIER cliente, Resend pide verificar el dominio de la empresa
--   (resend.com → Domains → Add domain, y cargar los registros DNS que indica). Después:
--     select vault.create_secret('BoxTainer <ventas@tudominio.com>', 'correo_clientes_remitente');
--   Sin dominio verificado, Resend solo deja mandar al correo dueño de la cuenta (sirve para probar).
--   La respuesta del cliente le llega al vendedor que lo mandó (va como "responder a").
--
-- Requiere 0024, 0025, 0027 y 0033. Se puede correr más de una vez.

-- ══════════════ QUIÉN PUEDE MANDAR ══════════════
-- Ventas, líder y administrador sobre los proyectos que ven; el líder de ventas sobre los de su CRM.
create or replace function puede_mandar_correo(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (mi_rol()::text in ('admin','lider','ventas') and puede_ver_id(pid))
    or (ve_todo_crm() and (exists (select 1 from oportunidades o where o.proyecto_id = pid)
                           or exists (select 1 from cotizaciones c where c.proyecto_id = pid))),
    false)
$$;

-- ══════════════ DEPÓSITO DE LOS PDF ENVIADOS ══════════════
-- Carpeta = id del proyecto. Privado: Resend lo baja con un enlace firmado.
insert into storage.buckets (id, name, public) values ('correos', 'correos', false) on conflict (id) do nothing;
drop policy if exists correos_arch_subir on storage.objects;
create policy correos_arch_subir on storage.objects for insert
  with check (bucket_id = 'correos' and puede_mandar_correo(((storage.foldername(name))[1])::uuid));
drop policy if exists correos_arch_ver on storage.objects;
create policy correos_arch_ver on storage.objects for select
  using (bucket_id = 'correos' and puede_mandar_correo(((storage.foldername(name))[1])::uuid));

-- ══════════════ REGISTRO DE ENVÍOS ══════════════
create table if not exists correos_clientes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  oportunidad_id uuid references oportunidades on delete set null,
  tipo text not null check (tipo in ('presupuesto','oc')),
  para text not null,
  asunto text not null,
  mensaje text,
  ruta text not null,                     -- el PDF en el depósito "correos"
  enviado_por uuid references perfiles default auth.uid(),
  correo_req bigint,                      -- pedido de pg_net (para ver si Resend lo aceptó)
  creado_en timestamptz not null default now()
);
create index if not exists correos_cli_proy on correos_clientes (proyecto_id, creado_en desc);
alter table correos_clientes enable row level security;
revoke all on correos_clientes from anon;
drop policy if exists correos_cli_ver on correos_clientes;
create policy correos_cli_ver on correos_clientes for select using (puede_mandar_correo(proyecto_id));
-- se escribe solo con enviar_nota_por_correo

-- ══════════════ ENVIAR ══════════════
-- p_ruta: dónde subió la app el PDF (correos/<proyecto>/...) · p_url: su enlace firmado
create or replace function enviar_nota_por_correo(p_proyecto uuid, p_para text, p_ruta text, p_url text, p_mensaje text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  clave text := (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key' limit 1);
  remitente text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'correo_clientes_remitente' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'sugerencias_remitente' limit 1),
    'BoxTainer <onboarding@resend.dev>');
  p proyectos;
  c cotizaciones;
  pf perfiles;
  adm boolean := _soy_admin();
  activa boolean := aprobacion_admin_activa();
  es_oc boolean;
  para text := lower(trim(coalesce(p_para, '')));
  oid uuid;
  tipo_txt text;
  cliente text;
  empresa text;
  asunto text;
  html text;
  req bigint;
  nuevo uuid := gen_random_uuid();
begin
  if not puede_mandar_correo(p_proyecto) then
    raise exception 'No podés mandar correos de este proyecto' using errcode = 'P0001';
  end if;
  select * into p from proyectos where id = p_proyecto;
  if not found or p.ficha is null then raise exception 'No encontré esa nota de pedido' using errcode = 'P0001'; end if;
  if para !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Revisá el correo del cliente' using errcode = 'P0001'; end if;
  if clave is null or trim(clave) = '' then
    raise exception 'Falta configurar el envío de correos (clave de Resend): avisale al administrador' using errcode = 'P0001';
  end if;
  -- el PDF tiene que ser del propio proyecto y del depósito "correos"
  if p_ruta is null or p_ruta not like p_proyecto::text || '/%' or p_ruta like '%..%'
     or p_url not like 'https://%/storage/v1/object/sign/correos/' || p_ruta || '?%'
     or not exists (select 1 from storage.objects where bucket_id = 'correos' and name = p_ruta) then
    raise exception 'No se pudo adjuntar el PDF: probá de nuevo' using errcode = 'P0001';
  end if;

  es_oc := _es_oc(p.ficha);
  select * into c from cotizaciones where proyecto_id = p_proyecto and origen = 'nota' order by creado_en desc limit 1;

  -- ── aprobación del administrador y precio ──
  if es_oc then
    -- nada sale sin la aprobación del administrador (Cristian 27/11), tampoco una OC que todavía no le mandaron
    if activa and not adm and coalesce(p.aprob_oc, '') <> 'aprobada' then
      raise exception '%', case p.aprob_oc
        when 'pendiente' then 'Esta orden de compra espera la aprobación del administrador: el correo sale cuando la apruebe'
        when 'devuelta' then 'El administrador devolvió esta orden de compra: corregila antes de mandarla'
        else 'Primero enviá la orden de compra: el correo sale cuando el administrador la apruebe' end using errcode = 'P0001';
    end if;
  else
    if c.id is not null and c.estado <> 'enviada' then
      if c.estado in ('pendiente','rechazada') or c.sin_costo > 0 or c.precio_final is null then
        raise exception 'El precio de este presupuesto todavía no está confirmado: no se puede mandar' using errcode = 'P0001';
      end if;
      if activa and not adm and coalesce(c.aprobacion, 'pendiente') <> 'aprobada' then
        raise exception '%', case when c.aprobacion = 'devuelta'
          then 'El administrador devolvió este presupuesto: corregilo y guardalo de nuevo'
          else 'Este presupuesto espera la aprobación del administrador: el correo sale cuando lo apruebe' end using errcode = 'P0001';
      end if;
    elsif c.id is null and activa and not adm then
      raise exception 'Guardá el presupuesto: el administrador lo tiene que aprobar antes de mandarlo al cliente' using errcode = 'P0001';
    end if;
  end if;

  -- ── armar el correo ──
  select * into pf from perfiles where id = auth.uid();
  oid := coalesce(c.oportunidad_id, (select o.id from oportunidades o where o.proyecto_id = p_proyecto order by o.creado_en desc limit 1));
  tipo_txt := case when es_oc then 'nota de pedido' else 'presupuesto' end;
  cliente := coalesce(nullif(trim(p.ficha->>'cli'), ''), nullif(trim(p.cliente), ''), '');
  empresa := coalesce(nullif(trim(p.ficha->>'empresa'), ''), nullif(trim(p.empresa), ''), 'BoxTainer');
  asunto := case when es_oc then 'Nota de pedido' else 'Presupuesto' end
            || case when c.numero is not null and not es_oc then ' N° ' || c.numero else '' end
            || ' · ' || empresa;
  html := format(
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">'
    '<p>Hola%s,</p>'
    '<p>Te mandamos %s. Va adjunto en PDF.</p>'
    '%s'
    '<p>%s</p>'
    '<p style="margin-top:18px">Saludos,<br><b>%s</b><br>%s</p>'
    '<p style="margin-top:18px;font-size:12px;color:#888">Si no ves el adjunto, podés bajarlo de <a href="%s">este enlace</a> (dura 30 días).</p>'
    '</div>',
    case when cliente <> '' then ' ' || html_esc(cliente) else '' end,
    case when es_oc then 'la nota de pedido con todo lo que vamos a fabricar' else 'el presupuesto que nos pediste' end,
    case when nullif(trim(coalesce(p_mensaje, '')), '') is not null
      then '<div style="background:#f6f6f6;border-radius:8px;padding:12px;margin:10px 0">' || replace(html_esc(trim(p_mensaje)), E'\n', '<br>') || '</div>' else '' end,
    case when es_oc then 'Revisá que todo esté correcto. Si estás de acuerdo, respondé este correo con "Apruebo" o mandanos el PDF firmado.'
         else 'Cualquier duda, respondé este correo. Si querés avanzar, avisanos y te pasamos la orden de compra para confirmar.' end,
    html_esc(coalesce(nullif(pf.nombre, ''), 'Ventas')), html_esc(empresa),
    html_esc(p_url));

  select net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', remitente,
      'to', jsonb_build_array(para),
      'subject', asunto,
      'html', html,
      'attachments', jsonb_build_array(jsonb_build_object(
        'filename', (case when es_oc then 'Nota de pedido' else 'Presupuesto' end) || case when cliente <> '' then ' - ' || regexp_replace(cliente, '[\\/:*?"<>|]', '', 'g') else '' end || '.pdf',
        'path', p_url)))
      || case when coalesce(pf.email, '') <> '' then jsonb_build_object('reply_to', pf.email) else '{}'::jsonb end,
    headers := jsonb_build_object('Authorization', 'Bearer ' || clave, 'Content-Type', 'application/json'),
    timeout_milliseconds := 20000
  ) into req;

  insert into correos_clientes (id, proyecto_id, oportunidad_id, tipo, para, asunto, mensaje, ruta, enviado_por, correo_req)
  values (nuevo, p_proyecto, oid, case when es_oc then 'oc' else 'presupuesto' end, para, asunto, nullif(trim(coalesce(p_mensaje, '')), ''), p_ruta, auth.uid(), req);

  -- ── queda en el CRM del cliente: como seguimiento hecho, y el contacto toma el correo si no lo tenía ──
  if oid is not null then
    insert into tareas_crm (oportunidad_id, tipo, texto, vence, hecha_en, creado_por)
    values (oid, 'mail', 'Se le mandó ' || case when es_oc then 'la nota de pedido' else 'el presupuesto' end || ' por correo a ' || para,
            current_date, now(), auth.uid());
    update oportunidades set mail = para where id = oid and coalesce(trim(mail), '') = '';
  end if;
  return nuevo;
end $$;
revoke all on function enviar_nota_por_correo(uuid, text, text, text, text) from public, anon;
grant execute on function enviar_nota_por_correo(uuid, text, text, text, text) to authenticated;

-- ¿Resend aceptó cada correo? pg_net guarda las respuestas unas 6 horas: después queda como "enviado".
create or replace function estado_correos_clientes(p_proyecto uuid)
returns table (id uuid, status_code int, error text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not puede_mandar_correo(p_proyecto) then return; end if;
  return query
    select k.id, r.status_code, coalesce(r.error_msg, case when r.status_code >= 300 then left(r.content, 300) end)
    from correos_clientes k join net._http_response r on r.id = k.correo_req
    where k.proyecto_id = p_proyecto;
end $$;
revoke all on function estado_correos_clientes(uuid) from public, anon;
grant execute on function estado_correos_clientes(uuid) to authenticated;
