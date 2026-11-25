// ════════════════════════════════════════════════
// USO EN EL CELULAR
// - Barra de navegación abajo, con 3 o 4 botones según el rol; el resto de las pestañas,
//   el perfil y "Salir" van en "Más".
// - En el proyecto: la acción principal queda fija abajo (como en la nota de pedido) y las
//   secciones se abren y cierran; de entrada quedan abiertas las que le sirven a cada rol.
// - Parte diario rápido: avance con botones, personas y horas del día anterior, y fotos.
// ════════════════════════════════════════════════
const VISTAS={
  dashboard:{i:'🏠',t:'Hoy'}, proyectos:{i:'📋',t:'Proyectos'}, kanban:{i:'📊',t:'Kanban'}, alertas:{i:'🚨',t:'Avisos'},
  pedidos:{i:'🛠️',t:'Órdenes'}, stock:{i:'🗃️',t:'Stock'}, personal:{i:'👷',t:'Personal'}, contenedores:{i:'📦',t:'Contenedores'},
  materiales:{i:'🔧',t:'Materiales'}, costos:{i:'🔒',t:'Costos'}, usuarios:{i:'👤',t:'Usuarios'}, reportes:{i:'📈',t:'Reportes'},
  sugerencias:{i:'💡',t:'Sugerencias'}, recursos:{i:'🎬',t:'Recursos'}, crm:{i:'🎯',t:'CRM'},
};
// Lo de todos los días va en la barra; lo ocasional, en "Más"
const BNAV={
  supervisor:['dashboard','proyectos','pedidos','alertas'],
  ventas:['dashboard','crm','proyectos','recursos'],
  lider_ventas:['crm','sugerencias','recursos'],
  arquitectura:['dashboard','proyectos','recursos'],
  lider:['dashboard','proyectos','alertas','materiales'],
  admin:['dashboard','proyectos','alertas','costos'],
  lectura:['dashboard','proyectos','reportes'],
  carp_aluminio:['pedidos','stock','alertas'],
  carp_madera:['pedidos','stock','alertas'],
  tecnico_aires:['pedidos','alertas','recursos'],
};
function barraDeRol(){const t=tabsPermitidas();return (BNAV[rol()]||t.slice(0,3)).filter(v=>t.includes(v));}
const sinPlano=p=>!!(p&&p.ficha&&p.ficha.arq==='No');
let badgeHoy=0;

function pintarBnav(){
  const el=document.getElementById('bnav'); if(!el||!currentUser) return;
  const barra=barraDeRol(), resto=tabsPermitidas().filter(v=>!barra.includes(v));
  el.innerHTML=barra.map(v=>`<button class="bn-btn${v===vistaActual?' on':''}" onclick="showView('${v}')" data-bview="${v}">
      <span class="bn-i"><i>${VISTAS[v]?.i||'•'}</i>${(()=>{const n=v==='dashboard'?badgeHoy:v==='crm'&&typeof crmPendHoy==='function'&&rol()!=='ventas'?crmPendHoy():v==='pedidos'&&typeof pcPendientes==='function'?pcPendientes():0;return n?`<b class="bn-badge">${n>9?'9+':n}</b>`:''})()}</span><span class="bn-t">${v==='pedidos'&&typeof miTaller==='function'&&miTaller()?'Órdenes':VISTAS[v]?.t||v}</span></button>`).join('')
    +`<button class="bn-btn${resto.includes(vistaActual)?' on':''}" onclick="abrirMas()"><span class="bn-i"><i>☰</i></span><span class="bn-t">Más</span></button>`;
  document.body.classList.add('con-bnav');
}
function pintarBadgeHoy(n){badgeHoy=n||0;pintarBnav();}

function abrirMas(){
  if(!currentUser) return;
  const barra=barraDeRol(), resto=tabsPermitidas().filter(v=>!barra.includes(v));
  const ini=(currentUser.nombre||'?').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('mas-content').innerHTML=`
    <div class="mas-perfil"><div class="avatar">${esc(ini)}</div>
      <div><div class="persona-nombre">${esc(currentUser.nombre)}</div><div class="persona-rol">${esc(ROLES[currentUser.rol]||currentUser.rol)}${miEmail?' · '+esc(miEmail):''}</div></div></div>
    ${resto.length?`<div class="mas-lista">${resto.map(v=>`<button class="mas-item${v===vistaActual?' on':''}" onclick="closeOverlay('m-mas');showView('${v}')">
      <span>${VISTAS[v]?.i||'•'}</span>${VISTAS[v]?.t||v}</button>`).join('')}</div>`:''}
    <button class="btn btn-sec" style="margin-top:14px" onclick="salirConfirmado()">🚪 Salir de la cuenta</button>`;
  openOverlay('m-mas');
}
async function salirConfirmado(){
  closeOverlay('m-mas');
  if(await confirmar('¿Salir de tu cuenta? Para volver a entrar vas a necesitar tu correo y contraseña.')) doLogout();
}

// Título de la pantalla en el encabezado y botón activo en la barra
const _showView=showView;
showView=function(name){
  _showView(name);
  const v=VISTAS[vistaActual];
  const h=document.getElementById('header-tit'); if(h) h.textContent=v?v.t:'BoxTainer';
  pintarBnav();
  window.scrollTo(0,0); const sa=document.getElementById('screen-app'); if(sa) sa.scrollTop=0;
};
const _pintarHeader=pintarHeader;
pintarHeader=function(){
  _pintarHeader();
  const b=document.getElementById('btn-salir');
  if(b&&currentUser) b.textContent=(currentUser.nombre||'?').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
};

// ── barra fija de abajo en el proyecto ──
function pintarPie(pie){
  const el=document.getElementById('det-pie'); if(!el) return;
  const b=(x,cls)=>`<button class="btn ${x.c||cls}" onclick="${x.f}">${x.t}</button>`;
  let h='';
  if(pie.principal) h+=b(pie.principal,'btn-nar');
  if(pie.segunda) h+=`<button class="btn btn-sec det-seg" onclick="${pie.segunda.f}">${pie.segunda.t}</button>`;
  if(!pie.principal) h+=`<button class="btn btn-sec" onclick="closeOverlay('m-det')">Cerrar</button>`;
  if(pie.menu.length){
    h+=`<button class="btn btn-sec det-mas" onclick="document.getElementById('det-menu').classList.toggle('on')" aria-label="Más acciones">⋯</button>
      <div class="det-menu" id="det-menu">${pie.menu.map(x=>`<button class="${x.c==='rojo'?'rojo':''}" onclick="document.getElementById('det-menu').classList.remove('on');${x.f}">${x.t}</button>`).join('')}
        <button onclick="document.getElementById('det-menu').classList.remove('on');closeOverlay('m-det')">Cerrar el proyecto</button></div>`;
  }
  el.innerHTML=h;
}

// ── secciones del proyecto que se abren y cierran ──
const SEC_CLAVES=[['Información','info'],['Planos','planos'],['Costos','costos'],['Materiales','mp'],['Pedidos a carpinterías','pc'],
  ['Nota de pedido','nota'],['Ficha técnica','nota'],['Costeo','costeo'],['Consultas','consultas'],['Errores','errores'],
  ['Faltantes','faltantes'],['Contenedores','conts'],['Historial','hist'],['Recorrido','rec']];
function claveSec(h3){
  const t=h3.textContent.replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ]+/,'');
  const k=SEC_CLAVES.find(([n])=>t.startsWith(n)); return k?k[1]:t.slice(0,20);
}
function secAbiertasDe(p){
  const r=rol(), e=etapaDe(p);
  if(r==='supervisor') return ['mp','faltantes','pc','planos'];
  if(r==='ventas') return ['nota','consultas'];
  if(r==='arquitectura') return ['nota','planos'];
  if(r==='lectura') return ['info','hist'];
  const op=e==='asignacion'?['mp','planos']:e==='ejecucion'?['mp','faltantes','hist','pc']:['nota','planos'];
  return r==='admin'?op.concat(['costeo','costos']):op;
}
let secElegidas={};
try{secElegidas=JSON.parse(localStorage.getItem('bt-secciones')||'{}');}catch(e){}
function guardarSecElegidas(){try{localStorage.setItem('bt-secciones',JSON.stringify(secElegidas));}catch(e){}}
function plegarSecciones(root,p,forzar){
  if(!root||!p) return;
  const base=secAbiertasDe(p), pref=secElegidas[rol()]||{};
  root.querySelectorAll(':scope > .dsec').forEach(sec=>{
    if(sec.dataset.pl) return;
    const h3=sec.querySelector(':scope > h3'); if(!h3) return;
    const k=claveSec(h3); sec.dataset.pl=k;
    // abierta si: el rol la usa, la persona la dejó abierta, o tiene algo esperando
    let abierta=base.includes(k);
    if(k==='consultas'&&sec.querySelector('.consulta.abierta,.consulta.tarde,textarea')) abierta=true;
    if(k==='faltantes'&&/\((?!0 )\d+ abierto/.test(h3.textContent)) abierta=true;
    if(k in pref) abierta=pref[k];
    if(forzar&&k in forzar) abierta=forzar[k];
    sec.classList.add('plegable'); sec.classList.toggle('plegada',!abierta);
    h3.setAttribute('role','button'); h3.setAttribute('aria-expanded',abierta?'true':'false');
    h3.onclick=ev=>{
      if(ev.target.closest('button,a,input,select,label')) return;
      const ab=sec.classList.toggle('plegada')===false;
      h3.setAttribute('aria-expanded',ab?'true':'false');
      (secElegidas[rol()]=secElegidas[rol()]||{})[k]=ab; guardarSecElegidas();
    };
  });
}

// ── parte diario ──
function avanceUpd(v,desdeNumero){
  let n=Math.round(Number(v)||0); n=Math.min(100,Math.max(0,n));
  const num=document.getElementById('upd-av'), rg=document.getElementById('upd-av-r'), lb=document.getElementById('upd-av-lbl');
  if(!desdeNumero||String(n)!==num.value) num.value=n;
  if(rg) rg.value=n; if(lb) lb.textContent=n+'%';
}
const MAX_FOTOS=4;
let fotosUpdArr=[];
function limpiarFotosUpd(){fotosUpdArr.forEach(f=>URL.revokeObjectURL(f.url));fotosUpdArr=[];pintarFotosUpd();}
function pintarFotosUpd(){
  const el=document.getElementById('upd-fotos'); if(!el) return;
  el.innerHTML=fotosUpdArr.map((f,i)=>`<div class="uf"><img src="${f.url}" alt="Foto ${i+1}"><button type="button" onclick="quitarFotoUpd(${i})" aria-label="Quitar foto">✕</button></div>`).join('');
  const b=document.getElementById('upd-foto-btn'); if(b) b.style.display=fotosUpdArr.length>=MAX_FOTOS?'none':'';
}
function quitarFotoUpd(i){const f=fotosUpdArr.splice(i,1)[0];if(f)URL.revokeObjectURL(f.url);pintarFotosUpd();}
// Las fotos del celular pesan varios MB: se achican a 1600 px antes de subir (menos datos en la obra)
async function achicarFoto(file){
  try{
    const img=await createImageBitmap(file);
    const k=Math.min(1,1600/Math.max(img.width,img.height));
    const c=document.createElement('canvas'); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.75));
    return blob||file;
  }catch(e){return file;}
}
async function fotosUpd(input){
  const fs=[...(input.files||[])]; input.value='';
  for(const f of fs){
    if(fotosUpdArr.length>=MAX_FOTOS){toast(`Hasta ${MAX_FOTOS} fotos por parte`);break;}
    if(!/^image\//.test(f.type)) continue;
    const blob=await achicarFoto(f);
    fotosUpdArr.push({blob,url:URL.createObjectURL(blob)});
  }
  pintarFotosUpd();
}
async function subirFotosUpd(pid){
  if(!fotosUpdArr.length) return [];
  toast('⬆️ Subiendo fotos…');
  const rutas=[];
  for(const f of fotosUpdArr){
    const ruta=`${pid}/avance/${nuevoId()}.jpg`;
    const r=await sb.storage.from('planos').upload(ruta,f.blob,{contentType:'image/jpeg',upsert:false});
    if(r&&r.error){
      const m=String(r.error.message||'');
      throw /row-level|security|policy|Unauthorized|403/i.test(m)?{message:'Para subir fotos hay que correr la migración 0016 en Supabase'}:r.error;
    }
    rutas.push(ruta);
  }
  return rutas;
}

// Si ya había alguien adentro cuando cargó este archivo, se arma la barra
if(currentUser){pintarHeader();showView(vistaActual);}
