// ════════════════════════════════════════════════
// COTIZADOR DE VENTAS (migración 0025)
// - El vendedor cotiza desde el CRM: elige la tipología, la app trae lo que lleva y él agrega variantes
//   (una ventana más, un mingitorio, sin aire…). La BASE calcula el precio: costo × cantidad de cada
//   insumo, × (1 + margen). A la app del vendedor llega solo el precio final: nunca costos ni márgenes.
// - Si quiere un precio más bajo que el de lista, lo pide con el motivo y el líder de ventas lo autoriza,
//   pone otro precio o lo rechaza. El líder ve el costo y el margen que queda.
// - Al enviarla (PDF por WhatsApp o mail) el contacto toma el precio y pasa a Presupuesto.
// ════════════════════════════════════════════════
const cot={cat:null,lista:[],costos:{},falta:false,ed:null,ver:null,elegir:'',aut:{}};
const COT_EST={lista:['✅','Lista para enviar','b-verde'],pendiente:['⏳','Esperando autorización','b-amar'],autorizada:['✅','Precio autorizado','b-verde'],
  rechazada:['❌','Precio rechazado','b-rojo'],enviada:['📤','Enviada','b-morado']};
const cotOp=id=>cot.lista.find(c=>c.id===id);
const cotDeOp=oid=>cot.lista.filter(c=>c.oportunidad_id===oid).sort((a,b)=>String(b.creado_en).localeCompare(String(a.creado_en)));
const cotPend=()=>cot.lista.filter(c=>c.estado==='pendiente');
// los nombres del maestro vienen en mayúsculas: "MINGITORIOS" → "Mingitorios"
function cotLindo(n){n=String(n||'');return n===n.toUpperCase()?n.charAt(0)+n.slice(1).toLowerCase():n;}
const cotNum=n=>(Math.round((Number(n)||0)*100)/100).toLocaleString('es-AR');
const cotArs=n=>'$ '+Math.round(Number(n)||0).toLocaleString('es-AR');

// ── lectura ──
async function cargarCotizaciones(){
  cot.lista=[]; cot.costos={}; cot.falta=false;
  if(typeof puedeCRM!=='function'||!puedeCRM()) return;
  try{
    cot.lista=await traer('cotizaciones');
    if(veTodoCRM()) (await traerSinOrden('cotizaciones_costo')).forEach(r=>cot.costos[r.cotizacion_id]={costo:Number(r.costo_total),margen:Number(r.margen),det:Array.isArray(r.detalle)?r.detalle:[]});
  }catch(e){if(/relation|does not exist|schema cache|Could not find/i.test(e.message||'')) cot.falta=true; else console.error(e);}
  if(cot.ver&&document.getElementById('m-cot')?.classList.contains('active')&&!cotEscribiendo()) cotPintar();
}
const _cargarCRMSinCot=cargarCRM;
cargarCRM=async function(){await _cargarCRMSinCot();await cargarCotizaciones();};
function cotEscribiendo(){const a=document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.closest('#m-cot'));}
async function cotCat(forzar){
  if(cot.cat&&!forzar) return cot.cat;
  const r=await sb.rpc('cot_catalogo'); if(r.error) throw r.error;
  const c=r.data; c.ins={}; (c.insumos||[]).forEach(x=>c.ins[x.codigo]=x);
  cot.cat=c; return c;
}
function cotBase(tip){const b={};(cot.cat?.recetas||[]).filter(r=>r.tipologia===tip).forEach(r=>b[r.insumo]=Number(r.cant));return b;}

// ════════════════ EDITOR ════════════════
async function cotNueva(oid){
  const o=crmOp(oid); if(!o) return;
  try{await cotCat(true);}catch(e){toast(cot.falta||/cot_catalogo/.test(e.message||'')?'⚠️ Falta correr la migración 0025 (cotizador)':msgError(e));return;}
  if(!cot.cat.tipologias.length){
    if(rol()==='admin'){toast('⚠️ Falta subir la planilla del cotizador: te llevo a Materiales y costos → Insumos');closeOverlay('m-crm');mae.sub='insumos';showView('materiales');}
    else toast('⚠️ El administrador todavía no subió la planilla del cotizador (Materiales y costos → Insumos)');
    return;}
  cot.ed={id:null,op:oid,tip:'',uni:o.unidades||1,cambios:{},notas:'',pedido:'',motivo:'',calc:null,sucio:true,precio:false,busca:''};
  cot.ver=null; cotPintar(); openOverlay(crmModal('m-cot',240).id);
}
async function cotAbrir(id){
  const c=cotOp(id); if(!c) return;
  try{await cotCat(true);}catch(e){toast(msgError(e));return;}   // siempre fresco: un insumo nuevo aparece enseguida
  cot.ver=id;
  cot.ed={id:c.id,op:c.oportunidad_id,tip:c.tipologia,uni:c.unidades,cambios:{...(c.cambios||{})},notas:c.notas||'',
    pedido:c.precio_pedido??'',motivo:c.motivo_pedido||'',calc:null,sucio:false,precio:c.precio_pedido!=null,busca:''};
  cotPintar(); openOverlay(crmModal('m-cot',240).id); cotCalcular(0);
}
function cotCerrar(){closeOverlay('m-cot');cot.ed=null;cot.ver=null;if(crm.det&&document.getElementById('m-crm')?.classList.contains('active')) crmPintarDet();}
function cotCant(cod){const e=cot.ed;if(e.cambios[cod]!=null) return Number(e.cambios[cod]);return cotBase(e.tip)[cod]||0;}
function cotPintar(){
  const e=cot.ed; if(!e) return;
  const m=crmModal('m-cot',240), o=crmOp(e.op), c=e.id?cotOp(e.id):null, cat=cot.cat;
  const enviada=c&&c.estado==='enviada', lider=veTodoCRM();
  if(enviada) return cotPintarEnviada(m,c,o);
  const T=cat.tipologias, base=e.tip?cotBase(e.tip):{};
  // lo que cambió respecto de la tipología: adicionales, cantidades distintas y lo que se saca
  const camb=Object.keys(e.cambios).filter(k=>Number(e.cambios[k])!==(base[k]||0)).map(k=>({k,n:Number(e.cambios[k]),b:base[k]||0,i:cat.ins[k]})).filter(x=>x.i);
  const baseL=Object.keys(base).map(k=>({k,i:cat.ins[k],n:cotCant(k),b:base[k]})).filter(x=>x.i).sort((a,b)=>String(a.i.rubro).localeCompare(b.i.rubro)||a.i.nombre.localeCompare(b.i.nombre));
  const paso=(k,n,u)=>`<div class="cot-paso"><button type="button" class="mp-b" onclick="cotSet('${esc(k)}',${Math.max(0,n-1)})" aria-label="Uno menos">−</button>
    <input type="number" inputmode="decimal" min="0" step="any" value="${cotNum(n).replace(/\./g,'').replace(',','.')}" onchange="cotSet('${esc(k)}',this.value)" aria-label="Cantidad">
    <button type="button" class="mp-b" onclick="cotSet('${esc(k)}',${n+1})" aria-label="Uno más">+</button><small>${esc(u||'')}</small></div>`;
  const estado=c?COT_EST[c.estado]:null;
  m.querySelector('.crm-body').innerHTML=`<div class="crm-det-top"><div style="min-width:0"><div class="modal-title" style="margin-bottom:2px">🧮 ${c?'Cotización N° '+esc(c.numero):'Nueva cotización'}</div>
      <div class="crm-sub">${esc(o?.cliente||c?.cliente||'')}${estado?` <span class="badge ${estado[2]}">${estado[0]} ${estado[1]}</span>`:''}</div></div>
      <button class="btn btn-sec btn-sm" onclick="cotCerrar()" aria-label="Cerrar">✕</button></div>
    ${c&&c.estado==='rechazada'&&c.respuesta?`<div class="cst-aviso">❌ El líder de ventas no autorizó el precio: ${esc(c.respuesta)}</div>`:''}
    ${c&&c.estado==='autorizada'&&c.respuesta?`<div class="cst-aviso amar" style="background:var(--verde-l,#e8f6ee);color:inherit">✅ ${esc(c.respuesta)}</div>`:''}
    <div class="fg"><label>Producto</label><select onchange="cotTip(this.value)"><option value="">Elegí la tipología…</option>
      ${T.map(t=>`<option value="${esc(t.codigo)}" ${t.codigo===e.tip?'selected':''}>${esc(t.nombre)}</option>`).join('')}</select></div>
    ${e.tip?`
    <div class="fg"><label>Unidades iguales</label>${paso('__uni',e.uni,'')}</div>
    <div class="dsec crm-sec"><h3>➕ Adicionales y cambios</h3>
      ${camb.length?camb.map(x=>`<div class="mp-f"><div class="mp-n">${x.b?'':'<b style="color:var(--verde)">＋</b> '}${esc(cotLindo(x.i.nombre))}
          <small style="display:block;color:var(--gris-m)">${x.n===0?'Se saca':x.b?'La tipología trae '+cotNum(x.b):'Adicional'}</small></div>
        ${paso(x.k,x.n,x.i.unidad)}<button class="mp-b" onclick="cotVolver('${esc(x.k)}')" aria-label="Deshacer">↺</button></div>`).join('')
        :'<p class="crm-ayuda">Igual que la tipología estándar. Agregá lo que pida el cliente: una ventana más, un mingitorio…</p>'}
      <div class="fg" style="margin-top:8px"><input id="cot-add" list="cot-ins-dl" placeholder="🔍 Agregar: ventana, mingitorio, aire…" onchange="cotAgregar(this.value)">
        <datalist id="cot-ins-dl">${cat.insumos.filter(x=>x.para_vendedor).map(x=>`<option value="${esc(cotLindo(x.nombre))}">`).join('')}</datalist></div></div>
    <details class="dsec crm-sec"><summary style="cursor:pointer;font-weight:800">📋 Lo que trae la tipología (${baseL.length})</summary>
      <p class="crm-ayuda" style="margin-top:6px">Si el cliente no quiere algo, bajalo a 0.</p>
      ${baseL.map(x=>`<div class="mp-f"><div class="mp-n" style="${x.n!==x.b?'font-weight:800':''}">${esc(cotLindo(x.i.nombre))}</div>${paso(x.k,x.n,x.i.unidad)}</div>`).join('')}</details>
    <div id="cot-precio">${cotPrecioHTML()}</div>
    <details class="dsec crm-sec" ${e.precio?'open':''} ontoggle="cot.ed&&(cot.ed.precio=this.open)"><summary style="cursor:pointer;font-weight:800">✏️ Cambiar el precio</summary>
      <p class="crm-ayuda" style="margin-top:6px">Precio total en USD sin IVA${e.uni>1?' (las '+e.uni+' unidades)':''}. Si es más bajo que el de lista, lo tiene que autorizar el líder de ventas${lider?' (vos lo autorizás al guardar)':''}.</p>
      <div class="fg"><input type="number" inputmode="decimal" min="0" placeholder="USD" value="${esc(e.pedido)}" oninput="cot.ed.pedido=this.value;cot.ed.sucio=true;cotPintarPrecio();cotPintarBotones()"></div>
      <div class="fg"><textarea rows="2" placeholder="¿Por qué? (lo lee el líder de ventas)" oninput="cot.ed.motivo=this.value;cot.ed.sucio=true">${esc(e.motivo)}</textarea></div></details>
    <div class="fg"><label>Notas para el cliente <small>(opcional, van en el PDF)</small></label><textarea rows="2" oninput="cot.ed.notas=this.value;cot.ed.sucio=true;cotPintarBotones()">${esc(e.notas)}</textarea></div>
    <div id="cot-botones">${cotBotonesHTML()}</div>`
    :'<p class="crm-ayuda">Elegí el producto y la app arma la cotización con lo que trae la tipología.</p>'}`;
}
function cotTip(v){const e=cot.ed;e.tip=v;e.cambios={};e.sucio=true;e.calc=null;cotPintar();if(v) cotCalcular(0);}
function cotSet(k,v){
  const e=cot.ed; let n=Number(String(v).replace(',','.')); if(!isFinite(n)||n<0) n=0;
  if(k==='__uni'){e.uni=Math.max(1,Math.min(999,Math.round(n)||1));}
  else{const b=cotBase(e.tip)[k]||0; if(n===b) delete e.cambios[k]; else e.cambios[k]=n;}
  e.sucio=true; cotPintar(); cotCalcular();
}
function cotVolver(k){delete cot.ed.cambios[k];cot.ed.sucio=true;cotPintar();cotCalcular();}
function cotAgregar(v){
  const inp=document.getElementById('cot-add'); if(inp) inp.value='';
  const n=normTxt(v); if(!n) return;
  const x=cot.cat.insumos.find(i=>i.para_vendedor&&normTxt(cotLindo(i.nombre))===n)||cot.cat.insumos.find(i=>i.para_vendedor&&normTxt(i.nombre).includes(n));
  if(!x){toast('⚠️ Elegí un ítem de la lista');return;}
  cotSet(x.codigo,cotCant(x.codigo)+1);
  toast('➕ '+cotLindo(x.nombre));
}
let cotT=null, cotSeq=0;
function cotCalcular(ms){
  clearTimeout(cotT);
  cotT=setTimeout(async()=>{
    const e=cot.ed; if(!e||!e.tip) return;
    const s=++cotSeq;
    const r=await sb.rpc('cot_calcular',{p_tipologia:e.tip,p_cambios:e.cambios,p_unidades:e.uni});
    if(s!==cotSeq||cot.ed!==e) return;
    if(r.error){toast(msgError(r.error));return;}
    e.calc=r.data; cotPintarPrecio(); cotPintarBotones();
  },ms??300);
}
function cotPrecioHTML(){
  const e=cot.ed, k=e&&e.calc; if(!k) return `<div class="card cot-precio"><div class="crm-n">Calculando el precio…</div></div>`;
  const pedido=Number(e.pedido)||0, lista=Number(k.precio_total)||0, fin=pedido||lista;
  const iva=Number(k.iva)||0, tc=Number(k.tipo_cambio)||0;
  return `<div class="card cot-precio">
    <div class="crm-n">Precio al cliente${e.uni>1?` · ${e.uni} unidades`:''}</div>
    <div class="cot-grande">${usd(fin)} <small>+ IVA</small></div>
    ${pedido&&pedido!==lista?`<div class="crm-n">Precio de lista: ${usd(lista)}${pedido<lista?(cotAutorizado(e,pedido)?' · <b style="color:var(--verde)">autorizado por el líder de ventas</b>':' · <b style="color:var(--amarillo)">más bajo: lo autoriza el líder de ventas</b>'):''}</div>`:''}
    ${e.uni>1?`<div class="crm-n">${usd(fin/e.uni)} cada una</div>`:''}
    <div class="crm-n">Con IVA (${maePct(iva)}%): <b>${usd(fin*(1+iva))}</b>${tc?` · ${cotArs(fin*(1+iva)*tc)} (dólar ${crmNum(tc)})`:''}</div>
    ${k.costo_total!=null?`<div class="crm-n" style="margin-top:4px">🔒 Costo ${usd(k.costo_total)} · ganancia ${usd(fin-k.costo_total)} (${fin?Math.round((fin-k.costo_total)/fin*100):0}% del precio)</div>`:''}
    ${k.sin_costo?`<div class="cst-aviso" style="margin-top:6px">⚠️ ${k.sin_costo} ítem${k.sin_costo>1?'s':''} sin costo cargado (${esc((k.sin_costo_nombres||[]).map(cotLindo).join(', '))}): el precio no está completo. Avisale al administrador.</div>`:''}
  </div>`;
}
function cotAutorizado(e,pedido){const c=e.id&&cotOp(e.id);return !!(c&&c.estado==='autorizada'&&Number(c.precio_final)===pedido&&Number(c.precio_lista)===Number(e.calc?.precio_total));}
function cotBotonesHTML(){
  const e=cot.ed, c=e.id?cotOp(e.id):null, k=e.calc;
  const pedido=Number(e.pedido)||0, lista=Number(k?.precio_total)||0, pide=pedido&&lista&&pedido<lista&&!veTodoCRM();
  if(!c||e.sucio) return `<div class="flex-btns"><button class="btn btn-sec" onclick="cotCerrar()">Cancelar</button>
    <button class="btn btn-nar" id="cot-ok" onclick="cotGuardar()">${pide?'⏳ Pedir autorización':'💾 Guardar'}</button></div>`;
  if(c.estado==='pendiente') return `<p class="crm-ayuda">⏳ Esperando que el líder de ventas autorice ${usd(c.precio_pedido)}. Te avisamos acá cuando responda.</p>${cotLiderHTML(c)}
    <button class="btn btn-sec" style="width:100%" onclick="cotPdf('${esc(c.id)}')">📄 Ver PDF (borrador)</button>`;
  if(c.estado==='rechazada') return `<p class="crm-ayuda">Cambiá el precio (o borralo para usar el de lista) y guardá de nuevo.</p>`;
  // aprobación del administrador (aprobaciones.js, migración 0033)
  if(typeof aprCotFrena==='function'&&aprCotFrena(c)) return `${aprCotAvisoHTML(c)}
    <button class="btn btn-sec" style="width:100%" onclick="cotPdf('${esc(c.id)}')">📄 Ver PDF (borrador)</button>`;
  return `<button class="btn btn-nar" style="width:100%" onclick="cotEnviar('${esc(c.id)}')">📤 Enviar al cliente</button>
    <div class="crm-sec-btns"><button class="btn btn-sec btn-sm" onclick="cotPdf('${esc(c.id)}')">📄 Descargar PDF</button>
      <button class="btn btn-sec btn-sm" style="color:var(--rojo)" onclick="cotBorrar('${esc(c.id)}')">🗑️ Borrar</button></div>`;
}
function cotPintarPrecio(){const el=document.getElementById('cot-precio'); if(el&&cot.ed) el.innerHTML=cotPrecioHTML();}
function cotPintarBotones(){const el=document.getElementById('cot-botones'); if(el&&cot.ed) el.innerHTML=cotBotonesHTML();}
async function cotGuardar(){
  const e=cot.ed; if(!e||!e.tip) return;
  const b=document.getElementById('cot-ok'); if(b){if(b.disabled)return;b.disabled=true;}
  const pedido=String(e.pedido).trim()===''?null:Number(e.pedido);
  guardando++;
  try{
    const r=await sb.rpc('cot_guardar',{p_id:e.id,p_oportunidad:e.op,p_tipologia:e.tip,p_cambios:e.cambios,p_unidades:e.uni,
      p_notas:e.notas||null,p_precio_pedido:pedido,p_motivo:e.motivo||null});
    if(r.error) throw r.error;
    const id=r.data; const f=await sb.from('cotizaciones').select('*').eq('id',id).single();
    if(f.error) throw f.error;
    const i=cot.lista.findIndex(x=>x.id===id); if(i>=0) cot.lista[i]=f.data; else cot.lista.push(f.data);
    e.id=id; cot.ver=id; e.sucio=false;
    toast(f.data.estado==='pendiente'?'⏳ Guardada: le pedimos la autorización al líder de ventas':'✅ Cotización guardada');
    cotPintar(); cotCalcular(0); crmRefrescar();
  }catch(err){toast(msgError(err));if(b)b.disabled=false;}
  finally{guardando--;}
}
async function cotBorrar(id){
  if(!await confirmar('¿Borrar esta cotización?')) return;
  const r=await sb.from('cotizaciones').delete().eq('id',id);
  if(r.error){toast(msgError(r.error));return;}
  cot.lista=cot.lista.filter(c=>c.id!==id); cotCerrar(); toast('🗑️ Borrada'); crmRefrescar();
}
// Cotización ya enviada: solo se mira (y se puede reenviar el PDF o copiarla para una nueva versión)
function cotPintarEnviada(m,c,o){
  const camb=(c.detalle||[]).filter(x=>Number(x.cant)!==Number(x.base));
  m.querySelector('.crm-body').innerHTML=`<div class="crm-det-top"><div style="min-width:0"><div class="modal-title" style="margin-bottom:2px">🧮 Cotización N° ${esc(c.numero)}</div>
      <div class="crm-sub">${esc(o?.cliente||c.cliente||'')} <span class="badge b-morado">📤 Enviada ${crmFecha(String(c.enviada_en).slice(0,10))}</span></div></div>
      <button class="btn btn-sec btn-sm" onclick="cotCerrar()" aria-label="Cerrar">✕</button></div>
    <div class="card"><b>${esc(c.tipologia_nombre)}</b>${c.unidades>1?' × '+c.unidades:''}
      ${camb.length?`<div class="crm-n" style="margin-top:4px">${camb.map(x=>Number(x.cant)===0?'Sin '+esc(cotLindo(x.nombre)):(x.base?esc(cotLindo(x.nombre))+': '+cotNum(x.cant):'＋ '+cotNum(x.cant)+' '+esc(cotLindo(x.nombre)))).join(' · ')}</div>`:''}
      <div class="cot-grande" style="margin-top:8px">${usd(c.precio_final)} <small>+ IVA</small></div>
      ${c.precio_final<c.precio_lista?`<div class="crm-n">Autorizado (lista ${usd(c.precio_lista)})</div>`:''}
      ${cot.costos[c.id]?`<div class="crm-n">🔒 Costo ${usd(cot.costos[c.id].costo)} · ganancia ${usd(c.precio_final-cot.costos[c.id].costo)}</div>`:''}</div>
    <div class="flex-btns"><button class="btn btn-sec" onclick="cotPdf('${esc(c.id)}')">📄 PDF</button>
      <button class="btn btn-nar" onclick="cotCopiar('${esc(c.id)}')">📝 Nueva versión</button></div>`;
}
function cotCopiar(id){
  const c=cotOp(id); if(!c) return;
  cot.ed={id:null,op:c.oportunidad_id,tip:c.tipologia,uni:c.unidades,cambios:{...(c.cambios||{})},notas:c.notas||'',pedido:'',motivo:'',calc:null,sucio:true,precio:false,busca:''};
  cot.ver=null; cotPintar(); cotCalcular(0);
}

// ════════════════ LÍDER DE VENTAS: AUTORIZAR ════════════════
function cotLiderHTML(c){
  if(!veTodoCRM()||c.estado!=='pendiente') return '';
  const k=cot.costos[c.id], a=cot.aut[c.id]||{precio:c.precio_pedido,resp:''};
  const p=Number(a.precio)||0;
  return `<div class="card cot-aut" style="border-left:5px solid var(--amarillo)">
    <div class="card-title">⏳ ${esc(c.cliente||'')} · ${esc(nombreDe(c.vendedor_id))}</div>
    <div class="crm-n">${esc(c.tipologia_nombre)}${c.unidades>1?' × '+c.unidades:''} · N° ${esc(c.numero)}</div>
    <div class="drow"><span class="lbl">Precio de lista</span><span class="val">${usd(c.precio_lista)}</span></div>
    <div class="drow"><span class="lbl">Pide</span><span class="val"><b>${usd(c.precio_pedido)}</b> (${Math.round((c.precio_pedido/c.precio_lista-1)*100)}%)</span></div>
    ${k?`<div class="drow"><span class="lbl">🔒 Costo</span><span class="val">${usd(k.costo)}</span></div>
    <div class="drow"><span class="lbl">Ganancia con ese precio</span><span class="val" style="color:${p-k.costo<0?'var(--rojo)':'var(--verde)'}">${usd(p-k.costo)} (${p?Math.round((p-k.costo)/p*100):0}%)</span></div>`:''}
    ${c.motivo_pedido?`<div class="crm-n" style="margin:6px 0">💬 ${esc(c.motivo_pedido)}</div>`:''}
    <div class="crm-2"><div class="fg"><label>Precio que autorizás (USD)</label><input type="number" inputmode="decimal" min="0" value="${esc(a.precio??'')}" oninput="(cot.aut['${esc(c.id)}']=cot.aut['${esc(c.id)}']||{}).precio=this.value"></div>
      <div class="fg"><label>Respuesta <small>(obligatoria si rechazás)</small></label><input type="text" value="${esc(a.resp||'')}" oninput="(cot.aut['${esc(c.id)}']=cot.aut['${esc(c.id)}']||{}).resp=this.value"></div></div>
    <div class="flex-btns"><button class="btn btn-sec" onclick="cotAutorizar('${esc(c.id)}',false)">❌ Rechazar</button>
      <button class="btn btn-verde" onclick="cotAutorizar('${esc(c.id)}',true)">✅ Autorizar</button></div></div>`;
}
async function cotAutorizar(id,ok){
  const c=cotOp(id); if(!c) return;
  const a=cot.aut[id]||{}; const precio=a.precio!=null&&String(a.precio).trim()!==''?Number(a.precio):c.precio_pedido;
  if(!ok&&!String(a.resp||'').trim()){toast('⚠️ Contale al vendedor por qué no');return;}
  if(ok&&precio>=c.precio_lista&&!await confirmar('Ese precio no es más bajo que el de lista. ¿Autorizarlo igual?')) return;
  const r=await sb.rpc('cot_autorizar',{p_id:id,p_aprobar:ok,p_precio:ok?precio:null,p_respuesta:a.resp||null});
  if(r.error){toast(msgError(r.error));return;}
  delete cot.aut[id]; await cargarCotizaciones();
  toast(ok?'✅ Precio autorizado: el vendedor ya puede enviarla':'❌ Rechazado: el vendedor ve tu respuesta');
  if(cot.ver===id&&cot.ed) cotAbrir(id);
  else if(c.origen==='nota'&&document.getElementById('m-cot')?.classList.contains('active')) cotAbrir(id);
  if(c.origen==='nota'&&detalleId===c.proyecto_id&&document.getElementById('m-det')?.classList.contains('active')) verDetalle(c.proyecto_id);
  crmRefrescar();
}

// ════════════════ ENVIAR: PDF + WhatsApp / mail, y el contacto pasa a Presupuesto ════════════════
async function cotPdfBlob(c){
  await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const {jsPDF}=window.jspdf, pdf=new jsPDF({unit:'mm',format:'a4'});
  const o=crmOp(c.oportunidad_id)||{}, W=210, M=16; let y=0;
  const emp=o.empresa||perfiles[c.vendedor_id]?.empresa||'BoxTainer';
  const fecha=new Date(c.enviada_en||Date.now()), val=new Date(fecha); val.setDate(val.getDate()+(c.validez_dias||7));
  const f=d=>d.toLocaleDateString('es-AR');
  pdf.setFillColor(232,101,10); pdf.rect(0,0,W,30,'F'); pdf.setTextColor(255,255,255);
  pdf.setFont('helvetica','bold'); pdf.setFontSize(18); pdf.text('Cotización N° '+c.numero,M,13);
  pdf.setFontSize(11); pdf.setFont('helvetica','normal'); pdf.text(emp+' · '+f(fecha)+' · válida hasta el '+f(val),M,22);
  pdf.setTextColor(30,35,48); y=42;
  const linea=(t,tam,b)=>{pdf.setFontSize(tam||11);pdf.setFont('helvetica',b?'bold':'normal');pdf.splitTextToSize(String(t),W-2*M).forEach(l=>{if(y>275){pdf.addPage();y=20;}pdf.text(l,M,y);y+=(tam||11)*0.5;});};
  linea('Cliente: '+(c.cliente||o.cliente||''),12,true); if(o.telefono) linea('Teléfono: '+o.telefono); if(o.mail) linea('Mail: '+o.mail);
  linea('Vendedor: '+nombreDe(c.vendedor_id)); y+=4;
  linea(c.tipologia_nombre+(c.unidades>1?' × '+c.unidades+' unidades':''),14,true); y+=1;
  const det=c.detalle||[], ad=det.filter(x=>Number(x.cant)>Number(x.base)), menos=det.filter(x=>Number(x.cant)<Number(x.base));
  if(ad.length){linea('Adicionales'+(c.unidades>1?' (en cada unidad)':''),11,true);ad.forEach(x=>linea('•  '+(x.base?cotLindo(x.nombre)+': '+cotNum(x.cant)+' (la estándar trae '+cotNum(x.base)+')':cotNum(x.cant-x.base)+' '+(x.unidad&&!/^(UN|UNIDAD)$/i.test(x.unidad)?x.unidad.toLowerCase()+' ':'')+cotLindo(x.nombre))));}
  if(menos.length){linea('Cambios'+(c.unidades>1?' (en cada unidad)':''),11,true);menos.forEach(x=>linea('•  '+(Number(x.cant)===0?'Sin '+cotLindo(x.nombre):cotLindo(x.nombre)+': '+cotNum(x.cant)+' en lugar de '+cotNum(x.base))));}
  if(c.notas){y+=2;linea('Observaciones',11,true);linea(c.notas);}
  y+=6; pdf.setDrawColor(221,225,231); pdf.line(M,y,W-M,y); y+=8;
  const iva=Number(c.iva)||0, tc=Number(c.tipo_cambio)||0, p=Number(c.precio_final||c.precio_pedido||c.precio_lista);
  const fila=(t,v,b)=>{pdf.setFont('helvetica',b?'bold':'normal');pdf.setFontSize(b?14:11);pdf.text(t,M,y);pdf.text(v,W-M,y,{align:'right'});y+=b?8:6;};
  if(c.unidades>1) fila('Precio por unidad','USD '+cotNum(Math.round(p/c.unidades)));
  fila('Precio'+(c.unidades>1?' total':''),'USD '+cotNum(p));
  fila('IVA '+maePct(iva)+'%','USD '+cotNum(Math.round(p*iva)));
  fila('Total con IVA','USD '+cotNum(Math.round(p*(1+iva))),true);
  if(tc){pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.text('Equivalente en pesos: '+cotArs(p*(1+iva)*tc)+' (dólar '+crmNum(tc)+'). Se factura al tipo de cambio del día del pago.',M,y);y+=8;}
  if(c.estado!=='enviada'&&c.estado!=='lista'&&c.estado!=='autorizada'){pdf.setTextColor(201,138,0);pdf.setFontSize(12);pdf.text('BORRADOR: precio pendiente de autorización',M,y);pdf.setTextColor(30,35,48);y+=8;}
  else if(typeof aprCotFrena==='function'&&aprCotFrena(c)&&rol()!=='admin'){pdf.setTextColor(201,138,0);pdf.setFontSize(12);pdf.text('BORRADOR: pendiente de aprobación',M,y);pdf.setTextColor(30,35,48);y+=8;}
  y+=6; linea('Para confirmar, respondé "Acepto" por WhatsApp o mail. Precio válido hasta el '+f(val)+'.',10);
  return pdf.output('blob');
}
async function cotPdf(id){
  const c=cotOp(id); if(!c) return;
  try{const b=await cotPdfBlob(c); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='Cotizacion-'+c.numero+'.pdf'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
  catch(e){toast('⚠️ No se pudo armar el PDF: '+(e.message||e));}
}
async function cotEnviar(id){
  const c=cotOp(id); if(!c) return;
  const o=crmOp(c.oportunidad_id);
  let blob; try{blob=await cotPdfBlob(c);}catch(e){toast('⚠️ No se pudo armar el PDF: '+(e.message||e));return;}
  const nom='Cotizacion-'+c.numero+'.pdf', file=new File([blob],nom,{type:'application/pdf'});
  const txt=`Hola ${o?.cliente||''}, te paso la cotización N° ${c.numero}: ${c.tipologia_nombre}${c.unidades>1?' × '+c.unidades:''}, USD ${cotNum(c.precio_final)} + IVA. Válida por ${c.validez_dias||7} días.`;
  let via='whatsapp';
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],text:txt,title:'Cotización N° '+c.numero});}catch(e){if(e&&e.name==='AbortError') return;}
  }else{
    // compu: se baja el PDF y se abre WhatsApp (o el mail) con el mensaje listo para adjuntarlo
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nom; a.click();
    if(o?.telefono&&typeof crmWa==='function') window.open(crmWa(o.telefono)+'?text='+encodeURIComponent(txt),'_blank');
    else if(o?.mail){via='mail';location.href='mailto:'+o.mail+'?subject='+encodeURIComponent('Cotización N° '+c.numero)+'&body='+encodeURIComponent(txt+'\n\n(Adjunto el PDF)');}
  }
  if(!await confirmar(`¿Le mandaste la cotización a ${o?.cliente||'el cliente'}? Queda como enviada y el contacto pasa a Presupuesto con este precio.`)) return;
  const r=await sb.rpc('cot_enviar',{p_id:id,p_via:via}); if(r.error){toast(msgError(r.error));return;}
  // el contacto ya tiene el precio: se trae de nuevo y pasa a Presupuesto (agenda el seguimiento)
  const f=await sb.from('oportunidades').select('*').eq('id',c.oportunidad_id).single();
  if(!f.error){const i=crm.ops.findIndex(x=>x.id===f.data.id); if(i>=0) crm.ops[i]=f.data;}
  await cargarCotizaciones();
  const op=crmOp(c.oportunidad_id);
  if(op&&['precalificado','calificado'].includes(op.etapa)){
    const falta=crmFaltaCalificar(op);
    if(falta.length){toast('📤 Enviada. Para pasar a Presupuesto completá: '+falta.join(', '));cotCerrar();crmAbrir(op.id);return;}
    await crmMover(op.id,'presupuesto');
  }else toast('📤 Cotización enviada');
  cotCerrar(); crmRefrescar();
}

// ════════════════ EN EL CRM ════════════════
// Sección en el detalle del contacto
function cotSeccionOp(o){
  if(cot.falta) return '';
  const l=cotDeOp(o.id), ab=CRM_ABIERTAS.includes(o.etapa);
  if(!l.length&&!ab) return '';
  return `<div class="dsec crm-sec"><h3>🧮 Cotizaciones</h3>
    ${l.map(cotFila).join('')}
    ${ab?`<button class="btn ${l.length?'btn-sec':'btn-nar'}" style="width:100%;margin-top:6px" onclick="cotNueva('${esc(o.id)}')">🧮 ${l.length?'Otra cotización':'Cotizar'} una tipología</button>`:''}
    ${ab&&puedeCrear()?`<button class="btn btn-sec" style="width:100%;margin-top:6px" onclick="cotNotaDesdeOp('${esc(o.id)}')">📝 ${o.proyecto_id&&todos[o.proyecto_id]?'Abrir la nota de pedido':'Presupuesto a medida (nota de pedido)'}</button>`:''}</div>`;
}
function cotFila(c){
  const e=(typeof aprCotFrena==='function'&&aprCotFrena(c)&&APR_EST[aprCotEstado(c)])||COT_EST[c.estado]||COT_EST.lista, p=c.precio_final??c.precio_pedido??c.precio_lista;
  return `<div class="fila-click" onclick="cotAbrir('${esc(c.id)}')"><div style="min-width:0"><div class="fh-t">${c.origen==='nota'?'📝 ':''}N° ${esc(c.numero)} · ${esc(c.tipologia_nombre||'')}${c.unidades>1?' × '+c.unidades:''}</div>
    <div class="fh-s">${esc(c.cliente||'')}${veTodoCRM()?' · '+esc(nombreDe(c.vendedor_id)):''} · ${crmFecha(String(c.actualizado_en||c.creado_en).slice(0,10))}</div></div>
    <div style="text-align:right;flex:none"><b>${usd(p)}</b><div><span class="badge ${e[2]}">${e[0]} ${e[1]}</span></div></div></div>`;
}
const _crmPintarDetSinCot=crmPintarDet;
crmPintarDet=function(){
  _crmPintarDetSinCot();
  const o=crmOp(crm.det); if(!o) return;
  const paso=document.querySelector('#m-crm .crm-paso'); if(paso) paso.insertAdjacentHTML('afterend',cotSeccionOp(o));
};
// Pestaña "Cotizaciones" dentro del CRM
const _renderCRMSinCot=renderCRM;
renderCRM=function(){
  if(crm.tab==='cotiz'&&(crm.falta||cot.falta)) crm.tab='hoy';
  const tab=crm.tab;
  if(tab==='cotiz') crm.tab='hoy';           // el CRM original no conoce la pestaña: se pinta y se reemplaza
  _renderCRMSinCot();
  crm.tab=tab;
  const el=document.getElementById('crm-content'); if(!el||crm.falta||cot.falta) return;
  const tabs=el.querySelector('.crm-tabs'); if(!tabs) return;
  const n=veTodoCRM()?cotPend().length:cot.lista.filter(c=>c.vendedor_id===myId&&(['rechazada','autorizada'].includes(c.estado)||(typeof aprCotEstado==='function'&&aprCotEstado(c)==='devuelta'))).length;
  (tabs.firstElementChild||tabs).insertAdjacentHTML(tabs.firstElementChild?'afterend':'beforeend',`<button class="chip${tab==='cotiz'?' active':''}" onclick="crmTab('cotiz')">🧮 Cotizaciones${n?` <span class="chip-n">${n}</span>`:''}</button>`);
  if(tab!=='cotiz') return;
  tabs.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',/Cotizaciones/.test(b.textContent)));
  [...el.children].forEach(x=>{if(x!==tabs) x.remove();});
  el.insertAdjacentHTML('beforeend',(veTodoCRM()?crmSelVendedor():'')+cotTabHTML());
};
function cotTabHTML(){
  const l=cot.lista.filter(c=>!crm.vend||c.vendedor_id===crm.vend).sort((a,b)=>String(b.actualizado_en).localeCompare(String(a.actualizado_en)));
  let h=`<button class="btn btn-nar crm-nuevo-btn" onclick="cotElegirOp()">🧮 Nueva cotización</button>`;
  if(veTodoCRM()){
    const p=l.filter(c=>c.estado==='pendiente');
    h+=p.length?`<div class="sec-title" style="font-size:15px">⏳ Para autorizar (${p.length})</div>${p.map(cotLiderHTML).join('')}`
      :`<div class="card hoy-ok">✅ No hay precios esperando tu autorización.</div>`;
  }else{
    const dev=c=>typeof aprCotEstado==='function'&&aprCotEstado(c)==='devuelta';
    const r=l.filter(c=>['rechazada','autorizada'].includes(c.estado)||dev(c));
    if(r.length) h+=`<div class="card hoy-bloque" style="border-left:5px solid var(--azul)"><div class="card-title" style="color:var(--azul)">📬 Respuestas del líder y del administrador (${r.length})</div>${r.map(cotFila).join('')}</div>`;
  }
  const resto=l.filter(c=>veTodoCRM()?c.estado!=='pendiente':!(['rechazada','autorizada'].includes(c.estado)||(typeof aprCotEstado==='function'&&aprCotEstado(c)==='devuelta')));
  if(resto.length) h+=`<div class="sec-title" style="font-size:15px">Últimas cotizaciones</div><div class="card">${resto.slice(0,60).map(cotFila).join('')}</div>`;
  else if(!l.length) h+='<div class="empty"><div class="em">🧮</div><h3>Todavía no hay cotizaciones</h3><p>Cotizá desde la ficha de cada contacto o con el botón de arriba.</p></div>';
  return h;
}
// Nueva cotización desde la pestaña: primero a qué contacto (las cotizaciones van siempre con un contacto del CRM)
function cotElegirOp(){
  cot.elegir=''; cotPintarElegir(); openOverlay(crmModal('m-cot-op',245).id);
  setTimeout(()=>document.getElementById('cot-op-q')?.focus(),250);
}
function cotPintarElegir(){
  const m=crmModal('m-cot-op',245), q=normTxt(cot.elegir);
  const l=crm.ops.filter(o=>CRM_ABIERTAS.includes(o.etapa)&&(veTodoCRM()||o.vendedor_id===myId)&&(!q||normTxt(o.cliente+' '+(o.telefono||'')).includes(q))).slice(0,40);
  m.querySelector('.crm-body').innerHTML=`<div class="modal-title">🧮 ¿Para qué cliente?</div>
    <div class="fg"><input type="search" id="cot-op-q" placeholder="🔍 Buscar cliente" value="${esc(cot.elegir)}" oninput="cot.elegir=this.value;cotPintarElegir();const i=document.getElementById('cot-op-q');i.focus();i.setSelectionRange(i.value.length,i.value.length)"></div>
    ${l.map(o=>`<div class="fila-click" onclick="closeOverlay('m-cot-op');cotNueva('${esc(o.id)}')"><div style="min-width:0"><div class="fh-t">${esc(o.cliente)}</div>
      <div class="fh-s">${crmEt(o.etapa).i} ${crmEt(o.etapa).t}${o.producto?' · '+esc(o.producto):''}</div></div></div>`).join('')||'<p class="crm-ayuda">No hay contactos abiertos con ese nombre.</p>'}
    <p class="crm-ayuda" style="margin-top:10px">¿Cliente nuevo? Cargalo primero (nombre y teléfono) y después cotizá desde su ficha.</p>
    <div class="flex-btns"><button class="btn btn-sec" onclick="closeOverlay('m-cot-op')">Cancelar</button>
      <button class="btn btn-nar" onclick="closeOverlay('m-cot-op');crmNuevo()">📥 Nuevo contacto</button></div>`;
}
// ════════════════ PRECIO DENTRO DE LA NOTA DE PEDIDO (migración 0027) ════════════════
// Cuando la nota es un "Presupuesto", en el último paso aparece el precio al cliente de ESA nota
// (tipología estándar o versión a medida). La base calcula con lo que sale de la nota + la receta de la
// tipología, por el maestro de insumos; al vendedor le llega solo el precio. Al guardar, el cliente queda
// en el CRM en Presupuesto. Cuando acepta, la nota pasa a orden de compra con ese precio.
const cotDeProy=pid=>pid?cot.lista.filter(c=>c.origen==='nota'&&c.proyecto_id===pid).sort((a,b)=>String(b.creado_en).localeCompare(String(a.creado_en)))[0]||null:null;
const cotTel=t=>String(t||'').replace(/\D/g,'').slice(-8);
let cotNotaT=null, cotNotaSeq=0;
function cotNotaDatos(f){
  const m={};
  NotaPedido.lineasCosteo(f).forEach(x=>{m[x.clave]=Math.round(((m[x.clave]||0)+Number(x.cant||0))*100)/100;});
  const t=NotaPedido.tipologia(f);
  return {lineas:Object.entries(m).map(([clave,cant])=>({clave,cant})),prod:t.prod||null,tam:t.tam||null,uni:t.unidades||1};
}
// ¿Esta nota lleva precio? Los presupuestos, y la orden de compra que salió de un presupuesto
function cotNotaVa(f,pid){return puedeCRM()&&!cot.falta&&(f.sol==='Presupuesto'||!!cotDeProy(pid));}
const notaPrecio={
  abrir(opts,f){
    const c=cotDeProy(opts.proyectoId);
    cot.nota={pid:opts.proyectoId||null,op:opts.oportunidad||null,firma:'',calc:null,err:'',
      pedido:c&&c.estado!=='enviada'&&c.precio_pedido!=null?String(c.precio_pedido):'',motivo:c&&c.estado!=='enviada'?c.motivo_pedido||'':'',abierto:!!(c&&c.precio_pedido!=null)};
  },
  pintar(el,f,opts){
    if(!el) return;
    const n=cot.nota||(this.abrir(opts||{},f),cot.nota);
    if(!cotNotaVa(f,n.pid)){el.innerHTML='';return;}
    const c=cotDeProy(n.pid);
    if(c&&c.estado==='enviada'){el.innerHTML=`<div class="card"><div class="lbl">💲 Precio al cliente</div>
      <div class="cot-grande">${usd(c.precio_final)} <small>+ IVA</small></div><div class="aviso" style="text-align:left">✅ El cliente aceptó este presupuesto: el precio ya no cambia.</div></div>`;return;}
    const dat=cotNotaDatos(f), firma=JSON.stringify(dat);
    if(firma!==n.firma){
      n.firma=firma; n.calc=null; n.err='';
      clearTimeout(cotNotaT);
      cotNotaT=setTimeout(async()=>{
        const s=++cotNotaSeq;
        const r=await sb.rpc('cot_calcular_nota',{p_lineas:dat.lineas,p_prod:dat.prod,p_tam:dat.tam,p_unidades:dat.uni});
        if(s!==cotNotaSeq||cot.nota!==n) return;
        if(r.error){n.err=/cot_calcular_nota|function/i.test(r.error.message||'')?'Falta correr la migración 0027 (precio en la nota)':msgError(r.error).replace(/^⚠️ No se pudo guardar: /,'');}
        else n.calc=r.data;
        cotNotaPintarPrecio();
      },150);
    }
    n.uni=dat.uni;
    el.innerHTML=`<div class="card"><div class="lbl">💲 Precio al cliente</div><div id="np-precio-n">${cotNotaPrecioHTML()}</div>
      <details style="margin-top:8px" ${n.abierto?'open':''} ontoggle="cot.nota&&(cot.nota.abierto=this.open)"><summary style="cursor:pointer;font-weight:700">✏️ Cambiar el precio</summary>
        <div class="aviso" style="text-align:left;margin:6px 0">Precio total en USD sin IVA${dat.uni>1?' (las '+dat.uni+' unidades)':''}. Si es más bajo que el de lista, lo tiene que autorizar el líder de ventas${veTodoCRM()?' (vos lo autorizás al guardar)':''}.</div>
        <input type="number" inputmode="decimal" min="0" placeholder="USD" value="${esc(n.pedido)}" oninput="cot.nota.pedido=this.value;cotNotaPintarPrecio()">
        <div class="fila"><textarea rows="2" placeholder="¿Por qué? (lo lee el líder de ventas)" oninput="cot.nota.motivo=this.value">${esc(n.motivo)}</textarea></div></details></div>`;
  },
  // Aprobación del administrador (0033): '' si el PDF del presupuesto se puede bajar, o el motivo por el que no
  bloqueoPDF(f,pid){
    if(typeof aprBloqueoPDFNota!=='function'||!cotNotaVa(f,pid)) return '';
    const c=cotDeProy(pid), enAsistente=document.getElementById('nota')?.classList.contains('on')&&cot.nota&&(cot.nota.pid||null)===(pid||null);
    let precio=null;
    if(enAsistente&&cot.nota.calc) precio=Number(cot.nota.pedido)||Number(cot.nota.calc.precio_total)||null;
    return aprBloqueoPDFNota(c,precio);
  },
  // texto del precio para el PDF: solo si el precio está completo y no espera autorización
  pdfHTML(f,pid){
    if(!puedeCRM()||cot.falta) return '';
    const enAsistente=document.getElementById('nota')?.classList.contains('on')&&cot.nota&&(cot.nota.pid||null)===(pid||null);
    let p=null, iva=0, tc=0, u=NotaPedido.tipologia(f).unidades||1, fin=null;
    if(enAsistente){
      if(!cotNotaVa(f,pid)) return '';
      const n=cot.nota, k=n.calc, c=cotDeProy(pid);
      if(c&&c.estado==='enviada'){p=Number(c.precio_final);iva=Number(c.iva)||0;tc=Number(c.tipo_cambio)||0;}
      else{
        if(!k) return '';
        const ped=Number(n.pedido)||0, lista=Number(k.precio_total)||0;
        if(k.sin_costo) fin='a confirmar';
        else if(ped&&ped<lista&&!veTodoCRM()&&!cotNotaAutorizado(c,ped,lista)) fin='a confirmar';
        else p=ped||lista;
        iva=Number(k.iva)||0; tc=Number(k.tipo_cambio)||0;
      }
    }else{
      const c=cotDeProy(pid); if(!c) return '';
      if(c.sin_costo||!['lista','autorizada','enviada'].includes(c.estado)||c.precio_final==null) fin='a confirmar';
      else p=Number(c.precio_final);
      iva=Number(c.iva)||0; tc=Number(c.tipo_cambio)||0; u=c.unidades||u;
    }
    const h4='<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5E6675;margin:14px 0 4px">Precio</h4>';
    if(fin) return h4+'<p style="margin:0 0 6px">Precio a confirmar: te lo pasamos por WhatsApp.</p>';
    const fila=(t,v,b)=>`<div style="display:flex;justify-content:space-between;${b?'font-weight:800;font-size:16px;border-top:1px solid #DDE1E7;padding-top:4px;margin-top:2px':''}"><span>${t}</span><span>${v}</span></div>`;
    return h4+`<div style="border:1px solid #DDE1E7;border-radius:10px;padding:10px 14px">
      ${u>1?fila('Precio por unidad','USD '+cotNum(Math.round(p/u))):''}
      ${fila('Precio'+(u>1?' total ('+u+' unidades)':''),'USD '+cotNum(p))}
      ${fila('IVA '+maePct(iva)+'%','USD '+cotNum(Math.round(p*iva)))}
      ${fila('Total con IVA','USD '+cotNum(Math.round(p*(1+iva))),true)}
      ${tc?`<div style="font-size:12px;color:#5E6675;margin-top:4px">Equivalente en pesos: ${cotArs(p*(1+iva)*tc)} (dólar ${crmNum(tc)}). Se factura al tipo de cambio del día del pago.</div>`:''}</div>`;
  },
  // Después de guardar la nota: guarda el precio, deja al cliente en el CRM y, si el cliente aceptó, carga el valor de venta.
  // Devuelve el mensaje para el usuario ('' si esta nota no lleva precio).
  async guardado(pid,f,oid){
    if(!cotNotaVa(f,pid)) return '';
    const n=cot.nota&&cot.nota.pid===pid?cot.nota:(cot.nota&&!cot.nota.pid?Object.assign(cot.nota,{pid}):{pedido:'',motivo:''});
    let c=cotDeProy(pid);
    if(c&&c.estado==='enviada') return '';
    const presu=f.sol==='Presupuesto', p=todos[pid];
    try{
      // 1. el contacto del CRM: el de la nota, el del CRM desde donde se abrió, uno abierto con el mismo teléfono, o uno nuevo
      oid=oid||n.op||c?.oportunidad_id||crm.ops.find(o=>o.proyecto_id===pid)?.id;
      if(!oid&&cotTel(f.tel).length>=6) oid=crm.ops.find(o=>CRM_ABIERTAS.includes(o.etapa)&&!o.proyecto_id&&(veTodoCRM()||o.vendedor_id===myId)&&cotTel(o.telefono)===cotTel(f.tel))?.id;
      let nuevo=false;
      if(!oid){
        const t=NotaPedido.tipologia(f);
        const fila={cliente:(f.cli||'').trim()||'Sin nombre',telefono:(f.tel||'').trim()||null,mail:(f.mail||'').trim()||null,empresa:f.empresa||null,
          producto:t.prod||null,unidades:t.unidades||1,etapa:'presupuesto',proyecto_id:pid,origen:null,
          vendedor_id:rolCRM()==='ventas'?myId:(p?.vendId||myId)};
        const r=await sb.from('oportunidades').insert(fila).select().single(); if(r.error) throw r.error;
        crm.ops.unshift(r.data); oid=r.data.id; nuevo=true;
      }
      // 2. el precio (la base lo calcula de nuevo con la nota guardada)
      const dat=cotNotaDatos(f), ped=String(n.pedido||'').trim()===''?null:Number(n.pedido);
      const r=await sb.rpc('cot_guardar_nota',{p_oportunidad:oid,p_proyecto:pid,p_lineas:dat.lineas,p_prod:dat.prod,p_tam:dat.tam,p_unidades:dat.uni,
        p_nombre:NotaPedido.nombreSugerido(f),p_precio_pedido:ped,p_motivo:n.motivo||null});
      if(r.error) throw r.error;
      const g=await sb.from('cotizaciones').select('*').eq('id',r.data).single(); if(g.error) throw g.error;
      c=g.data; const i=cot.lista.findIndex(x=>x.id===c.id); if(i>=0) cot.lista[i]=c; else cot.lista.push(c);
      // 3. si el cliente aceptó (orden de compra): el contacto pasa a Ganado y el precio queda como valor de venta
      let ganado=false;
      if(!presu&&['lista','autorizada'].includes(c.estado)&&!c.sin_costo){
        const a=await sb.rpc('cot_nota_aceptada',{p_proyecto:pid}); if(a.error) throw a.error;
        const q=todos[pid]?limpiar(todos[pid]):null;
        if(q&&a.data!=null){q.val=Number(a.data);await guardarProyectoOError(q);}
        ganado=true; await cargarCotizaciones();
      }
      const o=await sb.from('oportunidades').select('*').eq('id',oid).single();
      if(!o.error){const j=crm.ops.findIndex(x=>x.id===oid); if(j>=0) crm.ops[j]=o.data; else crm.ops.unshift(o.data);}
      if(!ganado&&!crmPendientes(oid).length&&CRM_AUTO.presupuesto){const t=CRM_AUTO.presupuesto;await crmNuevaTarea(oid,t[0],t[1],crmMas(t[2]),true);}
      crmRefrescar();
      const cli=o.data?.cliente||f.cli||'El cliente';
      if(ganado) return `✅ Orden de compra con ${usd(c.precio_final)} + IVA · ${cli} pasó a Ganado en el CRM`;
      if(!presu) return c.estado==='pendiente'?'⏳ Nota guardada: el precio cambió y espera la autorización del líder de ventas':'✅ Nota guardada';
      const crmTxt=nuevo?` · ${cli} quedó en el CRM en Presupuesto`:` · ${cli} está en el CRM en ${crmEt(o.data?.etapa||'presupuesto').t}`;
      if(c.sin_costo) return `⚠️ Presupuesto guardado, pero el precio no está completo (${c.sin_costo} ítem${c.sin_costo>1?'s':''} sin costo): avisale al administrador`+crmTxt;
      if(c.estado==='pendiente') return '⏳ Presupuesto guardado: el precio más bajo espera la autorización del líder de ventas'+crmTxt;
      if(typeof aprCotFrena==='function'&&aprCotFrena(c)) return '🛂 Presupuesto guardado: espera la aprobación del administrador antes de mandarlo'+crmTxt;
      return `✅ Presupuesto guardado: ${usd(c.precio_final)} + IVA`+crmTxt;
    }catch(e){console.error(e);return '⚠️ La nota se guardó, pero no el precio: '+msgError(e).replace(/^⚠️ /,'');}
  },
  // En el detalle del proyecto: el precio del presupuesto y el paso a orden de compra
  seccion(p){
    if(!puedeCRM()||cot.falta||!esNota(p)) return '';
    const c=cotDeProy(p.id), presu=p.ficha.sol==='Presupuesto';
    if(!c&&!presu) return '';
    const id=esc(p.id);
    if(!c) return `<div class="cst-aviso amar" style="margin-top:8px">💲 Este presupuesto todavía no tiene precio: abrí la nota y guardala de nuevo para calcularlo.</div>`;
    const e=COT_EST[c.estado]||COT_EST.lista, pr=c.precio_final??c.precio_pedido??c.precio_lista;
    const puede=presu&&['lista','autorizada'].includes(c.estado)&&!c.sin_costo&&puedeEditar(p);
    return `<div class="card cot-precio" style="margin-top:8px">
      <div class="crm-n">💲 Precio al cliente ${c.estado==='enviada'?'<span class="badge b-verde">✅ Aceptado</span>':`<span class="badge ${e[2]}">${e[0]} ${e[1]}</span>`}</div>
      <div class="cot-grande">${usd(pr)} <small>+ IVA</small></div>
      ${c.precio_final!=null&&c.precio_final<c.precio_lista?`<div class="crm-n">Precio de lista: ${usd(c.precio_lista)}</div>`:''}
      ${cot.costos[c.id]?`<div class="crm-n">🔒 Costo ${usd(cot.costos[c.id].costo)} · ganancia ${usd((c.precio_final??c.precio_lista)-cot.costos[c.id].costo)}</div>`:''}
      ${c.estado==='rechazada'&&c.respuesta?`<div class="cst-aviso">❌ El líder de ventas no autorizó el precio: ${esc(c.respuesta)}. Editá la nota y cambiá el precio.</div>`:''}
      ${c.sin_costo?`<div class="cst-aviso">⚠️ Hay ${c.sin_costo} ítem${c.sin_costo>1?'s':''} sin costo cargado: el precio no está completo. Avisale al administrador.</div>`:''}
      ${typeof aprCotAvisoHTML==='function'&&rol()!=='admin'?aprCotAvisoHTML(c):''}
      ${puede?`<button class="btn btn-verde" style="width:100%;margin-top:8px" onclick="cotPasarAOC('${id}')">✅ El cliente aceptó: pasar a orden de compra</button>`:''}
    </div>${c.estado==='pendiente'?cotLiderHTML(c):''}${typeof aprCotAvisoHTML==='function'&&rol()==='admin'?aprCotAvisoHTML(c):''}`;
  },
};
window.notaPrecio=notaPrecio;   // nota.js y app.js lo buscan en window (un const no queda en window)
// El cliente aceptó el presupuesto: se abre la nota en el último paso, ya como orden de compra confirmada
async function cotPasarAOC(pid,sinPreguntar){
  const p=todos[pid]; if(!p) return;
  const c=cotDeProy(pid);
  if(c&&c.sin_costo){toast('⚠️ El precio no está completo (hay ítems sin costo): avisale al administrador');return;}
  if(c&&!['lista','autorizada'].includes(c.estado)){toast(c.estado==='pendiente'?'⏳ El precio todavía espera la autorización del líder de ventas':'⚠️ Primero corregí el precio del presupuesto');return;}
  if(!sinPreguntar&&!await confirmar(`¿${p.cli} aceptó el presupuesto${c?' de '+usd(c.precio_final)+' + IVA':''}? Se abre la nota como orden de compra confirmada: revisala, tildá que el cliente la confirmó y enviala.`)) return;
  closeOverlay('m-det'); if(document.getElementById('m-crm')?.classList.contains('active')) crmCerrar(); closeOverlay('m-cot');
  editarNota(pid,{sol:'Orden de compra confirmada',paso:6});
}
// Presupuesto armado con la nota de pedido, desde la ficha del contacto del CRM (no hay que cargar los datos de nuevo)
function cotNotaDesdeOp(oid){
  const o=crmOp(oid); if(!o) return;
  if(!puedeCrear()){toast('La nota de pedido la carga el vendedor');return;}
  if(o.proyecto_id&&todos[o.proyecto_id]){crmCerrar();editarNota(o.proyecto_id);return;}
  const prod=NotaPedido.TIPOLOGIAS.includes(o.producto)&&o.producto!=='Contenedor'?o.producto:'';
  const empresa=o.empresa||perfiles[o.vendedor_id]?.empresa||'';
  const ficha={v:2,sol:'Presupuesto',cli:o.cliente||'',tel:o.telefono||'',mail:o.mail||'',empresa,unidades:o.unidades||1,...(prod?{prod}:{}),obs:o.notas||''};
  crmCerrar();
  NotaPedido.abrir({titulo:'Presupuesto · '+o.cliente,ficha,cliente:o.cliente,empresa,enviar:rol()==='ventas',oportunidad:oid,
    onGuardar:async(f,opt)=>!!(await crearDesdeNota(f,opt,{vendId:o.vendedor_id,vend:nombreDe(o.vendedor_id),oportunidad:oid}))});
}
function cotNotaAutorizado(c,ped,lista){return !!(c&&c.estado==='autorizada'&&Number(c.precio_final)===ped&&Number(c.precio_lista)===lista);}
function cotNotaPrecioHTML(){
  const n=cot.nota, k=n&&n.calc;
  if(n&&n.err) return `<div class="aviso" style="text-align:left">⚠️ ${esc(n.err)}</div>`;
  if(!k) return '<div class="aviso" style="text-align:left">Calculando el precio…</div>';
  const c=cotDeProy(n.pid), ped=Number(n.pedido)||0, lista=Number(k.precio_total)||0, fin=ped||lista, iva=Number(k.iva)||0, tc=Number(k.tipo_cambio)||0, u=n.uni||1;
  return `<div class="cot-grande">${usd(fin)} <small>+ IVA</small></div>
    ${ped&&ped!==lista?`<div class="crm-n">Precio de lista: ${usd(lista)}${ped<lista?(veTodoCRM()?' · lo autorizás vos al guardar':cotNotaAutorizado(c,ped,lista)?' · <b style="color:var(--verde)">autorizado por el líder de ventas</b>':c&&c.estado==='pendiente'&&Number(c.precio_pedido)===ped?' · <b style="color:var(--amarillo)">esperando al líder de ventas</b>':' · <b style="color:var(--amarillo)">más bajo: al guardar se lo pedimos al líder de ventas</b>'):''}</div>`:''}
    ${u>1?`<div class="crm-n">${usd(fin/u)} cada una</div>`:''}
    <div class="crm-n">Con IVA (${maePct(iva)}%): <b>${usd(fin*(1+iva))}</b>${tc?` · ${cotArs(fin*(1+iva)*tc)}`:''}</div>
    ${k.costo_total!=null?`<div class="crm-n" style="margin-top:4px">🔒 Costo ${usd(k.costo_total)} · ganancia ${usd(fin-k.costo_total)} (${fin?Math.round((fin-k.costo_total)/fin*100):0}% del precio)</div>`:''}
    ${typeof apr!=='undefined'&&apr.activa&&rol()!=='admin'?`<div class="crm-n" style="margin-top:4px">🛂 Al guardarlo le llega al administrador: lo mandás al cliente cuando lo apruebe.</div>`:''}
    ${k.sin_costo?`<div class="aviso" style="text-align:left;color:var(--err,#C62828)">⚠️ ${k.sin_costo} ítem${k.sin_costo>1?'s':''} sin costo cargado (${esc((k.sin_costo_nombres||[]).slice(0,4).join(', '))}${k.sin_costo>4?'…':''}): el precio no está completo. Avisale al administrador.</div>`:''}`;
}
function cotNotaPintarPrecio(){const el=document.getElementById('np-precio-n'); if(el) el.innerHTML=cotNotaPrecioHTML();}
// Una cotización que salió de una nota se mira y se maneja desde la nota (no tiene el editor por tipología)
const _cotAbrirSinNota=cotAbrir;
cotAbrir=async function(id){
  const c=cotOp(id); if(!c||c.origen!=='nota') return _cotAbrirSinNota(id);
  const m=crmModal('m-cot',240), e=(typeof aprCotFrena==='function'&&aprCotFrena(c)&&APR_EST[aprCotEstado(c)])||COT_EST[c.estado]||COT_EST.lista, p=todos[c.proyecto_id];
  const pr=c.precio_final??c.precio_pedido??c.precio_lista, puede=p&&p.ficha?.sol==='Presupuesto'&&['lista','autorizada'].includes(c.estado)&&!c.sin_costo;
  cot.ver=null; cot.ed=null;
  m.querySelector('.crm-body').innerHTML=`<div class="crm-det-top"><div style="min-width:0"><div class="modal-title" style="margin-bottom:2px">📝 Presupuesto N° ${esc(c.numero)}</div>
      <div class="crm-sub">${esc(c.cliente||'')} <span class="badge ${c.estado==='enviada'?'b-verde':e[2]}">${c.estado==='enviada'?'✅ Aceptado':e[0]+' '+e[1]}</span></div></div>
      <button class="btn btn-sec btn-sm" onclick="cotCerrar()" aria-label="Cerrar">✕</button></div>
    <div class="card"><b>${esc(c.tipologia_nombre||'Nota de pedido')}</b><div class="crm-n">Armado con la nota de pedido</div>
      <div class="cot-grande" style="margin-top:8px">${usd(pr)} <small>+ IVA</small></div>
      ${c.precio_final!=null&&c.precio_final<c.precio_lista?`<div class="crm-n">Precio de lista: ${usd(c.precio_lista)}</div>`:''}
      ${cot.costos[c.id]?`<div class="crm-n">🔒 Costo ${usd(cot.costos[c.id].costo)} · ganancia ${usd((c.precio_final??c.precio_lista)-cot.costos[c.id].costo)}</div>`:''}
      ${c.estado==='rechazada'&&c.respuesta?`<div class="cst-aviso">❌ ${esc(c.respuesta)}</div>`:''}</div>
    ${cotLiderHTML(c)}${typeof aprCotAvisoHTML==='function'?aprCotAvisoHTML(c):''}
    ${puede?`<button class="btn btn-verde" style="width:100%;margin-bottom:8px" onclick="cotPasarAOC('${esc(c.proyecto_id)}')">✅ El cliente aceptó: pasar a orden de compra</button>`:''}
    <div class="flex-btns">${p?`<button class="btn btn-sec" onclick="pdfNota('${esc(p.id)}',this)">📄 PDF</button>
      <button class="btn btn-nar" onclick="cotCerrar();crmCerrar();verDetalle('${esc(p.id)}')">📋 Ver la nota</button>`:'<p class="crm-ayuda">La nota de pedido ya no está.</p>'}</div>`;
  openOverlay(m.id);
};
// En la barra de abajo, el líder de ventas ve cuántos precios esperan su autorización
const _crmPendHoySinCot=crmPendHoy;
crmPendHoy=function(){return _crmPendHoySinCot()+(veTodoCRM()?cotPend().length:0);};

if(myId&&perfiles[myId]&&puedeCRM()) cargarCotizaciones().then(()=>{if(currentUser) rerender();});
