// ════════════════════════════════════════════════
// APROBACIÓN DEL ADMINISTRADOR (migración 0033, pedido de Cristian 27/11)
// Mientras el cotizador se pule, todo presupuesto y toda orden de compra confirmada pasan primero por el
// administrador. Es un interruptor que solo él prende o apaga (pestaña "Para aprobar" y Parámetros).
// - Presupuesto: con precio listo (de lista o con el descuento ya autorizado por el líder de ventas) queda
//   "esperando aprobación": el vendedor no puede enviarlo ni bajar el PDF con precio hasta que lo apruebe.
// - Orden de compra: al enviarla queda en ventas esperando; cuando la aprueba pasa sola a Arquitectura o al Líder.
// - Devolver lleva un comentario que ve el vendedor. La base controla todo esto también (no solo la app).
// ════════════════════════════════════════════════
const apr={activa:false,listo:false,com:{}};
async function cargarAprobaciones(){
  try{
    const r=await sb.from('ajustes_app').select('activo').eq('clave','aprobacion_admin').maybeSingle();
    if(r.error) throw r.error;
    apr.activa=!!r.data?.activo; apr.listo=true;
  }catch(e){apr.activa=false; apr.listo=false;}   // sin la migración 0033: todo sigue como antes
}

// ── presupuestos ──
// null: no hace falta (apagado, o todavía espera al líder de ventas, o ya salió) · pendiente · devuelta · aprobada
function aprCotEstado(c){
  if(!apr.activa||!c||!['lista','autorizada'].includes(c.estado)) return null;
  return c.aprobacion||'pendiente';
}
const aprCotFrena=c=>['pendiente','devuelta'].includes(aprCotEstado(c));
const APR_EST={pendiente:['🛂','Esperando aprobación','b-amar'],devuelta:['↩️','Devuelto por el administrador','b-rojo']};
function aprCotsPend(){return (typeof cot!=='undefined'?cot.lista:[]).filter(c=>aprCotEstado(c)==='pendiente')
  .sort((a,b)=>String(a.aprob_pedida_en||a.actualizado_en).localeCompare(String(b.aprob_pedida_en||b.actualizado_en)));}
// Aviso para el vendedor (y botones para el admin) dentro de la cotización o del presupuesto
function aprCotAvisoHTML(c){
  const e=aprCotEstado(c); if(!e||e==='aprobada') return '';
  if(rol()==='admin') return aprCotCardHTML(c,true);
  if(e==='devuelta') return `<div class="cst-aviso">↩️ <b>El administrador lo devolvió:</b> ${esc(c.aprob_comentario||'')}<br>Corregilo y guardalo de nuevo: le vuelve a llegar para aprobar.</div>`;
  return `<div class="cst-aviso amar">🛂 <b>Esperando la aprobación del administrador.</b> Cuando lo apruebe vas a poder mandarlo al cliente. Mientras tanto, el PDF sale como borrador.</div>`;
}
// Para el PDF de la nota de pedido: '' si se puede bajar con precio, o el motivo por el que no
function aprBloqueoPDFNota(c,precioEnPantalla){
  if(!apr.activa||rol()==='admin') return '';
  if(c&&c.estado==='enviada') return '';
  if(!c) return '🛂 Guardá el presupuesto: el administrador lo tiene que aprobar antes de mandarlo al cliente';
  const e=aprCotEstado(c);
  if(!e) return '';   // espera al líder de ventas: el PDF ya sale con "precio a confirmar"
  if(e==='devuelta') return '↩️ El administrador devolvió este presupuesto: '+(c.aprob_comentario||'')+'. Corregilo y guardalo de nuevo';
  if(e==='pendiente') return '🛂 Este presupuesto espera la aprobación del administrador: el PDF con precio sale cuando lo apruebe';
  if(precioEnPantalla!=null&&Math.round(Number(precioEnPantalla))!==Math.round(Number(c.aprob_precio)))
    return '🛂 Cambiaste el precio: guardá el presupuesto y esperá la aprobación del administrador';
  return '';
}

// ── órdenes de compra ──
const aprOCEsperando=p=>!!(apr.activa&&p&&etapaDe(p)==='ventas'&&p.aprob==='pendiente');
const aprOCDevuelta=p=>!!(apr.activa&&p&&etapaDe(p)==='ventas'&&p.aprob==='devuelta');
function aprOCNecesita(p){return !!(apr.activa&&rol()!=='admin'&&p&&esNota(p)&&p.ficha.sol!=='Presupuesto'&&p.aprob!=='aprobada');}
function aprOCsPend(){return proyectos.filter(aprOCEsperando).sort((a,b)=>(a.aprobEn||0)-(b.aprobEn||0));}
const aprPendientes=()=>rol()==='admin'&&apr.activa?aprCotsPend().length+aprOCsPend().length:0;
// Enviar una orden de compra: queda esperando al administrador.
// true = quedó esperando · false = no hace falta (se mueve como siempre) · null = error
async function aprOCPedir(id,destino){
  const r=await sb.rpc('oc_pedir_aprobacion',{p_id:id,p_destino:destino});
  if(r.error){
    if(/oc_pedir_aprobacion|function/i.test(r.error.message||'')&&!/P0001/.test(r.error.code||'')) return false;   // falta la 0033
    toast(msgError(r.error)); return null;
  }
  if(!r.data) return false;
  const p=todos[id]; if(p){p.aprob='pendiente';p.aprobDest=destino;p.aprobEn=Date.now();if(ORIG[id]) Object.assign(ORIG[id],{aprob:'pendiente',aprobDest:destino});}
  closeOverlay('m-det'); refrescar();
  toast('🛂 Orden de compra enviada al administrador: cuando la apruebe pasa sola a '+(destino==='asignacion'?'el líder de operaciones':'arquitectura'));
  return true;
}
const aprDestino=d=>d==='asignacion'?'🧭 Líder de operaciones':'📐 Arquitectura';
// En el detalle del proyecto (etapa ventas)
function aprOCAccionHTML(p){
  if(aprOCEsperando(p)){
    if(rol()==='admin') return aprOCCardHTML(p,true);
    return `<div class="accion"><p>🛂 <b>Esperando la aprobación del administrador.</b> Cuando la apruebe, pasa sola a ${aprDestino(p.aprobDest)}.</p></div>`;
  }
  if(aprOCDevuelta(p)) return `<div class="cst-aviso" style="margin-bottom:8px">↩️ <b>El administrador la devolvió:</b> ${esc(p.aprobCom||'')}<br>Corregí la nota y enviala de nuevo.</div>`;
  return '';
}
function aprBadge(p){
  if(aprOCEsperando(p)) return '<span class="badge b-amar">🛂 Esperando aprobación</span>';
  if(aprOCDevuelta(p)) return '<span class="badge b-rojo">↩️ Devuelta</span>';
  return '';
}

// ════════════════ BANDEJA DEL ADMINISTRADOR ════════════════
function aprComInput(k,ph){
  return `<div class="fg" style="margin:8px 0 6px"><input type="text" placeholder="${esc(ph||'Comentario (obligatorio para devolver)')}" value="${esc(apr.com[k]||'')}" oninput="apr.com['${esc(k)}']=this.value"></div>`;
}
function aprGanancia(precio,costo){
  if(precio==null||costo==null||!(Number(precio)>0)) return '';
  const g=Number(precio)-Number(costo);
  return `<div class="drow"><span class="lbl">🔒 Costo</span><span class="val">${usd(costo)}</span></div>
    <div class="drow"><span class="lbl">Ganancia</span><span class="val" style="color:${g<0?'var(--rojo)':'var(--verde)'}"><b>${usd(g)}</b> (${Math.round(g/Number(precio)*100)}% del precio)</span></div>`;
}
function aprHace(iso){const t=iso?ts(iso):null;return t?' · hace '+fmtHoras(horasDesde(t)):'';}
function aprCotCardHTML(c,dentro){
  const k=typeof cot!=='undefined'?cot.costos[c.id]:null, p=Number(c.precio_final);
  return `<div class="card" style="border-left:5px solid var(--amarillo)${dentro?';margin-top:8px':''}">
    <div class="card-title">🛂 Presupuesto N° ${esc(c.numero)} · ${esc(c.cliente||'')}</div>
    <div class="crm-n">${esc(c.tipologia_nombre||'Nota de pedido')}${c.unidades>1?' × '+c.unidades:''} · ${c.origen==='nota'?'nota de pedido':'cotizador'} · ${esc(nombreDe(c.vendedor_id))}${aprHace(c.aprob_pedida_en)}</div>
    <div class="drow"><span class="lbl">Precio al cliente</span><span class="val"><b>${usd(p)}</b> + IVA</span></div>
    ${Number(c.precio_lista)!==p?`<div class="drow"><span class="lbl">Precio de lista</span><span class="val">${usd(c.precio_lista)}${p<Number(c.precio_lista)?' · descuento autorizado por el líder de ventas':''}</span></div>`:''}
    ${k?aprGanancia(p,k.costo):''}
    ${c.sin_costo?`<div class="cst-aviso">⚠️ ${c.sin_costo} ítem${c.sin_costo>1?'s':''} sin costo cargado: el precio no está completo.</div>`:''}
    ${c.aprob_comentario?`<div class="crm-n" style="margin-top:6px">↩️ La última vez lo devolviste: ${esc(c.aprob_comentario)}</div>`:''}
    ${aprComInput('c'+c.id)}
    <div class="flex-btns">${dentro?'':`<button class="btn btn-sec" onclick="aprVerCot('${esc(c.id)}')">👁️ Ver</button>`}
      <button class="btn btn-sec" onclick="aprCotResponder('${esc(c.id)}',false)">↩️ Devolver</button>
      <button class="btn btn-verde" onclick="aprCotResponder('${esc(c.id)}',true)">✅ Aprobar</button></div></div>`;
}
function aprVerCot(id){
  const c=cotOp(id); if(!c) return;
  if(c.origen==='nota'&&c.proyecto_id&&todos[c.proyecto_id]) verDetalle(c.proyecto_id); else cotAbrir(id);
}
function aprOCCardHTML(p,dentro){
  const ci=typeof costoInfo==='function'?costoInfo(p):null, precio=p.val===''||p.val==null?null:Number(p.val);
  return `<div class="card" style="border-left:5px solid var(--amarillo)${dentro?';margin-bottom:8px':''}">
    <div class="card-title">🛂 Orden de compra · ${esc(p.nombre)}</div>
    <div class="crm-n">Cliente: ${esc(p.cli)} · ${esc(p.vend||nombreDe(p.vendId)||p.creadoPor||'')} · va a ${aprDestino(p.aprobDest)}${p.aprobEn?' · hace '+fmtHoras(horasDesde(p.aprobEn)):''}</div>
    <div class="drow"><span class="lbl">Valor de venta</span><span class="val">${precio!=null?'<b>'+usd(precio)+'</b> + IVA':'<span style="color:var(--rojo)">sin cargar</span>'}</span></div>
    ${ci&&ci.presTot>0?aprGanancia(precio,ci.presTot):'<div class="crm-n">🔒 El costeo todavía no tiene costo para esta nota.</div>'}
    ${p.aprobCom?`<div class="crm-n" style="margin-top:6px">↩️ La última vez la devolviste: ${esc(p.aprobCom)}</div>`:''}
    ${aprComInput('p'+p.id)}
    <div class="flex-btns">${dentro?`<button class="btn btn-sec" onclick="pdfNota('${esc(p.id)}',this)">📄 PDF</button>`:`<button class="btn btn-sec" onclick="verDetalle('${esc(p.id)}')">📋 Ver la nota</button>`}
      <button class="btn btn-sec" onclick="aprOCResponder('${esc(p.id)}',false)">↩️ Devolver</button>
      <button class="btn btn-verde" onclick="aprOCResponder('${esc(p.id)}',true)">✅ Aprobar</button></div></div>`;
}
async function aprCotResponder(id,ok){
  const com=String(apr.com['c'+id]||'').trim();
  if(!ok&&!com){toast('⚠️ Contale al vendedor qué hay que corregir');return;}
  const r=await sb.rpc('cot_aprobar_admin',{p_id:id,p_aprobar:ok,p_comentario:com||null});
  if(r.error){toast(msgError(r.error));return;}
  delete apr.com['c'+id];
  const c=cotOp(id);
  await cargarCotizaciones();
  toast(ok?'✅ Presupuesto aprobado: el vendedor ya lo puede mandar':'↩️ Devuelto: el vendedor ve tu comentario');
  if(c&&document.getElementById('m-cot')?.classList.contains('active')) cotAbrir(id);
  if(c&&c.proyecto_id&&detalleId===c.proyecto_id&&document.getElementById('m-det')?.classList.contains('active')) verDetalle(c.proyecto_id);
  rerender(); if(typeof crmRefrescar==='function') crmRefrescar();
}
async function aprOCResponder(id,ok){
  const com=String(apr.com['p'+id]||'').trim();
  if(!ok&&!com){toast('⚠️ Contale al vendedor qué hay que corregir');return;}
  const p=todos[id];
  if(ok&&p&&(p.val===''||p.val==null)&&!await confirmar('Esta orden de compra no tiene valor de venta cargado. ¿Aprobarla igual?')) return;
  const r=await sb.rpc('oc_aprobar_admin',{p_id:id,p_aprobar:ok,p_comentario:com||null});
  if(r.error){toast(msgError(r.error));return;}
  delete apr.com['p'+id];
  if(p){p.aprob=ok?'aprobada':'devuelta';p.aprobCom=com;if(ok){p.etapa=p.aprobDest||'arquitectura';}if(ORIG[id]) Object.assign(ORIG[id],{aprob:p.aprob,aprobCom:p.aprobCom,etapa:p.etapa});}
  closeOverlay('m-det'); refrescar(); programarRecarga(300);
  toast(ok?'✅ Aprobada: pasó a '+aprDestino(p?.aprobDest):'↩️ Devuelta: el vendedor ve tu comentario');
}
async function aprCambiar(activar){
  const n=aprCotsPend().length+aprOCsPend().length;
  if(!activar&&!await confirmar('¿Apagar la aprobación del administrador? Los presupuestos y las órdenes de compra van a salir sin pasar por vos.'+(n?` Lo que está esperando (${n}) sale solo: los presupuestos quedan aprobados y las órdenes de compra pasan a la etapa siguiente.`:''))) return;
  const r=await sb.rpc('aprobacion_admin_cambiar',{p_activo:activar});
  if(r.error){toast(msgError(r.error));return;}
  apr.activa=activar;
  toast(activar?'🛂 Aprobación prendida: todo presupuesto y orden de compra pasa por vos':'Aprobación apagada'+(r.data?`: salieron ${r.data}`:''));
  rerender(); programarRecarga(300);
}
function aprInterruptorHTML(){
  return `<div class="card" style="display:flex;gap:10px;align-items:center;justify-content:space-between">
    <div><b>🛂 Aprobación del administrador: ${apr.activa?'<span style="color:var(--verde)">prendida</span>':'apagada'}</b>
      <div class="crm-n">${apr.activa?'Todo presupuesto y orden de compra confirmada espera tu aprobación antes de salir al cliente o pasar a la etapa siguiente.':'Los presupuestos y las órdenes de compra salen sin pasar por vos.'}</div></div>
    <button class="btn ${apr.activa?'btn-sec':'btn-nar'} btn-sm" onclick="aprCambiar(${!apr.activa})">${apr.activa?'Apagar':'Prender'}</button></div>`;
}
function aprBannerAvisos(){
  if(!('Notification' in window)||Notification.permission!=='default') return '';
  return `<div class="card" style="font-size:13px;display:flex;gap:10px;align-items:center;justify-content:space-between">
    <span>🔔 Activá los avisos para que te llegue al celular cada presupuesto y orden de compra para aprobar.</span>
    <button class="btn btn-nar btn-sm" onclick="pcActivarAvisos().then(()=>renderAprobar())">Activar</button></div>`;
}
function renderAprobar(){
  const el=document.getElementById('lista-aprobar'); if(!el) return;
  if(rol()!=='admin'){el.innerHTML='';return;}
  if(!apr.listo){el.innerHTML='<div class="card">⚠️ Falta correr la migración 0033 (aprobación del administrador).</div>';return;}
  const cs=aprCotsPend(), os=aprOCsPend();
  let h=aprInterruptorHTML()+aprBannerAvisos();
  if(apr.activa){
    if(os.length) h+=`<div class="sec-title" style="font-size:15px">📦 Órdenes de compra (${os.length})</div>${os.map(p=>aprOCCardHTML(p)).join('')}`;
    if(cs.length) h+=`<div class="sec-title" style="font-size:15px">📝 Presupuestos (${cs.length})</div>${cs.map(c=>aprCotCardHTML(c)).join('')}`;
    if(!os.length&&!cs.length) h+=`<div class="card hoy-ok">✅ No hay nada esperando tu aprobación.</div>`;
  }
  el.innerHTML=h;
  if(typeof pintarBnav==='function') pintarBnav();
}
// En "Hoy"
function aprBloqueHoy(){
  const r=rol();
  if(r==='admin'){
    const n=aprPendientes(); if(!n) return '';
    return bloqueLista('amarillo','🛂 Para aprobar',[...aprOCsPend().map(p=>`<div class="fila-click" onclick="showView('aprobar')"><div style="min-width:0"><div class="fh-t">📦 ${esc(p.nombre.slice(0,34))}</div><div class="fh-s">Orden de compra · ${esc(p.cli)}</div></div><span class="badge b-amar">Revisar</span></div>`),
      ...aprCotsPend().map(c=>`<div class="fila-click" onclick="showView('aprobar')"><div style="min-width:0"><div class="fh-t">📝 ${esc(c.cliente||'')}</div><div class="fh-s">Presupuesto N° ${esc(c.numero)} · ${usd(c.precio_final)} · ${esc(nombreDe(c.vendedor_id))}</div></div><span class="badge b-amar">Revisar</span></div>`)]);
  }
  if(r==='ventas'&&apr.activa){
    const ocs=proyectos.filter(p=>aprOCDevuelta(p)&&(p.creadoPorId===myId||p.vendId===myId));
    const cs=(typeof cot!=='undefined'?cot.lista:[]).filter(c=>c.vendedor_id===myId&&aprCotEstado(c)==='devuelta');
    return bloqueLista('rojo','↩️ Devueltos por el administrador',[...ocs.map(p=>filaHoy(p.id,esc(p.nombre.slice(0,34)),esc(p.aprobCom||''),'<span class="badge b-rojo">Corregir</span>')),
      ...cs.map(c=>`<div class="fila-click" onclick="aprVerCot('${esc(c.id)}')"><div style="min-width:0"><div class="fh-t">Presupuesto N° ${esc(c.numero)} · ${esc(c.cliente||'')}</div><div class="fh-s">${esc(c.aprob_comentario||'')}</div></div><span class="badge b-rojo">Corregir</span></div>`)]);
  }
  return '';
}
