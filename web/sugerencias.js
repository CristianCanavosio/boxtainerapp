// ════════════════════════════════════════════════
// BUZÓN DE SUGERENCIAS DE MEJORA
// Cualquier usuario carga una idea con texto, fotos y/o nota de audio. La base guarda la sugerencia y
// manda un correo al responsable de mejoras con los adjuntos (ver 0014_buzon_de_sugerencias.sql).
// Cada uno ve las suyas con el estado y la respuesta; el administrador ve todas y las gestiona.
// ════════════════════════════════════════════════
const SUG_MAX_FOTOS=3, SUG_MAX_AUDIO_SEG=180, SUG_URL_DIAS=30;
const SUG_ESTADOS={nueva:{l:'🆕 Nueva',c:'b-azul'},analisis:{l:'🔍 En análisis',c:'b-amar'},
  en_marcha:{l:'🔨 En marcha',c:'b-nar'},hecha:{l:'✅ Hecha',c:'b-verde'},descartada:{l:'⛔ Descartada',c:'b-gris'}};
const sug={fotos:[],audio:null,rec:null,stream:null,chunks:[],t0:0,timer:null,enviando:false,lista:[],correos:{},filtro:'abiertas'};

function sugFormHTML(){
  return `<div class="card">
    <div class="card-title">💡 Contanos tu idea</div>
    <p style="font-size:13px;color:var(--gris-m);margin-bottom:12px">Algo que se pueda hacer mejor, más rápido o más barato: en el taller, en la obra, en la oficina o en esta app. Podés escribir, sacar una foto o grabar un audio.</p>
    <div class="fg"><textarea id="sug-texto" rows="4" maxlength="5000" style="font-family:inherit" placeholder="¿Qué mejorarías y por qué?"></textarea></div>
    <div id="sug-fotos" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"></div>
    <div id="sug-audio" style="margin-bottom:10px"></div>
    <div class="flex-btns" style="display:flex;gap:8px;margin-bottom:12px">
      <label class="btn btn-sec" style="cursor:pointer;flex:1">📷 Foto
        <input type="file" accept="image/*" multiple onchange="sugAgregarFotos(this)" style="display:none"></label>
      <button class="btn btn-sec" style="flex:1" id="sug-btn-rec" onclick="sugGrabar()">🎙️ Grabar audio</button>
    </div>
    <button class="btn btn-nar" style="width:100%" id="sug-enviar" onclick="sugEnviar()">📨 Enviar sugerencia</button>
  </div>`;
}

function renderSugerencias(){
  const el=document.getElementById('sug-content'); if(!el) return;
  if(!document.getElementById('sug-texto')){
    el.innerHTML=sugFormHTML()+`<div id="sug-lista"></div>`;
    sugPintarAdjuntos();
  }
  sugCargarLista();
}

// ── Fotos: se achican en el celular (máx. 1600 px, JPEG) para que suban rápido y entren en el correo
function sugAgregarFotos(input){
  const fs=[...input.files]; input.value='';
  const lugar=SUG_MAX_FOTOS-sug.fotos.length;
  if(fs.length>lugar) toast(`⚠️ Hasta ${SUG_MAX_FOTOS} fotos por sugerencia`);
  fs.slice(0,Math.max(0,lugar)).forEach(async f=>{
    const blob=await sugAchicar(f);
    sug.fotos.push({blob,url:URL.createObjectURL(blob)});
    sugPintarAdjuntos();
  });
}
async function sugAchicar(f){
  try{
    const img=await new Promise((ok,mal)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=mal;i.src=URL.createObjectURL(f);});
    const k=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas'); c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(img.src);
    const b=await new Promise(ok=>c.toBlob(ok,'image/jpeg',0.82));
    return b||f;
  }catch(e){return f;}
}
function sugQuitarFoto(i){URL.revokeObjectURL(sug.fotos[i].url);sug.fotos.splice(i,1);sugPintarAdjuntos();}

// ── Audio: se graba en el navegador (Android: webm, iPhone: mp4). Si el celular no deja, se elige un archivo.
function sugTipoAudio(){
  if(!window.MediaRecorder) return '';
  for(const t of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'])
    if(MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}
async function sugGrabar(){
  if(sug.rec){sug.rec.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){sugElegirAudio();return;}
  try{sug.stream=await navigator.mediaDevices.getUserMedia({audio:true});}
  catch(e){toast('⚠️ No se pudo usar el micrófono: revisá el permiso del navegador');return;}
  const tipo=sugTipoAudio();
  sug.rec=new MediaRecorder(sug.stream,tipo?{mimeType:tipo}:undefined);
  sug.chunks=[];
  sug.rec.ondataavailable=e=>{if(e.data&&e.data.size) sug.chunks.push(e.data);};
  sug.rec.onstop=()=>{
    const t=(sug.rec.mimeType||tipo||'audio/webm').split(';')[0];
    const blob=new Blob(sug.chunks,{type:t});
    sug.stream.getTracks().forEach(x=>x.stop());
    clearInterval(sug.timer); sug.rec=null; sug.stream=null;
    if(sug.audio) URL.revokeObjectURL(sug.audio.url);
    sug.audio={blob,url:URL.createObjectURL(blob),seg:Math.round((Date.now()-sug.t0)/1000)};
    sugPintarAdjuntos();
  };
  sug.rec.start(1000); sug.t0=Date.now();
  sug.timer=setInterval(()=>{
    const s=Math.round((Date.now()-sug.t0)/1000);
    const b=document.getElementById('sug-btn-rec'); if(b) b.textContent=`⏹️ Detener (${Math.floor(s/60)}:${String(s%60).padStart(2,'0')})`;
    if(s>=SUG_MAX_AUDIO_SEG){toast('⏱️ Máximo 3 minutos por audio');sug.rec?.stop();}
  },500);
  sugPintarAdjuntos();
}
function sugElegirAudio(){
  const i=document.createElement('input'); i.type='file'; i.accept='audio/*';
  i.onchange=()=>{const f=i.files[0]; if(!f) return;
    if(f.size>20*1024*1024){toast('⚠️ El audio supera 20 MB');return;}
    if(sug.audio) URL.revokeObjectURL(sug.audio.url);
    sug.audio={blob:f,url:URL.createObjectURL(f),nombre:f.name}; sugPintarAdjuntos();};
  i.click();
}
function sugQuitarAudio(){if(sug.audio) URL.revokeObjectURL(sug.audio.url); sug.audio=null; sugPintarAdjuntos();}

function sugPintarAdjuntos(){
  const f=document.getElementById('sug-fotos'), a=document.getElementById('sug-audio'), b=document.getElementById('sug-btn-rec');
  if(f) f.innerHTML=sug.fotos.map((x,i)=>`<div style="position:relative">
      <img src="${x.url}" style="width:84px;height:84px;object-fit:cover;border-radius:10px;border:1.5px solid var(--borde)">
      <button onclick="sugQuitarFoto(${i})" style="position:absolute;top:-6px;right:-6px;border:none;border-radius:50%;width:24px;height:24px;background:var(--rojo);color:white;font-weight:800">×</button></div>`).join('');
  if(a) a.innerHTML=sug.rec?`<div style="color:var(--rojo);font-weight:700;font-size:13px">🔴 Grabando… hablá cerca del celular</div>`
    :sug.audio?`<div style="display:flex;align-items:center;gap:8px"><audio controls src="${sug.audio.url}" style="flex:1;max-width:100%"></audio>
      <button class="btn btn-sm btn-sec" onclick="sugQuitarAudio()">🗑️</button></div>`:'';
  if(b&&!sug.rec) b.textContent=sug.audio?'🎙️ Grabar de nuevo':'🎙️ Grabar audio';
}

function sugExt(tipo){return {'audio/mp4':'m4a','audio/x-m4a':'m4a','audio/webm':'webm','audio/ogg':'ogg','audio/mpeg':'mp3','audio/wav':'wav','audio/aac':'aac'}[tipo]||'audio';}
function sugLimpio(n){return String(n).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-60);}

async function sugEnviar(){
  if(sug.enviando) return;
  if(sug.rec){toast('⚠️ Primero detené la grabación');return;}
  const texto=(document.getElementById('sug-texto')?.value||'').trim();
  if(!texto&&!sug.fotos.length&&!sug.audio){toast('⚠️ Escribí algo, sacá una foto o grabá un audio');return;}
  const btn=document.getElementById('sug-enviar');
  sug.enviando=true; if(btn){btn.disabled=true;btn.textContent='⬆️ Enviando…';}
  const id=nuevoId(), adjuntos=[], subidos=[];
  try{
    const arch=sug.fotos.map((x,i)=>({tipo:'foto',blob:x.blob,nombre:`foto-${i+1}.${x.blob.type==='image/jpeg'?'jpg':((x.blob.type||'').split('/')[1]||'jpg').replace(/[^a-z0-9]/gi,'')}`}));
    if(sug.audio){const t=(sug.audio.blob.type||'').split(';')[0];
      arch.push({tipo:'audio',blob:sug.audio.blob,nombre:sug.audio.nombre?sugLimpio(sug.audio.nombre):`nota-de-audio.${sugExt(t)}`});}
    for(const x of arch){
      const ruta=`${myId}/${id}/${x.nombre}`;
      chk(await sb.storage.from('sugerencias').upload(ruta,x.blob,{contentType:x.blob.type||'application/octet-stream',upsert:false}));
      subidos.push(ruta);
      const {data,error}=await sb.storage.from('sugerencias').createSignedUrl(ruta,SUG_URL_DIAS*86400);
      if(error) throw error;
      adjuntos.push({tipo:x.tipo,nombre:x.nombre,ruta,url:data.signedUrl});
    }
    chk(await sb.from('sugerencias').insert({id,autor:myId,texto,adjuntos}));
    sug.fotos.forEach(x=>URL.revokeObjectURL(x.url)); sug.fotos=[]; sugQuitarAudio();
    document.getElementById('sug-texto').value='';
    toast('✅ ¡Gracias! Tu sugerencia fue enviada');
    sugCargarLista();
  }catch(e){
    toast(msgError(e));
    if(subidos.length) sb.storage.from('sugerencias').remove(subidos).catch(()=>{});
  }finally{
    sug.enviando=false; if(btn){btn.disabled=false;btn.textContent='📨 Enviar sugerencia';}
  }
}

// ── Listado: el autor ve las suyas; el administrador, todas con estado, respuesta y estado del correo
async function sugCargarLista(){
  const {data,error}=await sb.from('sugerencias').select('*').order('creado_en',{ascending:false}).limit(300);
  if(error){const l=document.getElementById('sug-lista'); if(l) l.innerHTML=`<div class="card">⚠️ No se pudieron leer las sugerencias. ¿Se corrió la migración 0014?</div>`; return;}
  sug.lista=data||[];
  if(rol()==='admin'){
    const r=await sb.rpc('estado_correos_sugerencias');
    sug.correos={}; (r.data||[]).forEach(x=>sug.correos[x.id]=x);
  }
  sugPintarLista();
}
function sugFecha(ts){const d=new Date(ts);return d.toLocaleDateString('es-AR')+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});}
function sugCorreo(s){
  if(!s.correo_req) return `<span style="color:var(--rojo)">✉️ Sin enviar (falta la clave de Resend)</span>`;
  const c=sug.correos[s.id];
  if(!c) return `✉️ Enviado ${sugFecha(s.correo_enviado_en||s.creado_en)}`;
  if(c.status_code>=200&&c.status_code<300) return `<span style="color:var(--verde)">✉️ Correo entregado a Resend</span>`;
  return `<span style="color:var(--rojo)" title="${esc(c.error||'')}">✉️ Falló el correo${c.status_code?' ('+c.status_code+')':''}: ${esc((c.error||'').slice(0,120))}</span>`;
}
function sugPintarLista(){
  const l=document.getElementById('sug-lista'); if(!l) return;
  const admin=rol()==='admin';
  let xs=sug.lista;
  if(admin&&sug.filtro==='abiertas') xs=xs.filter(s=>!['hecha','descartada'].includes(s.estado));
  const chips=admin?`<div class="chips" style="margin-bottom:8px">
      ${[['abiertas','Abiertas'],['todas','Todas']].map(([k,t])=>`<div class="chip ${sug.filtro===k?'active':''}" onclick="sug.filtro='${k}';sugPintarLista()">${t}</div>`).join('')}</div>`:'';
  const titulo=admin?`📥 Sugerencias del equipo (${sug.lista.filter(s=>s.estado==='nueva').length} nuevas)`:'🗂️ Mis sugerencias';
  l.innerHTML=`<div class="sec-title" style="margin-top:6px">${titulo}</div>${chips}`+(xs.length?xs.map(s=>{
    const e=SUG_ESTADOS[s.estado]||SUG_ESTADOS.nueva;
    const adj=(s.adjuntos||[]).map(a=>a.tipo==='audio'
      ?`<button class="btn btn-sm btn-sec" style="margin:6px 6px 0 0" data-ruta="${esc(a.ruta)}" onclick="sugEscuchar(this)">🎙️ Escuchar audio</button>`
      :`<a href="#" onclick="sugAbrir(event,'${esc(a.ruta)}')" class="btn btn-sm btn-sec" style="margin:6px 6px 0 0">📷 ${esc(a.nombre)}</a>`).join('');
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;color:var(--gris-m)">${admin?`<b>${esc(s.autor_nombre)}</b> · ${esc(s.autor_rol)} · `:''}${sugFecha(s.creado_en)}</span>
        <span class="badge ${e.c}">${e.l}</span></div>
      ${s.texto?`<div style="white-space:pre-wrap;font-size:14px">${esc(s.texto)}</div>`:''}
      <div>${adj}</div>
      ${admin?`<div style="margin-top:10px;font-size:12px">${sugCorreo(s)}</div>
        <div class="fg" style="margin-top:10px"><label>Estado</label>
          <select id="sug-est-${s.id}">${Object.entries(SUG_ESTADOS).map(([k,v])=>`<option value="${k}" ${k===s.estado?'selected':''}>${v.l}</option>`).join('')}</select></div>
        <div class="fg"><label>Respuesta para ${esc(s.autor_nombre||'el autor')} (la ve en la app)</label>
          <textarea id="sug-resp-${s.id}" rows="2">${esc(s.respuesta)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-nar" onclick="sugGuardar('${s.id}')">💾 Guardar</button>
          <button class="btn btn-sm btn-sec" onclick="sugReenviar('${s.id}')">✉️ Reenviar correo</button></div>`
      :s.respuesta?`<div style="margin-top:10px;padding:10px;background:var(--gris-l);border-radius:10px;font-size:13px"><b>Respuesta:</b> ${esc(s.respuesta)}</div>`:''}
    </div>`;}).join(''):`<div class="empty"><div class="em">💡</div><h3>${admin?'No hay sugerencias':'Todavía no mandaste sugerencias'}</h3><p>${admin?'Cuando alguien cargue una, aparece acá y te llega por correo.':'Las que mandes aparecen acá con su estado.'}</p></div>`);
}
async function sugAbrir(ev,ruta){
  ev.preventDefault();
  const w=window.open('','_blank');
  const {data,error}=await sb.storage.from('sugerencias').createSignedUrl(ruta,600);
  if(error||!data){if(w)w.close();toast('⚠️ No se pudo abrir el archivo');return;}
  if(w) w.location=data.signedUrl; else location.href=data.signedUrl;
}
async function sugEscuchar(btn){
  const {data,error}=await sb.storage.from('sugerencias').createSignedUrl(btn.dataset.ruta,600);
  if(error||!data){toast('⚠️ No se pudo abrir el audio');return;}
  const a=document.createElement('audio'); a.controls=true; a.src=data.signedUrl; a.style.cssText='width:100%;margin-top:6px';
  btn.replaceWith(a); a.play().catch(()=>{});
}
async function sugGuardar(id){
  const estado=document.getElementById('sug-est-'+id).value, respuesta=document.getElementById('sug-resp-'+id).value.trim();
  try{chk(await sb.from('sugerencias').update({estado,respuesta}).eq('id',id)); toast('✅ Guardado'); sugCargarLista();}
  catch(e){toast(msgError(e));}
}
async function sugReenviar(id){
  try{chk(await sb.rpc('reenviar_sugerencia',{sug:id})); toast('✉️ Correo reenviado'); setTimeout(sugCargarLista,4000);}
  catch(e){toast(msgError(e));}
}
