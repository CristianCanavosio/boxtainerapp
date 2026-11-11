// ════════════════════════════════════════════════
// MATERIALES DEL PROYECTO: stock antes de asignar, consumo real y desvíos
// Los ítems salen de la nota de pedido (los mismos del costeo). El líder valida el stock
// de cada uno antes de asignar, y el supervisor carga cuánto usó. El desvío en cantidad lo
// ven el líder y el supervisor. El desvío en plata se calcula con la lista de costos, así
// que lo ve solo el administrador (migración 0007).
// ════════════════════════════════════════════════
let mpListo=false;          // false si todavía no se corrió la migración 0007
const mpVista={};           // proyecto_id -> ítems de la última vista (los botones usan el índice)
const STOCK={hay:{t:'✅ Hay',c:'verde'},pedido:{t:'🛒 Pedido',c:'amar'},falta:{t:'❌ Falta',c:'rojo'}};

async function cargarMateriales(T){
  mpListo=false;
  try{
    const rs=await traer('materiales_proyecto');
    rs.forEach(r=>{const p=T[r.proyecto_id]; if(!p) return;
      (p.mats=p.mats||[]).push({id:r.id,clave:r.clave,det:r.det||'',unidad:r.unidad,plan:Number(r.cant_plan)||0,extra:!!r.extra,
        stock:r.stock||null,stockPor:r.stock_por?nombreDe(r.stock_por):'',usada:r.cant_usada==null?null:Number(r.cant_usada),
        usadaPor:r.usada_por?nombreDe(r.usada_por):'',usadaEn:fechaDe(r.usada_en)});});
    mpListo=true;
  }catch(e){console.warn('Materiales del proyecto no disponibles (¿falta la migración 0007?)',e);}
}

// Ítems del proyecto: los materiales de la nota + lo ya guardado + lo agregado a mano
function itemsMateriales(p){
  const g=p.mats||[], out=[], key=(c,d)=>c+' | '+(d||'');
  const usados=new Set();
  if(esNota(p)) NotaPedido.lineasCosteo(p.ficha).filter(x=>x.rubro==='mat').forEach(x=>{
    const s=g.find(y=>key(y.clave,y.det)===key(x.clave,x.det)); if(s) usados.add(s);
    out.push(s?{...s,pend:x.pend}:{id:null,clave:x.clave,det:x.det||'',unidad:x.unidad,plan:x.cant,extra:false,stock:null,usada:null,pend:x.pend});
  });
  // guardados que ya no están en la nota (la nota cambió) o agregados a mano
  g.filter(y=>!usados.has(y)).forEach(y=>out.push({...y,fuera:!y.extra}));
  return out;
}
const mpNum=v=>{if(v===''||v==null) return null;const n=Number(String(v).replace(',','.'));return isFinite(n)&&n>=0?n:null};
const mpFmt=n=>n==null?'—':(Math.round(n*100)/100).toLocaleString('es-AR');

// ¿Se puede asignar? Todos los ítems con stock validado y ninguno en falta
function problemaStock(p){
  if(!mpListo||!esNota(p)) return null;
  const it=itemsMateriales(p).filter(x=>!x.fuera);
  const sin=it.filter(x=>!x.stock), falta=it.filter(x=>x.stock==='falta');
  if(falta.length) return 'Hay '+falta.length+' material'+(falta.length>1?'es':'')+' en falta: '+falta.map(x=>x.clave).slice(0,3).join(', ')+(falta.length>3?'…':'');
  if(sin.length) return 'Falta validar el stock de '+sin.length+' material'+(sin.length>1?'es':'');
  return null;
}
// Al asignar se guardan todos los ítems: lo planificado queda fijo para medir el desvío
async function fijarPlanMateriales(p){
  if(!mpListo||!esNota(p)) return;
  const nuevos=itemsMateriales(p).filter(x=>!x.id);
  if(!nuevos.length) return;
  const filas=nuevos.map(x=>({id:nuevoId(),proyecto_id:p.id,clave:x.clave,det:x.det||'',unidad:x.unidad,cant_plan:x.plan,extra:!!x.extra,stock:x.stock||null}));
  chk(await sb.from('materiales_proyecto').insert(filas));
  const q=todos[p.id]; q.mats=q.mats||[];
  filas.forEach(f=>q.mats.push({id:f.id,clave:f.clave,det:f.det,unidad:f.unidad,plan:f.cant_plan,extra:f.extra,stock:f.stock,usada:null}));
}

async function guardarItemMat(pid,i,cambios){
  const p=todos[pid], x=(mpVista[pid]||[])[i]; if(!p||!x) return;
  const col={};
  if('stock' in cambios) col.stock=cambios.stock;
  if('plan' in cambios) col.cant_plan=cambios.plan;
  if('usada' in cambios) col.cant_usada=cambios.usada;
  const nuevo=!x.id, nid=x.id||nuevoId();
  try{
    if(!nuevo) chk(await sb.from('materiales_proyecto').update(col).eq('id',nid));
    else chk(await sb.from('materiales_proyecto').insert({id:nid,proyecto_id:pid,clave:x.clave,det:x.det||'',unidad:x.unidad,
        cant_plan:x.plan,extra:!!x.extra,stock:x.stock||null,...col}));
  }catch(e){console.error(e);toast('⚠️ No se pudo guardar: '+(e.message||'error'));pintarMateriales(pid);return;}
  x.id=nid;
  const m=(p.mats=p.mats||[]); let s=m.find(y=>y.id===x.id);
  if(!s){s={id:x.id,clave:x.clave,det:x.det||'',unidad:x.unidad,plan:x.plan,extra:!!x.extra,stock:x.stock||null,usada:null};m.push(s);}
  Object.assign(s,cambios);
  if('stock' in cambios) s.stockPor=currentUser.nombre;
  if('usada' in cambios){s.usadaPor=currentUser.nombre;s.usadaEn=hoyISO();}
  pintarMateriales(pid);
}
function stockItem(pid,i,v){guardarItemMat(pid,i,{stock:v});}
function planItem(pid,i,v){const n=mpNum(v); if(n===null){toast('⚠️ Cantidad inválida');pintarMateriales(pid);return;} guardarItemMat(pid,i,{plan:n});}
function usadaItem(pid,i,v){const n=mpNum(v); if(v!==''&&n===null){toast('⚠️ Cantidad inválida');pintarMateriales(pid);return;} guardarItemMat(pid,i,{usada:n});}
function todoHay(pid){
  const it=(mpVista[pid]||[]);
  (async()=>{for(let i=0;i<it.length;i++) if(!it[i].stock&&!it[i].fuera) await guardarItemMat(pid,i,{stock:'hay'});})();
}
async function agregarMatProy(pid){
  const p=todos[pid]; if(!p) return;
  const nom=document.getElementById('mp-nom').value.trim(), uni=document.getElementById('mp-uni').value.trim()||'c/u';
  const cant=mpNum(document.getElementById('mp-cant').value);
  if(nom.length<2){toast('⚠️ Poné el nombre del material');return;}
  if(cant===null){toast('⚠️ Poné la cantidad');return;}
  const enObra=etapaDe(p)==='ejecucion';
  // en obra, lo que se agrega no estaba planificado: plan 0 y todo lo usado es desvío
  const fila={id:nuevoId(),proyecto_id:pid,clave:nom,det:'',unidad:uni,cant_plan:enObra?0:cant,extra:true,
    stock:enObra?null:'hay',...(enObra?{cant_usada:cant}:{})};
  try{chk(await sb.from('materiales_proyecto').insert(fila));}
  catch(e){toast('⚠️ No se pudo agregar: '+(String(e.message||'').includes('duplicate')?'ya está en la lista':e.message||'error'));return;}
  (p.mats=p.mats||[]).push({id:fila.id,clave:nom,det:'',unidad:uni,plan:fila.cant_plan,extra:true,stock:fila.stock,
    usada:enObra?cant:null,usadaPor:enObra?currentUser.nombre:'',usadaEn:enObra?hoyISO():''});
  toast(enObra?'✅ Agregado como material no previsto':'✅ Material agregado');
  pintarMateriales(pid);
}

// Desvío de un ítem. Mientras la obra sigue, solo cuenta lo que se pasó de lo planificado.
function desvioItem(x,cerrado){
  if(x.usada==null) return null;
  const d=x.usada-x.plan;
  if(!cerrado&&d<=0) return null;
  return {d,pct:x.plan>0?d/x.plan*100:null};
}
function resumenDesvios(p){
  const cerrado=p.estado==='finalizado', it=itemsMateriales(p);
  let usd=0, sinPrecio=0, cargados=0, sobre=0;
  it.forEach(x=>{if(x.usada!=null) cargados++; const dv=desvioItem(x,cerrado); if(!dv) return; if(dv.d>0) sobre++;
    if(esAdmin()){const pr=listaCostos[x.clave]; if(pr&&pr.costo) usd+=dv.d*pr.costo; else if(dv.d) sinPrecio++;}});
  return {it,cerrado,usd,sinPrecio,cargados,sobre};
}

function pintarMateriales(pid){
  const el=document.getElementById('mp-sec'), p=todos[pid];
  if(el&&p) el.outerHTML=seccionMateriales(p);
}
function seccionMateriales(p){
  const e=etapaDe(p), r=rol();
  if(MODO!=='nube'||!esNota(p)||!(e==='asignacion'||e==='ejecucion')) return '';
  if(!(esOp()||r==='lectura'||(r==='supervisor'&&p.supId===myId))) return '';
  if(!mpListo) return `<div class="dsec" id="mp-sec"><h3>📦 Materiales del proyecto</h3><div style="font-size:13px">Para activarlo hay que correr la migración <b>0007_materiales_por_proyecto.sql</b> en Supabase.</div></div>`;
  const id=esc(p.id), R=resumenDesvios(p), it=R.it; mpVista[p.id]=it;
  const op=esOp()&&r!=='lectura';
  if(e==='asignacion'){
    const falta=problemaStock(p);
    return `<div class="dsec" id="mp-sec"><h3>📦 Materiales del proyecto</h3>
      <div style="font-size:12px;color:var(--gris-m);margin-bottom:8px">Salen de la nota de pedido. Validá el stock de cada uno: sin eso no se puede asignar. Si hace falta, corregí la cantidad.</div>
      ${falta?`<div class="cst-aviso amar">${esc(falta)}</div>`:'<div class="nota-ok" style="margin-bottom:8px">✅ Stock validado de todos los materiales</div>'}
      <div class="mp-lista">${it.map((x,i)=>`<div class="mp-f${x.fuera?' mp-fuera':''}">
        <div class="mp-n">${esc(x.clave)}${x.det?`<small>${esc(x.det)}</small>`:''}${x.pend?'<small style="color:var(--amarillo)">a confirmar con el cliente</small>':''}${x.fuera?'<small>ya no está en la nota</small>':''}</div>
        <div class="mp-c">${op?`<input type="number" step="0.01" min="0" value="${x.plan}" onchange="planItem('${id}',${i},this.value)">`:mpFmt(x.plan)} <span>${esc(x.unidad)}</span></div>
        <div class="mp-s">${Object.keys(STOCK).map(k=>op?`<button class="mp-b ${x.stock===k?'on '+STOCK[k].c:''}" onclick="stockItem('${id}',${i},'${k}')">${STOCK[k].t}</button>`
          :(x.stock===k?`<span class="mp-b on ${STOCK[k].c}">${STOCK[k].t}</span>`:'')).join('')}</div>
      </div>`).join('')}</div>
      ${op?`<div class="flex-btns" style="margin-top:8px">${it.some(x=>!x.stock&&!x.fuera)?`<button class="btn btn-sec btn-sm" onclick="todoHay('${id}')">✅ Marcar el resto como "hay"</button>`:''}</div>
      ${formAgregarMat(id,false)}`:''}
    </div>`;
  }
  const puedeCargar=(esSupDe(p)||esOp())&&r!=='lectura'&&p.estado!=='finalizado';
  return `<div class="dsec" id="mp-sec"><h3>📦 Materiales: planificado vs usado</h3>
    <div style="font-size:12px;color:var(--gris-m);margin-bottom:8px">${puedeCargar?'Cargá cuánto se usó de cada material (el total acumulado). ':''}${R.cerrado?'Proyecto finalizado: el desvío compara todo lo usado contra lo planificado.':'Mientras la obra sigue, el desvío marca solo lo que se pasó de lo planificado.'}</div>
    ${R.sobre?`<div class="cst-aviso">⚠️ ${R.sobre} material${R.sobre>1?'es':''} por encima de lo planificado</div>`:''}
    ${esAdmin()&&(R.cargados||R.cerrado)?`<div class="mp-usd ${R.usd>0?'rojo':'verde'}">🔒 Desvío en materiales: <b>${R.usd>0?'+':''}${usd(R.usd)}</b> <small>solo vos lo ves${R.sinPrecio?` · ${R.sinPrecio} ítem${R.sinPrecio>1?'s':''} sin precio en la lista de costos`:''}</small></div>`:''}
    <div class="mp-tabla">
      <div class="mp-h"><span>Material</span><span>Plan</span><span>Usado</span><span>Desvío</span></div>
      ${it.map((x,i)=>{const dv=desvioItem(x,R.cerrado);const pr=esAdmin()?listaCostos[x.clave]:null;
        return `<div class="mp-r">
          <span>${esc(x.clave)}${x.det?`<small>${esc(x.det)}</small>`:''}${x.extra&&!x.plan?'<small>no previsto</small>':''}${x.usadaPor?`<small>${esc(x.usadaPor)} · ${esc(x.usadaEn||'')}</small>`:''}</span>
          <span>${mpFmt(x.plan)} <small>${esc(x.unidad)}</small></span>
          <span>${puedeCargar?`<input type="number" step="0.01" min="0" value="${x.usada==null?'':x.usada}" placeholder="—" onchange="usadaItem('${id}',${i},this.value)">`:mpFmt(x.usada)}</span>
          <span class="${dv?(dv.d>0?(dv.pct===null||dv.pct>10?'rojo':'amar'):'verde'):''}">${dv?(dv.d>0?'+':'')+mpFmt(dv.d)+(dv.pct!==null?` <small>${dv.pct>0?'+':''}${Math.round(dv.pct)}%</small>`:''):'—'}
            ${dv&&pr&&pr.costo?`<small>🔒 ${dv.d>0?'+':''}${usd(dv.d*pr.costo)}</small>`:''}</span>
        </div>`}).join('')}
    </div>
    ${puedeCargar?formAgregarMat(id,true):''}
  </div>`;
}
function formAgregarMat(id,enObra){
  return `<details class="mp-add"><summary>➕ ${enObra?'Agregar material no previsto':'Agregar material'}</summary>
    <div class="form-2" style="margin-top:6px"><div class="fg"><label>Material</label><input id="mp-nom" placeholder="Ej: Sellador poliuretánico"></div>
      <div class="fg"><label>Unidad</label><input id="mp-uni" placeholder="c/u, m², l, kg"></div></div>
    <div class="fg"><label>${enObra?'Cantidad usada':'Cantidad'}</label><input type="number" step="0.01" min="0" id="mp-cant"></div>
    <button class="btn btn-sec btn-sm" onclick="agregarMatProy('${id}')">Agregar</button></details>`;
}
