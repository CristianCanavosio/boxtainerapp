// Función "avisar-pedido" (Supabase Edge Function).
// La llama la base (migración 0018) cada vez que se crea o cambia un pedido a carpinterías / técnicos
// de aire, y manda el aviso al celular (Web Push) de quien corresponde:
//   - pedido nuevo, corregido o cancelado  → la gente del taller (rol carp_aluminio, carp_madera o tecnico_aires)
//   - el taller acepta, rechaza, empieza, termina o corre la fecha → quien lo pidió y el supervisor del proyecto
// Nunca se avisa a quien hizo el cambio. Los equipos dados de baja se borran solos.
// Desde la migración 0033 también avisa de la aprobación del administrador ({tipo: "aprobacion"}):
//   - presupuesto u orden de compra esperando → a los administradores
//   - aprobado o devuelto → al vendedor
//
// Secretos de la función (Edge Functions → Secrets): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SECRETO.
// Al publicarla, apagar "Verify JWT" (la protege PUSH_SECRETO).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ROL_DE: Record<string, string> = { aluminio: "carp_aluminio", madera: "carp_madera", aires: "tecnico_aires" };
const NOMBRE: Record<string, string> = { aluminio: "Carpintería de aluminio", madera: "Carpintería de madera", aires: "Técnicos de aire" };
const ESTADO: Record<string, string> = { aceptado: "👍 Aceptado", rechazado: "⛔ Rechazado", en_fabricacion: "🔨 En fabricación", listo: "✅ Listo para retirar" };
const ESTADO_AIRE: Record<string, string> = { en_fabricacion: "🔧 Colocando", listo: "✅ Colocado" };
const fecha = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  if (!Deno.env.get("PUSH_SECRETO") || req.headers.get("x-push-secreto") !== Deno.env.get("PUSH_SECRETO")) {
    return new Response("no autorizado", { status: 401 });
  }
  const ev = await req.json();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://boxtainerapp.vercel.app",
    Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

  if (ev.tipo === "aprobacion") return await avisarAprobacion(sb, ev);

  const { data: x } = await sb.from("pedidos_carpinteria").select("*").eq("id", ev.id).single();
  if (!x) return new Response("sin pedido");
  const aire = x.taller === "aires";
  const quien = async (id: string | null) =>
    id ? ((await sb.from("perfiles").select("nombre").eq("id", id).single()).data?.nombre || "") : "";

  let destinos: string[] = [], titulo = "", cuerpo = "", alTaller = false;
  if (ev.nuevo || (ev.estado === "enviado" && ev.estado_antes === "rechazado") || (ev.estado === "cancelado" && ev.estado_antes !== "cancelado")) {
    alTaller = true;
    const { data } = await sb.from("perfiles").select("id").eq("rol", ROL_DE[x.taller]);
    destinos = (data || []).map((r) => r.id);
    if (ev.estado === "cancelado") { titulo = `✖️ Pedido cancelado #${x.numero}`; cuerpo = x.proyecto_nombre; }
    else {
      titulo = `${ev.nuevo ? "📥 Pedido nuevo" : "✏️ Pedido corregido"} #${x.numero}`;
      cuerpo = `${x.proyecto_nombre}. Lo pidió ${await quien(x.creado_por)}${x.para_fecha ? ", lo necesitan el " + fecha(x.para_fecha) : ""}.`;
    }
  } else if (ev.estado !== ev.estado_antes && ESTADO[ev.estado] || (ev.estado === ev.estado_antes && ev.fecha && ev.fecha !== ev.fecha_antes)) {
    const { data: p } = await sb.from("proyectos").select("supervisor_id").eq("id", x.proyecto_id).single();
    destinos = [x.creado_por, p?.supervisor_id].filter(Boolean);
    if (ev.estado !== ev.estado_antes) {
      titulo = `${NOMBRE[x.taller]} #${x.numero}: ${(aire && ESTADO_AIRE[ev.estado]) || ESTADO[ev.estado]}`;
      cuerpo = x.proyecto_nombre + (ev.estado === "rechazado" ? ". Motivo: " + (x.nota_taller || "—")
        : ev.estado === "aceptado" && x.fecha_compromiso ? ". Fecha: " + fecha(x.fecha_compromiso) : "");
    } else {
      titulo = `📅 ${NOMBRE[x.taller]} #${x.numero}: ${aire ? "cambió la fecha de colocación" : "corrió la fecha"}`;
      cuerpo = `${x.proyecto_nombre}. Nueva fecha: ${fecha(ev.fecha)}${x.nota_taller ? " · " + x.nota_taller : ""}`;
    }
  }
  destinos = [...new Set(destinos)].filter((id) => id && id !== ev.por);
  if (!destinos.length) return new Response("nadie a quien avisar");

  let pendientes: number | undefined;
  if (alTaller) {
    const { count } = await sb.from("pedidos_carpinteria").select("id", { count: "exact", head: true })
      .eq("taller", x.taller).eq("estado", "enviado");
    pendientes = count ?? undefined;
  }
  const aviso = { titulo, cuerpo, tag: "pedido-" + x.id, url: "./?vista=pedidos&proy=" + (alTaller ? "" : x.proyecto_id), pendientes };
  const { equipos, enviados } = await mandar(sb, destinos, aviso);
  return new Response(JSON.stringify({ destinos: destinos.length, equipos, enviados }), { headers: { "Content-Type": "application/json" } });
});

// Manda el aviso a todos los equipos anotados de esas personas
// deno-lint-ignore no-explicit-any
async function mandar(sb: any, destinos: string[], aviso: Record<string, unknown>) {
  const { data: subs } = await sb.from("push_suscripciones").select("*").in("usuario_id", destinos);
  const cuerpo = JSON.stringify(aviso);
  let enviados = 0;
  // deno-lint-ignore no-explicit-any
  await Promise.all((subs || []).map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 86400 });
      enviados++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_suscripciones").delete().eq("id", s.id); // equipo dado de baja
      else console.error("Error al avisar", code, (e as Error).message);
    }
  }));
  return { equipos: subs?.length || 0, enviados };
}

// Aprobación del administrador (migración 0033). ev: {que: "presupuesto" | "oc", id, estado, por}
// deno-lint-ignore no-explicit-any
async function avisarAprobacion(sb: any, ev: any) {
  const oc = ev.que === "oc";
  const quien = async (id: string | null) =>
    id ? ((await sb.from("perfiles").select("nombre").eq("id", id).single()).data?.nombre || "") : "";
  const usd = (n: unknown) => (n == null ? "" : "USD " + Math.round(Number(n)).toLocaleString("es-AR"));
  let cliente = "", vendedor: string | null = null, precio: unknown = null, nombre = "", comentario = "", pid = "";
  if (oc) {
    const { data: p } = await sb.from("proyectos").select("*").eq("id", ev.id).single();
    if (!p) return new Response("sin proyecto");
    cliente = p.cliente || ""; nombre = p.nombre || ""; vendedor = p.vendedor_id || p.creado_por;
    precio = p.valor_venta; comentario = p.aprob_oc_comentario || ""; pid = p.id;
  } else {
    const { data: c } = await sb.from("cotizaciones").select("*").eq("id", ev.id).single();
    if (!c) return new Response("sin presupuesto");
    cliente = c.cliente || ""; nombre = (c.tipologia_nombre || "") + " · N° " + c.numero; vendedor = c.vendedor_id;
    precio = c.precio_final; comentario = c.aprob_comentario || ""; pid = c.proyecto_id || "";
  }
  const cosa = oc ? "Orden de compra" : "Presupuesto";
  let destinos: string[] = [], titulo = "", cuerpo = "", url = "./?vista=aprobar";
  if (ev.estado === "pendiente") {
    const { data } = await sb.from("perfiles").select("id").eq("rol", "admin");
    destinos = (data || []).map((r: { id: string }) => r.id);
    titulo = `🛂 ${cosa} para aprobar`;
    // el aviso va solo a los administradores: puede llevar el precio
    cuerpo = `${cliente} · ${nombre}${precio != null ? " · " + usd(precio) + " + IVA" : ""}. Lo cargó ${await quien(vendedor)}.`;
  } else if (ev.estado === "aprobada" || ev.estado === "devuelta") {
    destinos = vendedor ? [vendedor] : [];
    const ok = ev.estado === "aprobada";
    titulo = `${ok ? "✅" : "↩️"} ${cosa} ${ok ? "aprobad" : "devuelt"}${oc ? "a" : "o"}: ${cliente}`;
    cuerpo = ok ? (oc ? "Ya pasó a la siguiente etapa." : "Ya lo podés mandar al cliente.") : "Qué corregir: " + (comentario || "—");
    url = pid ? "./?vista=proyectos&proy=" + pid : "./?vista=crm";
  }
  destinos = [...new Set(destinos)].filter((id) => id && id !== ev.por);
  if (!destinos.length) return new Response("nadie a quien avisar");
  let pendientes: number | undefined;
  if (ev.estado === "pendiente") {
    const a = await sb.from("cotizaciones").select("id", { count: "exact", head: true }).eq("aprobacion", "pendiente").in("estado", ["lista", "autorizada"]);
    const b = await sb.from("proyectos").select("id", { count: "exact", head: true }).eq("aprob_oc", "pendiente").eq("etapa", "ventas");
    pendientes = (a.count ?? 0) + (b.count ?? 0);
  }
  const r = await mandar(sb, destinos, { titulo, cuerpo, tag: "aprob-" + ev.id, url, pendientes });
  return new Response(JSON.stringify({ destinos: destinos.length, ...r }), { headers: { "Content-Type": "application/json" } });
}
