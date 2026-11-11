// ════════════════════════════════════════════════
// NOTA DE PEDIDO CONFIRMADA: cambios del líder y reconfirmación con el cliente
// Después de que ventas la envía, solo el líder o el admin la corrigen. Cada cambio queda
// registrado y le llega a ventas, que se lo manda al cliente. Hasta que ventas avise que
// el cliente lo aprobó, el proyecto no pasa a ejecución (también en la base, migración 0006).
// ════════════════════════════════════════════════
const PREFIJO_CAMBIO='✏️ Cambio en la nota de pedido: ';

async function cargarVersiones(T){
  try{
    const vs=await traer('nota_versiones');
    vs.forEach(v=>{const p=T[v.proyecto_id]; if(!p) return;
      (p.versiones=p.versiones||[]).push({version:v.version,tipo:v.tipo||'enviada',ficha:v.ficha,
        autor:v.autor_id?nombreDe(v.autor_id):'',fecha:fechaDe(v.creado_en),ts:ts(v.creado_en)});});
    Object.values(T).forEach(p=>{if(p.versiones) p.versiones.sort((a,b)=>a.version-b.version);});
  }catch(e){console.warn('Versiones de la nota no disponibles (¿falta la migración 0006?)',e);}
}
// la nota ya salió de ventas con la confirmación del cliente
const notaConfirmada=p=>etapaDe(p)!=='ventas'&&esNota(p);
// hay un cambio que el cliente todavía no aprobó
function notaPendiente(p){const vs=p.versiones||[];return vs.length>0&&vs[vs.length-1].tipo==='cambio';}
function puedeReconfirmar(p){
  if(!notaPendiente(p)) return false;
  const r=rol(); return r==='admin'||(r==='ventas'&&(p.creadoPorId===myId||p.vendId===myId));
}

// ── seccionesNota / cambiosEntre: qué partes de la nota cambiaron ──
function seccionesNota(f){
  const out={};
  NotaPedido.resumen(f).split('<h4>').slice(1).forEach(b=>{const i=b.indexOf('</h4>');
    out[b.slice(0,i).trim()]=b.slice(i+5).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();});
  return out;
}
function cambiosEntre(a,b){
  const sa=seccionesNota(a), sb=seccionesNota(b);
  return Object.keys({...sa,...sb}).filter(k=>sa[k]!==sb[k]);
}

// El líder o el admin guardó la nota después de la confirmación del cliente: queda registrado y le avisamos a ventas
async function avisarCambioNota(id,cam){
  const p=todos[id]; if(!p) return;
  anotarVersionLocal(p,'cambio');
  const q=limpiar(p);
  q.consultas=(q.consultas||[]);
  q.consultas.push({id:nuevoId(),texto:`${PREFIJO_CAMBIO}${currentUser.nombre} cambió ${cam.join(', ').toLowerCase()}. Mandale el PDF nuevo al cliente y, cuando lo apruebe, tocá "El cliente aprobó el cambio" en el proyecto.`,
    para:'ventas',ts:Date.now(),deId:myId,deNombre:currentUser.nombre,incidencia:false});
  await guardarProyecto(q);
}
function anotarVersionLocal(p,tipo){
  const vs=(p.versiones=p.versiones||[]);
  vs.push({version:(vs.length?vs[vs.length-1].version:0)+1,tipo,ficha:JSON.parse(JSON.stringify(p.ficha)),
    autor:currentUser.nombre,fecha:fechaDe(new Date().toISOString()),ts:Date.now()});
}

// ── ventas avisa que el cliente aprobó ──
async function reconfirmarNota(id,btn){
  const p=todos[id]; if(!p||!puedeReconfirmar(p)) return;
  if(!confirm('¿El cliente aprobó la nota con el cambio? Confirmalo solo si ya te respondió.')) return;
  if(btn) btn.disabled=true;
  try{chk(await sb.rpc('reconfirmar_nota',{pid:id}));}
  catch(e){console.error(e);toast('⚠️ No se pudo registrar: '+(e.message||'error'));if(btn) btn.disabled=false;return;}
  anotarVersionLocal(p,'reconfirmada');
  toast('✅ Cambio aprobado por el cliente'); verDetalle(id); refrescar();
}

// ── historial ──
const TIPO_VER={enviada:'Confirmada por el cliente',cambio:'Corrección del líder',reconfirmada:'Cliente aprobó el cambio'};
function seccionVersiones(p){
  const vs=p.versiones||[];
  if(!vs.length) return '';
  const ult=vs[vs.length-1];
  let estado;
  if(ult.tipo==='cambio'){
    const ok=vs.slice().reverse().find(v=>v.tipo!=='cambio');
    const cam=ok?cambiosEntre(ok.ficha,p.ficha):[];
    estado=`<div class="nota-pend">✏️ <b>${esc(ult.autor||'El líder')} cambió la nota</b> el ${esc(ult.fecha)}${cam.length?' ('+esc(cam.join(', ').toLowerCase())+')':''}. El cliente todavía no lo aprobó: ventas tiene que mandarle el PDF nuevo${etapaDe(p)==='ejecucion'?'. <b>El proyecto ya está en ejecución.</b>':' y no puede pasar a ejecución hasta que lo apruebe.'}
      ${puedeReconfirmar(p)?`<div style="margin-top:8px"><button class="btn btn-verde btn-sm" onclick="reconfirmarNota('${esc(p.id)}',this)">✅ El cliente aprobó el cambio</button></div>`:''}</div>`;
  }else estado=`<div class="nota-ok">🔒 Confirmada con el cliente · ${esc(ult.fecha)}${ult.autor?' · '+esc(ult.autor):''}</div>`;
  return `<div class="nota-vers">${estado}
    ${vs.length>1?`<details><summary>Historial (${vs.length} registros)</summary>
      ${vs.slice().reverse().map((v,i,arr)=>{const ant=arr.slice(i+1).find(x=>x.tipo!=='reconfirmada');
        const cam=v.tipo==='cambio'&&ant?cambiosEntre(ant.ficha,v.ficha):[];
        return `<div class="nota-v"><div><b>${TIPO_VER[v.tipo]||'Versión'}</b> · ${esc(v.fecha)}${v.autor?' · '+esc(v.autor):''}
          ${v.tipo==='cambio'?`<small>${cam.length?'Cambió: '+esc(cam.join(', ').toLowerCase()):'Sin cambios en el contenido'}</small>`:''}</div>
          ${v.tipo!=='reconfirmada'?`<button class="btn btn-sec btn-sm" onclick="pdfVersion('${esc(p.id)}',${v.version},this)">📄 PDF</button>`:''}</div>`}).join('')}
    </details>`:''}
  </div>`;
}
async function pdfVersion(id,n,btn){
  const v=(todos[id]?.versiones||[]).find(x=>x.version===n); if(!v) return;
  try{await NotaPedido.pdf(v.ficha,btn);}catch(e){toast('⚠️ No se pudo armar el PDF');}
}
