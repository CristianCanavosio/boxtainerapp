// ════════════════════════════════════════════════
// BoxTainer Gestión Pro — versión Supabase
// Los datos viven en Supabase (PostgreSQL). Los permisos por rol los aplica la base
// (Row Level Security): cada celular solo recibe lo que su rol puede ver.
// ════════════════════════════════════════════════
const MODO='nube';
const sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_KEY);
const LS={ // solo para preferencias del dispositivo
  g:(k)=>{try{return JSON.parse(localStorage.getItem('bxt2_'+k))||[]}catch{return[]}},
  s:(k,v)=>{try{localStorage.setItem('bxt2_'+k,JSON.stringify(v))}catch(e){}}
};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),3200)}
function isoLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function hoyISO(){return isoLocal(new Date())}
function nuevoId(){return crypto.randomUUID()}
function limpiar(o){return JSON.parse(JSON.stringify(o))}
function usd(n){return 'USD '+Math.round(Number(n)||0).toLocaleString('es-AR')}

let myId=null, soyOwner=false, miNombre='', miEmail='';
const cassets={}; // los planos se suben al depósito privado "planos" de Supabase
let todos={};          // id -> proyecto (los que la base deja ver a este usuario)
let ORIG={};           // id -> copia tal como vino de la base (para guardar solo lo que cambió)
let proyectos=[];
let personal=[], contenedores=[], materiales=[];
let ORIGL={personal:{},contenedores:{},materiales:{}};
let perfiles={};       // uid -> {nombre,rol,email,creado_en}
let roles={};          // uid -> {rol,nombre}   (con rol asignado)
let solicitudes={};    // uid -> {nombre,fecha,email} (pendientes)
let miSolicitud=null, usuarios=[];
let currentUser=null;
let filtroEstado='todos';
let vistaActual='dashboard';

const ROLES={admin:'👑 Administrador',lider:'🧭 Líder de operaciones',supervisor:'🔨 Supervisor',
  ventas:'💼 Ventas',arquitectura:'📐 Arquitectura',lectura:'👁️ Solo lectura'};
const TABS={
  admin:['dashboard','proyectos','kanban','alertas','personal','contenedores','materiales','costos','usuarios','reportes'],
  lider:['dashboard','proyectos','kanban','alertas','personal','contenedores','materiales','reportes'],
  supervisor:['dashboard','proyectos','kanban','alertas','materiales'],
  ventas:['dashboard','proyectos'],
  arquitectura:['dashboard','proyectos'],
  lectura:['dashboard','proyectos','kanban','reportes'],
};
const ETAPA={
  ventas:{label:'💼 En ventas',cls:'b-azul'},
  arquitectura:{label:'📐 En arquitectura',cls:'b-morado'},
  asignacion:{label:'🧭 Por asignar',cls:'b-amar'},
  ejecucion:{label:'🔨 En ejecución',cls:'b-nar'},
};
const RUBROS={mat:'Materiales',mo:'Mano de obra',ter:'Terceros',otr:'Otros'};
function etapaDe(p){return p.etapa||'ejecucion'}
function rol(){return currentUser?.rol||''}
function esOp(){return rol()==='admin'||rol()==='lider'}
function nombreDe(uid){
  if(!uid) return '';
  const x=perfiles[uid];
  return (x&&(x.nombre||x.email)) || (uid===myId?(miNombre||miEmail):'') || 'Usuario';
}
function supNombre(p){return p.supId?nombreDe(p.supId):(p.sup||'')}
// La base ya filtra; esto solo evita mostrar algo de más entre una recarga y otra
function puedeVer(p){
  const r=rol(); if(!r) return false;
  if(r==='admin'||r==='lider'||r==='lectura') return true;
  if(r==='supervisor') return p.supId===myId;
  if(r==='ventas') return p.creadoPorId===myId||p.vendId===myId;
  if(r==='arquitectura') return etapaDe(p)==='arquitectura'||(p.planos||[]).some(x=>x.autorId===myId);
  return false;
}
function recalcular(){
  proyectos=Object.values(todos).filter(puedeVer).sort((a,b)=>(b.creadoTs||0)-(a.creadoTs||0));
}

// ════════════════════════════════════════════════
// LECTURA DESDE SUPABASE
// ════════════════════════════════════════════════
function chk(r){if(r&&r.error) throw r.error; return r;}
async function traer(tabla){
  let out=[], i=0;
  for(;;){
    const {data,error}=await sb.from(tabla).select('*').order('creado_en',{ascending:true,nullsFirst:true}).range(i,i+999);
    if(error) throw error;
    out=out.concat(data||[]);
    if(!data||data.length<1000) break;
    i+=1000;
  }
  return out;
}
async function traerSinOrden(tabla){
  let out=[], i=0;
  for(;;){
    const {data,error}=await sb.from(tabla).select('*').range(i,i+999);
    if(error) throw error;
    out=out.concat(data||[]);
    if(!data||data.length<1000) break;
    i+=1000;
  }
  return out;
}
const ts=x=>x?new Date(x).getTime():null;
const fechaDe=x=>x?isoLocal(new Date(x)):'';

async function cargarPerfiles(){
  const ps=await traer('perfiles');
  perfiles={}; roles={}; solicitudes={};
  ps.forEach(x=>{
    perfiles[x.id]={nombre:x.nombre||'',rol:x.rol,email:x.email||'',creado_en:x.creado_en};
    if(x.rol==='pendiente') solicitudes[x.id]={nombre:x.nombre||x.email||'',fecha:fechaDe(x.creado_en),email:x.email||''};
    else roles[x.id]={rol:x.rol,nombre:x.nombre||x.email||''};
  });
}
function aApp(r){
  const verif=(por,en)=>por?{fecha:fechaDe(en),autor:nombreDe(por),autorId:por}:null;
  return {id:r.id,nombre:r.nombre,cli:r.cliente,tipo:r.tipo||'',etapa:r.etapa,estado:r.estado,avance:r.avance||0,
    val:r.valor_venta??'',creadoTs:ts(r.creado_en),creadoPorId:r.creado_por,creadoPor:nombreDe(r.creado_por),creadoEn:fechaDe(r.creado_en),
    vendId:r.vendedor_id,vend:r.vendedor||(r.vendedor_id?nombreDe(r.vendedor_id):''),
    supId:r.supervisor_id,sup:r.supervisor_id?nombreDe(r.supervisor_id):'',
    inicio:r.inicio||'',entrega:r.entrega||'',pers:r.personas||0,dep:r.deposito||'',pri:r.prioridad||'normal',obs:r.observaciones||'',
    ficha:r.ficha&&Object.keys(r.ficha).length?r.ficha:null,notaArq:r.nota_arquitectura||'',
    verifArq:verif(r.plano_verificado_por,r.plano_verificado_en),stockVerif:verif(r.stock_verificado_por,r.stock_verificado_en),
    historial:[],costos:[],planos:[],flujo:[],consultas:[],incidencias:[],faltantes:[]};
}
async function cargarTodo(){
  await cargarPerfiles();
  const r0=perfiles[myId]?.rol;
  if(!r0||r0==='pendiente'){todos={};ORIG={};recalcular();return;}
  const op=['admin','lider','lectura'].includes(r0);
  const [ps,pres,pl,co,ac,cs,inc,fa,rec,pe,ct,ma]=await Promise.all([
    traer('proyectos'),traerSinOrden('presupuestos'),traer('planos'),traer('costos'),traer('actualizaciones'),
    traer('consultas'),traer('incidencias'),traer('faltantes'),traer('recorrido'),
    op?traerSinOrden('personal'):[],op?traerSinOrden('contenedores'):[],traerSinOrden('materiales')]);
  const T={};
  ps.forEach(r=>{T[r.id]=aApp(r)});
  const en=(pid,fn)=>{const p=T[pid]; if(p) fn(p);};
  pres.forEach(r=>en(r.proyecto_id,p=>{p.presup={mat:Number(r.materiales)||0,mo:Number(r.mano_obra)||0,ter:Number(r.terceros)||0,otr:Number(r.otros)||0}}));
  pl.forEach(r=>en(r.proyecto_id,p=>p.planos.push({id:r.id,nombre:r.nombre,archivo:r.archivo||null,enlace:!r.archivo,url:r.enlace||'',
    fecha:fechaDe(r.creado_en),autorId:r.autor_id,ts:ts(r.creado_en)})));
  co.forEach(r=>en(r.proyecto_id,p=>p.costos.push({id:r.id,rubro:r.rubro,importe:Number(r.importe)||0,desc:r.descripcion,
    fecha:r.fecha,autor:nombreDe(r.autor_id),ts:ts(r.creado_en)})));
  ac.forEach(r=>en(r.proyecto_id,p=>p.historial.push({id:r.id,ts:ts(r.creado_en),fecha:fechaDe(r.creado_en),avance:r.avance,
    texto:r.texto,est:r.estado,autor:nombreDe(r.autor_id)})));
  cs.forEach(r=>en(r.proyecto_id,p=>p.consultas.push({id:r.id,texto:r.texto,para:r.para,ts:ts(r.creado_en),deId:r.de_id,
    deNombre:nombreDe(r.de_id),incidencia:!!r.es_error,respuesta:r.respuesta||'',respTs:ts(r.respondida_en),
    respId:r.respondida_por,respNombre:r.respondida_por?nombreDe(r.respondida_por):''})));
  inc.forEach(r=>en(r.proyecto_id,p=>p.incidencias.push({id:r.id,tipo:r.tipo,origen:r.origen,desc:r.descripcion,frena:!!r.frena,
    ts:ts(r.creado_en),fecha:fechaDe(r.creado_en),autorId:r.autor_id,autor:nombreDe(r.autor_id),vend:p.vend||''})));
  fa.forEach(r=>en(r.proyecto_id,p=>p.faltantes.push({id:r.id,mat:r.material,cant:r.cantidad||'',para:r.para_fecha||'',frena:!!r.frena,
    ts:ts(r.creado_en),autor:nombreDe(r.autor_id),resuelto:!!r.resuelto_en,resTs:ts(r.resuelto_en),
    resAutor:r.resuelto_por?nombreDe(r.resuelto_por):''})));
  rec.sort((a,b)=>a.id-b.id).forEach(r=>en(r.proyecto_id,p=>p.flujo.push({fecha:fechaDe(r.creado_en),a:r.a_etapa,
    autor:r.detalle||nombreDe(r.autor_id)})));
  todos=T; ORIG={}; for(const id in T) ORIG[id]=limpiar(T[id]);
  await cargarCosteo();
  personal=pe.map(r=>({id:r.id,nom:r.nombre,rol:r.rol||'',tel:r.telefono||''}));
  contenedores=ct.map(r=>({id:r.id,cod:r.codigo,tipo:r.tipo||'',estado:r.estado||'',proyId:r.proyecto_id,obs:r.observaciones||''}));
  materiales=ma.map(r=>({id:r.id,nom:r.nombre,cant:r.cantidad||'',est:r.estado,proyId:r.proyecto_id}));
  ORIGL={personal:{},contenedores:{},materiales:{}};
  personal.forEach(x=>ORIGL.personal[x.id]=JSON.stringify(x));
  contenedores.forEach(x=>ORIGL.contenedores[x.id]=JSON.stringify(x));
  materiales.forEach(x=>ORIGL.materiales[x.id]=JSON.stringify(x));
  recalcular();
}

// ════════════════════════════════════════════════
// GUARDADO (solo se manda lo que cambió)
// ════════════════════════════════════════════════
function msgError(e){
  console.error(e);
  const m=(e&&e.message)||'';
  if(e&&e.code==='P0001') return '⚠️ '+m;                       // reglas de negocio de la base
  if(e&&(e.code==='42501'||/row-level security|permission/i.test(m))) return '⚠️ No tenés permiso para guardar esto';
  if(/fetch|network|Failed/i.test(m)) return '⚠️ Sin conexión. Revisá internet y probá de nuevo';
  return '⚠️ No se pudo guardar: '+m;
}
function aFila(p){
  return {nombre:p.nombre,cliente:p.cli,tipo:p.tipo||null,etapa:etapaDe(p),estado:p.estado||'presupuesto',
    avance:Math.min(100,Math.max(0,parseInt(p.avance)||0)),
    valor_venta:(p.val===''||p.val==null)?null:(Number(p.val)||0),
    vendedor_id:p.vendId||null,vendedor:p.vend||null,supervisor_id:p.supId||null,
    inicio:p.inicio||null,entrega:p.entrega||null,deposito:p.dep||null,prioridad:p.pri||'normal',
    personas:parseInt(p.pers)||0,observaciones:p.obs||null,ficha:p.ficha||{},nota_arquitectura:p.notaArq||null};
}
const nuevos=(a,b)=>{const ids=new Set((b||[]).map(x=>x.id));return (a||[]).filter(x=>!ids.has(x.id));};
const isoTs=t=>t?new Date(t).toISOString():undefined;
let guardando=0;
async function guardarProyectoOError(p){
  const o=ORIG[p.id]||null;
  todos[p.id]=p; recalcular();
  guardando++;
  try{
    const pid=p.id, ahora=new Date().toISOString();
    const fila=aFila(p);
    if(p.verifArq&&!(o&&o.verifArq)){fila.plano_verificado_por=myId;fila.plano_verificado_en=ahora;}
    if(!p.verifArq&&o&&o.verifArq){fila.plano_verificado_por=null;fila.plano_verificado_en=null;}
    if(p.stockVerif&&!(o&&o.stockVerif)){fila.stock_verificado_por=myId;fila.stock_verificado_en=ahora;}
    if(!o){
      fila.id=pid; fila.creado_por=myId;
      if(p.creadoTs) fila.creado_en=isoTs(p.creadoTs);
      chk(await sb.from('proyectos').insert(fila));
    }
    const ins=async(tabla,filas)=>{if(filas.length) chk(await sb.from(tabla).insert(filas));};
    await ins('planos',nuevos(p.planos,o&&o.planos).map(x=>({id:x.id,proyecto_id:pid,nombre:x.nombre||'Plano',
      archivo:x.archivo||null,enlace:x.archivo?null:(x.url||null)})));
    await ins('costos',nuevos(p.costos,o&&o.costos).map(x=>({id:x.id,proyecto_id:pid,rubro:RUBROS[x.rubro]?x.rubro:'otr',
      importe:Number(x.importe)||0,descripcion:x.desc||'',fecha:x.fecha||hoyISO(),creado_en:isoTs(x.ts)})));
    await ins('actualizaciones',nuevos(p.historial,o&&o.historial).map(x=>({id:x.id,proyecto_id:pid,avance:parseInt(x.avance)||0,
      estado:x.est||p.estado||'en-curso',texto:x.texto||'',creado_en:isoTs(x.ts)})));
    await ins('consultas',nuevos(p.consultas,o&&o.consultas).map(x=>({id:x.id,proyecto_id:pid,para:x.para,texto:x.texto,
      es_error:!!x.incidencia,creado_en:isoTs(x.ts),respuesta:x.respuesta||null,respondida_en:x.respuesta?isoTs(x.respTs||Date.now()):null,
      respondida_por:x.respuesta&&perfiles[x.respId]?x.respId:null})));
    await ins('incidencias',nuevos(p.incidencias,o&&o.incidencias).map(x=>({id:x.id,proyecto_id:pid,tipo:x.tipo,origen:x.origen,
      descripcion:x.desc||'',frena:!!x.frena,creado_en:isoTs(x.ts)})));
    await ins('faltantes',nuevos(p.faltantes,o&&o.faltantes).map(x=>({id:x.id,proyecto_id:pid,material:x.mat,cantidad:x.cant||null,
      para_fecha:x.para||null,frena:!!x.frena,creado_en:isoTs(x.ts),
      resuelto_en:x.resuelto?isoTs(x.resTs||Date.now()):null,resuelto_por:x.resuelto?myId:null})));
    const flujoNuevo=(p.flujo||[]).slice(o?(o.flujo||[]).length:0);
    await ins('recorrido',flujoNuevo.map(x=>({proyecto_id:pid,a_etapa:x.a,
      detalle:(x.autor&&x.autor!==currentUser?.nombre)?x.autor:null})));
    if(o){
      // respuestas a consultas y faltantes resueltos
      const oc={}; (o.consultas||[]).forEach(c=>oc[c.id]=c);
      for(const c of p.consultas||[]) if(oc[c.id]&&!oc[c.id].respuesta&&c.respuesta)
        chk(await sb.from('consultas').update({respuesta:c.respuesta,respondida_por:myId,respondida_en:ahora}).eq('id',c.id));
      const of={}; (o.faltantes||[]).forEach(f=>of[f.id]=f);
      for(const f of p.faltantes||[]) if(of[f.id]&&!of[f.id].resuelto&&f.resuelto)
        chk(await sb.from('faltantes').update({resuelto_por:myId,resuelto_en:ahora}).eq('id',f.id));
      // planos quitados
      const quedan=new Set((p.planos||[]).map(x=>x.id));
      for(const x of o.planos||[]) if(!quedan.has(x.id)){
        chk(await sb.from('planos').delete().eq('id',x.id));
        if(x.archivo) await sb.storage.from('planos').remove([x.archivo]);
      }
      // datos del proyecto: solo columnas que cambiaron
      const antes=aFila(o), cambios={};
      for(const k in fila) if(JSON.stringify(fila[k])!==JSON.stringify(antes[k])) cambios[k]=fila[k];
      if(Object.keys(cambios).length) chk(await sb.from('proyectos').update(cambios).eq('id',pid));
    }
    if(esOp()&&p.presup&&JSON.stringify(p.presup)!==JSON.stringify(o&&o.presup||null)){
      const x=p.presup;
      chk(await sb.from('presupuestos').upsert({proyecto_id:pid,materiales:Number(x.mat)||0,mano_obra:Number(x.mo)||0,
        terceros:Number(x.ter)||0,otros:Number(x.otr)||0}));
    }
    ORIG[pid]=limpiar(p);
  }catch(e){
    toast(msgError(e));
    programarRecarga(300); // vuelve a mostrar lo que realmente quedó guardado
    throw e;
  }finally{guardando--;}
}
// Las funciones que llaman a guardarProyecto no esperan errores: se informan con un aviso
function guardarProyecto(p){return guardarProyectoOError(p).catch(()=>{});}

async function borrarProyecto(id){
  const p=todos[id];
  try{
    const archivos=(p&&p.planos||[]).filter(x=>x.archivo).map(x=>x.archivo);
    chk(await sb.from('proyectos').delete().eq('id',id));
    if(archivos.length) await sb.storage.from('planos').remove(archivos);
    delete todos[id]; delete ORIG[id]; recalcular();
  }catch(e){toast(msgError(e));}
}
// Listas generales: personal, contenedores, materiales
const LISTAS={
  personal:{tabla:'personal',fila:x=>({nombre:x.nom,rol:x.rol||null,telefono:x.tel||null})},
  contenedores:{tabla:'contenedores',fila:x=>({codigo:x.cod,tipo:x.tipo||null,estado:x.estado||null,
    proyecto_id:x.proyId&&todos[x.proyId]?x.proyId:null,observaciones:x.obs||null})},
  materiales:{tabla:'materiales',fila:x=>({nombre:x.nom,cantidad:x.cant||null,estado:x.est||'pendiente',
    proyecto_id:x.proyId&&todos[x.proyId]?x.proyId:null})},
};
async function save(){
  const L={personal,contenedores,materiales};
  guardando++;
  try{
    for(const k in L){
      const {tabla,fila}=LISTAS[k], prev=ORIGL[k], vistos=new Set();
      for(const x of L[k]){
        if(!x.id||typeof x.id!=='string') x.id=nuevoId();
        vistos.add(x.id);
        const j=JSON.stringify(x);
        if(!(x.id in prev)) chk(await sb.from(tabla).insert({id:x.id,...fila(x)}));
        else if(prev[x.id]!==j) chk(await sb.from(tabla).update(fila(x)).eq('id',x.id));
        prev[x.id]=j;
      }
      for(const id of Object.keys(prev)) if(!vistos.has(id)){
        chk(await sb.from(tabla).delete().eq('id',id)); delete prev[id];
      }
    }
  }catch(e){toast(msgError(e)); programarRecarga(300);}
  finally{guardando--;}
}

// ════════════════════════════════════════════════
// ACTUALIZACIÓN EN VIVO
// ════════════════════════════════════════════════
let _recarga=null, canal=null;
function programarRecarga(ms){
  clearTimeout(_recarga);
  _recarga=setTimeout(async()=>{
    if(guardando>0){programarRecarga(600);return;}
    try{
      await cargarTodo();
      decidirAcceso();
    }catch(e){console.error(e);}
  },ms??1200);
}
function suscribir(){
  if(canal) return;
  canal=sb.channel('cambios-boxtainer')
    .on('postgres_changes',{event:'*',schema:'public'},()=>programarRecarga())
    .subscribe();
  // al volver a la app (celular bloqueado, otra pestaña) se trae lo último
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&myId) programarRecarga(200);});
}

// ════════════════════════════════════════════════
// INGRESO: CORREO Y CONTRASEÑA
// ════════════════════════════════════════════════
const URL_APP=location.origin+location.pathname;
function pantallaLogin(estado,msg){
  document.getElementById('screen-login').style.display='flex';
  document.getElementById('screen-app').style.display='none';
  const box=document.getElementById('login-box');
  const err=`<div class="login-error" id="login-err"></div>`;
  if(estado==='cargando'){
    box.innerHTML=`<h2>Conectando…</h2><p>Buscando los datos del equipo</p><div class="loader-mini"></div>`;
  } else if(estado==='login'){
    box.innerHTML=`<h2>Iniciar sesión</h2><p>${esc(msg||'Ingresá con tu correo y contraseña')}</p>
      <input class="login-input" type="email" id="li-email" placeholder="Correo" autocomplete="email">
      <input class="login-input" type="password" id="li-pass" placeholder="Contraseña" autocomplete="current-password">
      <button class="login-btn" id="li-btn" onclick="doLogin()">Ingresar →</button>${err}
      <button class="btn btn-sec" style="width:100%;margin-top:10px" onclick="pantallaLogin('registro')">Crear cuenta</button>
      <button class="btn btn-sec" style="width:100%;margin-top:8px" onclick="pantallaLogin('olvido')">Olvidé mi contraseña</button>`;
    document.getElementById('li-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  } else if(estado==='registro'){
    box.innerHTML=`<h2>Crear cuenta</h2><p>Después de confirmar tu correo, el administrador te asigna un rol.</p>
      <input class="login-input" type="text" id="rg-nombre" placeholder="Nombre y apellido" autocomplete="name">
      <input class="login-input" type="email" id="rg-email" placeholder="Correo" autocomplete="email">
      <input class="login-input" type="password" id="rg-pass" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="new-password">
      <button class="login-btn" onclick="registrarse()">Crear cuenta →</button>${err}
      <button class="btn btn-sec" style="width:100%;margin-top:10px" onclick="pantallaLogin('login')">↩️ Ya tengo cuenta</button>`;
  } else if(estado==='olvido'){
    box.innerHTML=`<h2>Recuperar contraseña</h2><p>Te mandamos un enlace a tu correo para elegir una nueva.</p>
      <input class="login-input" type="email" id="ol-email" placeholder="Correo" autocomplete="email">
      <button class="login-btn" onclick="recuperarClave()">Enviar enlace →</button>${err}
      <button class="btn btn-sec" style="width:100%;margin-top:10px" onclick="pantallaLogin('login')">↩️ Volver</button>`;
  } else if(estado==='nueva-clave'){
    box.innerHTML=`<h2>Nueva contraseña</h2><p>Elegí tu nueva contraseña.</p>
      <input class="login-input" type="password" id="nc-pass" placeholder="Nueva contraseña (mínimo 8)" autocomplete="new-password">
      <button class="login-btn" onclick="guardarClaveNueva()">Guardar →</button>${err}`;
  } else if(estado==='aviso'){
    box.innerHTML=`<h2>Listo ✅</h2><p>${esc(msg)}</p>
      <button class="login-btn" onclick="pantallaLogin('login')">Ir a iniciar sesión</button>`;
  } else if(estado==='pendiente'){
    box.innerHTML=`<h2>Cuenta creada ✅</h2>
      <p>Hola <b>${esc(miNombre||miEmail)}</b>. El administrador tiene que asignarte un rol (ventas, arquitectura, líder de operaciones o supervisor). Cuando lo haga, esta pantalla se actualiza sola.</p>
      <button class="btn btn-sec" style="width:100%" onclick="programarRecarga(0)">🔄 Revisar de nuevo</button>
      <button class="btn btn-sec" style="width:100%;margin-top:8px" onclick="doLogout()">🚪 Salir</button>`;
  } else if(estado==='error'){
    box.innerHTML=`<h2>Sin conexión con la base</h2><p>${esc(msg||'Revisá la conexión a internet.')}</p>
      <button class="login-btn" onclick="location.reload()">🔄 Reintentar</button>
      <button class="btn btn-sec" style="width:100%;margin-top:8px" onclick="doLogout()">🚪 Salir</button>`;
  }
}
function errLogin(t){const e=document.getElementById('login-err');if(e){e.textContent=t;e.style.display='block';}}
function traducirAuth(e){
  const m=(e&&e.message)||'';
  if(/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos';
  if(/Email not confirmed/i.test(m)) return 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada (y spam).';
  if(/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Iniciá sesión o recuperá la contraseña.';
  if(/Password should be/i.test(m)) return 'La contraseña es muy corta (mínimo 8 caracteres)';
  if(/rate limit/i.test(m)) return 'Demasiados intentos. Esperá unos minutos.';
  return m||'No se pudo completar. Probá de nuevo.';
}
async function doLogin(){
  const email=document.getElementById('li-email').value.trim(), password=document.getElementById('li-pass').value;
  if(!email||!password){errLogin('Completá correo y contraseña');return;}
  const b=document.getElementById('li-btn'); b.disabled=true;
  const {error}=await sb.auth.signInWithPassword({email,password});
  b.disabled=false;
  if(error) errLogin(traducirAuth(error));
}
async function registrarse(){
  const nombre=document.getElementById('rg-nombre').value.trim(), email=document.getElementById('rg-email').value.trim(),
    password=document.getElementById('rg-pass').value;
  if(!nombre||!email){errLogin('Completá nombre y correo');return;}
  if(password.length<8){errLogin('La contraseña debe tener al menos 8 caracteres');return;}
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{nombre},emailRedirectTo:URL_APP}});
  if(error){errLogin(traducirAuth(error));return;}
  if(!data.session) pantallaLogin('aviso','Te mandamos un correo a '+email+'. Abrí el enlace para confirmar la cuenta y después iniciá sesión.');
}
async function recuperarClave(){
  const email=document.getElementById('ol-email').value.trim();
  if(!email){errLogin('Escribí tu correo');return;}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:URL_APP});
  if(error){errLogin(traducirAuth(error));return;}
  pantallaLogin('aviso','Si el correo tiene cuenta, te llega un enlace para elegir una contraseña nueva.');
}
let recuperando=false;
async function guardarClaveNueva(){
  const password=document.getElementById('nc-pass').value;
  if(password.length<8){errLogin('Mínimo 8 caracteres');return;}
  const {error}=await sb.auth.updateUser({password});
  if(error){errLogin(traducirAuth(error));return;}
  recuperando=false; toast('✅ Contraseña actualizada');
  const {data:{session}}=await sb.auth.getSession(); if(session) arrancar(session);
}
async function doLogout(){
  try{await sb.auth.signOut();}catch(e){}
  location.href=URL_APP;
}

let arrancado=false;
async function arrancar(session){
  if(arrancado||recuperando) return; arrancado=true;
  myId=session.user.id; miEmail=session.user.email||''; miNombre=session.user.user_metadata?.nombre||'';
  pantallaLogin('cargando');
  try{
    await cargarTodo();
    if(perfiles[myId]) miNombre=perfiles[myId].nombre||miNombre;
    suscribir();
    decidirAcceso();
  }catch(e){
    console.error(e); arrancado=false;
    pantallaLogin('error',/relation|does not exist|schema cache/i.test(e.message||'')
      ?'La base todavía no tiene las tablas. Hay que correr las migraciones en Supabase (ver README).'
      :'No se pudo leer la base del equipo. '+(e.message||''));
  }
}
function decidirAcceso(){
  const r=perfiles[myId]?.rol;
  soyOwner=r==='admin';
  if(!r||r==='pendiente'){currentUser=null; pantallaLogin('pendiente'); return;}
  const nuevo={id:myId,nombre:perfiles[myId].nombre||miNombre||miEmail,rol:r};
  const cambio=!currentUser||currentUser.rol!==nuevo.rol;
  currentUser=nuevo;
  if(cambio) entrarApp(nuevo); else {recalcular(); pintarHeader(); marcarSolicitudes(); rerender();}
}

function pintarHeader(){
  document.getElementById('header-user-info').textContent=`👤 ${currentUser.nombre} · ${ROLES[currentUser.rol]||currentUser.rol}`;
  document.getElementById('btn-salir').style.display='';
}
function tabsPermitidas(){return TABS[rol()]||['proyectos'];}
function entrarApp(u){
  currentUser=u; recalcular();
  document.getElementById('screen-login').style.display='none';
  document.getElementById('screen-app').style.display='block';
  pintarHeader();
  const t=tabsPermitidas();
  document.querySelectorAll('.nav-btn').forEach(b=>b.style.display=t.includes(b.dataset.view)?'':'none');
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=rol()==='admin'?'':'none');
  document.querySelectorAll('.solo-local').forEach(el=>el.style.display='none');
  document.querySelectorAll('.solo-nube').forEach(el=>el.style.display='');
  document.getElementById('fab-proy').style.display=puedeCrear()?'':'none';
  marcarSolicitudes();
  showView(t.includes(vistaActual)?vistaActual:t[0]);
}
function puedeCrear(){return ['admin','lider','ventas'].includes(rol())}
function marcarSolicitudes(){
  const b=document.querySelector('.nav-btn[data-view="usuarios"]'); if(!b) return;
  const n=Object.keys(solicitudes).length;
  b.textContent='👤 Usuarios'+(n?` (${n})`:'');
}

// ════════════════════════════════════════════════
// PLANOS EN EL DEPÓSITO PRIVADO
// ════════════════════════════════════════════════
const MAX_PLANO_MB=50; // límite por archivo del plan gratuito de Supabase (se sube en el plan Pro)
async function subirPlano(id,input){
  const f=input.files[0]; if(!f) return;
  if(f.size>MAX_PLANO_MB*1024*1024){toast(`⚠️ Supera ${MAX_PLANO_MB} MB: subilo a Drive/OneDrive y pegá el enlace abajo`);input.value='';return;}
  toast('⬆️ Subiendo plano…');
  const pid=nuevoId();
  const seguro=f.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-80);
  const ruta=`${id}/${pid}-${seguro}`;
  try{
    chk(await sb.storage.from('planos').upload(ruta,f,{contentType:f.type||'application/octet-stream',upsert:false}));
    const p=limpiar(todos[id]);
    p.planos=(p.planos||[]); p.planos.push({id:pid,archivo:ruta,url:'',nombre:f.name,fecha:hoyISO(),autorId:myId,ts:Date.now()});
    const nota=document.getElementById('det-notaarq'); if(nota) p.notaArq=nota.value.trim();
    await guardarProyecto(p); toast('✅ Plano subido'); verDetalle(id);
  }catch(e){toast(msgError(e));}
  input.value='';
}
async function abrirPlano(ev,ruta){
  ev.preventDefault();
  const w=window.open('','_blank'); // se abre ya para que el celular no lo bloquee
  const {data,error}=await sb.storage.from('planos').createSignedUrl(ruta,600);
  if(error||!data){if(w)w.close();toast('⚠️ No se pudo abrir el plano');return;}
  if(w) w.location=data.signedUrl; else location.href=data.signedUrl;
}

// ════════════════════════════════════════════════
// USUARIOS Y ROLES (solo administrador)
// ════════════════════════════════════════════════
function selectRol(id,actual){
  return `<select id="${id}" style="padding:7px;border:1.5px solid var(--borde);border-radius:8px;font-size:12px">
    ${['ventas','arquitectura','lider','supervisor','admin','lectura'].map(r=>`<option value="${r}" ${r===actual?'selected':''}>${ROLES[r]}</option>`).join('')}</select>`;
}
function renderUsuarios(){
  const lista=document.getElementById('lista-usuarios');
  const pend=Object.entries(solicitudes);
  const miembros=Object.entries(roles).sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||''));
  lista.innerHTML=`
    <div class="card" style="border-left:5px solid var(--azul)">
      <div class="card-title">Cómo sumar a una persona</div>
      <div style="font-size:13px;color:var(--gris);line-height:1.5">
        1️⃣ Pasale el enlace de la app: <b>${esc(URL_APP)}</b><br>
        2️⃣ Toca <b>Crear cuenta</b>, pone su nombre, correo y contraseña, y confirma el correo.<br>
        3️⃣ Aparece abajo: elegí su rol y tocá <b>Aprobar</b>.
      </div>
    </div>
    <div class="sec-title">📥 Esperando rol (${pend.length})</div>
    ${pend.length?`<div class="card">${pend.map(([id,s],i)=>`<div class="persona-item">
      <div class="avatar">${esc(s.nombre||'?').charAt(0).toUpperCase()}</div>
      <div class="persona-info"><div class="persona-nombre">${esc(s.nombre||nombreDe(id))}</div>
        <div class="persona-rol">${esc(s.email)} · se registró el ${esc(s.fecha)}</div>
        <div style="display:flex;gap:6px;margin-top:6px">${selectRol('sol-rol-'+i,'supervisor')}
        <button class="btn btn-verde btn-sm" onclick="aprobar('${esc(id)}','sol-rol-${i}')">Aprobar</button></div></div></div>`).join('')}</div>`
      :'<div class="card" style="font-size:13px;color:var(--gris-m)">No hay cuentas esperando rol</div>'}
    <div class="sec-title">👥 Equipo con acceso (${miembros.length})</div>
    <div class="card">
      ${miembros.map(([id,r],i)=>id===myId?`<div class="persona-item"><div class="avatar" style="background:var(--morado)">${esc(nombreDe(id)).charAt(0).toUpperCase()}</div>
        <div class="persona-info"><div class="persona-nombre">${esc(nombreDe(id))} (vos)</div><div class="persona-rol">${ROLES[r.rol]} · ${esc(perfiles[id]?.email)}</div></div></div>`
      :`<div class="persona-item">
        <div class="avatar" style="background:${r.rol==='admin'?'var(--morado)':'var(--nar)'}">${esc(nombreDe(id)).charAt(0).toUpperCase()}</div>
        <div class="persona-info"><div class="persona-nombre">${esc(nombreDe(id))}</div><div class="persona-rol">${esc(perfiles[id]?.email)}</div>
          <div style="display:flex;gap:6px;margin-top:6px">${selectRol('mr-rol-'+i,r.rol)}
          <button class="btn btn-sec btn-sm" onclick="cambiarRol('${esc(id)}','mr-rol-${i}')">Guardar</button>
          <button class="btn btn-rojo btn-sm" onclick="quitarAcceso('${esc(id)}')">Quitar</button></div></div></div>`).join('')}
    </div>`;
}
async function ponerRol(uid,r){
  const {data,error}=await sb.from('perfiles').update({rol:r}).eq('id',uid).select('id');
  if(error) throw error;
  if(!data||!data.length) throw {code:'42501',message:'permission'};
  perfiles[uid].rol=r;
  if(r==='pendiente'){delete roles[uid]; solicitudes[uid]={nombre:perfiles[uid].nombre,fecha:fechaDe(perfiles[uid].creado_en),email:perfiles[uid].email};}
  else {delete solicitudes[uid]; roles[uid]={rol:r,nombre:perfiles[uid].nombre||perfiles[uid].email};}
}
async function aprobar(uid,selId){
  const r=document.getElementById(selId).value;
  try{await ponerRol(uid,r); toast('✅ '+nombreDe(uid)+' ahora es '+ROLES[r]); marcarSolicitudes(); renderUsuarios();}
  catch(e){toast(msgError(e));}
}
// Proyectos activos a cargo de una persona (como supervisor)
function proyectosACargo(uid){
  return Object.values(todos).filter(p=>p.supId===uid&&etapaDe(p)==='ejecucion'&&p.estado!=='finalizado');
}
async function cambiarRol(uid,selId){
  const r=document.getElementById(selId).value;
  const antes=roles[uid]?.rol;
  if(r===antes){toast('Ya tiene ese rol');return;}
  if(!['supervisor','lider','admin'].includes(r)){
    if(!await pedirReasignacion(uid,`Como ${ROLES[r]} ya no va a ver esos proyectos.`)) return;
  }
  try{await ponerRol(uid,r); toast('✅ Rol actualizado: '+ROLES[r]); renderUsuarios();}catch(e){toast(msgError(e));}
}
async function quitarAcceso(uid){
  if(!await confirmar('¿Quitarle el acceso a '+nombreDe(uid)+'? Su cuenta queda sin rol y no ve nada. Para borrarla del todo, eliminala en Supabase → Authentication.')) return;
  if(!await pedirReasignacion(uid,'Sin acceso no va a poder actualizarlos.')) return;
  try{await ponerRol(uid,'pendiente'); toast('Acceso quitado'); marcarSolicitudes(); renderUsuarios();}catch(e){toast(msgError(e));}
}

// ════════════════════════════════════════════════
// IMPORTAR EL RESPALDO DE LA APP ANTERIOR (artefacto)
// ════════════════════════════════════════════════
function buscarPerfilPorNombre(n){
  const k=String(n||'').trim().toLowerCase(); if(!k) return null;
  const e=Object.entries(perfiles).find(([,x])=>x.rol!=='pendiente'&&(x.nombre||'').trim().toLowerCase()===k);
  return e?e[0]:null;
}
async function cargarDatos(d){
  if(rol()!=='admin'){toast('⚠️ Solo el administrador importa respaldos');return;}
  const ya=new Set(Object.values(todos).map(p=>(p.nombre+'|'+p.cli).toLowerCase()));
  const mapa={}; let n=0, salt=0, sinSup=[];
  for(const v of d.proyectos||[]){
    const clave=(String(v.nombre||'')+'|'+String(v.cli||'')).toLowerCase();
    if(ya.has(clave)){salt++; continue;}
    const id=nuevoId(); mapa[String(v.id)]=id;
    const supId=v.sup?buscarPerfilPorNombre(v.sup):null; if(v.sup&&!supId) sinSup.push(v.sup);
    const tsDe=f=>f?new Date(String(f).length===10?f+'T12:00:00':f).getTime():Date.now();
    const p={id,nombre:v.nombre||'Sin nombre',cli:v.cli||'Sin cliente',tipo:v.tipo||'',etapa:v.etapa||'ejecucion',
      estado:v.estado||'presupuesto',avance:v.avance||0,val:v.val??'',creadoTs:Number(v.creadoTs)||tsDe(v.creadoEn),
      vendId:buscarPerfilPorNombre(v.vend),vend:v.vend||'',supId,inicio:v.inicio||'',entrega:v.entrega||'',
      pers:v.pers||0,dep:v.dep||'',pri:v.pri||'normal',obs:v.obs||'',ficha:v.ficha||null,notaArq:v.notaArq||'',
      verifArq:v.verifArq||null,stockVerif:v.stockVerif||null,presup:v.presup||null,
      historial:(v.historial||[]).map(h=>({id:nuevoId(),ts:tsDe(h.fecha),avance:h.avance||0,est:h.est||'en-curso',
        texto:(h.texto||'')+(h.autor?' ('+h.autor+')':'')})),
      costos:(v.costos||[]).filter(c=>Number(c.importe)>0).map(c=>({id:nuevoId(),rubro:c.rubro,importe:c.importe,
        desc:(c.desc||'Gasto')+(c.autor?' ('+c.autor+')':''),fecha:c.fecha||hoyISO(),ts:tsDe(c.fecha)})),
      planos:(v.planos||[]).filter(x=>/^https:\/\//i.test(x.url||'')&&x.enlace).map(x=>({id:nuevoId(),nombre:x.nombre,url:x.url})),
      flujo:(v.flujo||[]).filter(x=>ETAPA[x.a]).map(x=>({fecha:x.fecha,a:x.a,autor:(x.autor||'')+' (importado)'})),
      consultas:(v.consultas||[]).filter(c=>AREAS[c.para]).map(c=>({id:nuevoId(),texto:(c.deNombre?c.deNombre+': ':'')+c.texto,
        para:c.para,ts:c.ts||Date.now(),incidencia:!!c.incidencia,respuesta:c.respuesta?(c.respuesta+(c.respNombre?' ('+c.respNombre+')':'')):'',
        respTs:c.respTs,respId:null})),
      incidencias:(v.incidencias||[]).filter(x=>AREAS[x.origen]).map(x=>({id:nuevoId(),tipo:x.tipo||'Otro',origen:x.origen,
        desc:(x.desc||'')+(x.autor?' ('+x.autor+')':''),frena:!!x.frena,ts:x.ts||tsDe(x.fecha)})),
      faltantes:(v.faltantes||[]).map(f=>({id:nuevoId(),mat:f.mat||'Material',cant:f.cant||'',para:f.para||'',frena:!!f.frena,
        ts:f.ts||Date.now(),resuelto:!!f.resuelto,resTs:f.resTs}))};
    if(!p.flujo.length) p.flujo.push({fecha:hoyISO(),a:p.etapa,autor:'Importado de la app anterior'});
    try{await guardarProyectoOError(p); n++;}catch(e){/* ya se avisó */}
  }
  const conv=(arr,f)=>(arr||[]).map(x=>{const y=f(x); y.id=nuevoId(); if(y.proyId!=null) y.proyId=mapa[String(y.proyId)]||null; return y;});
  if(n&&Array.isArray(d.personal)) personal=personal.concat(conv(d.personal,x=>({nom:x.nom||x.nombre||'',rol:x.rol||'',tel:x.tel||''})));
  if(n&&Array.isArray(d.contenedores)) contenedores=contenedores.concat(conv(d.contenedores,x=>({cod:x.cod||'',tipo:x.tipo||'',estado:x.estado||'',proyId:x.proyId,obs:x.obs||''})));
  if(n&&Array.isArray(d.materiales)) materiales=materiales.concat(conv(d.materiales,x=>({nom:x.nom||'',cant:x.cant||'',est:['pendiente','comprado','transito'].includes(x.est)?x.est:'pendiente',proyId:x.proyId})));
  await save();
  refrescar();
  const extra=sinSup.length?` · ${[...new Set(sinSup)].length} supervisor(es) sin cuenta con el mismo nombre: quedaron sin asignar`:'';
  toast(`✅ ${n} proyectos importados${salt?` · ${salt} ya existían`:''}${extra}`);
}
function importBackup(ev){
  const f=ev.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=async()=>{
    try{
      const d=JSON.parse(r.result); if(!Array.isArray(d.proyectos)) throw 0;
      if(!await confirmar(`Se van a agregar ${d.proyectos.length} proyectos del respaldo (los que ya existen con el mismo nombre y cliente se saltean). Los supervisores se asignan buscando una cuenta con el mismo nombre. ¿Continuar?`)){ev.target.value='';return;}
      toast('⏳ Importando…'); await cargarDatos(d);
    }catch(e){toast('⚠️ Archivo de respaldo inválido')}
    ev.target.value='';
  };
  r.readAsText(f);
}
function migrarDispositivo(){}

// ════════════════════════════════════════════════
// ARRANQUE
// ════════════════════════════════════════════════
async function iniciarNube(){
  if(!window.supabase||!window.SUPABASE_URL){pantallaLogin('error','Falta la configuración de Supabase (config.js).');return;}
  pantallaLogin('cargando');
  sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==='PASSWORD_RECOVERY'){recuperando=true; pantallaLogin('nueva-clave'); return;}
    if(ev==='SIGNED_IN'&&session&&!recuperando) setTimeout(()=>arrancar(session),0);
    if(ev==='SIGNED_OUT'){arrancado=false; myId=null; currentUser=null; pantallaLogin('login');}
  });
  const {data:{session}}=await sb.auth.getSession();
  if(session){ if(!recuperando) arrancar(session); }
  else if(!recuperando) pantallaLogin('login');
}

// ════════════════════════════════════════════════
// NAV
// ════════════════════════════════════════════════
const RENDERS={
  dashboard:()=>renderDash(), proyectos:()=>renderProyectos(), kanban:()=>renderKanban(),
  alertas:()=>renderAlertas(), personal:()=>renderPersonal(), contenedores:()=>{updContSel();renderContenedores()},
  materiales:()=>{updMatSel();renderMateriales()}, usuarios:()=>renderUsuarios(), costos:()=>renderCostos(), reportes:()=>renderReportes()
};
function showView(name){
  const t=tabsPermitidas();
  if(!t.includes(name)) name=t[0];
  vistaActual=name;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  document.getElementById('view-'+name).classList.add('active');
  RENDERS[name]?.();
}
function refrescar(){showView(vistaActual)}
function rerender(){if(currentUser) RENDERS[vistaActual]?.();}

// ════════════════════════════════════════════════
// HELPERS DE AVANCE Y COSTOS
// ════════════════════════════════════════════════
const EC={
  'presupuesto':{label:'💬 Presupuesto',cls:'b-gris'},
  'en-curso':   {label:'🔨 En curso',   cls:'b-nar'},
  'finalizado': {label:'✅ Finalizado', cls:'b-verde'},
  'pausado':    {label:'⏸️ Pausado',    cls:'b-amar'},
};
const PC={'normal':'','alta':'🔴 Alta','urgente':'🚨 Urgente','baja':'🟢 Baja'};
function badgeEstado(p){
  const e=etapaDe(p);
  if(e!=='ejecucion'){const x=ETAPA[e];return `<span class="badge ${x.cls}">${x.label}</span>`;}
  const ec=EC[p.estado]||EC['presupuesto'];return `<span class="badge ${ec.cls}">${ec.label}</span>`;
}
function diasRestantes(entrega){
  if(!entrega) return null;
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const ent=new Date(entrega+'T00:00:00');
  return Math.round((ent-hoy)/(1000*60*60*24));
}
function calcAvanceEsperado(p){
  if(!p.inicio||!p.entrega) return 0;
  const ini=new Date(p.inicio+'T00:00:00'), ent=new Date(p.entrega+'T00:00:00');
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const total=(ent-ini)/(1000*60*60*24), trans=(hoy-ini)/(1000*60*60*24);
  if(total<=0) return 100;
  return Math.min(100,Math.max(0,Math.round((trans/total)*100)));
}
function costoInfo(p){
  const pres=p.presup||{}, por={};
  let presTot=0, realTot=0;
  for(const k in RUBROS){por[k]={pres:Number(pres[k])||0,real:0};presTot+=por[k].pres;}
  (p.costos||[]).forEach(c=>{const k=por[c.rubro]?c.rubro:'otr';por[k].real+=Number(c.importe)||0;realTot+=Number(c.importe)||0;});
  const av=p.avance||0;
  const idx=(presTot>0&&av>0)?realTot/(presTot*av/100):null; // >1 = se gasta más rápido de lo que se avanza
  const proy=(av>0)?realTot/(av/100):null;                     // costo proyectado al cierre
  return {por,presTot,realTot,idx,proy};
}
function costoDesviado(p){
  const c=costoInfo(p);
  if(!c.presTot) return false;
  return c.realTot>c.presTot*1.05 || ((p.avance||0)>=10 && c.idx!==null && c.idx>1.10);
}
function esDesviado(p){
  if(etapaDe(p)!=='ejecucion') return false;
  if(p.estado==='finalizado'||p.estado==='presupuesto') return costoDesviado(p);
  if(costoDesviado(p)) return true;
  const dr=diasRestantes(p.entrega);
  if(dr===null) return false;
  return dr<0||(calcAvanceEsperado(p)-(p.avance||0)>25);
}
function progColor(av,esp){if(av>=esp)return 'prog-verde';if(esp-av>25)return 'prog-rojo';return 'prog-amar';}
function pct(n){return (n>0?'+':'')+Math.round(n)+'%'}

function proyCard(p){
  const av=p.avance||0, dr=diasRestantes(p.entrega), desv=esDesviado(p), esperado=calcAvanceEsperado(p);
  const e=etapaDe(p);
  let cardCls='proy-card';
  if(e!=='ejecucion') cardCls+=' previo';
  else if(p.estado==='finalizado') cardCls+=' ok';
  else if(desv) cardCls+=' desviado';
  else if(p.estado==='pausado') cardCls+=' pausado';
  let drLabel='';
  if(dr!==null&&p.estado!=='finalizado'&&e==='ejecucion'){
    if(dr<0) drLabel=`<span class="badge b-rojo">⚠️ ${Math.abs(dr)}d vencido</span>`;
    else if(dr<=3) drLabel=`<span class="badge b-rojo">🔥 ${dr}d restantes</span>`;
    else if(dr<=7) drLabel=`<span class="badge b-amar">⏰ ${dr}d restantes</span>`;
    else drLabel=`<span class="badge b-gris">📅 ${dr}d</span>`;
  }
  const sup=supNombre(p);
  return `<div class="${cardCls}" onclick="verDetalle('${esc(p.id)}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1;margin-right:8px">
        <div class="proy-nombre">${esc(p.nombre)}</div>
        <div class="proy-cliente">👤 ${esc(p.cli)}</div>
      </div>
      ${badgeEstado(p)}
    </div>
    ${e==='ejecucion'?`<div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gris-m);margin-bottom:4px">
        <span>👷 ${p.pers||0} personas · 📍 ${esc((p.dep||'').split('—')[0])}</span>
        <span><b>${av}%</b> / esp.${esperado}%</span>
      </div>
      <div class="prog-bar"><div class="prog-fill ${progColor(av,esperado)}" style="width:${av}%"></div></div>
    </div>`:''}
    <div class="proy-meta">
      <span class="badge b-azul">📦 ${esc(p.tipo)}</span>
      ${sup?`<span class="badge b-gris">👷 ${esc(sup)}</span>`:''}
      ${(p.planos||[]).length?`<span class="badge b-morado">📐 ${p.planos.length} plano${p.planos.length>1?'s':''}</span>`:''}
      ${p.pri&&p.pri!=='normal'?`<span class="badge b-rojo">${PC[p.pri]}</span>`:''}
      ${drLabel}
      ${desv?`<span class="badge b-rojo">⚠️ ${costoDesviado(p)?'DESVÍO DE COSTO':'DESVIADO'}</span>`:''}
      ${p.val?`<span class="badge b-verde">💰 ${usd(p.val)}</span>`:''}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════
function pendientesDeMiArea(){
  const r=rol();
  const etapa=r==='ventas'?'ventas':r==='arquitectura'?'arquitectura':(r==='lider'||r==='admin')?'asignacion':null;
  if(!etapa) return {etapa:null,items:[]};
  return {etapa,items:proyectos.filter(p=>etapaDe(p)===etapa)};
}
function renderDash(){
  const ej=proyectos.filter(p=>etapaDe(p)==='ejecucion');
  const total=proyectos.length;
  const enCurso=ej.filter(p=>p.estado==='en-curso').length;
  const fin=ej.filter(p=>p.estado==='finalizado').length;
  const desv=proyectos.filter(esDesviado).length;
  const previos=proyectos.filter(p=>etapaDe(p)!=='ejecucion').length;
  const totalPersonas=ej.filter(p=>p.estado==='en-curso').reduce((s,p)=>s+(parseInt(p.pers)||0),0);
  const avProm=enCurso>0?Math.round(ej.filter(p=>p.estado==='en-curso').reduce((s,p)=>s+(p.avance||0),0)/enCurso):0;
  const recientes=proyectos.slice(0,4);
  const urgentes=ej.filter(p=>p.estado==='en-curso'&&diasRestantes(p.entrega)!==null&&diasRestantes(p.entrega)<=7);
  const pend=pendientesDeMiArea();
  const txtPend={ventas:'Proyectos en ventas (falta enviar a arquitectura)',arquitectura:'Proyectos esperando plano',asignacion:'Proyectos esperando asignación de supervisor'};

  document.getElementById('dash-content').innerHTML=`
    ${(()=>{const cp=consultasPendientesParaMi();return cp.length?`<div class="card" style="border-left:5px solid var(--amarillo)">
      <div class="card-title" style="color:var(--amarillo)">❓ Consultas para responder (${cp.length})</div>
      ${cp.map(({p,c})=>{const h=horasDesde(c.ts);return `<div class="fila-click" onclick="verDetalle('${esc(p.id)}')">
        <div><div style="font-size:13px;font-weight:700">${c.incidencia?'⚠️ ':''}${esc(c.texto.slice(0,60))}</div>
        <div style="font-size:11px;color:var(--gris-m)">${esc(p.nombre.slice(0,30))} · de ${esc(c.deNombre)}</div></div>
        <span class="sla ${claseSla(h)}">${fmtHoras(h)}</span></div>`;}).join('')}
    </div>`:'';})()}
    ${(()=>{const fa=esOp()?faltantesAbiertos():[];return fa.length?`<div class="card" style="border-left:5px solid var(--rojo)">
      <div class="card-title" style="color:var(--rojo)">📦 Faltantes de material (${fa.length})</div>
      ${fa.map(({p,f})=>`<div class="fila-click" onclick="verDetalle('${esc(p.id)}')">
        <div><div style="font-size:13px;font-weight:700">${f.frena?'🛑 ':''}${esc(f.mat)}${f.cant?' · '+esc(f.cant):''}</div>
        <div style="font-size:11px;color:var(--gris-m)">${esc(p.nombre.slice(0,30))} · pidió ${esc(f.autor)} · para ${esc(f.para)}</div></div>
        <span class="badge b-rojo">${fmtHoras(horasDesde(f.ts))}</span></div>`).join('')}
    </div>`:'';})()}
    ${(()=>{const mc=misConsultasEsperando();return mc.length?`<div class="card" style="border-left:5px solid var(--azul)">
      <div class="card-title" style="color:var(--azul)">⏳ Tus consultas esperando respuesta (${mc.length})</div>
      ${mc.map(({p,c})=>{const h=horasDesde(c.ts);return `<div class="fila-click" onclick="verDetalle('${esc(p.id)}')">
        <div><div style="font-size:13px;font-weight:700">${esc(c.texto.slice(0,60))}</div>
        <div style="font-size:11px;color:var(--gris-m)">${esc(p.nombre.slice(0,30))} · para ${AREAS[c.para]||esc(c.para)}</div></div>
        <span class="sla ${claseSla(h)}">${fmtHoras(h)}</span></div>`;}).join('')}
    </div>`:'';})()}
    ${pend.items.length?`<div class="card" style="border-left:5px solid var(--morado)">
      <div class="card-title" style="color:var(--morado)">📥 ${txtPend[pend.etapa]} (${pend.items.length})</div>
      ${pend.items.map(p=>`<div class="fila-click" onclick="verDetalle('${esc(p.id)}')">
        <div><div style="font-size:13px;font-weight:700">${esc(p.nombre.slice(0,34))}</div>
        <div style="font-size:11px;color:var(--gris-m)">Cliente: ${esc(p.cli)}${p.entrega?' · Entrega '+esc(p.entrega):''}</div></div>
        <span class="badge b-morado">Abrir</span></div>`).join('')}
    </div>`:''}
    <div class="stats-4">
      <div class="stat-box nar"><div class="stat-num">${total}</div><div class="stat-lbl">Proyectos${rol()==='supervisor'?' asignados':''}</div></div>
      <div class="stat-box azul"><div class="stat-num">${enCurso}</div><div class="stat-lbl">En curso</div></div>
      <div class="stat-box verde"><div class="stat-num">${fin}</div><div class="stat-lbl">Finalizados</div></div>
      <div class="stat-box rojo"><div class="stat-num">${desv}</div><div class="stat-lbl">Desviados ⚠️</div></div>
      <div class="stat-box amarillo"><div class="stat-num">${previos}</div><div class="stat-lbl">En ventas / arquitectura / por asignar</div></div>
      <div class="stat-box"><div class="stat-num">${totalPersonas}</div><div class="stat-lbl">Personas en obra</div></div>
      <div class="stat-box"><div class="stat-num">${avProm}%</div><div class="stat-lbl">Avance promedio</div></div>
      <div class="stat-box"><div class="stat-num">${personal.length}</div><div class="stat-lbl">Personal registrado</div></div>
    </div>
    ${desv>0?`<div class="card" style="border-left:5px solid var(--rojo)">
      <div class="card-title" style="color:var(--rojo)">🚨 ${desv} proyecto${desv>1?'s':''} con desviación</div>
      ${proyectos.filter(esDesviado).map(p=>`<div class="fila-click" onclick="verDetalle('${esc(p.id)}')">
        <div><div style="font-size:13px;font-weight:700">${esc(p.nombre.slice(0,30))}</div>
        <div style="font-size:11px;color:var(--gris-m)">Avance: ${p.avance||0}% · Sup: ${esc(supNombre(p))||'—'}${costoDesviado(p)?' · costo excedido':''}</div></div>
        <span class="badge b-rojo">⚠️</span></div>`).join('')}
    </div>`:''}
    ${urgentes.length?`<div class="card" style="border-left:5px solid var(--amarillo)">
      <div class="card-title" style="color:var(--amarillo)">⏰ Próximas entregas (7 días)</div>
      ${urgentes.sort((a,b)=>diasRestantes(a.entrega)-diasRestantes(b.entrega)).map(p=>{const dr=diasRestantes(p.entrega);
        return `<div class="fila-click" onclick="verDetalle('${esc(p.id)}')">
          <div><div style="font-size:13px;font-weight:700">${esc(p.nombre.slice(0,28))}</div>
          <div style="font-size:11px;color:var(--gris-m)">Cliente: ${esc(p.cli)}</div></div>
          <span class="badge ${dr<0?'b-rojo':'b-amar'}">${dr<0?'Vencido':dr+'d'}</span></div>`;}).join('')}
    </div>`:''}
    <div class="sec-title" style="margin-top:4px">⚡ Proyectos recientes</div>
    ${recientes.length?recientes.map(proyCard).join(''):`<div class="empty"><div class="em">📋</div><h3>Sin proyectos</h3>
      <p>${rol()==='supervisor'?'Todavía no te asignaron proyectos':'Todavía no hay proyectos cargados'}</p>
      ${puedeCrear()?`<button class="btn btn-nar" onclick="showView('proyectos');abrirNuevoProy()">+ Nuevo Proyecto</button>`:''}</div>`}
  `;
}

// ════════════════════════════════════════════════
// PROYECTOS
// ════════════════════════════════════════════════
function setFiltro(e,el){
  filtroEstado=e;
  document.querySelectorAll('#view-proyectos .chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderProyectos();
}
function pasaFiltro(p){
  const f=filtroEstado, e=etapaDe(p);
  if(f==='todos') return true;
  if(f==='desviado') return esDesviado(p);
  if(ETAPA[f]&&f!=='ejecucion') return e===f;
  return e==='ejecucion'&&p.estado===f;
}
function renderProyectos(){
  const q=(document.getElementById('search-p')?.value||'').toLowerCase();
  const filtered=proyectos.filter(p=>(!q||(p.nombre||'').toLowerCase().includes(q)||(p.cli||'').toLowerCase().includes(q))&&pasaFiltro(p));
  document.getElementById('lista-proyectos').innerHTML=filtered.length?filtered.map(proyCard).join('')
    :`<div class="empty"><div class="em">🔍</div><h3>Sin resultados</h3><p>No hay proyectos que coincidan</p></div>`;
}
function opcionesSupervisores(sel){
  const lista=Object.entries(roles).filter(([id,r])=>r.rol==='supervisor'||r.rol==='lider')
    .sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||''));
  return '<option value="">Sin asignar</option>'+lista.map(([id,r])=>
    `<option value="${esc(id)}" ${id===sel?'selected':''}>${esc(nombreDe(id))}${r.rol==='lider'?' (líder)':''}</option>`).join('');
}
function prepararModalProy(){
  const op=esOp();
  document.querySelectorAll('#m-proy .campo-op').forEach(el=>el.style.display=op?'':'none');
  document.getElementById('ep-sup').style.display=MODO==='local'?'':'none';
  document.getElementById('ep-supid').style.display=MODO==='nube'?'':'none';
}
function abrirNuevoProy(){
  if(!puedeCrear()) return;
  const v=rol()==='ventas';
  NotaPedido.abrir({titulo:'Nueva nota de pedido',enviar:v,
    onGuardar:(f,o)=>crearDesdeNota(f,o)});
}
const esNota=p=>!!(p&&p.ficha&&p.ficha.v===2);
// Crea el proyecto con lo que cargó ventas en la nota de pedido
async function crearDesdeNota(f,{enviar,archivo}){
  const p={id:nuevoId(),creadoTs:Date.now(),creadoPor:currentUser?.nombre||'',creadoPorId:myId,creadoEn:hoyISO(),
    historial:[],costos:[],planos:[],flujo:[],consultas:[],incidencias:[],faltantes:[],estado:'presupuesto',avance:0,
    vendId:rol()==='ventas'?myId:null,nombre:NotaPedido.nombreSugerido(f),cli:(f.cli||'').trim()||'Sin nombre',
    tipo:NotaPedido.tipoTrabajo(f),entrega:f.fecha||'',val:'',vend:currentUser?.nombre||'',dep:'',pri:'normal',obs:'',
    ficha:NotaPedido.compat(f)};
  p.etapa=rol()==='ventas'?'ventas':'asignacion';
  p.flujo.push({fecha:hoyISO(),a:p.etapa,autor:currentUser.nombre});
  try{await guardarProyectoOError(p);}catch(e){return false;}
  if(archivo) await subirCroquis(p.id,archivo);
  if(enviar) await moverEtapa(p.id,'arquitectura');
  else toast('✅ Nota de pedido guardada');
  refrescar();
  return true;
}
function editarNota(id){
  const p=todos[id]; if(!p||!puedeEditar(p)) return;
  const enviar=etapaDe(p)==='ventas';
  NotaPedido.abrir({ficha:esNota(p)?p.ficha:null,cliente:p.cli,titulo:'Nota de pedido · '+p.nombre,enviar,
    onGuardar:async(f,{enviar:env,archivo})=>{
      const q=limpiar(todos[id]); if(!q) return false;
      q.ficha=NotaPedido.compat(f);
      if((!q.cli||q.cli==='Sin nombre')&&f.cli) q.cli=f.cli.trim();
      if(!q.entrega&&f.fecha) q.entrega=f.fecha;
      try{await guardarProyectoOError(q);}catch(e){return false;}
      if(archivo) await subirCroquis(id,archivo);
      if(env) await moverEtapa(id,'arquitectura'); else toast('✅ Nota de pedido guardada');
      refrescar();
      return true;
    }});
}
async function pdfNota(id,btn){
  const p=todos[id]; if(!p||!esNota(p)) return;
  try{await NotaPedido.pdf(p.ficha,btn);}catch(e){toast('⚠️ No se pudo armar el PDF');}
}
// El croquis que carga ventas queda con los planos del proyecto
async function subirCroquis(id,f){
  if(f.size>MAX_PLANO_MB*1024*1024){toast(`⚠️ El croquis supera ${MAX_PLANO_MB} MB: pasáselo a arquitectura por una consulta`);return;}
  const pid=nuevoId();
  const seguro=f.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-80);
  const ruta=`${id}/${pid}-${seguro}`;
  try{
    chk(await sb.storage.from('planos').upload(ruta,f,{contentType:f.type||'application/octet-stream',upsert:false}));
    const p=limpiar(todos[id]);
    p.planos=(p.planos||[]); p.planos.push({id:pid,archivo:ruta,url:'',nombre:'Croquis del cliente: '+f.name,fecha:hoyISO(),autorId:myId,ts:Date.now()});
    await guardarProyectoOError(p);
  }catch(e){console.error(e);toast('⚠️ No se pudo subir el croquis. Pasáselo a arquitectura por una consulta');}
}
function leerPresup(){
  return {mat:Number(document.getElementById('ep-pmat').value)||0,mo:Number(document.getElementById('ep-pmo').value)||0,
    ter:Number(document.getElementById('ep-pter').value)||0,otr:Number(document.getElementById('ep-potr').value)||0};
}
function guardarProy(){
  const nom=document.getElementById('ep-nom').value.trim();
  const cli=document.getElementById('ep-cli').value.trim();
  if(!nom||!cli){toast('⚠️ Completá nombre y cliente');return;}
  const id=document.getElementById('ep-id').value;
  const prev=id?todos[id]:null;
  const p=prev?limpiar(prev):{id:nuevoId(),creadoTs:Date.now(),creadoPor:currentUser?.nombre||'',creadoPorId:MODO==='nube'?myId:null,
    creadoEn:hoyISO(),historial:[],costos:[],planos:[],flujo:[],estado:'presupuesto',avance:0,
    vendId:rol()==='ventas'&&MODO==='nube'?myId:null};
  if(!prev&&MODO==='nube'){
    p.etapa=rol()==='ventas'?'ventas':'asignacion';
    p.flujo.push({fecha:hoyISO(),a:p.etapa,autor:currentUser.nombre});
  }
  Object.assign(p,{nombre:nom,cli,tipo:document.getElementById('ep-tipo').value,entrega:document.getElementById('ep-ent').value,
    val:document.getElementById('ep-val').value,vend:document.getElementById('ep-vend').value,dep:document.getElementById('ep-dep').value,
    pri:document.getElementById('ep-pri').value,obs:document.getElementById('ep-obs').value});
  if(!esNota(prev)) p.ficha=leerFicha();
  if(esOp()){
    p.inicio=document.getElementById('ep-ini').value;
    p.estado=document.getElementById('ep-est').value;
    p.avance=Math.min(100,Math.max(0,parseInt(document.getElementById('ep-av').value)||0));
    p.pers=parseInt(document.getElementById('ep-pers').value)||0;
    p.presup=leerPresup();
    if(MODO==='nube'){const s=document.getElementById('ep-supid').value||null; p.supId=s; p.sup=s?nombreDe(s):(p.sup||'');}
    else p.sup=document.getElementById('ep-sup').value;
  }
  guardarProyecto(p); closeOverlay('m-proy'); refrescar(); toast(prev?'✅ Proyecto actualizado':'✅ Proyecto creado');
}
function puedeEditar(p){
  if(MODO==='local') return rol()!=='lectura';
  if(esOp()) return true;
  return rol()==='ventas'&&etapaDe(p)==='ventas'&&p.creadoPorId===myId;
}
function esSupDe(p){return MODO==='local'?rol()!=='lectura':(p.supId===myId||esOp())}

let detalleId=null;
function verDetalle(id){
  const p=todos[id]; if(!p||!puedeVer(p)) return;
  detalleId=id;
  const av=p.avance||0, dr=diasRestantes(p.entrega), esperado=calcAvanceEsperado(p), desv=esDesviado(p), e=etapaDe(p);
  const mats=materiales.filter(m=>String(m.proyId)===String(id));
  const conts=contenedores.filter(c=>String(c.proyId)===String(id));
  const upds=(p.historial||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
  const r=rol();
  const c=costoInfo(p);

  // Flujo de etapas
  const pasos=['ventas','arquitectura','asignacion','ejecucion'];
  const iAct=pasos.indexOf(e);
  const flujoHTML=MODO==='nube'?`<div class="flujo">${pasos.map((k,i)=>`<div class="flujo-paso ${i<iAct?'hecho':i===iAct?'actual':''}">${ETAPA[k].label.split(' ')[0]}<span>${['Ventas','Arquitectura','Asignación','Ejecución'][i]}</span></div>`).join('')}</div>`:'';

  // Acciones según etapa y rol
  let acciones='';
  if(MODO==='nube'){
    if(e==='ventas'&&(esOp()||(r==='ventas'&&p.creadoPorId===myId)))
      acciones+=`<div class="accion"><p>Cuando el pedido del cliente esté completo, envialo a arquitectura para que agregue el plano.</p>
        <button class="btn btn-nar" onclick="moverEtapa('${esc(id)}','arquitectura')">📐 Enviar a Arquitectura</button></div>`;
    if(e==='arquitectura'&&(r==='arquitectura'||esOp())){
      acciones+=`<div class="accion"><p><b>Arquitectura:</b> subí el plano (PDF o imagen) y enviá el proyecto al líder de operaciones.</p>
        ${cassets?`<label class="btn btn-sec" style="cursor:pointer;display:block;text-align:center">⬆️ Subir plano
          <input type="file" accept="application/pdf,image/*" style="display:none" onchange="subirPlano('${esc(id)}',this)"></label>`
          :`<p style="color:var(--rojo);font-size:12px">Para subir planos necesitás acceso de Editor al artefacto. Pedíselo al administrador.</p>`}
        <div style="font-size:12px;color:var(--gris-m);margin:8px 0 4px">¿Pesa más de 50 MB? Pegá el enlace del archivo en Drive, OneDrive o Dropbox:</div>
        <input type="url" id="det-plano-url" placeholder="https://drive.google.com/...">
        <input type="text" id="det-plano-nom" placeholder="Nombre del plano (ej: Planta y cortes v2)" style="margin-top:6px">
        <button class="btn btn-sec btn-sm" style="margin-top:6px" onclick="agregarPlanoEnlace('${esc(id)}')">🔗 Agregar enlace</button>
        <textarea id="det-notaarq" placeholder="Nota para operaciones (medidas, materiales, observaciones)" style="margin-top:8px">${esc(p.notaArq||'')}</textarea>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="det-verif" ${p.verifArq?'checked':''}> Verifiqué que el plano coincide con la ficha técnica (medidas, puertas, ventanas, instalaciones)</label>
        <div class="flex-btns" style="margin-top:8px">
          <button class="btn btn-sec" onclick="moverEtapa('${esc(id)}','ventas')">↩️ Devolver a Ventas</button>
          <button class="btn btn-nar" onclick="moverEtapa('${esc(id)}','asignacion')">🧭 Enviar a Líder de Operaciones</button>
        </div></div>`;
    }
    if(e==='asignacion'&&esOp()){
      const pr=p.presup||{};
      acciones+=`<div class="accion"><p><b>Líder de operaciones:</b> asigná un supervisor, las fechas y el presupuesto de costos. Con eso arranca la medición de avance y desvíos.</p>
        <div class="fg"><label>Supervisor</label><select id="as-sup">${opcionesSupervisores(p.supId||'')}</select></div>
        <div class="form-2"><div class="fg"><label>Inicio</label><input type="date" id="as-ini" value="${esc(p.inicio||hoyISO())}"></div>
          <div class="fg"><label>Entrega</label><input type="date" id="as-ent" value="${esc(p.entrega||'')}"></div></div>
        <div class="fg"><label>Presupuesto de costos (USD)</label></div>
        <div class="form-2">
          <div class="fg"><label>Materiales</label><input type="number" id="as-pmat" value="${pr.mat||''}" placeholder="0"></div>
          <div class="fg"><label>Mano de obra</label><input type="number" id="as-pmo" value="${pr.mo||''}" placeholder="0"></div>
          <div class="fg"><label>Terceros</label><input type="number" id="as-pter" value="${pr.ter||''}" placeholder="0"></div>
          <div class="fg"><label>Otros</label><input type="number" id="as-potr" value="${pr.otr||''}" placeholder="0"></div>
        </div>
        ${(()=>{const pm=materiales.filter(m=>String(m.proyId)===String(id)&&m.est!=='comprado');
          return pm.length?`<p style="color:var(--rojo);font-size:12px;margin-bottom:6px">Materiales de este proyecto sin comprar: ${pm.map(m=>esc(m.nom)).join(', ')}</p>`:'';})()}
        <label class="check" style="margin-bottom:10px"><input type="checkbox" id="as-stock"> Verifiqué que hay stock (o compra confirmada) de los materiales críticos para arrancar</label>
        <div class="flex-btns">
          <button class="btn btn-sec" onclick="moverEtapa('${esc(id)}','arquitectura')">↩️ Devolver a Arq.</button>
          <button class="btn btn-verde" onclick="asignar('${esc(id)}')">✅ Asignar y comenzar</button>
        </div></div>`;
    }
  }

  const planos=(p.planos||[]);
  const puedeBorrarPlano=MODO==='nube'&&(esOp()||(r==='arquitectura'&&e==='arquitectura'));

  document.getElementById('det-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div style="flex:1;margin-right:8px">
        <div style="font-size:19px;font-weight:800">${esc(p.nombre)}</div>
        <div style="font-size:13px;color:var(--gris-m);margin-top:2px">👤 ${esc(p.cli)}</div>
      </div>
      ${badgeEstado(p)}
    </div>
    ${flujoHTML}
    ${acciones}
    ${desv?`<div style="background:#fdf0ef;border-radius:10px;padding:10px;margin-bottom:12px;border-left:4px solid var(--rojo)">
      <div style="font-size:14px;font-weight:800;color:var(--rojo)">⚠️ PROYECTO DESVIADO</div>
      <div style="font-size:12px;color:var(--gris-m);margin-top:3px">Avance real: ${av}% — esperado: ${esperado}%${dr!==null&&dr<0?` — vencido hace ${Math.abs(dr)} días`:''}${costoDesviado(p)?` — costo real ${usd(c.realTot)} vs presupuesto ${usd(c.presTot)}`:''}</div>
    </div>`:''}
    ${e==='ejecucion'?`<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gris-m);margin-bottom:5px">
        <span>Avance: <b>${av}%</b></span><span>Esperado: ${esperado}%</span></div>
      <div class="prog-bar" style="height:14px"><div class="prog-fill ${progColor(av,esperado)}" style="width:${av}%"></div></div>
    </div>`:''}
    <div class="dsec"><h3>📋 Información</h3>
      <div class="drow"><span class="lbl">Tipo</span><span class="val">${esc(p.tipo)}</span></div>
      <div class="drow"><span class="lbl">Depósito</span><span class="val">${esc(p.dep)||'—'}</span></div>
      <div class="drow"><span class="lbl">Inicio</span><span class="val">${esc(p.inicio)||'—'}</span></div>
      <div class="drow"><span class="lbl">Entrega</span><span class="val">${esc(p.entrega)||'—'}${dr!==null&&e==='ejecucion'?' ('+(dr<0?'⚠️ '+Math.abs(dr)+'d vencido':dr+'d restantes')+')':''}</span></div>
      <div class="drow"><span class="lbl">Valor de venta</span><span class="val">${p.val?usd(p.val):'—'}</span></div>
      <div class="drow"><span class="lbl">Supervisor</span><span class="val">${esc(supNombre(p))||'—'}</span></div>
      <div class="drow"><span class="lbl">Vendedor</span><span class="val">${esc(p.vend)||'—'}</span></div>
      <div class="drow"><span class="lbl">Cargado por</span><span class="val">${esc(p.creadoPor)||'—'} · ${esc(p.creadoEn)||''}</span></div>
      <div class="drow"><span class="lbl">Personas asignadas</span><span class="val">${p.pers||0}</span></div>
      <div class="drow"><span class="lbl">Prioridad</span><span class="val">${PC[p.pri]||'Normal'}</span></div>
      ${p.obs?`<div class="drow"><span class="lbl">Notas</span><span class="val">${esc(p.obs)}</span></div>`:''}
    </div>
    ${MODO==='nube'||planos.length?`<div class="dsec"><h3>📐 Planos (${planos.length})</h3>
      ${planos.length?planos.map(pl=>`<div class="drow"><a class="lbl" href="${esc(pl.url||'#')}" ${pl.archivo?`onclick="abrirPlano(event,'${esc(pl.archivo)}')"`:''} target="_blank" rel="noopener noreferrer">${pl.enlace?'🔗':'📄'} ${esc(pl.nombre)}</a>
        <span class="val">${esc(pl.fecha)}${puedeBorrarPlano?` <button class="btn btn-rojo btn-sm" onclick="quitarPlano('${esc(id)}','${esc(pl.id)}')">✕</button>`:''}</span></div>`).join('')
        :'<div style="font-size:13px;color:var(--gris-m)">Todavía sin plano</div>'}
      ${p.notaArq&&e!=='arquitectura'?`<div class="drow"><span class="lbl">Nota de arquitectura</span><span class="val">${esc(p.notaArq)}</span></div>`:''}
    </div>`:''}
    ${e==='ejecucion'||c.presTot||c.realTot?`<div class="dsec"><h3>💰 Costos: presupuestado vs real</h3>
      <table class="tcost"><tr><th>Rubro</th><th>Presup.</th><th>Real</th><th>Desvío</th></tr>
      ${Object.keys(RUBROS).map(k=>{const x=c.por[k];const d=x.pres?((x.real-x.pres)/x.pres*100):null;
        return `<tr><td>${RUBROS[k]}</td><td>${usd(x.pres)}</td><td>${usd(x.real)}</td><td class="${d===null?'':d>10?'rojo':d>5?'amar':'verde'}">${d===null?'—':pct(d)}</td></tr>`;}).join('')}
      <tr class="tot"><td>Total</td><td>${usd(c.presTot)}</td><td>${usd(c.realTot)}</td><td>${c.presTot?pct((c.realTot-c.presTot)/c.presTot*100):'—'}</td></tr></table>
      <div class="drow"><span class="lbl">Costo vs avance</span><span class="val">${c.idx===null?'—':c.idx.toFixed(2)+(c.idx>1.1?' ⚠️ se gasta más rápido de lo que se avanza':c.idx>1.05?' (atento)':' ✅')}</span></div>
      <div class="drow"><span class="lbl">Costo proyectado al cierre</span><span class="val">${c.proy===null?'—':usd(c.proy)}</span></div>
      ${p.val?`<div class="drow"><span class="lbl">Margen real hasta hoy</span><span class="val">${usd((Number(p.val)||0)-c.realTot)}${c.presTot?' (presup.: '+usd((Number(p.val)||0)-c.presTot)+')':''}</span></div>`:''}
      ${(p.costos||[]).length?`<div style="margin-top:8px;font-size:12px;font-weight:700">Últimos gastos cargados</div>
        ${(p.costos||[]).slice().reverse().slice(0,6).map(x=>`<div class="drow"><span class="lbl">${esc(x.fecha)} · ${RUBROS[x.rubro]||'Otros'} · ${esc(x.desc)}</span><span class="val">${usd(x.importe)}</span></div>`).join('')}`:''}
      ${e==='ejecucion'&&esSupDe(p)&&r!=='lectura'?`<button class="btn btn-sec btn-sm" style="margin-top:8px" onclick="abrirCosto('${esc(id)}')">💲 Cargar gasto real</button>`:''}
    </div>`:''}
    ${seccionFicha(p)}
    ${seccionCosteo(p)}
    ${seccionConsultas(p)}
    ${seccionIncidencias(p)}
    ${seccionFaltantes(p)}
    ${conts.length?`<div class="dsec"><h3>📦 Contenedores (${conts.length})</h3>
      ${conts.map(x=>`<div class="drow"><span class="lbl">${esc(x.cod)}</span><span class="val">${esc(x.tipo)}</span></div>`).join('')}</div>`:''}
    ${mats.length?`<div class="dsec"><h3>🔧 Materiales (${mats.length})</h3>
      ${mats.map(m=>`<div class="mat-item"><div class="mat-dot dot-${esc((m.est||'p').charAt(0))}"></div>
        <div class="mat-info"><div class="mat-nom">${esc(m.nom)}</div><div class="mat-det">Cant: ${esc(m.cant)||'—'} · ${esc(m.est)}</div></div></div>`).join('')}</div>`:''}
    ${e==='ejecucion'?`<div class="dsec"><h3>📝 Historial de actualizaciones</h3>
      ${upds.length?upds.slice(0,5).map(u=>`<div class="update-item">
        <div class="update-fecha">📅 ${esc(u.fecha)} · Por: ${esc(u.autor)}</div>
        <div class="update-texto">${esc(u.texto)}</div>
        <div class="update-autor">Avance registrado: ${esc(u.avance)}%</div></div>`).join('')
        :'<div style="font-size:13px;color:var(--gris-m)">Sin actualizaciones aún</div>'}</div>`:''}
    ${(p.flujo||[]).length?`<div class="dsec"><h3>🔁 Recorrido</h3>
      ${p.flujo.map(f=>`<div class="drow"><span class="lbl">${esc(f.fecha)} · ${esc(f.autor)}</span><span class="val">${ETAPA[f.a]?.label||esc(f.a)}</span></div>`).join('')}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      ${e==='ejecucion'&&esSupDe(p)&&r!=='lectura'?`<button class="btn btn-verde btn-sm" onclick="abrirUpdate('${esc(id)}')">📝 Actualizar hoy</button>
        <button class="btn btn-sec btn-sm" onclick="abrirFaltante('${esc(id)}')">📦 Falta material</button>
        <button class="btn btn-sec btn-sm" onclick="abrirIncidencia('${esc(id)}')">⚠️ Reportar error</button>`:''}
      ${puedeEditar(p)&&(esOp()||MODO==='local'||e==='ventas')?`<button class="btn btn-rojo btn-sm" onclick="eliminarProy('${esc(id)}')">🗑️ Eliminar</button>`:''}
    </div>
  `;
  const be=document.getElementById('btn-edit-det');
  be.style.display=puedeEditar(p)?'':'none';
  be.onclick=()=>{closeOverlay('m-det');editarProy(id)};
  openOverlay('m-det');
}

async function moverEtapa(id,a){
  const p=limpiar(todos[id]); if(!p) return;
  if(a==='arquitectura'&&etapaDe(p)==='ventas'){
    const falta=fichaFaltantes(p);
    if(falta.length){
      if(esNota(p)){toast('⚠️ Completá la nota de pedido: '+falta[0]);closeOverlay('m-det');editarNota(id);return;}
      toast('⚠️ Completá la ficha técnica: '+falta.join(', '));closeOverlay('m-det');editarProy(id);return;}
  }
  if(a==='asignacion'){
    const nota=document.getElementById('det-notaarq'); if(nota) p.notaArq=nota.value.trim();
    const ver=document.getElementById('det-verif');
    if(ver&&!ver.checked){toast('⚠️ Confirmá que verificaste el plano contra la ficha técnica');return;}
    p.verifArq={fecha:hoyISO(),autor:currentUser.nombre};
    if(!(p.planos||[]).length&&!await confirmar('El proyecto no tiene plano cargado. ¿Enviarlo igual al líder de operaciones?')) return;
  }
  if(a==='arquitectura'||a==='ventas'){const nota=document.getElementById('det-notaarq'); if(nota) p.notaArq=nota.value.trim();}
  p.etapa=a; p.flujo=(p.flujo||[]); p.flujo.push({fecha:hoyISO(),a,autor:currentUser.nombre});
  await guardarProyecto(p);
  closeOverlay('m-det'); refrescar();
  toast({arquitectura:'📐 Enviado a Arquitectura',asignacion:'🧭 Enviado al Líder de Operaciones',ventas:'↩️ Devuelto a Ventas'}[a]||'✅ Listo');
}
async function asignar(id){
  const p=limpiar(todos[id]); if(!p) return;
  if(esNota(p)){const pe=NotaPedido.pendientes(p.ficha); if(pe.length){toast('⚠️ Falta confirmar con el cliente: '+pe.join(', ')+'. Completalo en la nota antes de pasar a ejecución');return;}}
  const s=document.getElementById('as-sup').value;
  if(!s){toast('⚠️ Elegí un supervisor');return;}
  const ent=document.getElementById('as-ent').value;
  if(!ent){toast('⚠️ Poné la fecha de entrega');return;}
  if(!document.getElementById('as-stock').checked){toast('⚠️ Confirmá el stock de materiales críticos antes de arrancar');return;}
  p.stockVerif={fecha:hoyISO(),autor:currentUser.nombre};
  p.supId=s; p.sup=nombreDe(s);
  p.inicio=document.getElementById('as-ini').value||hoyISO(); p.entrega=ent;
  p.presup={mat:Number(document.getElementById('as-pmat').value)||0,mo:Number(document.getElementById('as-pmo').value)||0,
    ter:Number(document.getElementById('as-pter').value)||0,otr:Number(document.getElementById('as-potr').value)||0};
  p.etapa='ejecucion'; p.estado='en-curso';
  p.flujo=(p.flujo||[]); p.flujo.push({fecha:hoyISO(),a:'ejecucion',autor:currentUser.nombre});
  await guardarProyecto(p); closeOverlay('m-det'); refrescar(); toast('✅ Asignado a '+p.sup);
}
async function agregarPlanoEnlace(id){
  const url=document.getElementById('det-plano-url').value.trim();
  const nombre=document.getElementById('det-plano-nom').value.trim()||'Plano (enlace)';
  if(!/^https:\/\/[^\s]+$/i.test(url)){toast('⚠️ Pegá un enlace que empiece con https://');return;}
  const p=limpiar(todos[id]);
  p.planos=(p.planos||[]); p.planos.push({id:nuevoId(),url,nombre,fecha:hoyISO(),autorId:myId,enlace:true});
  const nota=document.getElementById('det-notaarq'); if(nota) p.notaArq=nota.value.trim();
  await guardarProyecto(p); toast('✅ Enlace agregado'); verDetalle(id);
}
async function quitarPlano(id,planoId){
  if(!await confirmar('¿Quitar este plano del proyecto?')) return;
  const p=limpiar(todos[id]); p.planos=(p.planos||[]).filter(x=>x.id!==planoId);
  await guardarProyecto(p); verDetalle(id);
}

function editarProy(id){
  const p=todos[id]; if(!p) return;
  document.getElementById('ep-id').value=p.id;
  document.getElementById('m-proy-title').textContent='✏️ Editar Proyecto';
  const v=(k,x)=>document.getElementById(k).value=x??'';
  v('ep-nom',p.nombre);v('ep-cli',p.cli);v('ep-tipo',p.tipo);v('ep-ini',p.inicio);v('ep-ent',p.entrega);
  v('ep-est',p.estado||'presupuesto');v('ep-av',p.avance||0);v('ep-val',p.val);v('ep-sup',p.sup);v('ep-vend',p.vend);
  v('ep-pers',p.pers||0);v('ep-dep',p.dep);v('ep-pri',p.pri||'normal');v('ep-obs',p.obs);
  const pr=p.presup||{}; v('ep-pmat',pr.mat||'');v('ep-pmo',pr.mo||'');v('ep-pter',pr.ter||'');v('ep-potr',pr.otr||'');
  ponerFicha(esNota(p)?{}:(p.ficha||{}));
  const nueva=esNota(p);
  document.getElementById('ficha-vieja').style.display=nueva?'none':'';
  document.getElementById('ficha-nueva-txt').textContent=nueva
    ?(NotaPedido.faltantes(p.ficha).length?'Incompleta: abrila para terminarla.':'Completa.')
    :'Este proyecto tiene la ficha anterior. Podés pasarla a la nota de pedido nueva.';
  document.getElementById('ficha-nueva-btn').onclick=()=>{closeOverlay('m-proy');editarNota(id)};
  document.getElementById('ep-supid').innerHTML=opcionesSupervisores(p.supId||'');
  prepararModalProy();
  openOverlay('m-proy');
}
async function eliminarProy(id){
  if(!await confirmar('¿Eliminar este proyecto?')) return;
  await borrarProyecto(id);
  contenedores.forEach(c=>{if(String(c.proyId)===String(id))c.proyId=null});
  materiales.forEach(m=>{if(String(m.proyId)===String(id))m.proyId=null});
  save(); closeOverlay('m-det'); refrescar(); toast('🗑️ Proyecto eliminado');
}

// ════════════════════════════════════════════════
// ACTUALIZACIÓN DIARIA Y GASTOS
// ════════════════════════════════════════════════
function abrirUpdate(id){
  const p=todos[id]; if(!p) return;
  document.getElementById('upd-proy-id').value=id;
  document.getElementById('upd-av').value=p.avance||0;
  document.getElementById('upd-text').value='';
  document.getElementById('upd-est').value=p.estado||'en-curso';
  closeOverlay('m-det'); openOverlay('m-update');
}
async function guardarUpdate(){
  const id=document.getElementById('upd-proy-id').value;
  const av=Math.min(100,Math.max(0,parseInt(document.getElementById('upd-av').value)||0));
  const texto=document.getElementById('upd-text').value.trim();
  const est=document.getElementById('upd-est').value;
  if(!texto){toast('⚠️ Ingresá un comentario');return;}
  const p=limpiar(todos[id]); if(!p) return;
  p.avance=av; p.estado=est;
  p.historial=(p.historial||[]); p.historial.push({id:nuevoId(),ts:Date.now(),avance:av,texto,est,fecha:hoyISO(),autor:currentUser?.nombre||'Sistema'});
  await guardarProyecto(p); closeOverlay('m-update'); refrescar(); toast('✅ Actualización guardada');
}

// ════════════════════════════════════════════════
// FICHA TÉCNICA
// ════════════════════════════════════════════════
const FICHA_IDS=['fx-largo','fx-ancho','fx-alto','fx-puerta','fx-puertas','fx-ventanas','fx-ventmed','fx-elec','fx-sani','fx-term','fx-extra'];
function leerFicha(){
  const g=k=>document.getElementById(k).value.trim();
  return {largo:g('fx-largo'),ancho:g('fx-ancho'),alto:g('fx-alto'),puerta:g('fx-puerta'),puertas:g('fx-puertas'),
    ventanas:g('fx-ventanas'),ventmed:g('fx-ventmed'),elec:g('fx-elec'),sani:g('fx-sani'),term:g('fx-term'),extra:g('fx-extra'),
    confirmada:document.getElementById('fx-conf').checked};
}
function ponerFicha(f){
  const m={'fx-largo':'largo','fx-ancho':'ancho','fx-alto':'alto','fx-puerta':'puerta','fx-puertas':'puertas','fx-ventanas':'ventanas',
    'fx-ventmed':'ventmed','fx-elec':'elec','fx-sani':'sani','fx-term':'term','fx-extra':'extra'};
  for(const k in m) document.getElementById(k).value=f[m[k]]??'';
  document.getElementById('fx-conf').checked=!!f.confirmada;
}
function fichaFaltantes(p){
  if(esNota(p)) return NotaPedido.faltantes(p.ficha);
  const f=p.ficha||{}, falta=[];
  if(!(Number(f.largo)>0)||!(Number(f.ancho)>0)||!(Number(f.alto)>0)) falta.push('medidas');
  if(!f.puerta) falta.push('tipo de puerta');
  if(f.puertas===''||f.puertas==null) falta.push('cantidad de puertas');
  if(f.ventanas===''||f.ventanas==null) falta.push('ventanas');
  if(!f.elec) falta.push('instalación eléctrica');
  if(!f.sani) falta.push('instalación sanitaria');
  if(!f.confirmada) falta.push('confirmación con el cliente');
  return falta;
}
function seccionFicha(p){
  const f=p.ficha;
  if(esNota(p)){
    const falta=NotaPedido.faltantes(f), pend=NotaPedido.pendientes(f), id=esc(p.id);
    return `<div class="dsec"><h3>📋 Nota de pedido</h3>
      ${falta.length?`<div style="font-size:12px;color:var(--rojo);margin-bottom:6px">Falta: ${esc(falta.slice(0,3).join(' · '))}${falta.length>3?` y ${falta.length-3} más`:''}</div>`:''}
      ${pend.length?`<div class="nota-pend">⚠️ A confirmar con el cliente: ${esc(pend.join(', '))}. No pasa a ejecución hasta completarlo.</div>`:''}
      <div class="nota-vars nota-res">${NotaPedido.resumen(f)}</div>
      <div class="nota-vars nota-dib">${NotaPedido.dibujos(f)}</div>
      <div class="flex-btns" style="margin-top:8px"><button class="btn btn-sec btn-sm" onclick="pdfNota('${id}',this)">📄 PDF para el cliente</button>
        ${puedeEditar(p)?`<button class="btn btn-nar btn-sm" onclick="closeOverlay('m-det');editarNota('${id}')">✏️ Editar nota</button>`:''}</div>
      ${p.verifArq?`<div style="font-size:12px;color:var(--verde);margin-top:6px">✅ Plano verificado por ${esc(p.verifArq.autor)} (${esc(p.verifArq.fecha)})</div>`:''}
    </div>`;
  }
  if(!f) return MODO==='nube'?`<div class="dsec"><h3>📏 Ficha técnica</h3><div style="font-size:13px;color:var(--rojo)">Sin ficha técnica cargada</div></div>`:'';
  const falta=fichaFaltantes(p);
  const fila=(l,v)=>v?`<div class="drow"><span class="lbl">${l}</span><span class="val">${esc(v)}</span></div>`:'';
  return `<div class="dsec"><h3>📏 Ficha técnica</h3>
    ${falta.length?`<div style="font-size:12px;color:var(--rojo);margin-bottom:6px">Falta: ${falta.join(', ')}</div>`:''}
    ${fila('Medidas (L × A × H)',(f.largo||'?')+' × '+(f.ancho||'?')+' × '+(f.alto||'?')+' m')}
    ${fila('Puertas',(f.puertas||'?')+' · '+(f.puerta||'?'))}
    ${fila('Ventanas',(f.ventanas||'0')+(f.ventmed?' · '+f.ventmed:''))}
    ${fila('Eléctrica',f.elec)}${fila('Sanitaria',f.sani)}
    ${fila('Terminaciones',f.term)}${fila('Detalles',f.extra)}
    ${f.confirmada?'<div style="font-size:12px;color:var(--verde);margin-top:4px">✅ Confirmada con el cliente</div>':''}
    ${p.verifArq?`<div style="font-size:12px;color:var(--verde)">✅ Plano verificado por ${esc(p.verifArq.autor)} (${esc(p.verifArq.fecha)})</div>`:''}
  </div>`;
}

// ════════════════════════════════════════════════
// CONSULTAS ENTRE ÁREAS (con tiempo de respuesta)
// ════════════════════════════════════════════════
const AREAS={ventas:'💼 Ventas',arquitectura:'📐 Arquitectura',lider:'🧭 Líder de operaciones'};
const SLA_HORAS=4; // más de 4 h sin respuesta: amarillo; más de 24 h: rojo
function horasDesde(ts,hasta){return Math.max(0,((hasta||Date.now())-ts)/36e5)}
function fmtHoras(h){return h<1?Math.round(h*60)+' min':h<48?(Math.round(h*10)/10)+' h':Math.round(h/24)+' días'}
function claseSla(h){return h>24?'rojo':h>SLA_HORAS?'amar':'verde'}
function puedeResponder(p,c){
  if(MODO==='local') return true;
  if(esOp()) return true;
  return rol()===c.para;
}
function consultasPendientesParaMi(){
  const out=[];
  proyectos.forEach(p=>(p.consultas||[]).forEach(c=>{
    if(c.respuesta) return;
    const r=rol();
    if(r===c.para||((r==='lider'||r==='admin')&&c.para==='lider')) out.push({p,c});
  }));
  return out.sort((a,b)=>a.c.ts-b.c.ts);
}
function misConsultasEsperando(){
  const out=[];
  proyectos.forEach(p=>(p.consultas||[]).forEach(c=>{if(!c.respuesta&&c.deId===myId) out.push({p,c});}));
  return out;
}
function seccionConsultas(p){
  if(MODO!=='nube') return '';
  const cs=(p.consultas||[]).slice().sort((a,b)=>b.ts-a.ts);
  const id=esc(p.id);
  return `<div class="dsec"><h3>💬 Consultas (${cs.length})</h3>
    ${cs.map(c=>{const h=horasDesde(c.ts,c.respTs);const abierta=!c.respuesta;
      return `<div class="consulta ${abierta?(h>24?'tarde':'abierta'):''}">
        <div class="cq">${c.incidencia?'⚠️ ':'❓ '}${esc(c.texto)}</div>
        <div class="cm">${esc(c.deNombre)} → ${AREAS[c.para]||esc(c.para)} · ${new Date(c.ts).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</div>
        ${abierta?`<div class="cm">Sin respuesta hace <span class="sla ${claseSla(h)}">${fmtHoras(h)}</span></div>
          ${puedeResponder(p,c)&&rol()!=='lectura'?`<textarea id="resp-${esc(c.id)}" placeholder="Respuesta…"></textarea>
            <button class="btn btn-verde btn-sm" style="margin-top:6px" onclick="responderConsulta('${id}','${esc(c.id)}')">Responder</button>`:''}`
        :`<div class="cr">✅ ${esc(c.respuesta)}<div class="cm">${esc(c.respNombre)} · respondió en <span class="sla ${claseSla(h)}">${fmtHoras(h)}</span></div></div>`}
      </div>`;}).join('')}
    ${rol()!=='lectura'?`<div style="display:flex;gap:6px;align-items:center;margin-top:4px">
      <select id="cq-para" style="flex:1">${Object.entries(AREAS).filter(([k])=>k!==rol()).map(([k,v])=>`<option value="${k}">Para ${v}</option>`).join('')}</select></div>
      <textarea id="cq-texto" placeholder="Ej: ¿la puerta es corrediza o de abrir?"></textarea>
      <button class="btn btn-sec btn-sm" style="margin-top:6px" onclick="enviarConsulta('${id}')">💬 Enviar consulta</button>`:''}
  </div>`;
}
async function enviarConsulta(id,texto,para,incidencia){
  texto=texto||document.getElementById('cq-texto').value.trim();
  para=para||document.getElementById('cq-para').value;
  if(!texto){toast('⚠️ Escribí la consulta');return;}
  const p=limpiar(todos[id]); if(!p) return;
  p.consultas=(p.consultas||[]);
  p.consultas.push({id:nuevoId(),texto,para,ts:Date.now(),deId:myId,deNombre:currentUser.nombre,incidencia:!!incidencia});
  await guardarProyecto(p);
  if(!incidencia){toast('💬 Consulta enviada a '+(AREAS[para]||para)); verDetalle(id);}
}
async function responderConsulta(id,cid){
  const t=document.getElementById('resp-'+cid).value.trim();
  if(!t){toast('⚠️ Escribí la respuesta');return;}
  const p=limpiar(todos[id]); if(!p) return;
  const c=(p.consultas||[]).find(x=>x.id===cid); if(!c) return;
  c.respuesta=t; c.respTs=Date.now(); c.respId=myId; c.respNombre=currentUser.nombre;
  await guardarProyecto(p); toast('✅ Respuesta enviada'); verDetalle(id);
}

// ════════════════════════════════════════════════
// ERRORES DE INFORMACIÓN (medidas / planos)
// ════════════════════════════════════════════════
function abrirIncidencia(id){
  document.getElementById('inc-proy').value=id; document.getElementById('inc-desc').value='';
  closeOverlay('m-det'); openOverlay('m-inc');
}
async function guardarIncidencia(){
  const id=document.getElementById('inc-proy').value;
  const desc=document.getElementById('inc-desc').value.trim();
  if(!desc){toast('⚠️ Describí el error');return;}
  const tipo=document.getElementById('inc-tipo').value, origen=document.getElementById('inc-origen').value, frena=document.getElementById('inc-frena').value==='si';
  const p=limpiar(todos[id]); if(!p) return;
  p.incidencias=(p.incidencias||[]);
  p.incidencias.push({id:nuevoId(),tipo,origen,desc,frena,ts:Date.now(),fecha:hoyISO(),autorId:myId,autor:currentUser.nombre,vend:p.vend||''});
  p.consultas=(p.consultas||[]);
  p.consultas.push({id:nuevoId(),texto:`[${tipo}${frena?' · FRENA EL TRABAJO':''}] ${desc}`,para:origen,ts:Date.now(),deId:myId,deNombre:currentUser.nombre,incidencia:true});
  await guardarProyecto(p); closeOverlay('m-inc'); verDetalle(id); toast('⚠️ Error reportado a '+AREAS[origen]);
}
function seccionIncidencias(p){
  const ins=p.incidencias||[]; if(!ins.length) return '';
  return `<div class="dsec"><h3>⚠️ Errores reportados (${ins.length})</h3>
    ${ins.slice().reverse().map(x=>`<div class="drow"><span class="lbl">${esc(x.fecha)} · ${esc(x.tipo)} · ${esc(x.desc)}</span><span class="val">${AREAS[x.origen]||esc(x.origen)}${x.frena?' · 🛑':''}</span></div>`).join('')}
  </div>`;
}

// ════════════════════════════════════════════════
// FALTANTES DE MATERIAL
// ════════════════════════════════════════════════
function abrirFaltante(id){
  document.getElementById('fa-proy').value=id;
  ['fa-mat','fa-cant'].forEach(k=>document.getElementById(k).value='');
  document.getElementById('fa-fecha').value=hoyISO();
  closeOverlay('m-det'); openOverlay('m-falt');
}
async function guardarFaltante(){
  const id=document.getElementById('fa-proy').value;
  const mat=document.getElementById('fa-mat').value.trim();
  if(!mat){toast('⚠️ Indicá el material');return;}
  const p=limpiar(todos[id]); if(!p) return;
  p.faltantes=(p.faltantes||[]);
  p.faltantes.push({id:nuevoId(),mat,cant:document.getElementById('fa-cant').value.trim(),para:document.getElementById('fa-fecha').value,
    frena:document.getElementById('fa-frena').value==='si',ts:Date.now(),autor:currentUser.nombre,resuelto:false});
  await guardarProyecto(p); closeOverlay('m-falt'); verDetalle(id); toast('📦 Aviso enviado al líder de operaciones');
}
async function resolverFaltante(id,fid){
  const p=limpiar(todos[id]); if(!p) return;
  const f=(p.faltantes||[]).find(x=>x.id===fid); if(!f) return;
  f.resuelto=true; f.resTs=Date.now(); f.resAutor=currentUser.nombre;
  await guardarProyecto(p); verDetalle(id); toast('✅ Material resuelto');
}
function faltantesAbiertos(){
  const out=[]; proyectos.forEach(p=>(p.faltantes||[]).forEach(f=>{if(!f.resuelto) out.push({p,f});}));
  return out.sort((a,b)=>(b.f.frena-a.f.frena)||(a.f.ts-b.f.ts));
}
function seccionFaltantes(p){
  const fs=p.faltantes||[]; if(!fs.length) return '';
  return `<div class="dsec"><h3>📦 Faltantes de material (${fs.filter(f=>!f.resuelto).length} abiertos)</h3>
    ${fs.slice().reverse().map(f=>`<div class="drow"><span class="lbl">${f.resuelto?'✅':f.frena?'🛑':'⏳'} ${esc(f.mat)}${f.cant?' · '+esc(f.cant):''} · para ${esc(f.para)}</span>
      <span class="val">${f.resuelto?'resuelto en '+fmtHoras(horasDesde(f.ts,f.resTs)):'hace '+fmtHoras(horasDesde(f.ts))}
      ${!f.resuelto&&esOp()?` <button class="btn btn-verde btn-sm" onclick="resolverFaltante('${esc(p.id)}','${esc(f.id)}')">Resuelto</button>`:''}</span></div>`).join('')}
  </div>`;
}

function abrirCosto(id){
  document.getElementById('co-proy').value=id;
  document.getElementById('co-rubro').value='mat';
  document.getElementById('co-imp').value='';
  document.getElementById('co-desc').value='';
  document.getElementById('co-fecha').value=hoyISO();
  closeOverlay('m-det'); openOverlay('m-costo');
}
async function guardarCosto(){
  const id=document.getElementById('co-proy').value;
  const imp=Number(document.getElementById('co-imp').value);
  const desc=document.getElementById('co-desc').value.trim();
  if(!imp||imp<=0){toast('⚠️ Ingresá el importe');return;}
  if(!desc){toast('⚠️ Describí el gasto');return;}
  const p=limpiar(todos[id]); if(!p) return;
  p.costos=(p.costos||[]); p.costos.push({id:nuevoId(),ts:Date.now(),rubro:document.getElementById('co-rubro').value,importe:imp,desc,
    fecha:document.getElementById('co-fecha').value||hoyISO(),autor:currentUser?.nombre||''});
  await guardarProyecto(p); closeOverlay('m-costo'); verDetalle(id); toast('✅ Gasto cargado');
}

// ════════════════════════════════════════════════
// KANBAN
// ════════════════════════════════════════════════
function renderKanban(){
  const cols=[
    ...(MODO==='nube'?[
      {label:'💼 Ventas',color:'var(--azul)',f:p=>etapaDe(p)==='ventas'},
      {label:'📐 Arquitectura',color:'var(--morado)',f:p=>etapaDe(p)==='arquitectura'},
      {label:'🧭 Por asignar',color:'var(--amarillo)',f:p=>etapaDe(p)==='asignacion'},
    ]:[]),
    {label:'💬 Presupuesto',color:'var(--gris-m)',f:p=>etapaDe(p)==='ejecucion'&&p.estado==='presupuesto'},
    {label:'🔨 En curso',color:'var(--nar)',f:p=>etapaDe(p)==='ejecucion'&&p.estado==='en-curso'},
    {label:'⏸️ Pausado',color:'var(--amarillo)',f:p=>etapaDe(p)==='ejecucion'&&p.estado==='pausado'},
    {label:'✅ Finalizado',color:'var(--verde)',f:p=>etapaDe(p)==='ejecucion'&&p.estado==='finalizado'},
  ];
  document.getElementById('kanban-board').innerHTML=cols.map(col=>{
    const items=proyectos.filter(col.f);
    return `<div class="kanban-col">
      <h3 style="color:${col.color}">${col.label} <span style="color:var(--gris-m);font-weight:400">(${items.length})</span></h3>
      ${items.length?items.map(p=>{const av=p.avance||0,desv=esDesviado(p);
        return `<div class="kanban-item" style="${desv?'border-left:3px solid var(--rojo)':''}" onclick="verDetalle('${esc(p.id)}')">
          <div class="ki-nom">${esc((p.nombre||'').slice(0,28))}</div>
          <div class="ki-cli">👤 ${esc((p.cli||'').slice(0,20))}</div>
          ${etapaDe(p)==='ejecucion'?`<div class="ki-av">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
              <span>${esc(supNombre(p))||'Sin supervisor'}</span><span>${av}%</span></div>
            <div class="prog-bar" style="height:6px"><div class="prog-fill ${progColor(av,calcAvanceEsperado(p))}" style="width:${av}%"></div></div>
          </div>`:''}
          ${desv?'<div style="font-size:11px;color:var(--rojo);margin-top:4px;font-weight:700">⚠️ Desviado</div>':''}
        </div>`;}).join(''):`<div style="font-size:12px;color:var(--gris-m);text-align:center;padding:16px">Sin proyectos</div>`}
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
// ALERTAS
// ════════════════════════════════════════════════
function renderAlertas(){
  const alertas=[];
  proyectos.forEach(p=>{
    const e=etapaDe(p);
    (p.consultas||[]).forEach(c=>{if(c.respuesta) return; const h=horasDesde(c.ts);
      if(h>SLA_HORAS&&(esOp()||rol()===c.para||c.deId===myId))
        alertas.push({tipo:h>24?'error':'warn',icon:'❓',titulo:`Consulta sin respuesta hace ${fmtHoras(h)}: ${esc(p.nombre)}`,
          texto:`${esc(c.deNombre)} → ${AREAS[c.para]||esc(c.para)}: ${esc(c.texto.slice(0,90))}`,id:p.id});});
    (p.faltantes||[]).forEach(f=>{if(!f.resuelto&&(esOp()||p.supId===myId))
      alertas.push({tipo:f.frena?'error':'warn',icon:'📦',titulo:`${f.frena?'TRABAJO FRENADO por falta de':'Falta'} ${esc(f.mat)}: ${esc(p.nombre)}`,
        texto:`Pedido por ${esc(f.autor)} hace ${fmtHoras(horasDesde(f.ts))}. Se necesita para ${esc(f.para)}.`,id:p.id});});
    if(e==='asignacion'&&esOp())
      alertas.push({tipo:'warn',icon:'🧭',titulo:`Sin asignar: ${esc(p.nombre)}`,texto:`Esperando supervisor, fechas y presupuesto de costos.`,id:p.id});
    if(e!=='ejecucion') return;
    const dr=diasRestantes(p.entrega), esperado=calcAvanceEsperado(p), av=p.avance||0, c=costoInfo(p), sup=esc(supNombre(p))||'—';
    if(c.presTot&&c.realTot>c.presTot*1.05)
      alertas.push({tipo:'error',icon:'💸',titulo:`COSTO EXCEDIDO: ${esc(p.nombre)}`,
        texto:`Real ${usd(c.realTot)} vs presupuesto ${usd(c.presTot)} (${pct((c.realTot-c.presTot)/c.presTot*100)}). Supervisor: ${sup}`,id:p.id});
    else if(c.idx!==null&&av>=10&&c.idx>1.10)
      alertas.push({tipo:'warn',icon:'💲',titulo:`Gasto más rápido que el avance: ${esc(p.nombre)}`,
        texto:`Índice costo/avance ${c.idx.toFixed(2)}. Proyectado al cierre: ${usd(c.proy)} vs presupuesto ${usd(c.presTot)}`,id:p.id});
    if(p.estado==='finalizado'||p.estado==='presupuesto') return;
    if(dr!==null&&dr<0) alertas.push({tipo:'error',icon:'🚨',titulo:`VENCIDO: ${esc(p.nombre)}`,texto:`Entrega vencida hace ${Math.abs(dr)} días. Supervisor: ${sup}. Avance: ${av}%`,id:p.id});
    else if(dr!==null&&dr<=3) alertas.push({tipo:'error',icon:'🔥',titulo:`URGENTE: ${esc(p.nombre)}`,texto:`Solo ${dr} días para la entrega. Avance: ${av}%. Supervisor: ${sup}`,id:p.id});
    else if(dr!==null&&dr<=7) alertas.push({tipo:'warn',icon:'⏰',titulo:`Entrega próxima: ${esc(p.nombre)}`,texto:`${dr} días para la entrega del ${esc(p.entrega)}. Avance: ${av}%`,id:p.id});
    if(esperado-av>25) alertas.push({tipo:'error',icon:'📉',titulo:`DESVÍO DE AVANCE: ${esc(p.nombre)}`,texto:`Avance real: ${av}% — esperado: ${esperado}%. Desvío: ${esperado-av}%. Supervisor: ${sup}`,id:p.id});
    if(p.pri==='urgente') alertas.push({tipo:'warn',icon:'🚨',titulo:`Prioridad urgente: ${esc(p.nombre)}`,texto:`Este proyecto tiene prioridad URGENTE. Cliente: ${esc(p.cli)}`,id:p.id});
  });
  const lista=document.getElementById('lista-alertas');
  if(!alertas.length){lista.innerHTML=`<div class="empty"><div class="em">✅</div><h3>¡Todo en orden!</h3><p>No hay alertas ni desviaciones en este momento</p></div>`;return;}
  lista.innerHTML=alertas.map(a=>`<div class="alerta ${a.tipo==='warn'?'warn':''}" onclick="verDetalle('${esc(a.id)}')">
      <div class="alerta-icon">${a.icon}</div><div class="alerta-texto"><h4>${a.titulo}</h4><p>${a.texto}</p></div></div>`).join('');
}

// ════════════════════════════════════════════════
// PERSONAL / CONTENEDORES / MATERIALES
// ════════════════════════════════════════════════
function agregarPersona(){
  const nom=document.getElementById('np-nombre').value.trim();
  if(!nom){toast('⚠️ Ingresá el nombre');return;}
  personal.push({id:nuevoId(),nom,rol:document.getElementById('np-rol').value,tel:document.getElementById('np-tel').value});
  save(); document.getElementById('np-nombre').value=''; document.getElementById('np-tel').value=''; renderPersonal();
}
function renderPersonal(){
  const lista=document.getElementById('lista-personal');
  if(!personal.length){lista.innerHTML=`<div class="empty"><div class="em">👷</div><h3>Sin personal</h3><p>Agregá el equipo</p></div>`;return;}
  lista.innerHTML=`<div class="card">${personal.map((pe,i)=>`<div class="persona-item">
      <div class="avatar">${esc(pe.nom).charAt(0).toUpperCase()}</div>
      <div class="persona-info"><div class="persona-nombre">${esc(pe.nom)}</div>
        <div class="persona-rol">${esc(pe.rol)||'Sin rol'}${pe.tel?' · 📱'+esc(pe.tel):''}</div></div>
      <button class="btn btn-rojo btn-sm" onclick="elimPersona(${i})">✕</button></div>`).join('')}</div>`;
}
async function elimPersona(i){if(!await confirmar('¿Eliminar?'))return;personal.splice(i,1);save();renderPersonal();}
function opcionesProy(selId){
  const el=document.getElementById(selId), prev=el.value;
  el.innerHTML='<option value="">Sin proyecto</option>'+proyectos.map(p=>`<option value="${esc(p.id)}">${esc((p.nombre||'').slice(0,28))}</option>`).join('');
  el.value=prev;
}
function nombreProy(pid){const p=pid&&todos[String(pid)];return p?p.nombre:''}
function updContSel(){opcionesProy('nc-proy')}
function agregarContenedor(){
  const cod=document.getElementById('nc-cod').value.trim(), tipo=document.getElementById('nc-tipo').value;
  if(!cod||!tipo){toast('⚠️ Completá código y tipo');return;}
  contenedores.push({id:nuevoId(),cod,tipo,estado:document.getElementById('nc-estado').value,
    proyId:document.getElementById('nc-proy').value||null,obs:document.getElementById('nc-obs').value});
  save(); document.getElementById('nc-cod').value=''; document.getElementById('nc-obs').value=''; renderContenedores();
}
function renderContenedores(){
  const lista=document.getElementById('lista-contenedores');
  if(!contenedores.length){lista.innerHTML=`<div class="empty"><div class="em">📦</div><h3>Sin contenedores</h3></div>`;return;}
  const ic={'20 pies Dry':'📦','40 pies Dry':'📦','40 pies HC':'📦','20 pies Reefer':'❄️','40 pies Reefer':'❄️','Módulo Habitable':'🏠','Construcción Modular':'🔧'};
  lista.innerHTML=contenedores.map((c,i)=>{const pn=nombreProy(c.proyId);
    return `<div class="cont-item"><div class="cont-icon">${ic[c.tipo]||'📦'}</div>
      <div class="cont-info"><div class="cont-cod">${esc(c.cod)} — ${esc(c.tipo)}</div>
        <div class="cont-det">${esc(c.estado)||'—'}${pn?' · 📋 '+esc(pn.slice(0,18)):''}</div>
        ${c.obs?`<div class="cont-det">${esc(c.obs)}</div>`:''}</div>
      <button class="btn btn-rojo btn-sm" onclick="elimCont(${i})">✕</button></div>`;}).join('');
}
async function elimCont(i){if(!await confirmar('¿Eliminar?'))return;contenedores.splice(i,1);save();renderContenedores();}
function updMatSel(){opcionesProy('nm-proy')}
function agregarMaterial(){
  const nom=document.getElementById('nm-nom').value.trim();
  if(!nom){toast('⚠️ Ingresá el material');return;}
  materiales.push({id:nuevoId(),nom,cant:document.getElementById('nm-cant').value,est:document.getElementById('nm-est').value,
    proyId:document.getElementById('nm-proy').value||null});
  save(); document.getElementById('nm-nom').value=''; document.getElementById('nm-cant').value=''; renderMateriales();
}
function renderMateriales(){
  const lista=document.getElementById('lista-materiales');
  // El supervisor ve solo los materiales de sus proyectos (y los sin proyecto)
  const visibles=materiales.map((m,i)=>({m,i})).filter(({m})=>!m.proyId||MODO==='local'||esOp()||(todos[String(m.proyId)]&&puedeVer(todos[String(m.proyId)])));
  if(!visibles.length){lista.innerHTML=`<div class="empty"><div class="em">🔧</div><h3>Sin materiales</h3></div>`;return;}
  const eL={pendiente:'⏳ Pendiente',comprado:'✅ Comprado',transito:'🚛 En tránsito'};
  lista.innerHTML=`<div class="card">${visibles.map(({m,i})=>{const pn=nombreProy(m.proyId);
    return `<div class="mat-item"><div class="mat-dot dot-${esc((m.est||'p').charAt(0))}"></div>
      <div class="mat-info"><div class="mat-nom">${esc(m.nom)}</div>
        <div class="mat-det">${m.cant?'Cant: '+esc(m.cant)+' · ':''}${eL[m.est]||esc(m.est)}${pn?' · '+esc(pn.slice(0,18)):''}</div></div>
      <select onchange="cambEst(${i},this.value)" style="padding:6px;border:1.5px solid var(--borde);border-radius:8px;font-size:12px">
        <option value="pendiente" ${m.est==='pendiente'?'selected':''}>Pendiente</option>
        <option value="comprado" ${m.est==='comprado'?'selected':''}>Comprado</option>
        <option value="transito" ${m.est==='transito'?'selected':''}>Tránsito</option>
      </select>
      <button class="btn btn-rojo btn-sm" onclick="elimMat(${i})">✕</button></div>`;}).join('')}</div>`;
}
function cambEst(i,e){materiales[i].est=e;save();renderMateriales();}
async function elimMat(i){if(!await confirmar('¿Eliminar?'))return;materiales.splice(i,1);save();renderMateriales();}

// ════════════════════════════════════════════════
// USUARIOS Y ROLES
// ════════════════════════════════════════════════
// Si la persona deja de poder llevar proyectos, pregunta a quién pasárselos.
// Devuelve false si se canceló.
function pedirReasignacion(uid,motivo){
  const lista=proyectosACargo(uid);
  if(!lista.length) return Promise.resolve(true);
  return new Promise(res=>{
    const nom=nombreDe(uid);
    document.getElementById('ra-msg').textContent=`${nom} tiene ${lista.length} proyecto${lista.length>1?'s':''} en ejecución a su cargo. ${motivo} ¿A quién se los pasás?`;
    document.getElementById('ra-lista').innerHTML=lista.map(p=>`<div class="drow"><span class="lbl">${esc(p.nombre)}</span><span class="val">${p.avance||0}%</span></div>`).join('');
    const sel=document.getElementById('ra-sup');
    sel.innerHTML=opcionesSupervisores('').replace(new RegExp('<option value="'+uid.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^<]*</option>'),'').replace('Sin asignar','Elegí un supervisor…');
    const ov=document.getElementById('m-reasig');
    const fin=v=>{ov.classList.remove('active');res(v)};
    document.getElementById('ra-si').onclick=async()=>{
      const s=sel.value; if(!s){toast('⚠️ Elegí a quién pasárselos');return;}
      for(const p0 of lista){const p=limpiar(p0);p.supId=s;p.sup=nombreDe(s);
        p.flujo=(p.flujo||[]);p.flujo.push({fecha:hoyISO(),a:'ejecucion',autor:currentUser.nombre+' (reasignado de '+nom+' a '+p.sup+')'});
        await guardarProyecto(p);}
      toast('✅ '+lista.length+' proyecto'+(lista.length>1?'s':'')+' reasignado'+(lista.length>1?'s':'')+' a '+nombreDe(s));
      fin(true);
    };
    document.getElementById('ra-no').onclick=()=>fin(true);
    document.getElementById('ra-cancel').onclick=()=>fin(false);
    ov.onclick=e=>{if(e.target===ov)fin(false)};
    ov.classList.add('active');
  });
}
// ════════════════════════════════════════════════
// REPORTES
// ════════════════════════════════════════════════
function renderReportes(){
  const ej=proyectos.filter(p=>etapaDe(p)==='ejecucion');
  const total=proyectos.length, enCurso=ej.filter(p=>p.estado==='en-curso');
  const totalVal=proyectos.reduce((s,p)=>s+(parseFloat(p.val)||0),0);
  const desviados=proyectos.filter(esDesviado);
  const avProm=enCurso.length?Math.round(enCurso.reduce((s,p)=>s+(p.avance||0),0)/enCurso.length):0;
  const tiposCount={}; proyectos.forEach(p=>{tiposCount[p.tipo]=(tiposCount[p.tipo]||0)+1;});
  let presT=0,realT=0; const conCosto=ej.filter(p=>{const c=costoInfo(p);presT+=c.presTot;realT+=c.realTot;return c.presTot||c.realTot;});
  const filasEtapa=MODO==='nube'?['ventas','arquitectura','asignacion'].map(k=>({lbl:ETAPA[k].label,cls:ETAPA[k].cls,n:proyectos.filter(p=>etapaDe(p)===k).length})):[];
  const filasEst=['presupuesto','en-curso','finalizado','pausado'].map(k=>({lbl:EC[k].label,cls:EC[k].cls,n:ej.filter(p=>p.estado===k).length}));
  const sups={}; ej.forEach(p=>{const s=supNombre(p); if(s){sups[s]=sups[s]||{n:0,d:0};sups[s].n++;if(esDesviado(p))sups[s].d++;}});
  const resp={}, abiertas={}, inc={}, incVend={}; let faltT=0,faltA=0,faltH=0,faltR=0,frenados=0;
  proyectos.forEach(p=>{
    (p.consultas||[]).forEach(c=>{const k=c.para; if(c.respuesta){resp[k]=resp[k]||[];resp[k].push(horasDesde(c.ts,c.respTs));} else abiertas[k]=(abiertas[k]||0)+1;});
    (p.incidencias||[]).forEach(x=>{inc[x.origen]=(inc[x.origen]||0)+1; if(x.origen==='ventas'){const v=x.vend||'Sin vendedor';incVend[v]=(incVend[v]||0)+1;} if(x.frena) frenados++;});
    (p.faltantes||[]).forEach(f=>{faltT++; if(f.resuelto){faltR++;faltH+=horasDesde(f.ts,f.resTs);} else faltA++; if(f.frena) frenados++;});
  });
  const prom=a=>a&&a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  const conInfo=proyectos.filter(p=>etapaDe(p)!=='ventas').length;
  const conErr=proyectos.filter(p=>(p.incidencias||[]).length).length;
  const cardCom=`<div class="card"><div class="card-title" style="margin-bottom:10px">🗣️ Comunicación y calidad de la información</div>
    <table class="tcost"><tr><th>Área</th><th>Respuesta promedio</th><th>Sin responder</th></tr>
    ${Object.keys(AREAS).map(k=>{const pr=prom(resp[k]);return `<tr><td>${AREAS[k]}</td><td class="${pr===null?'':claseSla(pr)}">${pr===null?'—':fmtHoras(pr)}</td><td>${abiertas[k]||0}</td></tr>`;}).join('')}</table>
    <div class="drow"><span class="lbl">Proyectos con errores de medidas o planos</span><span class="val">${conErr} de ${conInfo}${conInfo?' ('+Math.round(conErr/conInfo*100)+'%)':''}</span></div>
    <div class="drow"><span class="lbl">Errores originados en ventas / arquitectura</span><span class="val">${inc.ventas||0} / ${inc.arquitectura||0}</span></div>
    ${Object.keys(incVend).length?`<div class="drow"><span class="lbl">Errores de ventas por vendedor</span><span class="val">${Object.entries(incVend).sort((a,b)=>b[1]-a[1]).map(([v,n])=>esc(v)+': '+n).join(' · ')}</span></div>`:''}
    <div class="drow"><span class="lbl">Faltantes de material (abiertos / total)</span><span class="val">${faltA} / ${faltT}</span></div>
    <div class="drow"><span class="lbl">Tiempo promedio para resolver un faltante</span><span class="val">${faltR?fmtHoras(faltH/faltR):'—'}</span></div>
    <div class="drow"><span class="lbl">Veces que el trabajo se frenó</span><span class="val">${frenados}</span></div>
  </div>`;
  document.getElementById('reporte-content').innerHTML=`
    ${MODO==='nube'?cardCom:''}
    <div class="stats-4">
      <div class="stat-box nar"><div class="stat-num">${total}</div><div class="stat-lbl">Total proyectos</div></div>
      <div class="stat-box azul"><div class="stat-num">${enCurso.length}</div><div class="stat-lbl">En curso</div></div>
      <div class="stat-box verde"><div class="stat-num" style="font-size:20px">${usd(totalVal)}</div><div class="stat-lbl">Valor total</div></div>
      <div class="stat-box rojo"><div class="stat-num">${desviados.length}</div><div class="stat-lbl">Desviados</div></div>
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:10px">📊 Por etapa y estado</div>
      ${[...filasEtapa,...filasEst].map(f=>{const pc=total?Math.round(f.n/total*100):0;
        return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span class="badge ${f.cls}">${f.lbl}</span><span>${f.n} (${pc}%)</span></div>
          <div class="prog-bar"><div class="prog-fill prog-nar" style="width:${pc}%"></div></div></div>`;}).join('')}
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:10px">💰 Costos: presupuestado vs real</div>
      ${conCosto.length?`<div class="drow"><span class="lbl">Presupuesto total</span><span class="val">${usd(presT)}</span></div>
        <div class="drow"><span class="lbl">Costo real cargado</span><span class="val">${usd(realT)}</span></div>
        <table class="tcost" style="margin-top:8px"><tr><th>Proyecto</th><th>Avance</th><th>Presup.</th><th>Real</th></tr>
        ${conCosto.map(p=>{const c=costoInfo(p);const mal=costoDesviado(p);
          return `<tr onclick="verDetalle('${esc(p.id)}')" style="cursor:pointer"><td>${esc((p.nombre||'').slice(0,20))}</td><td>${p.avance||0}%</td><td>${usd(c.presTot)}</td><td class="${mal?'rojo':''}">${usd(c.realTot)}</td></tr>`;}).join('')}</table>`
        :'<div style="font-size:13px;color:var(--gris-m)">Todavía no hay presupuestos de costos ni gastos cargados. Se cargan al asignar el proyecto y desde cada proyecto en ejecución.</div>'}
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:10px">📦 Por tipo de trabajo</div>
      ${Object.entries(tiposCount).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`<div class="drow"><span class="lbl">${esc(t)}</span><span class="val">${n} proyecto${n>1?'s':''}</span></div>`).join('')||'—'}
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:10px">📈 Avance promedio (en curso)</div>
      <div style="font-size:38px;font-weight:800;color:var(--nar);text-align:center">${avProm}%</div>
      <div class="prog-bar" style="height:16px;margin-top:10px"><div class="prog-fill prog-nar" style="width:${avProm}%"></div></div>
    </div>
    ${desviados.length?`<div class="card" style="border-left:4px solid var(--rojo)">
      <div class="card-title" style="color:var(--rojo);margin-bottom:10px">⚠️ Proyectos desviados (${desviados.length})</div>
      ${desviados.map(p=>`<div class="drow"><span class="lbl">${esc((p.nombre||'').slice(0,22))}</span>
        <span class="val" style="color:var(--rojo)">Real: ${p.avance||0}% / Esp: ${calcAvanceEsperado(p)}%${costoDesviado(p)?' · costo':''}</span></div>`).join('')}
    </div>`:''}
    <div class="card"><div class="card-title" style="margin-bottom:10px">👷 Supervisores y carga</div>
      ${Object.entries(sups).map(([s,x])=>`<div class="drow"><span class="lbl">👷 ${esc(s)}</span>
        <span class="val">${x.n} proyectos${x.d>0?` · <span style="color:var(--rojo)">${x.d} desviados</span>`:''}</span></div>`).join('')||'<div style="font-size:13px;color:var(--gris-m)">Sin supervisores asignados</div>'}
    </div>`;
  const mig=document.getElementById('btn-migrar');
  if(mig) mig.style.display=(MODO==='nube'&&soyOwner&&LS.g('proyectos2').length)?'':'none';
}

// ════════════════════════════════════════════════
// EXPORTAR / RESPALDO / MIGRACIÓN
// ════════════════════════════════════════════════
function csvq(v){return '"'+String(v??'').replace(/"/g,"'")+'"'}
function exportCSV(){
  let csv='ID,Nombre,Cliente,Tipo,Etapa,Estado,Avance%,AvanceEsperado%,Inicio,Entrega,ValorUSD,PresupuestoCostoUSD,CostoRealUSD,Supervisor,Vendedor,Personas,Deposito,Prioridad,Desviado,Planos,Observaciones\n';
  proyectos.forEach(p=>{const c=costoInfo(p);
    csv+=[csvq(p.id),csvq(p.nombre),csvq(p.cli),csvq(p.tipo),csvq(etapaDe(p)),csvq(p.estado),p.avance||0,calcAvanceEsperado(p),csvq(p.inicio),csvq(p.entrega),
      Number(p.val)||0,c.presTot,c.realTot,csvq(supNombre(p)),csvq(p.vend),p.pers||0,csvq(p.dep),csvq(p.pri||'normal'),esDesviado(p)?'SÍ':'NO',(p.planos||[]).length,csvq(p.obs)].join(',')+'\n';});
  downloadFile('﻿'+csv,'BoxTainer_Proyectos_'+hoyISO()+'.csv','text/csv');
}
function exportPersonalCSV(){
  let csv='ID,Nombre,Rol,Telefono\n';
  personal.forEach(pe=>{csv+=`${pe.id},${csvq(pe.nom)},${csvq(pe.rol)},${csvq(pe.tel)}\n`;});
  downloadFile('﻿'+csv,'BoxTainer_Personal_'+hoyISO()+'.csv','text/csv');
}
async function downloadFile(content,filename,type){
  const blob=new Blob([content],{type});
  if(window.claude&&typeof window.claude.use==='function'){
    try{const dl=await window.claude.use('downloads');
      if(dl){try{await dl.save({filename,data:blob});toast('📥 Archivo listo');}
        catch(e){toast(e&&e.code==='declined'?'Descarga cancelada':'⚠️ No se pudo descargar en esta vista');}return;}
    }catch(e){}
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function exportBackup(){
  const data={v:3,fecha:new Date().toISOString(),proyectos:Object.values(todos),personal,contenedores,materiales,usuarios:MODO==='local'?usuarios:[]};
  downloadFile(JSON.stringify(data,null,1),'BoxTainer_Respaldo_'+hoyISO()+'.json','application/json');
  toast('💾 Respaldo descargado');
}
// ════════════════════════════════════════════════
// OVERLAYS
// ════════════════════════════════════════════════
function confirmar(msg){
  return new Promise(res=>{
    document.getElementById('cf-msg').textContent=msg;
    const ov=document.getElementById('m-confirm');
    const fin=v=>{ov.classList.remove('active');res(v)};
    document.getElementById('cf-si').onclick=()=>fin(true);
    document.getElementById('cf-no').onclick=()=>fin(false);
    ov.onclick=e=>{if(e.target===ov)fin(false)};
    ov.classList.add('active');
  });
}
function openOverlay(id){document.getElementById(id).classList.add('active');}
function closeOverlay(id){document.getElementById(id).classList.remove('active');}
document.querySelectorAll('.overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('active');});});

// ════════════════════════════════════════════════
// SPLASH · BANNER IPHONE · INICIO
// ════════════════════════════════════════════════
function hideBanner(){
  try{localStorage.setItem('bxt_installed','1')}catch(e){}
  document.getElementById('install-banner').classList.remove('show');
}
(function init(){
  iniciarNube();
  const ocultarSplash=()=>{
    const s=document.getElementById('pwa-splash'); if(!s) return;
    s.classList.add('hide'); setTimeout(()=>s.remove(),700);
    let ya=null; try{ya=localStorage.getItem('bxt_installed')}catch(e){}
    const standalone=window.navigator.standalone||window.matchMedia('(display-mode: standalone)').matches;
    if(!standalone&&!ya&&/iPhone|iPad|iPod/.test(navigator.userAgent))
      setTimeout(()=>document.getElementById('install-banner').classList.add('show'),3000);
  };
  setTimeout(ocultarSplash,1300);
})();

