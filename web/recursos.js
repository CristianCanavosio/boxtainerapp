// ════════════════════════════════════════════════
// RECURSOS: guías y videos cortos de cómo usar la app, por rol.
// La app trae un recurso por rol (texto + video en web/recursos/videos). El administrador puede,
// desde la misma pestaña y sin tocar código: reemplazar el video (subiendo otro o pegando un
// enlace de YouTube/Drive), corregir el texto y los pasos, elegir para qué roles es, ocultarlo,
// o agregar recursos nuevos (otro video, un manual en PDF, un enlace). Ver 0015_recursos.sql.
// ════════════════════════════════════════════════
const REC_MAX_MB=50;
const REC_VIDEO_DIR='recursos/videos/';
// Recursos que trae la app. Si el administrador cambia uno, la fila de la base con la misma clave manda.
const REC_BASE=[
  {clave:'inicio',orden:1,roles:[],titulo:'Primeros pasos en la app',
    descripcion:'Cómo entrar, qué hay en cada pestaña y cómo mandar una sugerencia. Para todos.',
    pasos:`Entrá desde el celular a la dirección de la app con tu correo y contraseña. Si es la primera vez, tocá "Crear cuenta" y esperá a que el administrador te asigne el rol.
Arriba ves tu nombre y tu rol. Cada rol ve solo las pestañas y los proyectos que le tocan.
En Tablero aparece primero lo que espera algo de vos: consultas para responder, proyectos de tu área y avisos.
En Proyectos tocá una tarjeta para ver el detalle: etapa, información, planos, nota de pedido, consultas y recorrido.
Las consultas entre áreas tienen semáforo: verde hasta 4 horas, amarillo hasta 24 horas y rojo después. Respondé desde el proyecto.
En Sugerencias podés mandar una idea de mejora con texto, foto o audio.
En Recursos tenés esta guía y el video de tu rol. Si algo cambió en la app, el video se actualiza acá.`},
  {clave:'ventas',orden:10,roles:['ventas'],titulo:'Ventas: cargar la nota de pedido',
    descripcion:'Desde el pedido del cliente hasta que el proyecto pasa a arquitectura o al líder de operaciones.',
    pasos:`Tocá el botón naranja "+" para cargar una nota de pedido nueva. Son 7 pasos y el dibujo del contenedor se arma solo.
Paso 1: empresa que vende, tipo de solicitud, cliente, teléfono, dirección de entrega verificada en el mapa y fecha de entrega. La fecha tiene un plazo mínimo: 5 días corridos para productos Company y 15 para el resto.
Indicá si necesita plano de arquitectura. Si no lo necesita, el proyecto va directo al líder de operaciones.
Pasos 2 a 6: producto y tamaño, distribución de espacios, terminaciones, aberturas e instalaciones. Lo que el cliente todavía no definió marcalo "A confirmar".
Paso 7: revisá el resumen con el cliente, marcá que lo revisó y enviá. Podés descargar el PDF para mandárselo.
Lo marcado "A confirmar" deja avanzar, pero el proyecto no puede pasar a ejecución hasta completarlo.
Si el líder corrige una nota ya confirmada, te aparece el aviso: mostrale el cambio al cliente y tocá "El cliente aprobó el cambio".
Respondé rápido las consultas de arquitectura y operaciones: el semáforo mide cuánto tarda la respuesta.`},
  {clave:'arquitectura',orden:20,roles:['arquitectura'],titulo:'Arquitectura: plano y verificación',
    descripcion:'Subir el plano, verificarlo contra la nota de pedido y pasarlo al líder de operaciones.',
    pasos:`En Tablero ves los proyectos que esperan plano. Tocá uno para abrirlo.
Leé la nota de pedido del proyecto: medidas, espacios, aberturas e instalaciones.
Subí el plano en PDF o imagen con "Subir plano". Si pesa más de 50 MB, pegá el enlace de Drive, OneDrive o Dropbox.
Escribí una nota para operaciones si hace falta (medidas, materiales, observaciones).
Tildá que verificaste que el plano coincide con la ficha técnica y tocá "Enviar a Líder de Operaciones".
Si a la nota le falta información, mandá una consulta a ventas o devolvé el proyecto con "Devolver a Ventas".`},
  {clave:'lider',orden:30,roles:['lider'],titulo:'Líder de operaciones: stock, asignación y seguimiento',
    descripcion:'Validar materiales, asignar supervisor y fechas, pedir a carpinterías y seguir los desvíos.',
    pasos:`En Tablero ves los proyectos que esperan asignación, los faltantes de material y las consultas para vos.
Abrí el proyecto y revisá la nota de pedido. Si hay que corregirla, el cambio queda en el historial y ventas tiene que reconfirmarlo con el cliente.
En "Materiales del proyecto" marcá cada ítem como Hay, Pedido o Falta. Sin el stock validado no se puede asignar.
Elegí el supervisor, la fecha de inicio y la de entrega, y tocá "Asignar y comenzar".
Desde el proyecto pedí a la carpintería de aluminio o de madera: la lista sale de la nota y la podés corregir.
En Alertas y Kanban seguí los proyectos atrasados o desviados. Cuando un supervisor avisa que falta material, resolvelo y marcalo "Resuelto".
En Materiales cargás la receta de cada tipología: los materiales que se suman solos a cada proyecto de ese tipo.`},
  {clave:'supervisor',orden:40,roles:['supervisor'],titulo:'Supervisor: parte diario y materiales',
    descripcion:'Cargar el avance del día, los materiales usados, faltantes y errores de la obra.',
    pasos:`En Proyectos ves solo los proyectos que te asignaron.
Todos los días abrí el proyecto y tocá "Actualizar hoy": porcentaje de avance, cuántas personas trabajaron, cuántas horas y un comentario.
En "Materiales: planificado vs usado" cargá cuánto se usó de cada material (el total acumulado). Si te pasás de lo planificado, se marca el desvío.
Si usaste algo que no estaba previsto, agregalo con "Agregar material no previsto".
Si falta un material, tocá "Falta material": le llega al líder con la fecha en que lo necesitás y si frena el trabajo.
Si encontrás un error en medidas o planos, tocá "Reportar error" y elegí de qué área vino.
Para aberturas o muebles, pedí a la carpintería desde el proyecto y marcá "Lo recibimos" cuando llegue.`},
  {clave:'carpinteria',orden:50,roles:['carp_aluminio','carp_madera'],titulo:'Carpinterías: responder y avisar los pedidos',
    descripcion:'Aceptar con fecha, fabricar y avisar cuando el pedido está listo.',
    pasos:`En la pestaña de pedidos ves solo los pedidos que te mandaron, con los planos del proyecto.
Pedido nuevo: tocá "Aceptar" y poné la fecha en que lo vas a tener, o "Rechazar" con el motivo.
Cuando empiecen a fabricar, tocá "Empezamos a fabricar".
Si no llegás a la fecha, tocá "Correr la fecha" y explicá por qué: la obra se entera al instante.
Cuando esté terminado, tocá "Está listo" para que coordinen el retiro.
El semáforo muestra los pedidos sin responder y los que vencen pronto.`},
  {clave:'admin',orden:60,roles:['admin'],titulo:'Administrador: usuarios, costos y recursos',
    descripcion:'Dar acceso y roles, ver costos y desvíos en plata, gestionar sugerencias y actualizar estos videos.',
    pasos:`En Usuarios aprobá a quien se registró eligiendo su rol. Ahí mismo cambiás el rol o la empresa de cada vendedor.
Si cambiás el rol de un supervisor con proyectos a cargo, la app avisa para reasignarlos.
En Costos mantenés la lista de precios (a mano o importando Excel o PDF de proveedores). Toda la plata la ves solo vos.
En cada proyecto ves el costeo y el desvío de materiales en dólares.
En Sugerencias ves todas las ideas del equipo, les cambiás el estado y les respondés.
En Recursos tocá "Editar" en cualquier tarjeta para reemplazar el video, corregir los pasos o elegir para qué roles es. Con "Nuevo recurso" sumás otro video, un manual en PDF o un enlace.`},
];

const recs={filas:{},listo:false,filtro:'mio',editando:null,urls:{},subiendo:false};

async function cargarRecursos(){
  recs.listo=false;
  try{
    const {data,error}=await sb.from('recursos').select('*');
    if(error) throw error;
    recs.filas={}; (data||[]).forEach(r=>recs.filas[r.clave]=r);
    recs.listo=true;
  }catch(e){console.warn('Recursos de la base no disponibles (¿falta la migración 0015?)',e);}
}
function recLista(){
  const base={}; REC_BASE.forEach(b=>base[b.clave]=b);
  const claves=[...new Set([...REC_BASE.map(b=>b.clave),...Object.keys(recs.filas)])];
  return claves.map(k=>{
    const b=base[k], f=recs.filas[k];
    const x={clave:k,base:!!b,titulo:b?.titulo||'',descripcion:b?.descripcion||'',roles:b?.roles||[],pasos:b?.pasos||'',orden:b?.orden??100,
      oculto:false,archivo:null,tipo:null,enlace:null,video:b?REC_VIDEO_DIR+k+'.mp4':null,cambiado:null};
    if(f){
      if(f.titulo) x.titulo=f.titulo;
      if(f.descripcion) x.descripcion=f.descripcion;
      if(Array.isArray(f.roles)&&(f.roles.length||!b)) x.roles=f.roles;
      if(f.pasos) x.pasos=f.pasos;
      x.orden=f.orden??x.orden; x.oculto=!!f.oculto;
      if(f.archivo){x.archivo=f.archivo;x.tipo=f.archivo_tipo||'';x.video=null;}
      else if(f.enlace){x.enlace=f.enlace;x.video=null;}
      x.cambiado={fecha:fechaDe(f.actualizado_en),por:f.actualizado_por?nombreDe(f.actualizado_por):''};
    }
    return x;
  }).sort((a,b)=>a.orden-b.orden||a.titulo.localeCompare(b.titulo));
}
const recEsMio=x=>!x.roles.length||x.roles.includes(rol());
const recRolesTxt=x=>x.roles.length?x.roles.map(r=>ROLES[r]||r).join(' · '):'Para todos';

function renderRecursos(){
  const el=document.getElementById('rec-content'); if(!el) return;
  const admin=esAdmin();
  if(!recs._cargado){recs._cargado=true; el.innerHTML='<div class="card" style="font-size:13px;color:var(--gris-m)">Cargando…</div>';
    cargarRecursos().then(renderRecursos); return;}
  const todos_=recLista().filter(x=>admin||!x.oculto);
  // en "Mi rol" va primero lo específico del rol y después lo general
  const mios=todos_.filter(recEsMio).sort((a,b)=>(a.roles.length?0:1)-(b.roles.length?0:1));
  const lista=recs.filtro==='todos'?todos_:mios;
  el.innerHTML=`
    <div class="sec-title">🎬 Recursos</div>
    <div class="card" style="font-size:13px;color:var(--gris);line-height:1.5">Videos cortos y guías paso a paso de lo que hace cada rol en el proceso.
      ${admin?'<br>Como administrador podés reemplazar cualquier video o texto con <b>✏️ Editar</b>, sin tocar el código.':''}</div>
    ${admin&&!recs.listo?`<div class="rec-aviso">Para poder cambiar los videos desde acá hay que correr la migración <b>0015_recursos.sql</b> en Supabase. Mientras tanto se ven los que trae la app.</div>`:''}
    <div class="chips">
      <div class="chip ${recs.filtro==='mio'?'active':''}" onclick="recFiltro('mio')">Mi rol (${mios.length})</div>
      <div class="chip ${recs.filtro==='todos'?'active':''}" onclick="recFiltro('todos')">Todos los roles (${todos_.length})</div>
    </div>
    ${admin&&recs.listo?`<button class="btn btn-sec" style="width:100%;margin-bottom:12px" onclick="recEditar(null)">➕ Nuevo recurso</button>`:''}
    ${recs.editando===''?recFormHTML(null):''}
    ${lista.map(x=>recs.editando===x.clave?recFormHTML(x):recTarjeta(x,admin)).join('')||'<div class="card" style="font-size:13px;color:var(--gris-m)">No hay recursos para tu rol todavía.</div>'}`;
  lista.forEach(x=>{if(x.archivo&&recs.editando!==x.clave) recPonerArchivo(x);});
}
function recFiltro(f){recs.filtro=f;renderRecursos();}

function recYoutube(u){
  const m=String(u||'').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  return m?'https://www.youtube-nocookie.com/embed/'+m[1]:null;
}
function recMedia(x){
  if(x.video) return `<video class="rec-video" controls playsinline preload="metadata" src="${esc(x.video)}#t=0.1"></video>`;
  if(x.archivo) return `<div class="rec-media" id="rec-m-${esc(x.clave)}"><div style="font-size:12px;color:var(--gris-m)">Cargando…</div></div>`;
  if(x.enlace){
    const yt=recYoutube(x.enlace);
    return yt?`<div class="rec-yt"><iframe src="${esc(yt)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" title="${esc(x.titulo)}"></iframe></div>`
      :`<a class="btn btn-sec" style="display:block;text-align:center;margin-bottom:8px" href="${esc(x.enlace)}" target="_blank" rel="noopener noreferrer">🔗 Abrir el video o documento</a>`;
  }
  return '';
}
async function recPonerArchivo(x){
  const box=document.getElementById('rec-m-'+x.clave); if(!box) return;
  let u=recs.urls[x.archivo];
  if(!u||u.vence<Date.now()){
    const {data,error}=await sb.storage.from('recursos').createSignedUrl(x.archivo,6*3600);
    if(error||!data){box.innerHTML='<div style="font-size:12px;color:var(--rojo)">No se pudo abrir el archivo</div>';return;}
    u=recs.urls[x.archivo]={url:data.signedUrl,vence:Date.now()+5.5*3600e3};
  }
  const t=x.tipo||'';
  box.innerHTML=t.startsWith('video/')?`<video class="rec-video" controls playsinline preload="metadata" src="${esc(u.url)}"></video>`
    :t.startsWith('image/')?`<img src="${esc(u.url)}" alt="${esc(x.titulo)}" style="width:100%;border-radius:10px;margin-bottom:8px">`
    :`<a class="btn btn-sec" style="display:block;text-align:center;margin-bottom:8px" href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">📄 Abrir el documento</a>`;
}
function recTarjeta(x,admin){
  const pasos=x.pasos.split('\n').map(s=>s.trim()).filter(Boolean);
  return `<div class="card rec-card${x.oculto?' rec-oculto':''}">
    <div class="card-title" style="margin-bottom:2px">${esc(x.titulo)}</div>
    <div style="font-size:11px;color:var(--gris-m);margin-bottom:6px">${esc(recRolesTxt(x))}${x.oculto?' · 🙈 oculto':''}</div>
    ${x.descripcion?`<div style="font-size:13px;color:var(--gris);margin-bottom:8px">${esc(x.descripcion)}</div>`:''}
    ${recMedia(x)}
    ${pasos.length?`<details class="rec-pasos" ${recs.filtro==='mio'?'open':''}><summary>📝 Paso a paso (${pasos.length})</summary>
      <ol>${pasos.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details>`:''}
    ${x.cambiado?`<div style="font-size:11px;color:var(--gris-m);margin-top:6px">Actualizado el ${esc(x.cambiado.fecha)}${x.cambiado.por?' por '+esc(x.cambiado.por):''}</div>`:''}
    ${admin&&recs.listo?`<div class="flex-btns" style="margin-top:8px"><button class="btn btn-sec btn-sm" onclick="recEditar('${esc(x.clave)}')">✏️ Editar</button></div>`:''}
  </div>`;
}

// ── edición (solo administrador) ──
function recEditar(clave){recs.editando=clave===null?'':clave;renderRecursos();
  const f=document.getElementById('rec-form'); if(f) f.scrollIntoView({behavior:'smooth',block:'start'});}
function recCancelar(){recs.editando=null;renderRecursos();}
function recFormHTML(x){
  const nuevo=!x;
  x=x||{clave:'',base:false,titulo:'',descripcion:'',roles:[],pasos:'',orden:100,oculto:false,archivo:null,enlace:null,video:null};
  const actual=x.archivo?'Archivo subido'+(x.tipo?' ('+x.tipo.split('/')[1]+')':''):x.enlace?'Enlace: '+x.enlace:x.video?'Video que trae la app':'Sin video';
  return `<div class="card" id="rec-form" style="border-left:5px solid var(--nar)">
    <div class="card-title">${nuevo?'➕ Nuevo recurso':'✏️ Editar recurso'}</div>
    <div class="fg"><label>Título</label><input id="rec-tit" maxlength="200" value="${esc(x.titulo)}" placeholder="Ej: Cómo cargar el parte diario"></div>
    <div class="fg"><label>Descripción corta</label><textarea id="rec-desc" rows="2" maxlength="2000">${esc(x.descripcion)}</textarea></div>
    <div class="fg"><label>Para qué roles (ninguno marcado = para todos)</label>
      <div class="rec-roles">${Object.entries(ROLES).map(([k,v])=>`<label class="check"><input type="checkbox" class="rec-rol" value="${k}" ${x.roles.includes(k)?'checked':''}> ${esc(v)}</label>`).join('')}</div></div>
    <div class="fg"><label>Paso a paso (un paso por renglón)</label><textarea id="rec-pasos" rows="7" maxlength="8000">${esc(x.pasos)}</textarea></div>
    <div class="fg"><label>Video o documento</label>
      <div style="font-size:12px;color:var(--gris-m);margin-bottom:6px">Ahora: ${esc(actual)}</div>
      <label class="btn btn-sec btn-sm" style="cursor:pointer;display:inline-block">⬆️ Subir archivo (video, PDF o imagen, hasta ${REC_MAX_MB} MB)
        <input type="file" id="rec-arch" accept="video/*,application/pdf,image/*" style="display:none" onchange="recArchivoElegido(this)"></label>
      <div id="rec-arch-nom" style="font-size:12px;margin-top:4px"></div>
      <div style="font-size:12px;color:var(--gris-m);margin:8px 0 4px">…o pegá un enlace (YouTube, Drive):</div>
      <input type="url" id="rec-enlace" value="${esc(x.enlace||'')}" placeholder="https://youtu.be/...">
      ${x.base&&(x.archivo||x.enlace)?`<label class="check" style="margin-top:6px"><input type="checkbox" id="rec-original"> Volver al video que trae la app</label>`:''}
    </div>
    <div class="form-2">
      <div class="fg"><label>Orden</label><input type="number" id="rec-orden" value="${esc(x.orden)}"></div>
      <div class="fg"><label>&nbsp;</label><label class="check"><input type="checkbox" id="rec-oculto" ${x.oculto?'checked':''}> Ocultar</label></div>
    </div>
    <div class="flex-btns">
      <button class="btn btn-sec" onclick="recCancelar()">Cancelar</button>
      <button class="btn btn-nar" id="rec-guardar" onclick="recGuardar('${esc(x.clave)}')">💾 Guardar</button>
    </div>
    ${!nuevo&&recs.filas[x.clave]?`<button class="btn btn-rojo btn-sm" style="margin-top:8px" onclick="recBorrar('${esc(x.clave)}')">${x.base?'↩️ Volver todo a como venía en la app':'🗑️ Borrar recurso'}</button>`:''}
  </div>`;
}
function recArchivoElegido(input){
  const f=input.files[0], n=document.getElementById('rec-arch-nom');
  if(!f){n.textContent='';return;}
  if(f.size>REC_MAX_MB*1048576){toast(`⚠️ El archivo pesa más de ${REC_MAX_MB} MB. Subilo a YouTube o Drive y pegá el enlace`);input.value='';n.textContent='';return;}
  n.textContent='📎 '+f.name+' · '+(f.size/1048576).toFixed(1)+' MB';
}
function recClave(t){
  const s=String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
  return (s.length>=2?s:'recurso')+'-'+Math.random().toString(36).slice(2,6);
}
async function recGuardar(clave){
  if(recs.subiendo) return;
  const g=k=>document.getElementById(k);
  const titulo=g('rec-tit').value.trim();
  if(!titulo){toast('⚠️ Poné un título');return;}
  const nuevo=!clave; if(nuevo) clave=recClave(titulo);
  const prev=recs.filas[clave]||null;
  const f=g('rec-arch').files[0], enlace=g('rec-enlace').value.trim(), original=g('rec-original')?.checked;
  if(enlace&&!/^https:\/\/\S+$/i.test(enlace)){toast('⚠️ El enlace tiene que empezar con https://');return;}
  const fila={clave,titulo,descripcion:g('rec-desc').value.trim(),pasos:g('rec-pasos').value.trim(),
    roles:[...document.querySelectorAll('.rec-rol:checked')].map(c=>c.value),
    orden:parseInt(g('rec-orden').value)||100,oculto:g('rec-oculto').checked,
    archivo:prev?.archivo||null,archivo_tipo:prev?.archivo_tipo||null,enlace:prev?.enlace||null};
  const btn=g('rec-guardar'); recs.subiendo=true; btn.disabled=true;
  let subido=null;
  try{
    if(f){
      btn.textContent='⏳ Subiendo…';
      const ext=(f.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
      subido=`${clave}/${Date.now()}.${ext}`;
      chk(await sb.storage.from('recursos').upload(subido,f,{contentType:f.type||'application/octet-stream',upsert:false}));
      fila.archivo=subido; fila.archivo_tipo=f.type||''; fila.enlace=null;
    }else if(enlace&&enlace!==prev?.enlace){fila.enlace=enlace; fila.archivo=null; fila.archivo_tipo=null;}
    else if(!enlace&&prev?.enlace&&!prev?.archivo){fila.enlace=null;}
    if(original){fila.archivo=null;fila.archivo_tipo=null;fila.enlace=null;}
    chk(await sb.from('recursos').upsert(fila,{onConflict:'clave'}));
    if(prev?.archivo&&prev.archivo!==fila.archivo) sb.storage.from('recursos').remove([prev.archivo]).catch(()=>{});
    toast('✅ Recurso guardado');
    recs.editando=null; await cargarRecursos(); renderRecursos();
  }catch(e){
    if(subido) sb.storage.from('recursos').remove([subido]).catch(()=>{});
    toast(msgError(e)); btn.disabled=false; btn.textContent='💾 Guardar';
  }finally{recs.subiendo=false;}
}
async function recBorrar(clave){
  const x=recLista().find(y=>y.clave===clave); if(!x) return;
  if(!await confirmar(x.base?'¿Volver este recurso a como venía en la app? Se pierden los cambios.':'¿Borrar este recurso?')) return;
  try{
    const prev=recs.filas[clave];
    chk(await sb.from('recursos').delete().eq('clave',clave));
    if(prev?.archivo) sb.storage.from('recursos').remove([prev.archivo]).catch(()=>{});
    toast(x.base?'↩️ Volvió a la versión de la app':'🗑️ Recurso borrado');
    recs.editando=null; await cargarRecursos(); renderRecursos();
  }catch(e){toast(msgError(e));}
}
