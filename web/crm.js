// ════════════════════════════════════════════════
// CRM DE VENTAS (migración 0024)
// - El vendedor carga cada contacto en segundos (nombre, teléfono y por dónde llegó) y lo va pasando
//   por las etapas: Pre-calificado → Calificado → Presupuesto → Acuerdo mutuo → Ganado
//   (o Perdido, con la razón, o No calificado).
// - Cada contacto tiene tareas de seguimiento con fecha. Al avanzar de etapa se agenda sola la siguiente.
// - Al pasar a Ganado se abre la nota de pedido con los datos del cliente y del vendedor ya cargados.
// - Pronóstico: importe de cada oportunidad abierta × probabilidad de cierre de su etapa. Se usa la
//   probabilidad teórica hasta que haya CRM_MIN_CASOS ventas cerradas; después, la conversión real.
// - Líder de ventas (y admin): ve todas, con precio estándar y precio del cliente, carga la comisión
//   y marca entregado y cobrado. El vendedor ve solo las suyas.
// ════════════════════════════════════════════════
const CRM_ET=[
  {k:'precalificado',t:'Pre-calificado',i:'📥',c:'b-gris',p:10},
  {k:'calificado',t:'Calificado',i:'✅',c:'b-azul',p:25},
  {k:'presupuesto',t:'Presupuesto',i:'📄',c:'b-morado',p:40},
  {k:'acuerdo',t:'Acuerdo mutuo',i:'🤝',c:'b-amar',p:80},
  {k:'ganado',t:'Ganado',i:'🏆',c:'b-verde',p:100},
  {k:'perdido',t:'Perdido',i:'❌',c:'b-rojo',p:0},
  {k:'no_calificado',t:'No calificado',i:'⛔',c:'b-gris',p:0},
];
const CRM_ABIERTAS=['precalificado','calificado','presupuesto','acuerdo'];
const CRM_CERRADAS=['ganado','perdido','no_calificado'];
const CRM_ORD={precalificado:0,calificado:1,presupuesto:2,acuerdo:3,ganado:4};
const CRM_MIN_CASOS=10;   // ventas cerradas necesarias para usar la conversión real en vez de la teórica
const CRM_ORIGEN={whatsapp:'💬 WhatsApp',llamada:'📞 Llamada',mail:'✉️ Mail',web:'🌐 Web / redes',referido:'🤝 Referido',otro:'Otro'};
const CRM_TAREA={llamar:'📞 Llamar',whatsapp:'💬 WhatsApp',mail:'✉️ Mail',reunion:'🤝 Reunión',otro:'📌 Otro'};
const CRM_CUANDO=[['Hoy',0],['Mañana',1],['En 3 días',3],['En 1 semana',7]];
const CRM_NECESITA=['Urgente','Este mes','En 1 a 3 meses','Más adelante'];
const CRM_PERDIDO={precio:'💲 Precio',plazo:'⏱️ Plazo',producto:'📦 Producto',otro:'Otro'};
const CRM_NOCALIF=['No decide la compra','No tiene presupuesto','No lo necesita','El producto no le sirve','No responde'];
// tarea que se agenda sola al llegar a cada etapa (si no hay otra pendiente)
const CRM_AUTO={precalificado:['llamar','Calificar: quién decide, para cuándo, presupuesto',1],
  calificado:['whatsapp','Mandar el presupuesto',1],presupuesto:['llamar','Seguimiento del presupuesto',2],acuerdo:['llamar','Pedir la orden de compra / facturar',2]};

const crm={kbCol:0,kbX:0,ops:[],tareas:[],prob:{},falta:false,tab:'hoy',filtro:'abiertas',vend:'',busca:'',det:null,modo:'',nuevo:null,tarea:null,comFiltro:'cobrar'};

const rolCRM=()=>perfiles[myId]?.rol||'';
function puedeCRM(){return ['ventas','lider_ventas','admin'].includes(rolCRM())}
function veTodoCRM(){return ['lider_ventas','admin'].includes(rolCRM())}
const crmEt=k=>CRM_ET.find(e=>e.k===k)||CRM_ET[0];
const crmOp=id=>crm.ops.find(o=>o.id===id);
const crmImporte=o=>Number(o.precio_cliente)||Number(o.precio_estandar)||0;
const crmFecha=iso=>iso?iso.slice(0,10).split('-').reverse().join('/'):'';
function crmMas(dias){const f=new Date();f.setDate(f.getDate()+dias);return isoLocal(f);}
function crmFinDeMes(n){const f=new Date();return isoLocal(new Date(f.getFullYear(),f.getMonth()+n+1,0));}
const crmMes=iso=>iso?new Date(iso.slice(0,7)+'-15T12:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'}).replace(' de ',' '):'';
const crmNum=n=>Math.round(Number(n)||0).toLocaleString('es-AR');
function crmDiasA(iso){const a=new Date(hoyISO()+'T12:00'),b=new Date(iso+'T12:00');return Math.round((b-a)/864e5);}
function crmCuandoTxt(iso){const d=crmDiasA(iso);return d<-1?`vencida hace ${-d} días`:d===-1?'vencida ayer':d===0?'hoy':d===1?'mañana':`en ${d} días`;}

// ── lectura ──
async function cargarCRM(){
  if(!puedeCRM()){crm.ops=[];crm.tareas=[];return;}
  try{
    let [o,t,p]=await Promise.all([traer('oportunidades'),traer('tareas_crm'),traerSinOrden('crm_probabilidades')]);
    // la base ya filtra (RLS); esto es por las dudas
    if(rolCRM()==='ventas') o=o.filter(x=>x.vendedor_id===myId);
    crm.ops=o.sort((a,b)=>String(b.actualizado_en).localeCompare(String(a.actualizado_en)));
    crm.tareas=t; crm.prob={}; p.forEach(r=>crm.prob[r.etapa]=Number(r.prob));
    crm.falta=false;
  }catch(e){
    if(/relation|does not exist|schema cache|Could not find/i.test(e.message||'')) crm.falta=true; else console.error(e);
  }
  if(crm.det&&!crmOp(crm.det)) {crm.det=null;closeOverlay('m-crm');}
  else if(crm.det&&document.getElementById('m-crm')?.classList.contains('active')&&!crmEscribiendo()) crmPintarDet();
}
function crmEscribiendo(){const a=document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.closest('#m-crm,#m-crm-nuevo'));}

// ── escritura ──
async function crmGuardar(id,cambios,callado){
  guardando++;
  try{
    const r=await sb.from('oportunidades').update(cambios).eq('id',id).select().single();
    if(r.error) throw r.error;
    const i=crm.ops.findIndex(o=>o.id===id); if(i>=0) crm.ops[i]=r.data||Object.assign(crm.ops[i],cambios);
    if(!callado) toast('✅ Guardado');
    return true;
  }catch(e){toast(msgError(e));return false;}
  finally{guardando--;}
}
async function crmNuevaTarea(oid,tipo,texto,vence,callado){
  guardando++;
  try{
    const r=await sb.from('tareas_crm').insert({oportunidad_id:oid,tipo,texto:texto||null,vence}).select().single();
    if(r.error) throw r.error;
    crm.tareas.push(r.data||{id:nuevoId(),oportunidad_id:oid,tipo,texto,vence,hecha_en:null});
    if(!callado) toast('📅 Seguimiento agendado para '+crmCuandoTxt(vence));
    return true;
  }catch(e){toast(msgError(e));return false;}
  finally{guardando--;}
}
async function crmTareaHecha(tid,ev){
  if(ev) ev.stopPropagation();
  const t=crm.tareas.find(x=>x.id===tid); if(!t) return;
  guardando++;
  try{
    const en=new Date().toISOString();
    const r=await sb.from('tareas_crm').update({hecha_en:en}).eq('id',tid);
    if(r.error) throw r.error;
    t.hecha_en=en; toast('✅ Tarea hecha');
    const o=crmOp(t.oportunidad_id);
    crmRefrescar();
    // si no queda nada agendado en una oportunidad abierta, se ofrece agendar el próximo paso
    if(o&&CRM_ABIERTAS.includes(o.etapa)&&!crmPendientes(o.id).length){crmAbrir(o.id);crm.tarea={tipo:'llamar',dias:3};crmPintarDet();
      setTimeout(()=>document.getElementById('crm-tareas')?.scrollIntoView({behavior:'smooth',block:'center'}),150);}
  }catch(e){toast(msgError(e));}
  finally{guardando--;}
}
const crmPendientes=oid=>crm.tareas.filter(t=>t.oportunidad_id===oid&&!t.hecha_en).sort((a,b)=>a.vence.localeCompare(b.vence));
function crmTareasHoy(){const h=hoyISO();return crm.tareas.filter(t=>!t.hecha_en&&t.vence<=h&&crmOp(t.oportunidad_id)).sort((a,b)=>a.vence.localeCompare(b.vence));}
function crmPendHoy(){return puedeCRM()&&!crm.falta?crmTareasHoy().length:0;}

// ── contacto directo desde el celular ──
function crmWa(tel){
  let d=String(tel||'').replace(/\D/g,''); if(!d) return '';
  if(d.startsWith('00')) d=d.slice(2);
  if(!d.startsWith('54')){d=d.replace(/^0/,''); d='549'+d;}
  return 'https://wa.me/'+d;
}
function crmBotonesContacto(o,chico){
  const cl=chico?'btn btn-sec btn-sm':'btn btn-sec';
  const b=[];
  if(o.telefono){b.push(`<a class="${cl} crm-ct" href="${esc(crmWa(o.telefono))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬${chico?'':' WhatsApp'}</a>`);
    b.push(`<a class="${cl} crm-ct" href="tel:${esc(String(o.telefono).replace(/[^\d+]/g,''))}" onclick="event.stopPropagation()">📞${chico?'':' Llamar'}</a>`);}
  if(o.mail&&!chico) b.push(`<a class="${cl} crm-ct" href="mailto:${esc(o.mail)}">✉️ Mail</a>`);
  return b.join('');
}

// ════════════════ PANTALLA CRM ════════════════
function crmRefrescar(){if(vistaActual==='crm') renderCRM(); else if(vistaActual==='dashboard') renderDash(); if(typeof pintarBnav==='function') pintarBnav();}
function crmTab(t){crm.tab=t;renderCRM();}
function renderCRM(){
  const el=document.getElementById('crm-content'); if(!el) return;
  if(crm.falta){el.innerHTML=`<div class="card" style="margin-top:12px"><div class="card-title">🎯 CRM</div>
    <p style="font-size:14px">Para usar el CRM falta un paso del administrador: correr la migración <b>0024_crm_de_ventas.sql</b> en Supabase.</p></div>`;return;}
  const tabs=[['hoy','📞 Agenda'],['embudo','🗂️ Embudo'],['pronostico','📈 Pronóstico']];
  if(veTodoCRM()) tabs.push(['comisiones','💰 Comisiones']);
  if(!tabs.some(t=>t[0]===crm.tab)) crm.tab='hoy';
  const nHoy=crmTareasHoy().length;
  let h=`<div class="chips crm-tabs">${tabs.map(([k,t])=>`<button class="chip${crm.tab===k?' active':''}" onclick="crmTab('${k}')">${t}${k==='hoy'&&nHoy?` <span class="chip-n">${nHoy}</span>`:''}</button>`).join('')}</div>`;
  if(veTodoCRM()&&crm.tab!=='hoy') h+=crmSelVendedor();
  h+=crm.tab==='embudo'?crmEmbudoHTML():crm.tab==='pronostico'?crmPronosticoHTML():crm.tab==='comisiones'?crmComisionesHTML():crmHoyHTML();
  el.innerHTML=h;
  crmKbRestaurar();
}
function crmVendedores(){
  const ids=new Set(crm.ops.map(o=>o.vendedor_id));
  Object.entries(perfiles).forEach(([id,x])=>{if(x.rol==='ventas') ids.add(id);});
  return [...ids].filter(Boolean).sort((a,b)=>nombreDe(a).localeCompare(nombreDe(b)));
}
function crmSelVendedor(){
  return `<div class="fg" style="margin-bottom:10px"><select onchange="crm.vend=this.value;renderCRM()">
    <option value="">👥 Todos los vendedores</option>${crmVendedores().map(id=>`<option value="${esc(id)}" ${crm.vend===id?'selected':''}>${esc(nombreDe(id))}</option>`).join('')}</select></div>`;
}
function crmMias(){return crm.ops.filter(o=>!crm.vend||o.vendedor_id===crm.vend);}

// ── Para hacer: seguimientos vencidos y de hoy, y oportunidades sin próximo paso ──
function crmFilaTarea(t){
  const o=crmOp(t.oportunidad_id); const d=crmDiasA(t.vence);
  return `<div class="fila-click crm-tarea" onclick="crmAbrir('${esc(o.id)}')">
    <div style="min-width:0;flex:1"><div class="fh-t">${CRM_TAREA[t.tipo]?.split(' ')[0]||'📌'} ${esc(o.cliente)}</div>
      <div class="fh-s">${esc(t.texto||CRM_TAREA[t.tipo]||'')} · <b style="color:${d<0?'var(--rojo)':'inherit'}">${crmCuandoTxt(t.vence)}</b>${veTodoCRM()?' · '+esc(nombreDe(o.vendedor_id)):''}</div></div>
    <div class="crm-acc">${crmBotonesContacto(o,true)}<button class="btn btn-verde btn-sm" onclick="crmTareaHecha('${esc(t.id)}',event)" aria-label="Marcar hecha">✓</button></div></div>`;
}
function crmHoyHTML(){
  const mias=veTodoCRM()?crm.ops:crm.ops.filter(o=>o.vendedor_id===myId);
  const ids=new Set(mias.map(o=>o.id));
  const hoy=crmTareasHoy().filter(t=>ids.has(t.oportunidad_id));
  const prox=crm.tareas.filter(t=>!t.hecha_en&&ids.has(t.oportunidad_id)&&t.vence>hoyISO()&&t.vence<=crmMas(7)).sort((a,b)=>a.vence.localeCompare(b.vence));
  const sinPaso=mias.filter(o=>CRM_ABIERTAS.includes(o.etapa)&&!crmPendientes(o.id).length);
  let h=`<button class="btn btn-nar crm-nuevo-btn" onclick="crmNuevo()">+ Nuevo contacto</button>`;
  h+=hoy.length?`<div class="card hoy-bloque" style="border-left:5px solid var(--rojo)"><div class="card-title" style="color:var(--rojo)">📞 Seguimientos para hoy (${hoy.length})</div>${hoy.map(crmFilaTarea).join('')}</div>`
    :`<div class="card hoy-ok">✅ <b>Seguimientos al día.</b> No hay llamados ni mensajes pendientes para hoy.</div>`;
  if(sinPaso.length) h+=`<div class="card hoy-bloque" style="border-left:5px solid var(--amarillo)"><div class="card-title" style="color:var(--amarillo)">⚠️ Sin próximo paso (${sinPaso.length})</div>
    <p class="crm-ayuda">Oportunidades abiertas sin seguimiento agendado. Tocá una y agendá cuándo la volvés a contactar.</p>
    ${sinPaso.map(o=>`<div class="fila-click" onclick="crmAbrir('${esc(o.id)}')"><div style="min-width:0"><div class="fh-t">${esc(o.cliente)}</div>
      <div class="fh-s">${crmEt(o.etapa).i} ${crmEt(o.etapa).t}${veTodoCRM()?' · '+esc(nombreDe(o.vendedor_id)):''}</div></div><span class="badge b-amar">Agendar</span></div>`).join('')}</div>`;
  if(prox.length) h+=`<div class="card hoy-bloque" style="border-left:5px solid var(--azul)"><div class="card-title" style="color:var(--azul)">📅 Próximos 7 días (${prox.length})</div>${prox.map(crmFilaTarea).join('')}</div>`;
  return h;
}

// ── Embudo: oportunidades por etapa ──
// Columnas del tablero (kanban): las 4 etapas abiertas y Ganado. Perdido y No calificado se ven aparte, en lista.
const CRM_KB=[...CRM_ABIERTAS,'ganado'];
const CRM_SIG={precalificado:'calificado',calificado:'presupuesto',presupuesto:'acuerdo',acuerdo:'ganado'};
function crmEmbudoHTML(){
  const base=crmMias();
  const q=crm.busca.trim().toLowerCase();
  const pasa=o=>!q||[o.cliente,o.telefono,o.producto].some(x=>String(x||'').toLowerCase().includes(q));
  if(!['abiertas','perdido','no_calificado'].includes(crm.filtro)) crm.filtro='abiertas';
  const n=k=>base.filter(o=>o.etapa===k).length;
  let h=`<div class="fg" style="margin-bottom:8px"><input type="search" placeholder="🔍 Buscar cliente o teléfono" value="${esc(crm.busca)}" oninput="crm.busca=this.value;crmPintarEmbudo()"></div>
    <div class="chips crm-kb-nav">${CRM_KB.map((k,i)=>{const e=crmEt(k);return `<button class="chip${crm.filtro==='abiertas'&&crm.kbCol===i?' active':''}" onclick="crmIrColumna(${i})">${e.i} <span class="chip-n">${n(k)}</span></button>`;}).join('')}
      ${['perdido','no_calificado'].map(k=>{const e=crmEt(k);return `<button class="chip${crm.filtro===k?' active':''}" onclick="crm.filtro='${k}';renderCRM()">${e.i} ${e.t} <span class="chip-n">${n(k)}</span></button>`;}).join('')}</div>
    <div id="crm-embudo">`;
  if(crm.filtro==='abiertas'){
    h+=`<div class="crm-kb" id="crm-kb" onscroll="crmKbScroll(this)">${CRM_KB.map(k=>{const e=crmEt(k);
      let l=base.filter(o=>o.etapa===k&&pasa(o));
      // en Ganado, las de los últimos 60 días (el resto, en Pronóstico y Comisiones)
      if(k==='ganado'&&!q) l=l.filter(o=>crmDiasA(crmFechaGanado(o))>=-60);
      const tot=l.reduce((s,o)=>s+crmImporte(o),0);
      return `<section class="crm-col" data-et="${k}" ondragover="event.preventDefault();this.classList.add('sobre')" ondragleave="this.classList.remove('sobre')" ondrop="crmSoltar(event,'${k}')">
        <div class="crm-col-tit"><b>${e.i} ${e.t}</b><span>${l.length}${tot?' · '+usd(tot):''}</span></div>
        ${l.length?l.map(crmKbCard).join(''):'<div class="crm-vacio">Sin oportunidades</div>'}</section>`;}).join('')}</div>
      <p class="crm-ayuda crm-kb-ayuda">Deslizá a los costados para ver cada etapa. Con <b>→</b> pasás la tarjeta a la etapa siguiente.</p>`;
  }else{
    const l=base.filter(o=>o.etapa===crm.filtro&&pasa(o));
    h+=`<button class="btn btn-sec btn-sm" style="margin-bottom:8px" onclick="crm.filtro='abiertas';renderCRM()">← Volver al tablero</button>`
      +(l.length?l.map(crmCard).join(''):'<div class="empty"><div class="em">🗂️</div><h3>Nada por acá</h3></div>');
  }
  h+=`</div><button class="btn btn-nar crm-nuevo-btn" onclick="crmNuevo()">+ Nuevo contacto</button>`;
  return h;
}
function crmPintarEmbudo(){const el=document.getElementById('crm-embudo');if(!el)return;const t=document.createElement('div');t.innerHTML=crmEmbudoHTML();el.replaceWith(t.querySelector('#crm-embudo'));crmKbRestaurar();}
// el tablero recuerda en qué columna estaba al redibujarse
function crmKbAncho(kb){const c=kb.querySelector('.crm-col');return c?c.getBoundingClientRect().width+10:1;}
function crmKbScroll(kb){crm.kbX=kb.scrollLeft;const i=Math.round(kb.scrollLeft/crmKbAncho(kb));
  if(i!==crm.kbCol){crm.kbCol=i;document.querySelectorAll('.crm-kb-nav .chip').forEach((b,j)=>b.classList.toggle('active',crm.filtro==='abiertas'&&j===i));}}
function crmKbRestaurar(){const kb=document.getElementById('crm-kb');if(kb&&crm.kbX) kb.scrollLeft=crm.kbX;}
function crmIrColumna(i){
  if(crm.filtro!=='abiertas'){crm.filtro='abiertas';crm.kbCol=i;crm.kbX=0;renderCRM();}
  const kb=document.getElementById('crm-kb'); const c=kb&&kb.querySelectorAll('.crm-col')[i];
  if(c) kb.scrollTo({left:c.offsetLeft-kb.offsetLeft-kb.clientLeft-(parseFloat(getComputedStyle(kb).paddingLeft)||0),behavior:'smooth'});
}
function crmKbCard(o){
  const t=crmPendientes(o.id)[0], sig=CRM_SIG[o.etapa];
  const tarea=CRM_ABIERTAS.includes(o.etapa)?(t?`<span style="color:${t.vence<hoyISO()?'var(--rojo)':t.vence===hoyISO()?'var(--nar)':'var(--gris-m)'}">${CRM_TAREA[t.tipo]?.split(' ')[0]||'📌'} ${crmCuandoTxt(t.vence)}</span>`:'<span style="color:var(--amarillo)">⚠️ Sin seguimiento</span>'):'';
  return `<div class="crm-kc" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(o.id)}')" onclick="crmAbrir('${esc(o.id)}')">
    <div class="crm-cli">${esc(o.cliente)}</div>
    <div class="crm-sub">${esc(o.producto||'Producto a definir')}${o.unidades>1?' × '+o.unidades:''}${veTodoCRM()?' · 👤 '+esc(nombreDe(o.vendedor_id)):''}</div>
    <div class="crm-card-pie"><b>${crmImporte(o)?usd(crmImporte(o)):''}</b>${tarea}
      ${o.etapa==='ganado'&&!o.proyecto_id?'<span style="color:var(--rojo)">📝 Falta la nota</span>':''}
      ${o.etapa==='ganado'&&o.cobrado?'<span style="color:var(--verde)">✅ Cobrado</span>':''}</div>
    ${sig?`<button class="btn btn-sec btn-sm crm-kc-sig" onclick="event.stopPropagation();crmAvanzar('${esc(o.id)}','${sig}')" aria-label="Pasar a ${crmEt(sig).t}">→ ${crmEt(sig).i} ${crmEt(sig).t}</button>`:''}</div>`;
}
// Pasar de etapa desde el tablero: si falta la calificación se abre la ficha para completarla
async function crmAvanzar(id,etapa){
  const o=crmOp(id); if(!o) return;
  if(etapa!=='precalificado'&&crmFaltaCalificar(o).length){crmAbrir(id);setTimeout(()=>crmMover(id,etapa),150);return;}
  if(etapa==='ganado') return crmGanar(id);
  await crmMover(id,etapa);
}
// En la compu también se puede arrastrar la tarjeta a otra columna
function crmSoltar(ev,etapa){
  ev.preventDefault(); ev.currentTarget.classList.remove('sobre');
  const id=ev.dataTransfer.getData('text/plain'), o=crmOp(id); if(!o||o.etapa===etapa) return;
  crmAvanzar(id,etapa);
}
function crmCard(o){
  const e=crmEt(o.etapa), t=crmPendientes(o.id)[0];
  const tarea=CRM_ABIERTAS.includes(o.etapa)?(t?`<span style="color:${t.vence<hoyISO()?'var(--rojo)':t.vence===hoyISO()?'var(--nar)':'var(--gris-m)'}">${CRM_TAREA[t.tipo]?.split(' ')[0]||'📌'} ${crmCuandoTxt(t.vence)}</span>`:'<span style="color:var(--amarillo)">⚠️ Sin seguimiento</span>'):'';
  return `<div class="card crm-card" onclick="crmAbrir('${esc(o.id)}')">
    <div class="crm-card-top"><div class="crm-cli">${esc(o.cliente)}</div><span class="badge ${e.c}">${e.i} ${e.t}</span></div>
    <div class="crm-sub">${esc(o.producto||'Producto a definir')}${o.unidades>1?' × '+o.unidades:''}${veTodoCRM()?' · 👤 '+esc(nombreDe(o.vendedor_id)):''}</div>
    <div class="crm-card-pie"><b>${crmImporte(o)?usd(crmImporte(o)):''}</b>${tarea}
      ${o.etapa==='ganado'&&!o.proyecto_id?'<span style="color:var(--rojo)">📝 Falta la nota</span>':''}
      ${o.etapa==='perdido'?`<span>${esc(CRM_PERDIDO[o.motivo]||'')}</span>`:''}</div></div>`;
}

// ── Pronóstico y conversión ──
function crmProbTeo(k){return crm.prob[k]??crmEt(k).p;}
function crmMaxOrd(o){let m=CRM_ORD[o.etapa]??-1;(o.historial||[]).forEach(x=>{const v=CRM_ORD[x.etapa];if(v!=null&&v>m)m=v;});return m;}
function crmConversion(lista){
  const cerr=lista.filter(o=>CRM_CERRADAS.includes(o.etapa));
  const out={};
  CRM_ABIERTAS.forEach((k,i)=>{const lleg=cerr.filter(o=>crmMaxOrd(o)>=i);const g=lleg.filter(o=>o.etapa==='ganado').length;
    const real=lleg.length?Math.round(g*100/lleg.length):null;const usaReal=lleg.length>=CRM_MIN_CASOS;
    out[k]={n:lleg.length,g,real,teo:crmProbTeo(k),usada:usaReal?real:crmProbTeo(k),usaReal};});
  return out;
}
function crmFechaGanado(o){const h=(o.historial||[]).filter(x=>x.etapa==='ganado').pop();return h?String(h.en).slice(0,10):String(o.etapa_en||'').slice(0,10);}
function crmPronosticoHTML(){
  const lista=crmMias(), conv=crmConversion(lista);
  const ab=lista.filter(o=>CRM_ABIERTAS.includes(o.etapa));
  const mesAct=hoyISO().slice(0,7);
  const meses=[0,1,2].map(n=>crmFinDeMes(n).slice(0,7));
  const grupo=o=>{const m=(o.cierre_estimado||'').slice(0,7);if(!m)return 'sin';if(m<mesAct)return 'atrasado';return meses.includes(m)?m:'despues';};
  const filas=[['atrasado','⚠️ Cierre ya vencido'],...meses.map(m=>[m,crmMes(m)]),['despues','Más adelante'],['sin','Sin fecha de cierre']];
  const pond=o=>crmImporte(o)*(conv[o.etapa]?.usada||0)/100;
  const totPond=ab.reduce((s,o)=>s+pond(o),0), totAb=ab.reduce((s,o)=>s+crmImporte(o),0);
  const ganMes=lista.filter(o=>o.etapa==='ganado'&&crmFechaGanado(o).slice(0,7)===mesAct);
  const editable=veTodoCRM();
  let h=`<div class="stats-4 crm-kpis">
    <div class="stat-box verde"><div class="stat-num">${usd(ganMes.reduce((s,o)=>s+crmImporte(o),0)).replace('USD ','')}</div><div class="stat-lbl">USD ganado este mes (${ganMes.length})</div></div>
    <div class="stat-box azul"><div class="stat-num">${usd(totPond).replace('USD ','')}</div><div class="stat-lbl">USD pronóstico (ponderado)</div></div>
    <div class="stat-box"><div class="stat-num">${usd(totAb).replace('USD ','')}</div><div class="stat-lbl">USD en juego (${ab.length} abiertas)</div></div>
    <div class="stat-box amarillo"><div class="stat-num">${crmTasaCierre(lista)}</div><div class="stat-lbl">Tasa de cierre</div></div></div>
  <div class="card"><div class="card-title">📅 Ingresos esperados por mes de cierre</div>
    <p class="crm-ayuda">Importe de cada oportunidad abierta × la probabilidad de cierre de su etapa.</p>
    <table class="crm-tabla"><tr><th>Mes de cierre</th><th>Oport.</th><th>En juego (USD)</th><th>Pronóstico (USD)</th></tr>
    ${filas.map(([k,t])=>{const l=ab.filter(o=>grupo(o)===k);if(!l.length&&(k==='atrasado'||k==='sin'||k==='despues'))return '';
      return `<tr><td>${t}</td><td>${l.length}</td><td>${crmNum(l.reduce((s,o)=>s+crmImporte(o),0))}</td><td><b>${crmNum(l.reduce((s,o)=>s+pond(o),0))}</b></td></tr>`;}).join('')}
    </table></div>
  <div class="card"><div class="card-title">🎯 Probabilidad de cierre por etapa</div>
    <p class="crm-ayuda">La <b>teórica</b> se usa hasta que haya ${CRM_MIN_CASOS} ventas cerradas (ganadas, perdidas o no calificadas) que pasaron por esa etapa. Desde ahí se usa la <b>real</b>: de las que llegaron a esa etapa, cuántas se ganaron.</p>
    <table class="crm-tabla"><tr><th>Etapa</th><th>Teórica</th><th>Real</th><th>Se usa</th></tr>
    ${CRM_ABIERTAS.map(k=>{const c=conv[k],e=crmEt(k);return `<tr><td>${e.i} ${e.t}</td>
      <td>${editable?`<input type="number" class="crm-prob" min="0" max="100" value="${c.teo}" onchange="crmCambiarProb('${k}',this.value)" aria-label="Probabilidad teórica ${e.t}">%`:c.teo+'%'}</td>
      <td>${c.real==null?'—':c.real+'%'}<div class="crm-n">${c.g} de ${c.n}</div></td><td><b>${c.usada}%</b><div class="crm-n">${c.usaReal?'real':'teórica'}</div></td></tr>`;}).join('')}
    </table></div>`;
  if(veTodoCRM()&&!crm.vend) h+=crmPorVendedorHTML();
  h+=crmPerdidasHTML(lista);
  return h;
}
function crmTasaCierre(lista){const c=lista.filter(o=>CRM_CERRADAS.includes(o.etapa));if(!c.length)return '—';return Math.round(c.filter(o=>o.etapa==='ganado').length*100/c.length)+'%';}
function crmPorVendedorHTML(){
  const vs=crmVendedores(); if(!vs.length) return '';
  const mes=hoyISO().slice(0,7), h=hoyISO(), conv=crmConversion(crm.ops);   // la conversión del equipo, una sola vez
  return `<div class="card"><div class="card-title">👥 Gestión por vendedor</div>
    <table class="crm-tabla"><tr><th>Vendedor</th><th>Abiertas</th><th>Ganado mes (USD)</th><th>Cierre</th><th>Pronóstico (USD)</th><th>Atrasadas</th></tr>
    ${vs.map(id=>{const l=crm.ops.filter(o=>o.vendedor_id===id);
      const ab=l.filter(o=>CRM_ABIERTAS.includes(o.etapa)), gm=l.filter(o=>o.etapa==='ganado'&&crmFechaGanado(o).slice(0,7)===mes);
      const ids=new Set(l.map(o=>o.id)), atr=crm.tareas.filter(t=>!t.hecha_en&&ids.has(t.oportunidad_id)&&t.vence<h).length;
      return `<tr onclick="crm.vend='${esc(id)}';crm.tab='embudo';renderCRM()" style="cursor:pointer"><td>${esc(nombreDe(id))}</td><td>${ab.length}</td>
        <td>${crmNum(gm.reduce((s,o)=>s+crmImporte(o),0))}</td><td>${crmTasaCierre(l)}</td>
        <td>${crmNum(ab.reduce((s,o)=>s+crmImporte(o)*(conv[o.etapa]?.usada||0)/100,0))}</td><td style="color:${atr?'var(--rojo)':'inherit'}">${atr}</td></tr>`;}).join('')}
    </table><p class="crm-ayuda" style="margin-top:6px">Tocá un vendedor para ver sus oportunidades. "Atrasadas" = seguimientos vencidos.</p></div>`;
}
function crmPerdidasHTML(lista){
  const p=lista.filter(o=>o.etapa==='perdido'); if(!p.length) return '';
  const n=k=>p.filter(o=>o.motivo===k).length;
  return `<div class="card"><div class="card-title">❌ Por qué se pierden (${p.length})</div>
    ${Object.entries(CRM_PERDIDO).map(([k,t])=>`<div class="crm-barra"><span>${t}</span><div><i style="width:${Math.round(n(k)*100/p.length)}%"></i></div><b>${n(k)}</b></div>`).join('')}</div>`;
}
async function crmCambiarProb(k,v){
  const n=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  const r=await sb.from('crm_probabilidades').update({prob:n,actualizado_en:new Date().toISOString()}).eq('etapa',k);
  if(r.error){toast(msgError(r.error));return;}
  crm.prob[k]=n; toast('✅ Probabilidad de '+crmEt(k).t+': '+n+'%'); renderCRM();
}

// ── Comisiones, entregado y cobrado (líder de ventas y admin) ──
function crmComisionesHTML(){
  const g=crmMias().filter(o=>o.etapa==='ganado').sort((a,b)=>crmFechaGanado(b).localeCompare(crmFechaGanado(a)));
  const fs=[['cobrar','Por cobrar',o=>!o.cobrado],['entregar','Por entregar',o=>!o.entregado],['comision','Sin comisión',o=>o.comision==null],['todas','Todas',()=>true]];
  const f=fs.find(x=>x[0]===crm.comFiltro)||fs[0];
  const l=g.filter(f[2]);
  const totCom=g.filter(o=>crmFechaGanado(o).slice(0,7)===hoyISO().slice(0,7)).reduce((s,o)=>s+(Number(o.comision)||0),0);
  const porCobrar=g.filter(o=>!o.cobrado).reduce((s,o)=>s+crmImporte(o),0);
  return `<div class="stats-4 crm-kpis" style="grid-template-columns:1fr 1fr">
      <div class="stat-box amarillo"><div class="stat-num">${usd(porCobrar).replace('USD ','')}</div><div class="stat-lbl">USD ganado sin cobrar</div></div>
      <div class="stat-box"><div class="stat-num">${usd(totCom).replace('USD ','')}</div><div class="stat-lbl">USD comisiones del mes</div></div></div>
    <div class="chips">${fs.map(([k,t,fn])=>`<button class="chip${crm.comFiltro===k?' active':''}" onclick="crm.comFiltro='${k}';renderCRM()">${t} <span class="chip-n">${g.filter(fn).length}</span></button>`).join('')}</div>
    ${l.length?l.map(o=>`<div class="card crm-com"><div class="crm-card-top" onclick="crmAbrir('${esc(o.id)}')" style="cursor:pointer"><div class="crm-cli">${esc(o.cliente)}</div><span class="crm-n">ganado ${crmFecha(crmFechaGanado(o))}</span></div>
      <div class="crm-sub">👤 ${esc(nombreDe(o.vendedor_id))} · ${esc(o.producto||'')}${o.unidades>1?' × '+o.unidades:''}</div>
      ${crmLiderHTML(o)}</div>`).join(''):'<div class="empty"><div class="em">💰</div><h3>Nada pendiente</h3></div>'}`;
}
function crmLiderHTML(o){
  const pe=Number(o.precio_estandar)||0, pc=Number(o.precio_cliente)||0, dif=pc-pe;
  return `<div class="crm-precios"><div><span>Precio estándar</span><b>${pe?usd(pe):'—'}</b></div><div><span>Precio del cliente</span><b>${pc?usd(pc):'—'}</b></div>
    <div><span>Diferencia</span><b style="color:${dif<0?'var(--rojo)':'var(--verde)'}">${pe&&pc?(dif<0?'−':'+')+usd(Math.abs(dif)).replace('USD ','USD ')+' ('+(dif<0?'':'+')+Math.round(dif*100/pe)+'%)':'—'}</b></div></div>
    <div class="crm-lider-fila"><label>Comisión del vendedor (USD)</label>
      <input type="number" inputmode="decimal" min="0" step="1" value="${o.comision??''}" placeholder="0" onchange="crmGuardarNum('${esc(o.id)}','comision',this.value)"></div>
    <div class="crm-lider-fila crm-checks">
      <button class="chip${o.entregado?' active':''}" onclick="crmMarcar('${esc(o.id)}','entregado')">${o.entregado?'✅':'⬜'} Entregado${o.entregado_en?' '+crmFecha(o.entregado_en):''}</button>
      <button class="chip${o.cobrado?' active':''}" onclick="crmMarcar('${esc(o.id)}','cobrado')">${o.cobrado?'✅':'⬜'} Cobrado${o.cobrado_en?' '+crmFecha(o.cobrado_en):''}</button></div>`;
}
async function crmMarcar(id,campo){
  const o=crmOp(id); if(!o) return;
  const v=!o[campo];
  if(await crmGuardar(id,{[campo]:v,[campo+'_en']:v?hoyISO():null},true)){toast(v?'✅ Marcado '+campo:'Desmarcado '+campo);crmRefrescar();if(crm.det===id)crmPintarDet();}
}
async function crmGuardarNum(id,campo,v){
  const n=v===''?null:Math.max(0,Number(String(v).replace(',','.'))||0);
  if(await crmGuardar(id,{[campo]:n})){if(!crmEscribiendo())crmRefrescar();}
}

// ════════════════ NUEVO CONTACTO (lo más corto posible) ════════════════
function crmModal(id,z){
  let m=document.getElementById(id);
  if(!m){m=document.createElement('div');m.className='overlay';m.id=id;if(z)m.style.zIndex=z;
    m.innerHTML='<div class="modal crm-modal"><div class="modal-handle"></div><div class="crm-body"></div></div>';
    m.addEventListener('click',e=>{if(e.target===m){m.classList.remove('active');if(id==='m-crm')crm.det=null;}});
    document.body.appendChild(m);}
  return m;
}
function crmNuevo(){
  crm.nuevo={cliente:'',telefono:'',origen:'whatsapp',producto:'',seg:1,notas:''};
  crmPintarNuevo(); openOverlay('m-crm-nuevo');
  setTimeout(()=>document.getElementById('cn-cli')?.focus(),250);
}
function crmPintarNuevo(){
  const n=crm.nuevo, m=crmModal('m-crm-nuevo');
  const chips=(lista,sel,fn)=>`<div class="crm-ops">${lista.map(([k,t])=>`<button type="button" class="chip${sel===k?' active':''}" onclick="${fn}('${esc(k)}')">${esc(t)}</button>`).join('')}</div>`;
  m.querySelector('.crm-body').innerHTML=`<div class="modal-title">📥 Nuevo contacto</div>
    <div class="fg"><label>Cliente *</label><input id="cn-cli" type="text" autocomplete="off" placeholder="Nombre o empresa" value="${esc(n.cliente)}" oninput="crm.nuevo.cliente=this.value"></div>
    <div class="fg"><label>Teléfono / WhatsApp</label><input id="cn-tel" type="tel" inputmode="tel" placeholder="Ej: 351 555 1234" value="${esc(n.telefono)}" oninput="crm.nuevo.telefono=this.value"></div>
    <div class="fg"><label>¿Por dónde llegó?</label>${chips(Object.entries(CRM_ORIGEN),n.origen,'crmNuevoSet.origen')}</div>
    <div class="fg"><label>¿Qué busca? <small>(opcional)</small></label>${chips([...NotaPedido.TIPOLOGIAS.filter(x=>!/Company$/.test(x)).map(x=>[x,x]),['Otro','Otro']],n.producto,'crmNuevoSet.producto')}</div>
    <div class="fg"><label>Próximo seguimiento</label>${chips([...CRM_CUANDO.map(([t,d])=>[String(d),t]),['-1','Sin agendar']],String(n.seg),'crmNuevoSet.seg')}</div>
    <div class="fg"><label>Nota <small>(opcional)</small></label><textarea rows="2" placeholder="Lo que pidió, para qué lo quiere…" oninput="crm.nuevo.notas=this.value">${esc(n.notas)}</textarea></div>
    <div class="flex-btns"><button class="btn btn-sec" onclick="closeOverlay('m-crm-nuevo')">Cancelar</button>
      <button class="btn btn-nar" id="cn-ok" onclick="crmCrear()">Guardar</button></div>`;
}
const crmNuevoSet={
  origen:v=>{crm.nuevo.origen=v;crmPintarNuevo();},
  producto:v=>{crm.nuevo.producto=crm.nuevo.producto===v?'':v;crmPintarNuevo();},
  seg:v=>{crm.nuevo.seg=Number(v);crmPintarNuevo();},
};
async function crmCrear(){
  const n=crm.nuevo; if(!n) return;
  if(!n.cliente.trim()){toast('⚠️ Poné el nombre del cliente');document.getElementById('cn-cli')?.focus();return;}
  const b=document.getElementById('cn-ok'); if(b){if(b.disabled)return;b.disabled=true;}
  guardando++;
  try{
    const fila={cliente:n.cliente.trim(),telefono:n.telefono.trim()||null,origen:n.origen,producto:n.producto||null,notas:n.notas.trim()||null,
      empresa:perfiles[myId]?.empresa||null,etapa:'precalificado'};
    if(rolCRM()==='ventas') fila.vendedor_id=myId;
    const r=await sb.from('oportunidades').insert(fila).select().single();
    if(r.error) throw r.error;
    const o=r.data; crm.ops.unshift(o);
    if(n.seg>=0){const a=CRM_AUTO.precalificado;await crmNuevaTarea(o.id,n.origen==='whatsapp'?'whatsapp':a[0],a[1],crmMas(n.seg),true);}
    closeOverlay('m-crm-nuevo'); crm.nuevo=null;
    toast('✅ Contacto guardado'+(n.seg>=0?' · seguimiento '+crmCuandoTxt(crmMas(n.seg)):''));
    crmRefrescar();
  }catch(e){toast(msgError(e));if(b)b.disabled=false;}
  finally{guardando--;}
}

// ════════════════ DETALLE DE UNA OPORTUNIDAD ════════════════
function crmAbrir(id){
  if(!crmOp(id)) return;
  if(crm.det!==id){crm.modo='';crm.tarea=null;}
  crm.det=id; crmPintarDet(); openOverlay(crmModal('m-crm').id);
  const b=document.querySelector('#m-crm .modal'); if(b) b.scrollTop=0;
}
function crmCerrar(){closeOverlay('m-crm');crm.det=null;crm.modo='';}
function crmFaltaCalificar(o){
  const f=[];
  if(!String(o.decide||'').trim()) f.push('quién decide la compra');
  if(!o.necesita) f.push('para cuándo lo necesita');
  if(o.tiene_presupuesto==null) f.push('si tiene presupuesto');
  if(o.soluciona==null) f.push('si nuestro producto le soluciona el problema');
  if(!(Number(o.precio_estandar)>0)) f.push('el precio estándar');
  if(!(Number(o.precio_cliente)>0)) f.push('el precio del cliente');
  if(!o.cierre_estimado) f.push('cuándo estimás que cierra');
  return f;
}
function crmPintarDet(){
  const o=crmOp(crm.det); if(!o) return;
  const m=crmModal('m-crm'), e=crmEt(o.etapa), ab=CRM_ABIERTAS.includes(o.etapa), lider=veTodoCRM();
  const sig={precalificado:'calificado',calificado:'presupuesto',presupuesto:'acuerdo',acuerdo:'ganado'}[o.etapa];
  const yn=(campo,v)=>`<div class="crm-ops">${[[true,'Sí'],[false,'No']].map(([k,t])=>`<button type="button" class="chip${v===k?' active':''}" onclick="crmSet('${campo}',${k})">${t}</button>`).join('')}</div>`;
  const ch=(campo,lista,v)=>`<div class="crm-ops">${lista.map(([k,t])=>`<button type="button" class="chip${v===k?' active':''}" onclick="crmSet('${campo}','${esc(k)}')">${esc(t)}</button>`).join('')}</div>`;
  const cierreChips=[0,1,2,3].map(n=>[crmFinDeMes(n),n===0?'Este mes':n===1?'Próximo mes':'En '+n+' meses']);
  // pasos del embudo
  const paso=CRM_ORD[o.etapa];
  const stepper=`<div class="crm-steps">${CRM_ET.slice(0,5).map((x,i)=>`<div class="crm-step${paso!=null&&i<paso?' hecho':''}${x.k===o.etapa?' actual':''}"><i>${x.i}</i><span>${x.t}</span></div>`).join('')}</div>`;
  // calificación e importe
  const calif=`<div class="dsec crm-sec"><h3>✅ Calificación e importe</h3>
    <div class="fg"><label>¿Quién decide la compra?</label><input type="text" value="${esc(o.decide||'')}" placeholder="Nombre y cargo" onchange="crmSet('decide',this.value.trim()||null,1)"></div>
    <div class="fg"><label>¿Para cuándo lo necesita?</label>${ch('necesita',CRM_NECESITA.map(x=>[x,x]),o.necesita)}</div>
    <div class="fg"><label>¿Tiene presupuesto?</label>${yn('tiene_presupuesto',o.tiene_presupuesto)}</div>
    <div class="fg"><label>¿Nuestro producto le soluciona el problema?</label>${yn('soluciona',o.soluciona)}</div>
    <div class="crm-2"><div class="fg"><label>Precio estándar (USD)</label><input type="number" inputmode="decimal" min="0" value="${o.precio_estandar??''}" placeholder="Lista" onchange="crmGuardarNum('${esc(o.id)}','precio_estandar',this.value)"></div>
      <div class="fg"><label>Precio del cliente (USD)</label><input type="number" inputmode="decimal" min="0" value="${o.precio_cliente??''}" placeholder="Acordado" onchange="crmGuardarNum('${esc(o.id)}','precio_cliente',this.value)"></div></div>
    <div class="fg"><label>¿Cuándo estimás que cierra? <small>(para el pronóstico)</small></label>${ch('cierre_estimado',cierreChips,o.cierre_estimado)}
      <input type="date" value="${esc(o.cierre_estimado||'')}" onchange="crmSet('cierre_estimado',this.value||null)" style="margin-top:6px" aria-label="Fecha estimada de cierre"></div></div>`;
  // próximo paso (lo que se hace en esta etapa)
  let accion='';
  if(crm.modo==='perdido'){
    accion=`<div class="card crm-paso" style="border-left:5px solid var(--rojo)"><div class="card-title">❌ ¿Por qué se perdió?</div>
      ${ch('motivo',Object.entries(CRM_PERDIDO),o.motivo&&CRM_PERDIDO[o.motivo]?o.motivo:'')}
      <div class="fg" style="margin-top:8px"><textarea id="crm-mot-det" rows="3" placeholder="Contá qué pasó (obligatorio)">${esc(o.etapa==='perdido'?o.motivo_detalle||'':'')}</textarea></div>
      <div class="flex-btns"><button class="btn btn-sec" onclick="crm.modo='';crmPintarDet()">Volver</button><button class="btn btn-rojo" onclick="crmPerder()">Marcar perdido</button></div></div>`;
  }else if(crm.modo==='nocalif'){
    accion=`<div class="card crm-paso" style="border-left:5px solid var(--gris-m)"><div class="card-title">⛔ ¿Qué criterio no cumple?</div>
      <div class="crm-ops">${CRM_NOCALIF.map(x=>`<button type="button" class="chip" onclick="crmNoCalificar('${esc(x)}')">${esc(x)}</button>`).join('')}</div>
      <div class="flex-btns" style="margin-top:10px"><button class="btn btn-sec" onclick="crm.modo='';crmPintarDet()">Volver</button></div></div>`;
  }else if(ab){
    const txt={precalificado:['✅ Pasar a Calificado','Ya sabés quién decide, para cuándo lo necesita, si tiene presupuesto y si le sirve el producto.'],
      calificado:['📄 Presupuesto enviado','Mandaste la propuesta por WhatsApp o mail.'],
      presupuesto:['🤝 El cliente dio el OK','Aceptó, pero todavía no mandó la orden de compra o no se facturó.'],
      acuerdo:['🏆 Ganado: se facturó','Se abre la nota de pedido con los datos ya cargados.']}[o.etapa];
    accion=`<div class="card crm-paso" style="border-left:5px solid var(--nar)"><div class="card-title">Próximo paso</div>
      <p class="crm-ayuda">${txt[1]}</p>
      ${o.etapa==='calificado'?`<div class="fg"><label>¿Por dónde lo mandaste?</label>${ch('presupuesto_via',[['whatsapp','💬 WhatsApp'],['mail','✉️ Mail']],o.presupuesto_via)}</div>`:''}
      <button class="btn btn-nar" style="width:100%" onclick="${sig==='ganado'?`crmGanar('${esc(o.id)}')`:`crmMover('${esc(o.id)}','${sig}')`}">${txt[0]}</button>
      <div class="crm-sec-btns">${o.etapa==='precalificado'?`<button class="btn btn-sec btn-sm" onclick="crm.modo='nocalif';crmPintarDet()">⛔ No calificado</button>`:''}
        <button class="btn btn-sec btn-sm" onclick="crm.modo='perdido';crmPintarDet()">❌ Perdido</button>
        ${o.etapa!=='acuerdo'?`<button class="btn btn-sec btn-sm" onclick="crmGanar('${esc(o.id)}')">🏆 Ganado</button>`:''}</div></div>`;
  }else if(o.etapa==='ganado'){
    const p=o.proyecto_id&&todos[o.proyecto_id];
    accion=`<div class="card crm-paso" style="border-left:5px solid var(--verde)"><div class="card-title">🏆 Venta ganada</div>
      ${o.proyecto_id?(p?`<button class="btn btn-sec" style="width:100%" onclick="crmCerrar();verDetalle('${esc(o.proyecto_id)}')">📋 Ver la nota de pedido · ${esc(p.nombre.slice(0,30))}</button>`:'<p class="crm-ayuda">✅ Nota de pedido cargada.</p>')
        :(puedeCrear()?`<p class="crm-ayuda">Falta cargar la nota de pedido de esta venta.</p><button class="btn btn-nar" style="width:100%" onclick="crmCargarNota('${esc(o.id)}')">📝 Cargar la nota de pedido</button>`
          :'<p class="crm-ayuda">⏳ Falta que el vendedor cargue la nota de pedido.</p>')}
      ${!lider?`<div class="crm-com-vend">💰 Tu comisión: <b>${o.comision!=null?usd(o.comision):'la carga el líder de ventas'}</b>${o.entregado?' · ✅ Entregado':''}${o.cobrado?' · ✅ Cobrado':''}</div>`:''}</div>`;
  }else{
    accion=`<div class="card crm-paso" style="border-left:5px solid var(--gris-m)"><div class="card-title">${e.i} ${e.t}</div>
      <p class="crm-ayuda">${o.etapa==='perdido'?'<b>'+esc(CRM_PERDIDO[o.motivo]||o.motivo||'')+'</b>: ':''}${esc(o.motivo_detalle||o.motivo||'')}</p>
      <button class="btn btn-sec" style="width:100%" onclick="crmReabrir('${esc(o.id)}')">↩️ Reabrir</button></div>`;
  }
  // tareas de seguimiento
  const pend=crmPendientes(o.id), hechas=crm.tareas.filter(t=>t.oportunidad_id===o.id&&t.hecha_en).sort((a,b)=>String(b.hecha_en).localeCompare(String(a.hecha_en))).slice(0,3);
  const nt=crm.tarea||{tipo:o.telefono?'whatsapp':'llamar',dias:1,texto:''};
  const tareas=`<div class="dsec crm-sec" id="crm-tareas"><h3>📅 Seguimiento</h3>
    ${pend.map(t=>`<div class="crm-t"><div><b>${CRM_TAREA[t.tipo]||t.tipo}</b> · <span style="color:${t.vence<hoyISO()?'var(--rojo)':'inherit'}">${crmCuandoTxt(t.vence)} (${crmFecha(t.vence)})</span>${t.texto?'<div class="crm-n">'+esc(t.texto)+'</div>':''}</div>
      <button class="btn btn-verde btn-sm" onclick="crmTareaHecha('${esc(t.id)}')">✓ Hecha</button></div>`).join('')||(ab?'<p class="crm-ayuda" style="color:var(--amarillo)">⚠️ No hay nada agendado.</p>':'')}
    ${ab?`<div class="crm-nt"><div class="crm-ops">${Object.entries(CRM_TAREA).map(([k,t])=>`<button type="button" class="chip${nt.tipo===k?' active':''}" onclick="crmTareaSet('tipo','${k}')">${t}</button>`).join('')}</div>
      <div class="crm-ops">${CRM_CUANDO.map(([t,d])=>`<button type="button" class="chip${nt.dias===d&&!nt.fecha?' active':''}" onclick="crmTareaSet('dias',${d})">${t}</button>`).join('')}
        <input type="date" class="crm-fecha${nt.fecha?' active':''}" value="${esc(nt.fecha||'')}" onchange="crmTareaSet('fecha',this.value)" aria-label="Otra fecha"></div>
      <input type="text" id="crm-nt-txt" placeholder="Qué hay que hacer (opcional)" value="${esc(nt.texto||'')}" oninput="(crm.tarea=crm.tarea||{tipo:'${nt.tipo}',dias:${nt.dias}}).texto=this.value">
      <button class="btn btn-sec" style="width:100%;margin-top:6px" onclick="crmAgendar('${esc(o.id)}')">📅 Agendar</button></div>`:''}
    ${hechas.length?`<div class="crm-n" style="margin-top:8px">Últimas hechas: ${hechas.map(t=>`${CRM_TAREA[t.tipo]?.split(' ')[0]||''} ${crmFecha(String(t.hecha_en).slice(0,10))}`).join(' · ')}</div>`:''}</div>`;
  // datos del contacto
  const vendSel=lider?`<div class="fg"><label>Vendedor</label><select onchange="crmSet('vendedor_id',this.value)">${crmVendedores().map(id=>`<option value="${esc(id)}" ${o.vendedor_id===id?'selected':''}>${esc(nombreDe(id))}</option>`).join('')}</select></div>`:'';
  const datos=`<div class="dsec crm-sec"><h3>👤 Datos del contacto</h3>
    <div class="fg"><label>Cliente</label><input type="text" value="${esc(o.cliente)}" onchange="this.value.trim()&&crmSet('cliente',this.value.trim(),1)"></div>
    <div class="crm-2"><div class="fg"><label>Teléfono</label><input type="tel" inputmode="tel" value="${esc(o.telefono||'')}" onchange="crmSet('telefono',this.value.trim()||null,1)"></div>
      <div class="fg"><label>Mail</label><input type="email" value="${esc(o.mail||'')}" onchange="crmSet('mail',this.value.trim()||null,1)"></div></div>
    <div class="crm-2"><div class="fg"><label>Producto</label><select onchange="crmSet('producto',this.value||null)"><option value="">A definir</option>${[...NotaPedido.TIPOLOGIAS,'Otro'].map(x=>`<option ${o.producto===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="fg"><label>Unidades</label><input type="number" inputmode="numeric" min="1" value="${o.unidades||1}" onchange="crmSet('unidades',Math.max(1,parseInt(this.value)||1),1)"></div></div>
    <div class="crm-2"><div class="fg"><label>Llegó por</label><select onchange="crmSet('origen',this.value)">${Object.entries(CRM_ORIGEN).map(([k,t])=>`<option value="${k}" ${o.origen===k?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="fg"><label>Empresa que vende</label><select onchange="crmSet('empresa',this.value||null)"><option value="">—</option>${(NotaPedido.EMPRESAS||[]).map(x=>`<option ${o.empresa===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div></div>
    ${vendSel}
    <div class="fg"><label>Notas</label><textarea rows="3" onchange="crmSet('notas',this.value.trim()||null,1)">${esc(o.notas||'')}</textarea></div>
    ${(lider||(o.vendedor_id===myId&&!o.proyecto_id&&o.etapa!=='ganado'))?`<button class="btn btn-sec btn-sm" style="color:var(--rojo)" onclick="crmBorrar('${esc(o.id)}')">🗑️ Borrar (cargado por error)</button>`:''}</div>`;
  const hist=`<div class="dsec crm-sec"><h3>🕓 Recorrido</h3>${(o.historial||[]).slice().reverse().map(x=>`<div class="crm-n">${crmEt(x.etapa).i} ${crmEt(x.etapa).t} · ${crmFecha(String(x.en).slice(0,10))}${x.por&&x.por!==o.vendedor_id?' · '+esc(nombreDe(x.por)):''}</div>`).join('')}</div>`;
  m.querySelector('.crm-body').innerHTML=`<div class="crm-det-top"><div style="min-width:0"><div class="modal-title" style="margin-bottom:2px">${esc(o.cliente)}</div>
      <div class="crm-sub"><span class="badge ${e.c}">${e.i} ${e.t}</span> N° ${esc(o.numero??'')}${lider?' · 👤 '+esc(nombreDe(o.vendedor_id)):''}${crmImporte(o)?' · <b>'+usd(crmImporte(o))+'</b>':''}</div></div>
      <button class="btn btn-sec btn-sm" onclick="crmCerrar()" aria-label="Cerrar">✕</button></div>
    <div class="crm-contacto">${crmBotonesContacto(o)}</div>
    ${stepper}${accion}
    ${lider&&o.etapa==='ganado'?`<div class="dsec crm-sec"><h3>💰 Comisión y cobro</h3>${crmLiderHTML(o)}</div>`:''}
    ${o.etapa==='precalificado'?calif+tareas:tareas+calif}${datos}${hist}`;
}
async function crmSet(campo,v,callado){
  const o=crmOp(crm.det); if(!o) return;
  if(o[campo]===v) return;
  if(await crmGuardar(o.id,{[campo]:v},true)){
    if(!callado) crmPintarDet();
    crmRefrescar();
  }
}
function crmTareaSet(k,v){
  const o=crmOp(crm.det);
  crm.tarea=crm.tarea||{tipo:o&&o.telefono?'whatsapp':'llamar',dias:1,texto:document.getElementById('crm-nt-txt')?.value||''};
  if(k==='dias'){crm.tarea.dias=v;crm.tarea.fecha='';}
  else crm.tarea[k]=v;
  crmPintarDet();
}
async function crmAgendar(oid){
  const o=crmOp(oid);
  const t=crm.tarea||{tipo:o&&o.telefono?'whatsapp':'llamar',dias:1};
  const txt=document.getElementById('crm-nt-txt')?.value.trim()||'';
  const vence=t.fecha||crmMas(t.dias??1);
  if(await crmNuevaTarea(oid,t.tipo,txt,vence)){crm.tarea=null;crmPintarDet();crmRefrescar();}
}

// ── cambios de etapa ──
async function crmMover(id,etapa,extra){
  const o=crmOp(id); if(!o) return false;
  if(['calificado','presupuesto','acuerdo','ganado'].includes(etapa)){
    const f=crmFaltaCalificar(o);
    if(f.length){toast('⚠️ Para pasar a '+crmEt(etapa).t+' falta: '+f.join(', '));
      document.querySelectorAll('#m-crm .crm-sec h3').forEach(h=>{if(/Calificación/.test(h.textContent))h.scrollIntoView({behavior:'smooth',block:'start'});});
      return false;}
    if(etapa==='calificado'&&(o.tiene_presupuesto===false||o.soluciona===false)
      &&!await confirmar('Marcaste que '+(o.tiene_presupuesto===false?'no tiene presupuesto':'el producto no le soluciona el problema')+'. Normalmente eso es "No calificado". ¿Lo pasás igual a Calificado?')) return false;
  }
  const ok=await crmGuardar(id,Object.assign({etapa},extra||{}),true);
  if(!ok) return false;
  crm.modo='';
  if(CRM_CERRADAS.includes(etapa)){
    // al cerrar, los seguimientos pendientes quedan hechos
    const p=crmPendientes(id);
    if(p.length){const en=new Date().toISOString();const r=await sb.from('tareas_crm').update({hecha_en:en}).in('id',p.map(t=>t.id));if(!r.error)p.forEach(t=>t.hecha_en=en);}
  }else{
    // el seguimiento automático de la etapa anterior queda hecho: se agenda el de la nueva
    const viejo=CRM_AUTO[o.etapa]&&o.etapa!==etapa?crmPendientes(id).filter(t=>t.texto===CRM_AUTO[o.etapa][1]):[];
    if(viejo.length){const en=new Date().toISOString();const r=await sb.from('tareas_crm').update({hecha_en:en}).in('id',viejo.map(t=>t.id));if(!r.error)viejo.forEach(t=>t.hecha_en=en);}
  }
  if(!CRM_CERRADAS.includes(etapa)&&!crmPendientes(id).length&&CRM_AUTO[etapa]){
    const a=CRM_AUTO[etapa]; await crmNuevaTarea(id,etapa==='calificado'&&o.presupuesto_via==='mail'?'mail':a[0],a[1],crmMas(a[2]),true);
  }
  toast(crmEt(etapa).i+' '+o.cliente+': '+crmEt(etapa).t);
  crmPintarDet(); crmRefrescar();
  return true;
}
async function crmPerder(){
  const o=crmOp(crm.det); if(!o) return;
  const det=document.getElementById('crm-mot-det')?.value.trim()||'';
  if(!CRM_PERDIDO[o.motivo]){toast('⚠️ Elegí la razón: precio, plazo, producto u otro');return;}
  if(!det){toast('⚠️ Contá en una línea qué pasó');document.getElementById('crm-mot-det')?.focus();return;}
  await crmMover(o.id,'perdido',{motivo:o.motivo,motivo_detalle:det});
}
async function crmNoCalificar(mot){
  const o=crmOp(crm.det); if(!o) return;
  await crmMover(o.id,'no_calificado',{motivo:mot,motivo_detalle:null});
}
async function crmReabrir(id){
  const o=crmOp(id); if(!o) return;
  // vuelve a la última etapa abierta por la que pasó
  const ult=(o.historial||[]).map(x=>x.etapa).filter(k=>CRM_ABIERTAS.includes(k)).pop()||'precalificado';
  if(!await confirmar('¿Reabrir '+o.cliente+'? Vuelve a '+crmEt(ult).t+'.')) return;
  if(o.etapa==='ganado'&&o.proyecto_id&&!await confirmar('Esta venta ya tiene nota de pedido. ¿Reabrirla igual? La nota no se borra.')) return;
  await crmMover(id,ult,{motivo:null,motivo_detalle:null});
}
async function crmGanar(id){
  const o=crmOp(id); if(!o) return;
  if(crmFaltaCalificar(o).length){await crmMover(id,'ganado');return;}
  if(!await confirmar('¿Se facturó la venta a '+o.cliente+'? Pasa a Ganado'+(puedeCrear()?' y se abre la nota de pedido con los datos del cliente ya cargados.':'.'))) return;
  if(!await crmMover(id,'ganado')) return;
  if(!puedeCrear()) return;
  if(!o.proyecto_id) crmCargarNota(id);
  // ya tiene un presupuesto armado con la nota: se pasa a orden de compra sin cargar nada de nuevo
  else if(typeof cotPasarAOC==='function'&&todos[o.proyecto_id]?.ficha?.sol==='Presupuesto') cotPasarAOC(o.proyecto_id,true);
}
// Abre la nota de pedido de siempre, con el cliente, el teléfono, el mail, la empresa y el producto del CRM
function crmCargarNota(id){
  const o=crmOp(id); if(!o) return;
  if(!puedeCrear()){toast('La nota de pedido la carga el vendedor');return;}
  const prod=NotaPedido.TIPOLOGIAS.includes(o.producto)&&o.producto!=='Contenedor'?o.producto:'';
  const empresa=o.empresa||perfiles[o.vendedor_id]?.empresa||'';
  const ficha={v:2,sol:'Orden de compra confirmada',cli:o.cliente||'',tel:o.telefono||'',mail:o.mail||'',empresa,unidades:o.unidades||1,...(prod?{prod}:{}),
    obs:o.notas||''};
  crmCerrar();
  NotaPedido.abrir({titulo:'Nota de pedido · '+o.cliente,ficha,cliente:o.cliente,empresa,enviar:rol()==='ventas',pideValor:veoPrecio(),valor:o.precio_cliente??'',
    onGuardar:async(f,opt)=>{
      const pid=await crearDesdeNota(f,opt,{vendId:o.vendedor_id,vend:nombreDe(o.vendedor_id),val:o.precio_cliente??'',oportunidad:id});
      if(!pid) return false;
      await crmGuardar(id,{proyecto_id:pid},true);
      crmRefrescar();
      return true;
    }});
}
async function crmBorrar(id){
  const o=crmOp(id); if(!o) return;
  if(!await confirmar('¿Borrar '+o.cliente+' del CRM? Se borran también sus seguimientos. Si no avanzó, mejor marcalo como Perdido o No calificado así queda el dato.')) return;
  const r=await sb.from('oportunidades').delete().eq('id',id);
  if(r.error){toast(msgError(r.error));return;}
  crm.ops=crm.ops.filter(x=>x.id!==id); crm.tareas=crm.tareas.filter(t=>t.oportunidad_id!==id);
  crmCerrar(); toast('🗑️ Borrado'); crmRefrescar();
}

// ── "Hoy" del vendedor: los seguimientos del día arriba de todo ──
const _renderDashSinCRM=renderDash;
renderDash=function(){
  _renderDashSinCRM();
  if(rol()!=='ventas'||crm.falta) return;
  const t=crmTareasHoy(), el=document.getElementById('dash-content'); if(!el) return;
  const nuevo=`<button class="btn btn-sec crm-nuevo-btn" onclick="showView('crm');crmNuevo()">📥 Nuevo contacto en el CRM</button>`;
  const sal=el.querySelector('.hoy-saludo');
  const html=(t.length?`<div class="card hoy-bloque" style="border-left:5px solid var(--rojo)"><div class="card-title" style="color:var(--rojo)">📞 Seguimientos de clientes (${t.length})</div>${t.slice(0,6).map(crmFilaTarea).join('')}
    ${t.length>6?`<button class="btn btn-sec btn-sm" onclick="crm.tab='hoy';showView('crm')">Ver los ${t.length}</button>`:''}</div>`:'')+nuevo;
  if(sal) sal.insertAdjacentHTML('afterend',html); else el.insertAdjacentHTML('afterbegin',html);
  if(t.length){el.querySelector('.hoy-ok')?.remove(); if(typeof pintarBadgeHoy==='function') pintarBadgeHoy((typeof badgeHoy!=='undefined'?badgeHoy:0)+t.length);}
};

// Si la app ya cargó los datos antes de que llegara este archivo, se trae el CRM y se redibuja
if(myId&&perfiles[myId]&&puedeCRM()) cargarCRM().then(()=>{if(currentUser) rerender();});
