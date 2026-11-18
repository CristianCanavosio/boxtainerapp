// ════════════════════════════════════════════════
// PEDIDOS A LAS CARPINTERÍAS (aluminio y madera) Y A LOS TÉCNICOS DE AIRE
// El líder, después de validar el stock, pide las aberturas a la fábrica (aluminio), lo de madera
// y la colocación de los aires a los técnicos. El supervisor también puede pedir durante la obra.
// Los aires usan el mismo circuito (migración 0017): aceptan con fecha, colocan y avisan.
// Cada carpintería entra con su usuario, ve solo sus pedidos y los planos de esos proyectos,
// acepta con fecha comprometida y va marcando el estado. El supervisor confirma cuando lo
// recibe. Los permisos y los pasos válidos los controla la base (migración 0009).
// Sin precios: la plata la ve solo el administrador.
// ════════════════════════════════════════════════
let pcListo=false;            // false si todavía no se corrió la migración 0009
let pedidosCarp=[];           // todos los pedidos que este usuario puede ver
let pcPlanos={};              // proyecto_id -> planos (para la carpintería, que no ve el proyecto)
let pcFiltro='activos';
const TALLER={
  aluminio:{t:'🪟 Carpintería de aluminio',c:'aluminio',a:'la carpintería de aluminio',corto:'Aluminio',pedir:'🪟 Aberturas a la fábrica'},
  madera:{t:'🪵 Carpintería de madera',c:'madera',a:'la carpintería de madera',corto:'Madera',pedir:'🪵 Pedir a madera'},
  aires:{t:'❄️ Técnicos de aire',c:'aires',a:'los técnicos de aire',corto:'Aires',pedir:'❄️ Colocación de aires',coloca:true},
};
const TALLERES=Object.keys(TALLER);
const PC_EST={
  enviado:{t:'📨 Enviado',cls:'b-azul'},
  aceptado:{t:'👍 Aceptado',cls:'b-morado'},
  en_fabricacion:{t:'🔨 En fabricación',cls:'b-nar'},
  listo:{t:'✅ Listo para retirar',cls:'b-verde'},
  entregado:{t:'📦 Recibido en obra',cls:'b-gris'},
  rechazado:{t:'⛔ Rechazado',cls:'b-rojo'},
  cancelado:{t:'✖️ Cancelado',cls:'b-gris'},
};
// los técnicos de aire no fabrican: colocan en la obra
const PC_EST_AIRE={en_fabricacion:{t:'🔧 Colocando',cls:'b-nar'},listo:{t:'✅ Colocado',cls:'b-verde'},entregado:{t:'👌 Revisado en obra',cls:'b-gris'}};
const estPC=(x,e)=>(TALLER[x.taller]?.coloca&&PC_EST_AIRE[e||x.estado])||PC_EST[e||x.estado]||{t:e||x.estado,cls:''};
const aQuien=x=>TALLER[x.taller]?.a||'la carpintería';
const PC_ABIERTO=['enviado','aceptado','en_fabricacion','listo','rechazado'];
const miTaller=()=>({carp_aluminio:'aluminio',carp_madera:'madera',tecnico_aires:'aires'})[rol()]||null;
const esTaller=()=>!!miTaller();

async function cargarPedidosCarp(T){
  pcListo=false; pedidosCarp=[]; pcPlanos={};
  Object.values(T).forEach(p=>{delete p.pedidosCarp;});
  try{
    const rs=await traer('pedidos_carpinteria');
    pedidosCarp=rs.map(r=>({id:r.id,num:r.numero,pid:r.proyecto_id,taller:r.taller,proy:r.proyecto_nombre||'',
      items:Array.isArray(r.items)?r.items:[],para:r.para_fecha||'',donde:r.entregar_en||'',obs:r.observaciones||'',
      estado:r.estado,comp:r.fecha_compromiso||'',nota:r.nota_taller||'',hist:Array.isArray(r.historial)?r.historial:[],
      porId:r.creado_por,por:nombreDe(r.creado_por),ts:ts(r.creado_en),fecha:fechaDe(r.creado_en)}));
    pedidosCarp.sort((a,b)=>(b.ts||0)-(a.ts||0));
    pedidosCarp.forEach(x=>{const p=T[x.pid]; if(p) (p.pedidosCarp=p.pedidosCarp||[]).push(x);});
    pcListo=true;
  }catch(e){console.warn('Pedidos a carpinterías no disponibles (¿falta la migración 0009?)',e);return;}
  try{pcAvisar();}catch(e){console.warn('Avisos de pedidos',e);}
  pintarBurbujaPC();
  // la carpintería no ve los proyectos, pero sí los planos de los proyectos con pedido suyo
  const pids=[...new Set(pedidosCarp.map(x=>x.pid))].filter(pid=>!T[pid]);
  if(pids.length){
    try{
      const {data,error}=await sb.from('planos').select('*').in('proyecto_id',pids);
      if(error) throw error;
      (data||[]).forEach(r=>(pcPlanos[r.proyecto_id]=pcPlanos[r.proyecto_id]||[]).push({nombre:r.nombre,archivo:r.archivo||null,url:r.enlace||''}));
    }catch(e){console.warn('No se pudieron leer los planos',e);}
  }
}

// ── semáforo del pedido ──
function diasHasta(iso){if(!iso) return null;const [y,m,d]=iso.split('-').map(Number);const h=new Date();h.setHours(0,0,0,0);return Math.round((new Date(y,m-1,d)-h)/864e5);}
function fmtFecha(iso){if(!iso) return '—';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
function avisoPedido(x){
  if(x.estado==='enviado'){const h=horasDesde(x.ts);
    if(h>24) return {c:'rojo',t:`Sin respuesta de ${aQuien(x)} hace ${fmtHoras(h)}`};
    if(h>SLA_HORAS) return {c:'amar',t:`Sin respuesta hace ${fmtHoras(h)}`};
    return null;}
  if(x.estado==='rechazado') return {c:'rojo',t:'Rechazado: '+(x.nota||'sin motivo')};
  if(x.estado==='aceptado'||x.estado==='en_fabricacion'){
    const dc=diasHasta(x.comp);
    if(dc!==null&&dc<0) return {c:'rojo',t:`Atrasado: tenía que estar el ${fmtFecha(x.comp)}`};
    if(x.para&&x.comp&&x.comp>x.para) return {c:'amar',t:`${TALLER[x.taller]?.coloca?'Los técnicos colocan':'La carpintería lo tiene'} el ${fmtFecha(x.comp)}, la obra lo necesita el ${fmtFecha(x.para)}`};
    if(dc!==null&&dc<=2) return {c:'amar',t:dc===0?'Vence hoy':`Vence en ${dc} día${dc>1?'s':''}`};
  }
  if(x.estado==='listo') return {c:'verde',t:TALLER[x.taller]?.coloca?'Colocado: revisalo en la obra':'Listo: coordinar retiro o entrega'};
  return null;
}

// ── quién puede hacer qué (la base vuelve a controlarlo) ──
function puedePedirCarp(p){
  if(MODO!=='nube'||!pcListo||rol()==='lectura') return false;
  const e=etapaDe(p);
  return (esOp()&&(e==='asignacion'||e==='ejecucion'))||(rol()==='supervisor'&&p.supId===myId&&e==='ejecucion');
}
function esObraDe(x){const p=todos[x.pid];return rol()!=='lectura'&&(esOp()||(p&&p.supId===myId));}

// ── tarjeta de un pedido (la usan la obra y la carpintería) ──
function itemsHTML(x){
  return `<div class="pc-items">${x.items.map(it=>`<div class="pc-it"><b>${esc(it.cant||'')} ${esc(it.unidad||'')}</b> ${esc(it.desc||'')}${it.medida?` <small>${esc(it.medida)}</small>`:''}</div>`).join('')}</div>`;
}
function histHTML(x){
  if(!x.hist.length) return '';
  return `<details class="pc-hist"><summary>Historial (${x.hist.length})</summary>${x.hist.map(h=>{
    const quien=h.por?nombreDe(h.por):'', cuando=h.en?new Date(h.en).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}):'';
    const que=h.estado?estPC(x,h.estado).t:`📅 Fecha corrida a ${fmtFecha(h.fecha)}${h.antes?' (antes '+fmtFecha(h.antes)+')':''}`;
    return `<div>${esc(cuando)} · ${esc(quien)}: ${que}${h.nota?` <small>“${esc(h.nota)}”</small>`:''}</div>`;}).join('')}</details>`;
}
function tarjetaPedido(x,{conProyecto}={}){
  const av=avisoPedido(x), id=esc(x.id), taller=esTaller()&&x.taller===miTaller(), obra=!taller&&esObraDe(x);
  const planos=conProyecto&&taller?(pcPlanos[x.pid]||[]):[];
  let acc='';
  if(taller){
    if(x.estado==='enviado') acc=`<button class="btn btn-verde btn-sm" onclick="pcResponder('${id}','aceptado')">👍 Aceptar</button>
      <button class="btn btn-rojo btn-sm" onclick="pcResponder('${id}','rechazado')">⛔ Rechazar</button>`;
    const col=TALLER[x.taller]?.coloca;
    if(x.estado==='aceptado') acc=`<button class="btn btn-nar btn-sm" onclick="pcEstado('${id}','en_fabricacion')">${col?'🔧 Empezamos a colocar':'🔨 Empezamos a fabricar'}</button>`;
    if(x.estado==='aceptado'||x.estado==='en_fabricacion') acc+=`<button class="btn btn-verde btn-sm" onclick="pcEstado('${id}','listo')">${col?'✅ Está colocado':'✅ Está listo'}</button>
      <button class="btn btn-sec btn-sm" onclick="pcResponder('${id}','fecha')">📅 Correr la fecha</button>`;
  }else if(obra){
    if(x.estado==='rechazado') acc=`<button class="btn btn-nar btn-sm" onclick="abrirPedidoCarp('${esc(x.pid)}','${esc(x.taller)}','${id}')">✏️ Corregir y reenviar</button>`;
    if(['aceptado','en_fabricacion','listo'].includes(x.estado)) acc+=`<button class="btn btn-verde btn-sm" onclick="pcEstado('${id}','entregado')">${TALLER[x.taller]?.coloca?'👌 Quedó bien':'📦 Lo recibimos'}</button>`;
    if(x.estado==='enviado') acc+=`<button class="btn btn-sec btn-sm" onclick="pcWhatsapp('${id}')">📲 Avisar por WhatsApp</button>`;
    if(PC_ABIERTO.includes(x.estado)) acc+=`<button class="btn btn-sec btn-sm" onclick="pcEstado('${id}','cancelado')">✖️ Cancelar</button>`;
  }
  return `<div class="pc-card ${av?'pc-'+av.c:''}">
    <div class="pc-top"><div><b>Pedido #${esc(x.num)}</b> · ${TALLER[x.taller]?.t||esc(x.taller)}
      ${conProyecto?`<div class="pc-proy"${!taller&&todos[x.pid]?` onclick="verDetalle('${esc(x.pid)}')"`:''}>📋 ${esc(x.proy)}</div>`:''}</div>
      <span class="badge ${estPC(x).cls}">${esc(estPC(x).t)}</span></div>
    ${av?`<div class="pc-aviso ${av.c}">${esc(av.t)}</div>`:''}
    ${itemsHTML(x)}
    <div class="pc-datos">
      <span>Pedido por <b>${esc(x.por)}</b> el ${esc(fmtFecha(x.fecha))}</span>
      <span>La obra lo necesita: <b>${esc(fmtFecha(x.para))}</b></span>
      ${x.comp?`<span>${TALLER[x.taller]?.coloca?'Fecha de colocación':'Fecha de la carpintería'}: <b>${esc(fmtFecha(x.comp))}</b></span>`:''}
      ${x.donde?`<span>${TALLER[x.taller]?.coloca?'Dónde se coloca':'Entregar en'}: <b>${esc(x.donde)}</b></span>`:''}
      ${x.obs?`<span>Notas: ${esc(x.obs)}</span>`:''}
      ${x.nota&&x.estado!=='rechazado'?`<span>${TALLER[x.taller]?.coloca?'Técnicos':'Carpintería'}: “${esc(x.nota)}”</span>`:''}
    </div>
    ${planos.length?`<div class="pc-planos">${planos.map(pl=>`<a href="${esc(pl.url||'#')}" ${pl.archivo?`onclick="abrirPlano(event,'${esc(pl.archivo)}')"`:''} target="_blank" rel="noopener noreferrer">${pl.archivo?'📄':'🔗'} ${esc(pl.nombre)}</a>`).join('')}</div>`:''}
    ${histHTML(x)}
    ${acc?`<div class="pc-acc">${acc}</div>`:''}
  </div>`;
}

// ── sección dentro del detalle del proyecto ──
function seccionPedidosCarp(p){
  if(MODO!=='nube') return '';
  if(!(esOp()||rol()==='lectura'||(rol()==='supervisor'&&p.supId===myId))) return '';
  const e=etapaDe(p); if(!(e==='asignacion'||e==='ejecucion')) return '';
  if(!pcListo) return esOp()?`<div class="dsec"><h3>🪚 Pedidos a carpinterías y técnicos</h3><div style="font-size:13px">Para activarlo hay que correr la migración <b>0009_pedidos_a_carpinterias.sql</b> en Supabase.</div></div>`:'';
  const ls=p.pedidosCarp||[], pid=esc(p.id);
  return `<div class="dsec" id="pc-sec"><h3>🪚 Pedidos a carpinterías y técnicos (${ls.length})</h3>
    ${ls.length?ls.map(x=>tarjetaPedido(x)).join(''):'<div style="font-size:13px;color:var(--gris-m);margin-bottom:8px">Todavía no se pidió nada.</div>'}
    ${puedePedirCarp(p)?`<div class="flex-btns" style="flex-wrap:wrap;margin-top:6px">
      ${tallersDisponibles().map(k=>`<button class="btn btn-sec btn-sm" onclick="abrirPedidoCarp('${pid}','${k}')">${TALLER[k].pedir}</button>`).join('')}</div>`:''}
  </div>`;
}
// los aires necesitan la migración 0017: si falta, el pedido a aires da error y se avisa
const pcAires=true;
const tallersDisponibles=()=>TALLERES.filter(k=>k!=='aires'||pcAires);

// ── paso del líder: después de validar el stock, pedir aberturas y aires ──
// Qué hay que pedir según la nota: aberturas a la fábrica (aluminio), lo de madera y la colocación
// de los aires. Para cada uno: el pedido que ya salió, o el botón para mandarlo.
function pedidosNecesarios(p){
  if(!esNota(p)) return [];
  return tallersDisponibles().filter(k=>sugerenciasCarp(p,k).length);
}
function pedidoVigente(p,k){return (p.pedidosCarp||[]).find(x=>x.taller===k&&x.estado!=='cancelado');}
function faltaPedir(p){
  if(MODO!=='nube'||!pcListo) return [];
  return pedidosNecesarios(p).filter(k=>!pedidoVigente(p,k));
}
const NOMBRE_NEC={aluminio:'Aberturas a la fábrica',madera:'Carpintería de madera',aires:'Colocación de aires'};
function bloquePedidosLider(p,stockOk){
  if(MODO!=='nube') return '';
  if(!pcListo) return `<p style="font-size:12px;color:var(--gris-m);margin-bottom:8px">📨 Para pedir aberturas y aires desde acá hay que correr las migraciones 0009 y 0017 en Supabase.</p>`;
  const nec=pedidosNecesarios(p), pid=esc(p.id);
  const otros=tallersDisponibles().filter(k=>!nec.includes(k)&&pedidoVigente(p,k));
  const filas=[...nec,...otros].map(k=>{const x=pedidoVigente(p,k);
    return `<div class="drow"><span class="lbl">${esc(NOMBRE_NEC[k])}</span><span class="val">${x
      ?`<span class="badge ${estPC(x).cls}">${esc(estPC(x).t)}</span> N° ${esc(x.num)}`
      :`<button class="btn btn-nar btn-sm" ${stockOk?'':'disabled title="Primero validá el stock"'} onclick="abrirPedidoCarp('${pid}','${k}')">📨 Pedir</button>`}</span></div>`;}).join('');
  const falta=nec.filter(k=>!pedidoVigente(p,k));
  const extra=tallersDisponibles().filter(k=>!nec.includes(k)&&!pedidoVigente(p,k)); // pedidos que la nota no sugiere
  return `<div style="margin-bottom:10px"><div style="font-size:13px;font-weight:700;margin-bottom:4px">📨 Pedidos${stockOk?'':' <span style="font-weight:400;color:var(--gris-m)">(primero validá el stock)</span>'}</div>
    ${filas||`<div style="font-size:12px;color:var(--gris-m)">La nota no tiene aberturas ni aires para pedir.</div>`}
    ${falta.length&&stockOk?`<div style="font-size:12px;color:var(--nar,#c66a00);margin-top:4px">Falta pedir: ${falta.map(k=>esc(NOMBRE_NEC[k].toLowerCase())).join(', ')}. Revisá la lista antes de mandarla.</div>`:''}
    ${extra.length?`<div class="flex-btns" style="flex-wrap:wrap;margin-top:6px">${extra.map(k=>`<button class="btn btn-sec btn-sm" ${stockOk?'':'disabled'} onclick="abrirPedidoCarp('${pid}','${k}')">${TALLER[k].pedir}</button>`).join('')}</div>`:''}
  </div>`;
}

// ── formulario del pedido ──
// Sugerencias que salen de la nota de pedido (el supervisor las revisa y corrige)
const SUGERIR={
  aluminio:c=>/^Ventana|^Puerta exterior · (?!Original)|^Mosquitero/.test(c),
  madera:c=>/^Puerta interior · Madera|Bajo mesada|Alacena|^Sanitario · Mueble/.test(c),
  aires:c=>/^Aire acondicionado|^Pre-instalación de aire/.test(c),
};
function sugerenciasCarp(p,taller){
  if(!esNota(p)) return [];
  return NotaPedido.lineasCosteo(p.ficha).filter(x=>SUGERIR[taller](x.clave))
    .map(x=>({desc:x.clave+(x.pend?' (a confirmar)':''),medida:x.det||'',cant:String(x.cant),unidad:x.unidad||'c/u'}));
}
let pcForm=null; // {pid,taller,editId,items}
function abrirPedidoCarp(pid,taller,editId){
  const p=todos[pid]; if(!p) return;
  if(!TALLER[taller]) return;
  const prev=editId?pedidosCarp.find(x=>x.id===editId):null;
  const sug=sugerenciasCarp(p,taller);
  pcForm={pid,taller,editId:editId||null,sug,
    items:prev?prev.items.map(x=>({...x})):(sug.length?sug.map(x=>({...x})):[{desc:'',medida:'',cant:'1',unidad:'c/u'}]),
    para:prev?prev.para:'',donde:prev?prev.donde:(p.dep||''),obs:prev?prev.obs:''};
  pintarFormPedido();
  closeOverlay('m-det'); openOverlay('m-pedcarp');
}
function pintarFormPedido(){
  const f=pcForm, p=todos[f.pid];
  const T=TALLER[f.taller], col=T.coloca;
  document.getElementById('m-pedcarp-title').textContent=(f.editId?'✏️ Reenviar a ':T.t.split(' ')[0]+' Pedido a ')+T.a;
  document.getElementById('pc-form').innerHTML=`
    <div style="font-size:13px;color:var(--gris-m);margin-bottom:10px">📋 ${esc(p.nombre)}${f.sug.length&&!f.editId?' · Cargamos lo que dice la nota de pedido: revisalo, sacá lo que no va y agregá lo que falte.':''}</div>
    <div class="fg"><label>Qué se pide</label>
      ${f.items.map((it,i)=>`<div class="pc-fila">
        <input placeholder="Descripción (ej: ${col?'Split 3.000 fg frío/calor':'Ventana Módena corrediza'})" value="${esc(it.desc)}" oninput="pcForm.items[${i}].desc=this.value">
        <div class="pc-fila2">
          <input placeholder="${col?'Dónde va (ej: dormitorio, pared frontal)':'Medida (ej: 120 × 100 cm)'}" value="${esc(it.medida)}" oninput="pcForm.items[${i}].medida=this.value">
          <input type="number" min="0" step="0.01" placeholder="Cant." value="${esc(it.cant)}" oninput="pcForm.items[${i}].cant=this.value" style="width:80px">
          <input placeholder="c/u" value="${esc(it.unidad)}" oninput="pcForm.items[${i}].unidad=this.value" style="width:64px">
          <button class="btn btn-rojo btn-sm" onclick="pcQuitarItem(${i})" ${f.items.length<2?'disabled':''}>✕</button>
        </div></div>`).join('')}
      <button class="btn btn-sec btn-sm" onclick="pcAgregarItem()">➕ Agregar ítem</button>
      ${f.sug.length&&f.editId?`<button class="btn btn-sec btn-sm" onclick="pcCargarSug()">📋 Volver a cargar desde la nota</button>`:''}
    </div>
    <div class="form-2">
      <div class="fg"><label>¿Para cuándo lo necesita la obra?</label><input type="date" value="${esc(f.para)}" min="${hoyISO()}" oninput="pcForm.para=this.value"></div>
      <div class="fg"><label>${col?'Dónde se coloca':'Dónde se entrega'}</label><input value="${esc(f.donde)}" placeholder="Depósito, obra…" oninput="pcForm.donde=this.value"></div>
    </div>
    <div class="fg"><label>Notas para ${esc(T.a)}</label><textarea placeholder="${col?'Equipo provisto por nosotros o por ellos, altura, desagüe, contacto en obra…':'Color, línea, vidrio, herrajes, contacto en obra…'}" oninput="pcForm.obs=this.value">${esc(f.obs)}</textarea></div>
    <div style="font-size:12px;color:var(--gris-m)">${col?'Los técnicos ven':'La carpintería ve'} este pedido y los planos del proyecto. No ${col?'ven':'ve'} precios ni el resto del proyecto.</div>`;
}
function pcAgregarItem(){pcForm.items.push({desc:'',medida:'',cant:'1',unidad:'c/u'});pintarFormPedido();}
function pcQuitarItem(i){pcForm.items.splice(i,1);pintarFormPedido();}
function pcCargarSug(){pcForm.items=pcForm.sug.map(x=>({...x}));pintarFormPedido();}
async function enviarPedidoCarp(btn){
  const f=pcForm; if(!f) return;
  const items=f.items.map(x=>({desc:(x.desc||'').trim(),medida:(x.medida||'').trim(),cant:String(x.cant||'').trim(),unidad:(x.unidad||'').trim()||'c/u'}))
    .filter(x=>x.desc);
  if(!items.length){toast('⚠️ Cargá al menos un ítem');return;}
  if(items.some(x=>!(Number(String(x.cant).replace(',','.'))>0))){toast('⚠️ Revisá las cantidades');return;}
  if(!f.para){toast('⚠️ Poné para cuándo lo necesita la obra');return;}
  const fila={items,para_fecha:f.para,entregar_en:f.donde.trim()||null,observaciones:f.obs.trim()||null};
  btn.disabled=true;
  try{
    if(f.editId) chk(await sb.from('pedidos_carpinteria').update({...fila,estado:'enviado'}).eq('id',f.editId));
    else chk(await sb.from('pedidos_carpinteria').insert({...fila,proyecto_id:f.pid,taller:f.taller,creado_por:myId}));
    closeOverlay('m-pedcarp'); toast('✅ Pedido enviado a '+TALLER[f.taller].a);
    const pid=f.pid; pcForm=null;
    await cargarPedidosCarp(todos); verDetalle(pid);
  }catch(e){toast(/taller_check/.test(e?.message||'')?'⚠️ Para pedir a los técnicos de aire hay que correr la migración 0017_pedidos_de_aires.sql en Supabase':msgError(e));}
  finally{btn.disabled=false;}
}

// ── cambios de estado ──
async function pcActualizar(id,cambios,ok){
  try{
    chk(await sb.from('pedidos_carpinteria').update(cambios).eq('id',id));
    toast(ok||'✅ Listo');
    await cargarPedidosCarp(todos); pcRepintar();
  }catch(e){toast(msgError(e));}
}
function pcRepintar(){
  if(document.getElementById('m-det')?.classList.contains('active')&&detalleId) verDetalle(detalleId);
  rerender();
}
async function pcEstado(id,estado){
  const x=pedidosCarp.find(y=>y.id===id); if(!x) return;
  const col=TALLER[x.taller]?.coloca;
  const msg={en_fabricacion:null,listo:col?'¿Confirmás que los aires quedaron colocados?':'¿Confirmás que el pedido está listo para retirar o entregar?',
    entregado:col?'¿Confirmás que revisaste la colocación y quedó bien?':'¿Confirmás que lo recibieron completo en la obra?',
    cancelado:`¿Cancelar el pedido? ${col?'Los técnicos lo van':'La carpintería lo va'} a ver cancelado.`}[estado];
  if(msg&&!await confirmar(msg)) return;
  pcActualizar(id,{estado},estado==='cancelado'?'Pedido cancelado':'✅ '+estPC(x,estado).t);
}
// Aceptar (con fecha), rechazar (con motivo) o correr la fecha: lo hace la carpintería
let pcResp=null;
function pcResponder(id,que){
  const x=pedidosCarp.find(y=>y.id===id); if(!x) return;
  pcResp={id,que};
  const t={aceptado:'👍 Aceptar pedido',rechazado:'⛔ Rechazar pedido',fecha:'📅 Correr la fecha'}[que];
  document.getElementById('m-pcresp-title').textContent=t+' #'+x.num;
  document.getElementById('pcresp-form').innerHTML=`
    ${que!=='rechazado'?`<div class="fg"><label>${TALLER[x.taller]?.coloca?'¿Qué día lo colocan?':'¿Para cuándo lo tienen listo?'}</label><input type="date" id="pcr-fecha" value="${esc(x.comp||x.para||'')}" min="${hoyISO()}">
      ${x.para?`<div style="font-size:12px;color:var(--gris-m);margin-top:4px">La obra lo necesita el ${esc(fmtFecha(x.para))}</div>`:''}</div>`:''}
    <div class="fg"><label>${que==='rechazado'?'Motivo (obligatorio)':que==='fecha'?'Por qué se corre (recomendado)':'Comentario (opcional)'}</label>
      <textarea id="pcr-nota" placeholder="${que==='rechazado'?'Ej: falta la medida de la ventana 2':'Ej: falta vidrio, llega el martes'}"></textarea></div>`;
  openOverlay('m-pcresp');
}
async function pcGuardarResp(){
  const r=pcResp; if(!r) return;
  const fecha=document.getElementById('pcr-fecha')?.value||'', nota=document.getElementById('pcr-nota').value.trim();
  const c={};
  if(r.que!=='rechazado'){if(!fecha){toast('⚠️ Poné la fecha');return;} c.fecha_compromiso=fecha;}
  if(r.que==='rechazado'&&!nota){toast('⚠️ Escribí el motivo');return;}
  if(nota) c.nota_taller=nota;
  if(r.que!=='fecha') c.estado=r.que;
  closeOverlay('m-pcresp');
  pcActualizar(r.id,c,{aceptado:'✅ Pedido aceptado',rechazado:'Pedido rechazado: le avisamos a la obra',fecha:'📅 Fecha actualizada'}[r.que]);
}
function pcWhatsapp(id){
  const x=pedidosCarp.find(y=>y.id===id); if(!x) return;
  const txt=`Hola! Te mandé el pedido #${x.num} (${x.proy}) por la app de BoxTainer. Lo necesitamos para el ${fmtFecha(x.para)}.\n`+
    x.items.map(it=>`• ${it.cant} ${it.unidad} ${it.desc}${it.medida?' ('+it.medida+')':''}`).join('\n')+`\n${URL_APP}`;
  window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank','noopener');
}

// ── pestaña "Carpinterías" (obra) / "Pedidos" (carpintería) ──
function setFiltroPC(f){pcFiltro=f;renderPedidosCarp();}
function renderPedidosCarp(){
  const el=document.getElementById('lista-pedcarp'); if(!el) return;
  if(!pcListo){el.innerHTML=`<div class="card" style="font-size:13px">Para activarlo hay que correr la migración <b>0009_pedidos_a_carpinterias.sql</b> en Supabase.</div>`;return;}
  const taller=miTaller();
  const ls=pedidosCarp.filter(x=>!taller||x.taller===taller);
  const ban=pcBannerAvisos();
  const grupos=taller?[
    ['📥 Nuevos: aceptalos o rechazalos',ls.filter(x=>x.estado==='enviado')],
    [TALLER[taller].coloca?'🔧 Por colocar':'🔨 En curso',ls.filter(x=>x.estado==='aceptado'||x.estado==='en_fabricacion')],
    [TALLER[taller].coloca?'✅ Colocados, esperando revisión':'✅ Listos, esperando retiro',ls.filter(x=>x.estado==='listo')],
    ['🗂️ Cerrados',ls.filter(x=>!PC_ABIERTO.includes(x.estado)||x.estado==='rechazado').slice(0,30)],
  ]:null;
  const chips=!taller?`<div class="chips">${[['activos','Abiertos'],['aluminio','🪟 Aluminio'],['madera','🪵 Madera'],...(pcAires?[['aires','❄️ Aires']]:[]),['atrasados','⚠️ Con aviso'],['cerrados','Cerrados']]
    .map(([k,t])=>`<div class="chip ${pcFiltro===k?'active':''}" onclick="setFiltroPC('${k}')">${t}</div>`).join('')}</div>`:'';
  const abiertos=ls.filter(x=>PC_ABIERTO.includes(x.estado));
  const res=`<div class="stats-4 pc-res">${tallersDisponibles().filter(k=>!taller||k===taller).map(k=>{
      const a=abiertos.filter(x=>x.taller===k), atr=a.filter(x=>avisoPedido(x)?.c==='rojo').length;
      return `<div class="stat-box"><div class="stat-num">${a.length}</div><div class="stat-lbl">${taller?'Pedidos abiertos':TALLER[k].corto+' abiertos'}${atr?` · <b style="color:var(--rojo)">${atr} con problema</b>`:''}</div></div>`;}).join('')}</div>`;
  if(taller){
    el.innerHTML=ban+res+(ls.length?grupos.map(([t,g])=>g.length?`<div class="sec-title" style="font-size:15px;margin-top:8px">${t} (${g.length})</div>${g.map(x=>tarjetaPedido(x,{conProyecto:true})).join('')}`:'').join('')
      :`<div class="empty"><div class="em">🪚</div><h3>Todavía no hay pedidos</h3><p>Cuando el líder o un supervisor te mande un pedido, aparece acá.</p></div>`);
    return;
  }
  const f=pcFiltro, sel=ls.filter(x=>f==='cerrados'?!PC_ABIERTO.includes(x.estado):f==='atrasados'?PC_ABIERTO.includes(x.estado)&&avisoPedido(x)&&avisoPedido(x).c!=='verde'
    :PC_ABIERTO.includes(x.estado)&&(f==='activos'||x.taller===f));
  el.innerHTML=ban+res+chips+(sel.length?sel.map(x=>tarjetaPedido(x,{conProyecto:true})).join('')
    :`<div class="empty"><div class="em">🪚</div><h3>No hay pedidos acá</h3><p>Los pedidos se mandan desde el detalle de cada proyecto en ejecución.</p></div>`);
}

// ── avisos al instante: pedido nuevo para el taller, respuesta del taller para la obra ──
// Se comparan los pedidos con lo último que vio este usuario en este equipo. Con la app abierta
// (aunque esté en otra pestaña o minimizada) sale la notificación del sistema si la activó;
// si no, un cartel en la app. Los cambios que hizo el propio usuario no avisan.
const PC_VISTO_KEY=()=>'pc_visto_'+(myId||'');
function pcAvisar(){
  if(MODO!=='nube'||!myId) return;
  let visto=null; try{visto=JSON.parse(localStorage.getItem(PC_VISTO_KEY())||'null');}catch(e){}
  const ahora={}; pedidosCarp.forEach(x=>{ahora[x.id]=x.estado+'|'+(x.comp||'');});
  try{localStorage.setItem(PC_VISTO_KEY(),JSON.stringify(ahora));}catch(e){}
  if(!visto) return; // primera vez en este equipo: no se avisa lo viejo
  const taller=miTaller(), avisos=[];
  pedidosCarp.forEach(x=>{
    const antes=visto[x.id], [ea,ca]=(antes||'').split('|');
    if(antes===ahora[x.id]) return;
    const ult=x.hist[x.hist.length-1]; if(ult&&ult.por===myId) return;
    const T=TALLER[x.taller]||{}, col=T.coloca;
    if(taller){
      if(x.taller!==taller) return;
      if(x.estado==='enviado') avisos.push({t:(ea==='rechazado'?'✏️ Pedido corregido #':'📥 Pedido nuevo #')+x.num,b:`${x.proy}. Lo pidió ${x.por}${x.para?', lo necesitan el '+fmtFecha(x.para):''}.`});
      else if(x.estado==='cancelado'&&antes) avisos.push({t:'✖️ Pedido cancelado #'+x.num,b:x.proy});
      return;
    }
    const p=todos[x.pid]; if(!(x.porId===myId||(p&&p.supId===myId))||!antes) return;
    if(x.estado!==ea&&['aceptado','rechazado','en_fabricacion','listo'].includes(x.estado))
      avisos.push({t:`${T.t||''} #${x.num}: ${estPC(x).t}`,b:x.proy+(x.estado==='rechazado'?'. Motivo: '+(x.nota||'—'):x.comp&&x.estado==='aceptado'?'. Fecha: '+fmtFecha(x.comp):''),pid:x.pid});
    else if(x.estado===ea&&x.comp!==ca&&x.comp) avisos.push({t:`📅 ${T.t||''} #${x.num}: ${col?'cambió la fecha de colocación':'corrió la fecha'}`,b:`${x.proy}. Nueva fecha: ${fmtFecha(x.comp)}${x.nota?' · '+x.nota:''}`,pid:x.pid});
  });
  avisos.slice(0,5).forEach(pcNotificar);
  if(avisos.length>5) pcNotificar({t:`Y ${avisos.length-5} avisos más de pedidos`,b:'Miralos en la pestaña de pedidos.'});
}
function pcNotificar(a){
  toast(a.t);
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  try{
    const n=new Notification(a.t,{body:a.b,icon:'logo.png',tag:'pc-'+a.t});
    n.onclick=()=>{window.focus();n.close();if(a.pid&&todos[a.pid]) verDetalle(a.pid); else showView('pedidos');};
  }catch(e){console.warn(e);} // algunos celulares solo permiten avisos desde una app instalada
}
function pcBannerAvisos(){
  if(!('Notification' in window)||Notification.permission==='granted') return '';
  if(Notification.permission==='denied') return `<div class="card" style="font-size:13px">🔕 Los avisos están bloqueados en este navegador. Para recibirlos, habilitá las notificaciones de este sitio en la configuración del navegador.</div>`;
  return `<div class="card" style="font-size:13px;display:flex;gap:10px;align-items:center;justify-content:space-between">
    <span>🔔 Activá los avisos para enterarte al instante de ${esTaller()?'cada pedido nuevo':'las respuestas a tus pedidos'}.</span>
    <button class="btn btn-nar btn-sm" onclick="pcActivarAvisos()">Activar</button></div>`;
}
async function pcActivarAvisos(){
  try{const r=await Notification.requestPermission();
    toast(r==='granted'?'🔔 Avisos activados en este equipo':'🔕 No se activaron los avisos');
    if(r==='granted') pcNotificar({t:'🔔 Avisos activados',b:'Así te va a llegar cada aviso de pedidos.'});
  }catch(e){toast('⚠️ Este navegador no permite avisos');}
  renderPedidosCarp();
}

// ── avisos para la pestaña Alertas ──
function alertasPedidosCarp(){
  if(!pcListo) return [];
  const taller=miTaller(), out=[];
  pedidosCarp.forEach(x=>{
    if(taller){
      if(x.taller!==taller) return;
      if(x.estado==='enviado') out.push({tipo:horasDesde(x.ts)>24?'error':'warn',icon:'📥',titulo:`Pedido nuevo #${esc(x.num)}: ${esc(x.proy)}`,
        texto:`Lo pidió ${esc(x.por)} hace ${fmtHoras(horasDesde(x.ts))}. Lo necesitan el ${esc(fmtFecha(x.para))}.`});
      const dc=diasHasta(x.comp);
      if((x.estado==='aceptado'||x.estado==='en_fabricacion')&&dc!==null&&dc<=1) out.push({tipo:dc<0?'error':'warn',icon:'⏰',
        titulo:`${dc<0?'Atrasado':'Vence '+(dc===0?'hoy':'mañana')}: pedido #${esc(x.num)}`,texto:`${esc(x.proy)}. Fecha comprometida ${esc(fmtFecha(x.comp))}.`});
      return;
    }
    if(!esObraDe(x)&&rol()!=='lectura') return;
    const av=avisoPedido(x); if(!av||av.c==='verde'&&x.estado!=='listo') return;
    out.push({tipo:av.c==='rojo'?'error':'warn',icon:TALLER[x.taller]?.coloca?'❄️':'🪚',titulo:`${TALLER[x.taller]?.t.replace(/^\S+ /,'').replace('Carpintería de ','Carpintería ')||''} #${esc(x.num)}: ${esc(x.proy)}`,texto:esc(av.t),id:x.pid});
  });
  return out;
}
// ── burbuja con contador en la pestaña de pedidos ──
// Taller: pedidos nuevos sin responder. Obra: pedidos suyos rechazados o listos (piden una acción).
function pcPendientes(){
  if(!pcListo||!currentUser) return 0;
  const t=miTaller();
  if(t) return pedidosCarp.filter(x=>x.taller===t&&x.estado==='enviado').length;
  return pedidosCarp.filter(x=>{const p=todos[x.pid];return (x.porId===myId||(p&&p.supId===myId))&&(x.estado==='rechazado'||x.estado==='listo');}).length;
}
function pintarBurbujaPC(){
  const n=pcPendientes();
  pintarTituloPC();
  const b=document.getElementById('nav-pedidos');
  if(b&&n) b.insertAdjacentHTML('beforeend',` <b class="nav-burbuja">${n>9?'9+':n}</b>`);
  if(typeof pintarBnav==='function') pintarBnav();
  // en el celular, con la app instalada en la pantalla de inicio, el número sale también sobre el ícono
  try{if(miTaller()&&navigator.setAppBadge) n?navigator.setAppBadge(n):navigator.clearAppBadge();}catch(e){}
}

// La carpintería / los técnicos ven la pestaña como "Pedidos"; la obra, como "Carpinterías"
function pintarTituloPC(){
  const t=miTaller(), b=document.getElementById('nav-pedidos'), h=document.getElementById('pedcarp-titulo');
  if(b) b.textContent=t?'📥 Pedidos':'🪚 Carpinterías';
  if(h) h.textContent=t?'📥 Pedidos a '+TALLER[t].a:'🪚 Pedidos a carpinterías y técnicos';
}
