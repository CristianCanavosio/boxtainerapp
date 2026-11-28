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
  if(!apr.activa||!c||!['lista','autorizada'].includes(c.estado)||aprCotDeOC(c)) return null;
  return c.aprobacion||'pendiente';
}
// El precio de una orden de compra lo aprueba el administrador junto con la orden de compra (0039), no como presupuesto
function aprCotDeOC(c){const p=c.origen==='nota'&&c.proyecto_id?todos[c.proyecto_id]:null;return !!(p&&esNota(p)&&p.ficha.sol!=='Presupuesto');}
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
// Después de guardar una nota que el administrador ya había aprobado: si ventas la cambió, la base la deja
// esperando de nuevo (0039). Se relee para que la app no la mueva como aprobada.
async function aprReleerOC(p){
  if(!p||p.aprob!=='aprobada'||etapaDe(p)!=='ventas') return;
  const r=await sb.from('proyectos').select('aprob_oc,aprob_oc_destino,aprob_oc_comentario').eq('id',p.id).maybeSingle();
  if(r.error||!r.data) return;
  const x={aprob:r.data.aprob_oc||null,aprobDest:r.data.aprob_oc_destino||null,aprobCom:r.data.aprob_oc_comentario||''};
  Object.assign(p,x); if(todos[p.id]&&todos[p.id]!==p) Object.assign(todos[p.id],x); if(ORIG[p.id]) Object.assign(ORIG[p.id],x);
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
// ── Qué lleva: cada ítem con su cantidad y su costo, para revisar antes de aprobar ──
// filas: [{nombre, cant, unidad, costo (null = sin costo, 0 = incluido en otro ítem), sub, de}]
const aprNum=n=>(Math.round((Number(n)||0)*100)/100).toLocaleString('es-AR');
function aprNomIns(cod){const i=typeof mae!=='undefined'&&mae.ins?mae.ins[cod]:null;return i?(typeof cotLindo==='function'?cotLindo(i.nombre):i.nombre):cod;}
function aprDetalleHTML(filas,titulo){
  if(!filas||!filas.length) return `<div class="crm-n" style="margin-top:6px">No hay detalle guardado: abrilo y guardalo de nuevo para verlo.</div>`;
  const sin=filas.filter(x=>x.costo==null), tot=filas.reduce((t,x)=>t+(x.costo?Number(x.cant)*Number(x.costo):0),0);
  const orden=[...filas].sort((a,b)=>(a.costo==null?0:1)-(b.costo==null?0:1)||(b.cant*(b.costo||0))-(a.cant*(a.costo||0)));
  return `<details style="margin-top:8px"${sin.length?' open':''}><summary style="cursor:pointer;font-weight:800">📋 ${titulo||'Qué lleva'} (${filas.length} ítems${sin.length?`, <span style="color:var(--rojo)">${sin.length} sin costo</span>`:''})</summary>
    ${sin.length?`<div class="cst-aviso" style="margin-top:6px">⚠️ Sin costo cargado: ${esc(sin.map(x=>x.nombre).join(', '))}. El costo (y el precio) no los incluye.</div>`:''}
    <div style="font-size:12px;margin-top:6px">
      <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:2px 10px;font-weight:700;color:var(--gris-m);border-bottom:1px solid var(--borde);padding-bottom:3px">
        <span>Ítem</span><span style="text-align:right">Cant.</span><span style="text-align:right">Costo u.</span><span style="text-align:right">Subtotal</span></div>
      ${orden.map(x=>`<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:2px 10px;padding:3px 0;border-bottom:1px solid var(--borde);${x.costo==null?'background:#FDECEA;color:var(--rojo);font-weight:700':''}">
        <span>${esc(x.nombre)}${x.de?`<small style="display:block;color:var(--gris-m);font-weight:400">${esc(x.de)}</small>`:''}</span>
        <span style="text-align:right">${aprNum(x.cant)}${x.unidad?' '+esc(String(x.unidad).toLowerCase()):''}</span>
        <span style="text-align:right">${x.costo==null?'⚠️ falta':x.costo===0?'incluido':usd(x.costo)}</span>
        <span style="text-align:right">${x.costo?usd(Number(x.cant)*Number(x.costo)):'—'}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;font-weight:800;padding-top:4px"><span>Costo total</span><span>${usd(tot)}</span></div>
    </div></details>`;
}
// Lo que lleva un presupuesto (sale de lo que calculó la base al guardarlo)
function aprFilasCot(c){
  const k=typeof cot!=='undefined'?cot.costos[c.id]:null; if(!k||!k.det) return [];
  if(c.origen==='nota') return k.det.map(x=>{
    const comp=typeof mae!=='undefined'&&mae.eq?mae.eq[x.clave]:null;
    const de=comp&&comp.length?'= '+comp.map(e=>(e.factor!==1?aprNum(e.factor)+' × ':'')+aprNomIns(e.insumo)).join(' + '):'';
    return {nombre:x.clave,cant:Number(x.cant)||0,costo:x.costo==null?null:Number(x.costo),de};
  });
  const nom={}; (c.detalle||[]).forEach(d=>nom[d.codigo]=d);
  return k.det.map(x=>({nombre:nom[x.codigo]?.nombre?(typeof cotLindo==='function'?cotLindo(nom[x.codigo].nombre):nom[x.codigo].nombre):aprNomIns(x.codigo),
    cant:Number(x.cant)||0,unidad:nom[x.codigo]?.unidad||'',costo:x.costo==null?null:Number(x.costo)}));
}
// Lo que lleva una orden de compra (costeo del pedido)
function aprFilasOC(p){
  if(typeof costoNota!=='function') return [];
  const c=costoNota(p); if(!c) return [];
  return [...c.lineas.map(x=>({nombre:x.clave+(x.det?' · '+x.det:''),cant:x.cant,unidad:x.unidad||'',
      costo:x.fuente==='incluido'?0:(x.costo==null||x.costo===0?null:Number(x.costo))})),
    ...(c.extras||[]).map(x=>({nombre:x.desc||x.nombre||'Línea a mano',cant:Number(x.cant)||0,costo:Number(x.costo)||null}))];
}
// ── Qué se pidió: breve descripción + dibujo, para entrar en contexto sin leer ítem por ítem (pedido de Cristian 27/11) ──
function aprResumenHTML(ficha,pid){
  if(!ficha||ficha.v!==2||typeof NotaPedido==='undefined'||!NotaPedido.breve) return '';
  let lineas=[],dib='';
  try{lineas=NotaPedido.breve(ficha);}catch(e){console.error(e);}
  try{dib=NotaPedido.dibujos(ficha);}catch(e){console.error(e);}
  const pl=pid&&todos[pid]?(todos[pid].planos||[]).length:0;
  return `<div style="background:var(--gris-l,#F4F5F7);border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13px;line-height:1.45">
    <div style="font-weight:800;margin-bottom:2px">🧾 Qué se pidió</div>${lineas.map(l=>`<div>${esc(l)}</div>`).join('')}
    ${pl?`<div class="crm-n" style="margin-top:4px">📎 ${pl} plano${pl>1?'s':''} o croquis adjunto${pl>1?'s':''}: están en la nota y en el PDF.</div>`:''}</div>
    ${dib?`<details open style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:700;font-size:13px">📐 Dibujo</summary><div class="nota-vars nota-dib" style="max-width:520px">${dib}</div></details>`:''}`;
}
// ── Precio por m² contra los valores de referencia (Parámetros). Fuera de la tolerancia, avisa ──
const REF_M2_DEF={ref_m2_20_sin:620,ref_m2_20_con:690,ref_m2_40_sin:630,ref_m2_40_con:680,ref_m2_tolerancia:0.15};
function refM2(k){const v=typeof mae!=='undefined'&&mae.par?Number(mae.par[k]):NaN;return v>0?v:REF_M2_DEF[k];}
function precioM2Info(ficha,precio){
  if(!ficha||ficha.v!==2||!(Number(precio)>0)||typeof NotaPedido==='undefined'||!NotaPedido.datosM2) return null;
  let x=null; try{x=NotaPedido.datosM2(ficha);}catch(e){return null;}
  if(!x||!x.aplica) return null;
  const pm=Number(precio)/x.unidades/x.m2, ref=refM2(`ref_m2_${x.pies}_${x.conBano?'con':'sin'}`), dif=pm/ref-1;
  return {pm,ref,dif,fuera:Math.abs(dif)>refM2('ref_m2_tolerancia'),txt:`${x.pies} pies ${x.conBano?'con baño o cocina':'sin baño'}`};
}
function aprM2HTML(ficha,precio){
  const i=precioM2Info(ficha,precio); if(!i) return '';
  const pct=Math.round(Math.abs(i.dif)*100);
  return `<div class="drow"><span class="lbl">Precio por m²</span><span class="val"><b>${usd(i.pm)}</b> · referencia ${usd(i.ref)} (${esc(i.txt)})</span></div>
    ${i.fuera?`<div class="cst-aviso">⚠️ El precio por m² está ${pct}% ${i.dif<0?'por debajo':'por encima'} de la referencia. Revisá que no falte o sobre algo.</div>`:''}`;
}
function aprHace(iso){const t=iso?ts(iso):null;return t?' · hace '+fmtHoras(horasDesde(t)):'';}
function aprCotCardHTML(c,dentro){
  const k=typeof cot!=='undefined'?cot.costos[c.id]:null, p=Number(c.precio_final);
  return `<div class="card" style="border-left:5px solid var(--amarillo)${dentro?';margin-top:8px':''}">
    <div class="card-title">🛂 Presupuesto N° ${esc(c.numero)} · ${esc(c.cliente||'')}</div>
    <div class="crm-n">${esc(c.tipologia_nombre||'Nota de pedido')}${c.unidades>1?' × '+c.unidades:''} · ${c.origen==='nota'?'nota de pedido':'cotizador'} · ${esc(nombreDe(c.vendedor_id))}${aprHace(c.aprob_pedida_en)}</div>
    ${c.origen==='nota'&&c.proyecto_id&&todos[c.proyecto_id]?aprResumenHTML(todos[c.proyecto_id].ficha,c.proyecto_id):''}
    <div class="drow"><span class="lbl">Precio al cliente</span><span class="val"><b>${usd(p)}</b> + IVA</span></div>
    ${c.origen==='nota'&&c.proyecto_id&&todos[c.proyecto_id]?aprM2HTML(todos[c.proyecto_id].ficha,p):''}
    ${Number(c.precio_lista)!==p?`<div class="drow"><span class="lbl">Precio de lista</span><span class="val">${usd(c.precio_lista)}${p<Number(c.precio_lista)?' · descuento autorizado por el líder de ventas':''}</span></div>`:''}
    ${k?aprGanancia(p,k.costo):''}
    ${c.sin_costo&&!aprFilasCot(c).length?`<div class="cst-aviso">⚠️ ${c.sin_costo} ítem${c.sin_costo>1?'s':''} sin costo cargado: el precio no está completo.</div>`:''}
    ${aprDetalleHTML(aprFilasCot(c))}
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
    ${aprResumenHTML(p.ficha,p.id)}
    <div class="drow"><span class="lbl">Valor de venta</span><span class="val">${precio!=null?'<b>'+usd(precio)+'</b> + IVA':'<span style="color:var(--rojo)">sin cargar</span>'}</span></div>
    ${aprM2HTML(p.ficha,precio)}
    ${ci&&ci.presTot>0?aprGanancia(precio,ci.presTot):'<div class="crm-n">🔒 El costeo todavía no tiene costo para esta nota.</div>'}
    ${aprDetalleHTML(aprFilasOC(p))}
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
